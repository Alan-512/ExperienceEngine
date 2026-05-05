import { describe, expect, it } from "vitest";
import { buildHygieneReviewReport } from "../../src/maintenance/experience-hygiene.js";
import type { AttributionRecord, ExperienceCandidate, ExperienceNode } from "../../src/types/domain.js";

const NOW = "2026-05-05T00:00:00.000Z";

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_a",
  node_type: "strategy",
  scope_id: "scope_repo",
  task_type: "test_debug",
  trigger_pattern: "Fix auth test failure",
  compact_hint: "Run the failing auth test before editing and verify the same auth test afterward.",
  recommended_steps: ["run auth test"],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "auth test passes",
  evidence_summary: "Recovered the auth test in a prior task.",
  retrieval_text: "Fix auth test failure Run the failing auth test before editing",
  source_kind: "system_derived",
  origin_record_ids: ["input_a"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const makeCandidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_a",
  source_record_id: "input_candidate",
  scope_id: "scope_repo",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix auth test failure",
  compact_hint: "Run the failing auth test before editing and verify the same auth test afterward.",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "auth test passes",
  evidence_summary: "Candidate from auth test recovery.",
  retrieval_text: "Fix auth test failure Run the failing auth test before editing",
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
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  ...overrides
});

const makeAttribution = (overrides: Partial<AttributionRecord> = {}): AttributionRecord => ({
  id: "attr_a",
  node_id: "node_a",
  delivered: true,
  outcome: "failure",
  attribution_verdict: "strong_harmed",
  confidence: "high",
  evidence_refs: ["input_a", "inject_a"],
  source: "automatic",
  created_at: "2026-05-04T00:00:00.000Z",
  ...overrides
});

describe("experience hygiene review", () => {
  it("reports stale, duplicate, conflict, over-generalized, candidate duplicate, and evidence drift findings without mutation inputs", () => {
    const stale = makeNode({ id: "node_stale", origin_record_ids: ["input_stale"] });
    const duplicateA = makeNode({
      id: "node_duplicate_a",
      trigger_pattern: "Repair payments fixture timeout",
      compact_hint: "Run the payments fixture test before editing and verify the payments fixture test after the fix.",
      retrieval_text: "Repair payments fixture timeout Run payments fixture test",
      updated_at: "2026-05-02T00:00:00.000Z"
    });
    const duplicateB = makeNode({
      id: "node_duplicate_b",
      state: "priority_candidate",
      delivery_state: "conservative_only",
      trigger_pattern: "Repair payments fixture timeout",
      compact_hint: "Run the payments fixture test before editing and verify the payments fixture test after the fix.",
      retrieval_text: "Repair payments fixture timeout Run payments fixture test",
      updated_at: "2026-05-03T00:00:00.000Z"
    });
    const conflictA = makeNode({
      id: "node_conflict_a",
      trigger_pattern: "Fix config drift",
      compact_hint: "Update the generated config after reading the runtime config.",
      recommended_steps: ["update generated config"],
      avoid_steps: []
    });
    const conflictB = makeNode({
      id: "node_conflict_b",
      trigger_pattern: "Fix config drift",
      compact_hint: "Avoid generated config changes until runtime config is inspected.",
      recommended_steps: [],
      avoid_steps: ["update generated config"]
    });
    const generic = makeNode({
      id: "node_generic",
      trigger_pattern: "Fix issue",
      compact_hint: "Always check and run test before fix",
      helped_count: 1,
      harmed_count: 2,
      harmed_record_ids: ["input_harmed"],
      last_harmed_at: "2026-05-04T00:00:00.000Z"
    });

    const report = buildHygieneReviewReport({
      nodes: [stale, duplicateA, duplicateB, conflictA, conflictB, generic],
      candidates: [
        makeCandidate({
          id: "candidate_duplicate",
          trigger_pattern: duplicateA.trigger_pattern,
          compact_hint: duplicateA.compact_hint,
          retrieval_text: duplicateA.retrieval_text
        })
      ],
      attributionRecords: [makeAttribution({ node_id: "node_generic" })],
      filters: { scopeId: "scope_repo", now: NOW, limit: 20 }
    });

    expect(report.findings.map((finding) => finding.type)).toEqual(
      expect.arrayContaining([
        "stale_experience",
        "duplicate_guidance",
        "conflicting_guidance",
        "over_generalized_guidance",
        "evidence_drift"
      ])
    );
    expect(report.findings.some((finding) => finding.affectedCandidateIds.includes("candidate_duplicate"))).toBe(true);
    expect(report.findings.find((finding) => finding.type === "evidence_drift")).toMatchObject({
      severity: "high",
      affectedNodeIds: ["node_generic"]
    });
  });

  it("returns an empty bounded report when no hygiene rule matches", () => {
    const report = buildHygieneReviewReport({
      nodes: [
        makeNode({
          id: "node_clean",
          support_count: 4,
          helped_count: 3,
          last_used_at: "2026-05-04T00:00:00.000Z",
          last_helped_at: "2026-05-04T00:00:00.000Z",
          updated_at: "2026-05-04T00:00:00.000Z"
        })
      ],
      candidates: [],
      attributionRecords: [],
      filters: { scopeId: "scope_repo", now: NOW }
    });

    expect(report.summary.total).toBe(0);
    expect(report.findings).toEqual([]);
  });
});
