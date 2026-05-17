import { describe, expect, it } from "vitest";
import { buildOperatorReviewFlow } from "../../src/maintenance/operator-review-flow.js";
import type { ExperienceRepoSummary } from "../../src/interaction/repo-summary.js";
import type { ExperienceExportDraftReport } from "../../src/maintenance/experience-export-drafts.js";
import type { HygieneReviewReport } from "../../src/maintenance/experience-hygiene.js";

const makeRepo = (overrides: Partial<ExperienceRepoSummary> = {}): ExperienceRepoSummary => ({
  scope: {
    scopeId: "scope_repo"
  },
  recent: {},
  benchmark: {
    deliveryRate: 0,
    suppressionRate: 0,
    helpfulRate: 0,
    harmfulRate: 0,
    netHelpfulRate: 0,
    verdict: "healthy",
    suggestedMode: "live",
    recommendation: "Keep monitoring."
  },
  quality: {
    strong: 0,
    building: 0,
    risky: 0,
    summary: "No experience nodes are available for this scope yet."
  },
  policy: {
    configuredMode: "safe",
    effectiveMode: "safe",
    circuitState: "clear",
    liveDiagnosticsDisabled: false,
    updatedAt: "2026-05-05T00:00:00.000Z"
  },
  recommendedNextAction: "Keep monitoring.",
  ...overrides
} as ExperienceRepoSummary);

const makeHygiene = (overrides: Partial<HygieneReviewReport> = {}): HygieneReviewReport => ({
  scopeId: "scope_repo",
  generatedAt: "2026-05-05T00:00:00.000Z",
  filters: {
    scopeId: "scope_repo",
    limit: 5
  },
  summary: {
    total: 0,
    byType: {
      stale_experience: 0,
      duplicate_guidance: 0,
      conflicting_guidance: 0,
      over_generalized_guidance: 0,
      evidence_drift: 0
    },
    bySeverity: {
      high: 0,
      medium: 0,
      low: 0
    }
  },
  findings: [],
  ...overrides
});

const makeExportDrafts = (overrides: Partial<ExperienceExportDraftReport> = {}): ExperienceExportDraftReport => ({
  scopeId: "scope_repo",
  generatedAt: "2026-05-05T00:00:00.000Z",
  filters: {
    scopeId: "scope_repo",
    limit: 5
  },
  summary: {
    total: 0,
    byRisk: {
      high: 0,
      medium: 0,
      low: 0
    },
    byTargetType: {
      instruction_note: 0,
      repo_guidance: 0,
      skill_candidate: 0,
      documentation_note: 0,
      do_not_export: 0
    }
  },
  drafts: [],
  ...overrides
});

describe("operator review flow", () => {
  it("returns a stable empty review shape with low-priority next action", () => {
    const report = buildOperatorReviewFlow({
      repo: makeRepo(),
      hygiene: makeHygiene(),
      exportDrafts: makeExportDrafts(),
      limit: 3,
      generatedAt: "2026-05-06T00:00:00.000Z"
    });

    expect(report).toMatchObject({
      scopeId: "scope_repo",
      generatedAt: "2026-05-06T00:00:00.000Z",
      filters: {
        scopeId: "scope_repo",
        limit: 3
      },
      sections: {
        repo_policy: {
          health: "clear"
        },
        hygiene: {
          total: 0
        },
        export_drafts: {
          total: 0
        }
      },
      reviewItems: [],
      recommendedReviewOrder: ["repo_policy", "hygiene", "export_drafts"]
    });
    expect(report.reviewOnlyNextActions[0]).toMatchObject({
      priority: "low",
      summary: expect.stringContaining("No immediate review items")
    });
  });

  it("prioritizes tripped repo policy and high-severity hygiene before export review", () => {
    const report = buildOperatorReviewFlow({
      repo: makeRepo({
        policy: {
          configuredMode: "safe",
          effectiveMode: "strict",
          circuitState: "tripped",
          circuitReason: "repo_circuit: harmed evidence",
          liveDiagnosticsDisabled: true,
          updatedAt: "2026-05-05T00:00:00.000Z"
        }
      }),
      hygiene: makeHygiene({
        summary: {
          total: 1,
          byType: {
            stale_experience: 0,
            duplicate_guidance: 0,
            conflicting_guidance: 1,
            over_generalized_guidance: 0,
            evidence_drift: 0
          },
          bySeverity: {
            high: 1,
            medium: 0,
            low: 0
          }
        },
        findings: [
          {
            type: "conflicting_guidance",
            severity: "high",
            affectedNodeIds: ["node_a", "node_b"],
            affectedCandidateIds: [],
            evidenceSummary: "Two nodes disagree on generated config changes.",
            recommendation: "Review the conflict.",
            evidenceRefs: ["input_conflict"],
            createdAt: "2026-05-05T00:00:00.000Z"
          }
        ]
      }),
      exportDrafts: makeExportDrafts({
        summary: {
          total: 1,
          byRisk: {
            high: 0,
            medium: 0,
            low: 1
          },
          byTargetType: {
            instruction_note: 0,
            repo_guidance: 1,
            skill_candidate: 0,
            documentation_note: 0,
            do_not_export: 0
          }
        },
        drafts: [
          {
            draftId: "draft_node_ready",
            scopeId: "scope_repo",
            nodeIds: ["node_ready"],
            contextCandidateIds: [],
            nodeType: "strategy",
            taskFamily: "test_debug",
            guidanceText: "Run the targeted test.",
            evidenceSummary: "Prior success.",
            provenanceRefs: ["input_ready"],
            risk: "low",
            riskNotes: [],
            hygieneNotes: [],
            helpedSignals: 1,
            harmedSignals: 0,
            deliveryState: "eligible",
            lifecycleState: "active",
            suggestedTargetType: "repo_guidance",
            readinessScore: 10,
            lastEvidenceAt: "2026-05-05T00:00:00.000Z"
          }
        ]
      }),
      limit: 5
    });

    expect(report.reviewItems.map((item) => [item.priority, item.source])).toEqual([
      ["high", "repo_policy"],
      ["high", "hygiene"],
      ["medium", "export_drafts"]
    ]);
    expect(report.recommendedReviewOrder.slice(0, 3)).toEqual(["repo_policy", "hygiene", "export_drafts"]);
    expect(report.reviewItems[0]).toMatchObject({
      title: "Repo policy circuit is tripped",
      drillDown: {
        cli: "ee inspect repo",
        mcpResource: "experienceengine://repo-summary"
      }
    });
    expect(report.reviewItems[1].drillDown).toMatchObject({
      cli: "ee inspect hygiene",
      brokerAction: "inspect_experience_hygiene"
    });
    expect(report.reviewItems[2].drillDown).toMatchObject({
      cli: "ee inspect export-drafts",
      mcpResource: "experienceengine://export-drafts",
      brokerAction: "inspect_export_drafts"
    });
    expect(report.reviewOnlyNextActions[0]).toMatchObject({
      priority: "high",
      drillDown: {
        cli: "ee inspect repo"
      }
    });
  });

  it("bounds surfaced findings and drafts while preserving source totals", () => {
    const report = buildOperatorReviewFlow({
      repo: makeRepo(),
      hygiene: makeHygiene({
        summary: {
          total: 2,
          byType: {
            stale_experience: 2,
            duplicate_guidance: 0,
            conflicting_guidance: 0,
            over_generalized_guidance: 0,
            evidence_drift: 0
          },
          bySeverity: {
            high: 0,
            medium: 2,
            low: 0
          }
        },
        findings: [0, 1].map((index) => ({
          type: "stale_experience",
          severity: "medium",
          affectedNodeIds: [`node_${index}`],
          affectedCandidateIds: [],
          evidenceSummary: `Node ${index} is stale.`,
          recommendation: "Review the node.",
          evidenceRefs: [`input_${index}`],
          createdAt: "2026-05-05T00:00:00.000Z"
        }))
      }),
      exportDrafts: makeExportDrafts({
        summary: {
          total: 2,
          byRisk: {
            high: 0,
            medium: 2,
            low: 0
          },
          byTargetType: {
            instruction_note: 0,
            repo_guidance: 2,
            skill_candidate: 0,
            documentation_note: 0,
            do_not_export: 0
          }
        },
        drafts: [0, 1].map((index) => ({
          draftId: `draft_${index}`,
          scopeId: "scope_repo",
          nodeIds: [`node_${index}`],
          contextCandidateIds: [],
          nodeType: "strategy",
          taskFamily: "test_debug",
          guidanceText: "Run tests.",
          evidenceSummary: `Draft ${index}`,
          provenanceRefs: [`input_${index}`],
          risk: "medium",
          riskNotes: [],
          hygieneNotes: [],
          helpedSignals: 1,
          harmedSignals: 0,
          deliveryState: "eligible",
          lifecycleState: "active",
          suggestedTargetType: "repo_guidance",
          readinessScore: 10,
          lastEvidenceAt: "2026-05-05T00:00:00.000Z"
        }))
      }),
      limit: 1
    });

    expect(report.sections.hygiene.total).toBe(2);
    expect(report.sections.hygiene.surfacedFindings).toHaveLength(1);
    expect(report.sections.export_drafts.total).toBe(2);
    expect(report.sections.export_drafts.surfacedDrafts).toHaveLength(1);
  });

  it("surfaces autonomous governance failures, recent automatic actions, and pending approvals", () => {
    const report = buildOperatorReviewFlow({
      repo: makeRepo(),
      hygiene: makeHygiene(),
      exportDrafts: makeExportDrafts(),
      governance: {
        status: "attention",
        recentAutomaticActions: 2,
        failedRuns: 1,
        pendingApprovals: 1,
        lastRunStatus: "failed",
        lastFailureClass: "worker_error",
        drillDown: {
          cli: "ee inspect governance",
          mcpResource: "experienceengine://governance"
        }
      },
      limit: 5
    });

    expect(report.sections.governance).toMatchObject({
      status: "attention",
      recentAutomaticActions: 2,
      failedRuns: 1,
      pendingApprovals: 1,
      lastRunStatus: "failed",
      lastFailureClass: "worker_error"
    });
    expect(report.reviewItems).toEqual([
      expect.objectContaining({
        priority: "medium",
        source: "governance",
        title: "Autonomous governance needs attention",
        drillDown: {
          cli: "ee inspect governance",
          mcpResource: "experienceengine://governance"
        }
      })
    ]);
    expect(report.recommendedReviewOrder[0]).toBe("governance");
  });
});
