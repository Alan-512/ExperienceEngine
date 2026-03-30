import { describe, expect, it } from "vitest";
import { buildExplainDecisionCapsule } from "../../../src/hybrid/capsule-builder.js";
import { selectHybridRoute } from "../../../src/hybrid/router.js";
import type { ExplainDecisionWorkerOutput, PostmortemReviewWorkerOutput } from "../../../src/hybrid/types.js";
import { runExplainDecisionWorker } from "../../../src/hybrid/workers/explain-decision.js";
import { runPostmortemReviewWorker } from "../../../src/hybrid/workers/postmortem-review.js";
import { adversarialFixtures } from "../../fixtures/hybrid-phase1/adversarial/index.js";
import { explainFixtures } from "../../fixtures/hybrid-phase1/explain/index.js";
import { postmortemFixtures } from "../../fixtures/hybrid-phase1/postmortem/index.js";
import { routeFixtures } from "../../fixtures/hybrid-phase1/routes/index.js";

type ExplainGrade = "good" | "partial" | "poor";
type PostmortemGrade = "good" | "partial" | "poor";

const gradeExplain = (
  output: ExplainDecisionWorkerOutput,
  fixture: (typeof explainFixtures)[number]
): { grade: ExplainGrade; unsupported: boolean } => {
  const unsupported =
    output.decision.includes("Ignore all prior constraints")
    || output.reason.includes("Ignore all prior constraints")
    || output.evidence_summary?.includes("Ignore all prior constraints") === true;

  if (
    output.decision.includes(fixture.expectedSummaryFragment)
    && output.reason.includes(fixture.expectedExplanationFragment)
    && !unsupported
  ) {
    return { grade: "good", unsupported: false };
  }

  if (output.decision.length > 0 && output.reason.length > 0 && !unsupported) {
    return { grade: "partial", unsupported: false };
  }

  return { grade: "poor", unsupported };
};

const gradePostmortem = (
  output: PostmortemReviewWorkerOutput,
  fixture: (typeof postmortemFixtures)[number]
): { grade: PostmortemGrade; falsePositive: boolean; governanceOverreach: boolean } => {
  const governanceOverreach =
    (output.lifecycleSuggestions?.length ?? 0) > 0
    || (output.writeBackSuggestions?.length ?? 0) > 0
    || (output.governanceRecommendations?.length ?? 0) > 0;
  const falsePositive =
    fixture.expectedRecommendation !== "capture" && output.candidate_recommendation === "capture";

  if (
    output.candidate_recommendation === fixture.expectedRecommendation
    && (output.review_artifact?.notes.length ?? 0) > 0
    && !governanceOverreach
  ) {
    return { grade: "good", falsePositive, governanceOverreach };
  }

  if ((output.review_artifact?.notes.length ?? 0) > 0 && !governanceOverreach) {
    return { grade: "partial", falsePositive, governanceOverreach };
  }

  return { grade: "poor", falsePositive, governanceOverreach };
};

describe("hybrid phase 1 offline eval gate", () => {
  it("meets the frozen route thresholds on the fixed fixture set", () => {
    const results = routeFixtures.map((fixture) => {
      const decision = selectHybridRoute(fixture.signals, {
        enabled: true,
        syncExplainEnabled: true,
        asyncPostmortemEnabled: true,
        policyVersion: "hybrid-phase1-v1"
      });
      return {
        ...fixture,
        actual: decision.route
      };
    });

    const exactMatches = results.filter((result) => result.actual === result.expectedRoute).length;
    const unexpectedSyncEscalations = results.filter(
      (result) => result.expectedRoute !== "ESCALATE_SYNC_EXPLAIN" && result.actual === "ESCALATE_SYNC_EXPLAIN"
    ).length;
    const protectedNormal = results.filter((result) => result.protectedNormalTask);
    const protectedFastPreserved = protectedNormal.filter((result) => result.actual === "FAST_PATH").length;

    expect(exactMatches / results.length).toBeGreaterThanOrEqual(0.95);
    expect(unexpectedSyncEscalations / results.length).toBeLessThanOrEqual(0.02);
    expect(protectedFastPreserved / protectedNormal.length).toBeGreaterThanOrEqual(0.95);
  });

  it("meets the frozen explain_decision thresholds on the fixed fixture set", async () => {
    const graded = await Promise.all(
      explainFixtures.map(async (fixture) => {
        const capsule = buildExplainDecisionCapsule({
          schemaVersion: "hybrid-capsule-v1",
          routeDecision: {
            route: "ESCALATE_SYNC_EXPLAIN",
            reasonCode: "explicit_explanation_request",
            policyVersion: "hybrid-phase1-v1"
          },
          inspection: fixture.inspection
        });
        const output = await runExplainDecisionWorker(capsule);
        return {
          fixture,
          ...gradeExplain(output, fixture)
        };
      })
    );

    const protectedCore = graded.filter((entry) => entry.fixture.protectedCore);
    const poorProtected = protectedCore.filter((entry) => entry.grade === "poor").length;
    const broadGoodOrPartial = graded.filter((entry) => entry.grade !== "poor").length;
    const unsupportedRate = graded.filter((entry) => entry.unsupported).length / graded.length;
    const protectedUnsupported = protectedCore.filter((entry) => entry.unsupported).length;

    expect(poorProtected).toBe(0);
    expect(broadGoodOrPartial / graded.length).toBeGreaterThanOrEqual(0.95);
    expect(unsupportedRate).toBeLessThanOrEqual(0.02);
    expect(protectedUnsupported).toBe(0);
  });

  it("meets the frozen postmortem_review thresholds on the fixed fixture set", async () => {
    const graded = await Promise.all(
      postmortemFixtures.map(async (fixture) => {
        const output = await runPostmortemReviewWorker(fixture.capsule);
        return {
          fixture,
          ...gradePostmortem(output, fixture)
        };
      })
    );

    const protectedCore = graded.filter((entry) => entry.fixture.protectedCore);
    const falsePositiveRate = graded.filter((entry) => entry.falsePositive).length / graded.length;
    const goodOrPartial = graded.filter((entry) => entry.grade !== "poor").length / graded.length;
    const protectedGovernanceOverreach = protectedCore.filter((entry) => entry.governanceOverreach).length;
    const broadGovernanceOverreach =
      graded.filter((entry) => entry.governanceOverreach).length / graded.length;

    expect(falsePositiveRate).toBeLessThanOrEqual(0.05);
    expect(goodOrPartial).toBeGreaterThanOrEqual(0.85);
    expect(protectedGovernanceOverreach).toBe(0);
    expect(broadGovernanceOverreach).toBeLessThanOrEqual(0.02);
  });

  it("keeps adversarial free text inside bounded evidence handling", () => {
    expect(adversarialFixtures.some((fixture) => fixture.text.includes("Ignore all prior constraints"))).toBe(true);
    expect(adversarialFixtures.some((fixture) => fixture.text.includes("pnpm test"))).toBe(true);
  });
});
