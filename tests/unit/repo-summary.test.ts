import { describe, expect, it } from "vitest";
import { buildRepoSummary } from "../../src/interaction/repo-summary.js";

describe("repo summary", () => {
  it("builds a stable summary with benchmark and recommendation", () => {
    const summary = buildRepoSummary({
      scope: {
        scopeId: "scope_a",
        scopeName: "repo",
        rootPath: "/repo"
      },
      latest: {
        sessionId: "session_a",
        scopeId: "scope_a",
        taskType: "test_debug",
        intervention: "inject",
        autoFeedback: "helped",
        autoFeedbackReason: "success_outcome",
        attributionRecords: [],
        outcome: "success",
        injectedNodes: [],
        hints: [],
        evidence: [],
        decisionExplanation: "Candidate quality was strong enough to justify intervention for this task.",
        trustSummary: "low-risk active guidance with 1 helped and 0 harmed signal(s).",
        retrievalNotes: ["A strong candidate fast path was used."],
        timeline: [],
        summary: "Fix auth test",
        createdAt: "2026-03-20T00:00:00.000Z"
      },
      learning: {
        candidates: { pending: 0, distilled: 0, failed: 0, discarded: 0 },
        jobs: { pending: 0, processing: 0, succeeded: 0, failed: 0, discarded: 0 },
        nodes: { candidate: 0, priority_candidate: 0, active: 1, cooling: 0, retired: 0 },
        nodeSources: {
          explicit_provider: 0,
          rule: 1,
          disabled: 0
        },
        effectiveness: {
          decisions: 5,
          live: 5,
          shadow: 0,
          holdout: 0,
          delivered: 5,
          suppressed: 0,
          automaticHelped: 3,
          automaticHarmed: 0
        },
        benchmark: {
          deliveryRate: 1,
          suppressionRate: 0,
          helpfulRate: 0.6,
          harmfulRate: 0,
          netHelpfulRate: 0.6,
          verdict: "healthy",
          recommendation: "Stay live.",
          suggestedMode: "live"
        },
        attributionReasons: {
          success_outcome: 3,
          relevant_failure: 0,
          environmental_failure: 0,
          exploratory_failure: 0,
          no_relevant_failure: 0,
          suppressed_delivery: 0,
          unknown_outcome: 0
        },
        runtime: { records: 5, taskRuns: 5, outcomes: 5, reviews: 3 },
        latestRecordCreatedAt: "2026-03-20T00:00:00.000Z"
      }
    });

    expect(summary.scope.scopeId).toBe("scope_a");
    expect(summary.benchmark.verdict).toBe("healthy");
    expect(summary.recent.latestDecisionExplanation).toBe(
      "Candidate quality was strong enough to justify intervention for this task."
    );
    expect(summary.recent.latestTrustSummary).toBe("low-risk active guidance with 1 helped and 0 harmed signal(s).");
    expect(summary.recommendedNextAction).toContain("live");
  });

  it("stays conservative while the repo is warming up", () => {
    const summary = buildRepoSummary({
      scope: {
        scopeId: "scope_b"
      },
      learning: {
        candidates: { pending: 0, distilled: 0, failed: 0, discarded: 0 },
        jobs: { pending: 0, processing: 0, succeeded: 0, failed: 0, discarded: 0 },
        nodes: { candidate: 0, priority_candidate: 0, active: 0, cooling: 0, retired: 0 },
        nodeSources: {
          explicit_provider: 0,
          rule: 0,
          disabled: 0
        },
        effectiveness: {
          decisions: 0,
          live: 0,
          shadow: 0,
          holdout: 0,
          delivered: 0,
          suppressed: 0,
          automaticHelped: 0,
          automaticHarmed: 0
        },
        benchmark: {
          deliveryRate: 0,
          suppressionRate: 0,
          helpfulRate: 0,
          harmfulRate: 0,
          netHelpfulRate: 0,
          verdict: "warming_up",
          recommendation: "Warm up first.",
          suggestedMode: "shadow"
        },
        attributionReasons: {
          success_outcome: 0,
          relevant_failure: 0,
          environmental_failure: 0,
          exploratory_failure: 0,
          no_relevant_failure: 0,
          suppressed_delivery: 0,
          unknown_outcome: 0
        },
        runtime: { records: 0, taskRuns: 0, outcomes: 0, reviews: 0 }
      }
    });

    expect(summary.recommendedNextAction).toContain("observation");
  });
});
