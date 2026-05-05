import { describe, expect, it } from "vitest";
import { buildExperienceExportDraftReport } from "../../src/maintenance/experience-export-drafts.js";
import type { AttributionRecord, ExperienceCandidate, ExperienceNode } from "../../src/types/domain.js";

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_export",
  node_type: "strategy",
  scope_id: "scope_repo",
  task_type: "test_debug",
  validation_state: "validated_by_reuse",
  trigger_pattern: "Fix auth test failure",
  applicability_notes: "Use for the same repo test-debug loop.",
  compact_hint: "Run the failing auth test before editing and verify after the fix.",
  recommended_steps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
  avoid_steps: ["Avoid broad refactors before reproducing the failure."],
  fallback_steps: [],
  success_signal: "The targeted auth test passes.",
  evidence_summary: "Recovered the same auth test failure in a prior task.",
  retrieval_text: "Fix auth test failure Run the failing auth test before editing",
  source_kind: "system_derived",
  origin_record_ids: ["input_origin"],
  helped_record_ids: ["input_helped"],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 2,
  helped_count: 1,
  harmed_count: 0,
  support_count: 2,
  last_used_at: "2026-05-04T00:00:00.000Z",
  last_helped_at: "2026-05-04T00:00:00.000Z",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
  ...overrides
});

const makeCandidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_context",
  source_record_id: "input_candidate",
  scope_id: "scope_repo",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix auth test failure",
  compact_hint: "Run auth tests in a tight verification loop.",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "auth test passes",
  evidence_summary: "Candidate overlaps exportable node.",
  retrieval_text: "Fix auth test failure Run auth tests",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_signal: {
    task_summary: "Fix auth test failure",
    outcome_signal: "success",
    tool_events: [],
    evidence: [],
    retry_count: 0,
    correction_signals: [],
    tool_event_summary: []
  },
  lifecycle_state: "pending",
  retry_count: 0,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
  ...overrides
});

const makeAttribution = (overrides: Partial<AttributionRecord> = {}): AttributionRecord => ({
  id: "attr_export",
  node_id: "node_export",
  delivered: true,
  outcome: "success",
  attribution_verdict: "strong_helped",
  confidence: "high",
  evidence_refs: ["input_attr"],
  source: "automatic",
  created_at: "2026-05-04T01:00:00.000Z",
  ...overrides
});

describe("experience export drafts", () => {
  it("builds bounded review-only drafts from default-exportable formal nodes", () => {
    const report = buildExperienceExportDraftReport({
      nodes: [
        makeNode({ id: "node_ready", helped_record_ids: ["input_ready"] }),
        makeNode({ id: "node_retired", state: "retired", delivery_state: "quarantined", harmed_count: 2 }),
        makeNode({ id: "node_cooling", state: "cooling", delivery_state: "conservative_only" })
      ],
      candidates: [makeCandidate()],
      attributionRecords: [makeAttribution({ node_id: "node_ready" })],
      filters: { scopeId: "scope_repo", limit: 10 },
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(report.summary.total).toBe(1);
    expect(report.drafts[0]).toMatchObject({
      draftId: "draft_node_ready",
      nodeIds: ["node_ready"],
      contextCandidateIds: [],
      risk: "low",
      suggestedTargetType: "repo_guidance",
      lifecycleState: "active",
      deliveryState: "eligible"
    });
    expect(report.drafts[0].guidanceText).toContain("Run the failing auth test");
    expect(report.drafts[0].provenanceRefs).toEqual(expect.arrayContaining(["input_origin", "input_ready", "input_attr"]));
  });

  it("returns low-readiness formal nodes only when explicitly filtered and marks them not exportable", () => {
    const report = buildExperienceExportDraftReport({
      nodes: [
        makeNode({
          id: "node_priority",
          state: "priority_candidate",
          delivery_state: "conservative_only",
          helped_count: 0,
          harmed_count: 0
        })
      ],
      filters: { scopeId: "scope_repo", state: "priority_candidate", deliveryState: "conservative_only" }
    });

    expect(report.summary.total).toBe(1);
    expect(report.drafts[0]).toMatchObject({
      draftId: "draft_node_priority",
      risk: "medium",
      suggestedTargetType: "do_not_export"
    });
    expect(report.drafts[0].riskNotes).toEqual(
      expect.arrayContaining(["Not default-exportable: lifecycle=priority_candidate, delivery=conservative_only."])
    );
  });

  it("downgrades high-severity hygiene findings to do_not_export and keeps raw candidates as context only", () => {
    const report = buildExperienceExportDraftReport({
      nodes: [makeNode({ id: "node_conflict" })],
      candidates: [makeCandidate({ id: "candidate_conflict" })],
      hygieneFindings: [
        {
          type: "conflicting_guidance",
          severity: "high",
          affectedNodeIds: ["node_conflict"],
          affectedCandidateIds: ["candidate_conflict"],
          evidenceSummary: "Same-scope nodes disagree on whether to update generated config.",
          recommendation: "Review the conflict before exporting either lesson.",
          evidenceRefs: ["input_conflict"],
          createdAt: "2026-05-04T02:00:00.000Z"
        }
      ],
      filters: { scopeId: "scope_repo", risk: "high" }
    });

    expect(report.summary.total).toBe(1);
    expect(report.drafts[0]).toMatchObject({
      draftId: "draft_node_conflict",
      contextCandidateIds: ["candidate_conflict"],
      risk: "high",
      suggestedTargetType: "do_not_export"
    });
    expect(report.drafts[0].riskNotes).toEqual(
      expect.arrayContaining(["high hygiene conflicting_guidance: Same-scope nodes disagree on whether to update generated config."])
    );
  });

  it("returns an empty report when no formal node matches filters", () => {
    const report = buildExperienceExportDraftReport({
      nodes: [],
      candidates: [makeCandidate()],
      filters: { scopeId: "scope_repo", limit: 5 }
    });

    expect(report.summary.total).toBe(0);
    expect(report.drafts).toEqual([]);
    expect(report.filters.limit).toBe(5);
  });
});
