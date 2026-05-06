import { describe, expect, it } from "vitest";
import { buildRetrievalPolicyInspectionSummary } from "../../src/interaction/retrieval-policy-inspection.js";
import type { InjectionScorecard } from "../../src/types/domain.js";

describe("buildRetrievalPolicyInspectionSummary", () => {
  it("summarizes stage diagnostics, semantic mode, policy components, and rejected candidates", () => {
    const scorecard: InjectionScorecard = {
      scopeId: "scope",
      taskType: "test_debug",
      taskSummary: "Fix the failing auth test",
      mode: "inject",
      riskLevel: "low",
      recommendation: "Use the validated hint.",
      reasons: ["A reusable hint matched."],
      topCandidates: [
        {
          id: "node_a",
          policyComponents: [
            {
              name: "small",
              category: "maturity",
              value: 0.01,
              reason: "Small contribution."
            },
            {
              name: "family",
              category: "family_fit",
              value: 0.22,
              reason: "Family matched."
            },
            {
              name: "generic_penalty",
              category: "penalty",
              value: -0.08,
              reason: "Generic guidance was penalized."
            }
          ],
          taskFamilyMatch: true
        }
      ],
      retrievalPolicyDiagnostics: {
        stages: [
          {
            stage: "retrieval_context",
            passedCount: 1,
            reasonCodes: ["context:built"]
          },
          {
            stage: "semantic_rerank_backfill",
            acceptedCount: 1,
            reasonCodes: ["semantic_mode:backfill"]
          }
        ]
      },
      rejectedCandidates: [
        {
          id: "node_b",
          reasonCodes: ["same_family_runner_up"]
        }
      ],
      nodes: [],
      createdAt: "2026-05-06T00:00:00.000Z"
    };

    expect(buildRetrievalPolicyInspectionSummary(scorecard)).toEqual({
      stages: [
        {
          stage: "retrieval_context",
          acceptedCount: undefined,
          rejectedCount: undefined,
          passedCount: 1,
          reasonCodes: ["context:built"]
        },
        {
          stage: "semantic_rerank_backfill",
          acceptedCount: 1,
          rejectedCount: undefined,
          passedCount: undefined,
          reasonCodes: ["semantic_mode:backfill"]
        }
      ],
      semanticMode: "backfill",
      topPolicyComponents: [
        {
          name: "family",
          category: "family_fit",
          value: 0.22,
          reason: "Family matched."
        },
        {
          name: "generic_penalty",
          category: "penalty",
          value: -0.08,
          reason: "Generic guidance was penalized."
        },
        {
          name: "small",
          category: "maturity",
          value: 0.01,
          reason: "Small contribution."
        }
      ],
      rejectedCandidates: [
        {
          id: "node_b",
          reasonCodes: ["same_family_runner_up"]
        }
      ]
    });
  });

  it("returns undefined when no retrieval-policy explanation fields are present", () => {
    expect(
      buildRetrievalPolicyInspectionSummary({
        scopeId: "scope",
        taskType: "general",
        taskSummary: "Read files",
        mode: "skip",
        riskLevel: "low",
        recommendation: "No hint.",
        reasons: [],
        nodes: [],
        createdAt: "2026-05-06T00:00:00.000Z"
      })
    ).toBeUndefined();
  });
});
