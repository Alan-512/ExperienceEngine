import { describe, expect, it } from "vitest";
import { deriveSkipReason } from "../../src/controller/skip-reason.js";
import type { InterventionDecisionDiagnostics } from "../../src/types/domain.js";

const diagnostics = (overrides: Partial<InterventionDecisionDiagnostics>): InterventionDecisionDiagnostics => ({
  topCandidates: [],
  fastPathApplied: false,
  gateReason: "no_candidates",
  decisionReason: "no_matching_candidates",
  confidence: "low",
  budgetClass: "none",
  selectedCandidateIds: [],
  rejectedCandidates: [],
  ...overrides
});

describe("deriveSkipReason", () => {
  it("derives no-candidate skips", () => {
    expect(deriveSkipReason({ mode: "skip", diagnostics: diagnostics({}) })).toMatchObject({
      code: "no_candidate"
    });
  });

  it("derives record-only diagnostic candidates before lower-priority policy reasons", () => {
    expect(
      deriveSkipReason({
        mode: "skip",
        diagnostics: diagnostics({
          gateReason: "diagnostic_candidate_record_only",
          decisionReason: "candidate_quality_rejected",
          recordOnlyDiagnosticCandidateIds: ["candidate_1"],
          topCandidates: [{ id: "candidate_1", taskFamilyMatch: true }]
        })
      })
    ).toMatchObject({
      code: "record_only_diagnostic_candidate"
    });
  });

  it("derives policy-rejected semantic matches", () => {
    expect(
      deriveSkipReason({
        mode: "skip",
        diagnostics: diagnostics({
          gateReason: "uncertainty_aware_routing",
          decisionReason: "candidate_quality_rejected",
          topCandidates: [{ id: "candidate_1", taskFamilyMatch: true }]
        })
      })
    ).toMatchObject({
      code: "semantic_match_policy_rejected"
    });
  });

  it("derives recent harm or quarantine before generic maturity explanations", () => {
    expect(
      deriveSkipReason({
        mode: "skip",
        diagnostics: diagnostics({
          gateReason: "uncertainty_aware_routing",
          decisionReason: "candidate_quality_rejected",
          topCandidates: [
            {
              id: "candidate_1",
              taskFamilyMatch: true,
              policyReasons: ["state_requires_conservative_handling", "harmed_feedback_penalty"]
            }
          ]
        })
      })
    ).toMatchObject({
      code: "recent_harm_or_quarantined"
    });
  });

  it("derives scope-disabled and holdout suppression with highest explicit precedence", () => {
    expect(deriveSkipReason({ mode: "skip", scopeDisabled: true })?.code).toBe("scope_disabled");
    expect(deriveSkipReason({ mode: "inject", deliveryMode: "holdout", delivered: false })?.code).toBe(
      "holdout_suppressed"
    );
  });
});
