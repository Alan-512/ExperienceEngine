import { describe, expect, it } from "vitest";
import { validateHygieneGovernancePlan } from "../../src/maintenance/hygiene-governance-validator.js";
import type {
  HygieneGovernanceInput,
  HygieneGovernancePlan
} from "../../src/maintenance/hygiene-governance-planner.js";

const baseInput = (): HygieneGovernanceInput => ({
  scope: { scopeId: "scope_repo", scopeName: "repo", scopeType: "repo" },
  generatedAt: "2026-05-16T10:00:00.000Z",
  findingHash: "hygiene_findings_hash",
  review: {
    total: 1,
    byType: {
      stale_experience: 0,
      duplicate_guidance: 1,
      conflicting_guidance: 0,
      over_generalized_guidance: 0,
      evidence_drift: 0
    },
    bySeverity: { high: 0, medium: 1, low: 0 }
  },
  findings: [
    {
      type: "duplicate_guidance",
      severity: "medium",
      affectedNodeIds: ["node_a", "node_b"],
      affectedCandidateIds: [],
      evidenceSummary: "duplicate",
      recommendation: "merge",
      evidenceRefs: ["input_a", "input_b"],
      createdAt: "2026-05-16T09:00:00.000Z"
    }
  ],
  nodes: [
    {
      id: "node_a",
      scopeId: "scope_repo",
      nodeType: "strategy",
      taskType: "test_debug",
      state: "active",
      deliveryState: "eligible",
      triggerPattern: "Fix provider config mismatch",
      compactHint: "Inspect runtime provider config before changing generated config.",
      recommendedSteps: ["inspect runtime provider config"],
      avoidSteps: [],
      originRecordIds: ["input_a"],
      helpedRecordIds: ["input_helped"],
      harmedRecordIds: [],
      usageCount: 2,
      helpedCount: 1,
      harmedCount: 0,
      supportCount: 2,
      updatedAt: "2026-05-16T09:00:00.000Z"
    },
    {
      id: "node_b",
      scopeId: "scope_repo",
      nodeType: "strategy",
      taskType: "test_debug",
      state: "priority_candidate",
      deliveryState: "conservative_only",
      triggerPattern: "Fix provider config mismatch",
      compactHint: "Inspect runtime provider config before changing generated config.",
      recommendedSteps: ["inspect runtime provider config"],
      avoidSteps: [],
      originRecordIds: ["input_b"],
      helpedRecordIds: [],
      harmedRecordIds: [],
      usageCount: 0,
      helpedCount: 0,
      harmedCount: 0,
      supportCount: 1,
      updatedAt: "2026-05-16T08:00:00.000Z"
    }
  ],
  candidates: [],
  attributions: [],
  exportRiskNotes: [],
  evidenceRefs: ["input_a", "input_b", "input_helped"]
});

const planWithAction = (action: HygieneGovernancePlan["actions"][number]): HygieneGovernancePlan => ({
  source: "deterministic_fallback",
  scopeId: "scope_repo",
  findingHash: "hygiene_findings_hash",
  clusters: [],
  actions: [action]
});

describe("hygiene governance validator", () => {
  it("accepts exact duplicate merges only when scope, task family, node type, and evidence are preserved", () => {
    const input = baseInput();
    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_merge",
      actionType: "merge_exact_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a", "node_b"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_a",
      expectedEffect: "Preserve evidence and merge duplicate guidance."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({ decision: "accept" });
  });

  it("rejects multi-node safety actions before automatic guarded execution", () => {
    const input = baseInput();

    const result = validateHygieneGovernancePlan(input, {
      source: "llm",
      scopeId: input.scope.scopeId,
      findingHash: input.findingHash,
      clusters: [],
      actions: [
        {
          actionId: "action_multi_quarantine",
          actionType: "quarantine",
          riskLevel: "high",
          approvalRequired: true,
          affectedNodeIds: ["node_a", "node_b"],
          affectedCandidateIds: [],
          expectedEffect: "Quarantine a conflict cluster."
        }
      ]
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        actionId: "action_multi_quarantine",
        decision: "reject",
        reasonCode: "safety_action_requires_single_node"
      })
    ]);
  });

  it("accepts conflicted helped and harmed merges through guarded automatic execution", () => {
    const input = baseInput();
    input.nodes[1] = {
      ...input.nodes[1],
      harmedRecordIds: ["input_harmed"],
      harmedCount: 1
    };
    input.evidenceRefs.push("input_harmed");

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_merge",
      actionType: "merge_exact_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a", "node_b"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_a",
      expectedEffect: "Preserve evidence and merge duplicate guidance."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({
      decision: "accept_guarded",
      reasonCode: "conflicted_helped_harmed_merge_guarded"
    });
  });

  it("rejects rewrites until a replacement-node contract exists", () => {
    const input = baseInput();
    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_rewrite",
      actionType: "rewrite_guidance",
      riskLevel: "medium",
      approvalRequired: false,
      affectedNodeIds: ["node_a"],
      affectedCandidateIds: [],
      expectedEffect: "Make guidance more general for config issues.",
      rationale: "broaden trigger"
    }));

    expect(result.accepted).toBe(false);
    expect(result.actions[0]).toMatchObject({
      decision: "reject",
      reasonCode: "rewrite_requires_replacement_contract"
    });
  });

  it("accepts near-duplicate merge only when one side is shadow-only or has no feedback history", () => {
    const input = baseInput();
    input.nodes[1] = {
      ...input.nodes[1],
      deliveryState: "shadow_only",
      triggerPattern: "Fix provider config mismatch in OpenRouter canary",
      compactHint: "Inspect runtime provider config before changing generated config in canary runs."
    };

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_near_merge",
      actionType: "merge_near_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a", "node_b"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_b",
      expectedEffect: "Merge near duplicate while preserving the narrower canary trigger."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({
      decision: "accept",
      reasonCode: "near_duplicate_merge_validated"
    });
  });

  it("routes near-duplicate merges with feedback history on both sides to guarded automatic execution", () => {
    const input = baseInput();
    input.nodes[1] = {
      ...input.nodes[1],
      helpedRecordIds: ["input_b_helped"],
      helpedCount: 1,
      supportCount: 2,
      triggerPattern: "Fix provider config mismatch in OpenRouter canary",
      compactHint: "Inspect runtime provider config before changing generated config in canary runs."
    };
    input.evidenceRefs.push("input_b_helped");

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_near_merge_history",
      actionType: "merge_near_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a", "node_b"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_b",
      expectedEffect: "Merge near duplicate guidance."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({
      decision: "accept_guarded",
      reasonCode: "near_duplicate_merge_guarded"
    });
  });

  it("accepts stale shadow retirement only for unused shadow-only guidance", () => {
    const input = baseInput();
    input.findings = [];
    input.nodes = [{
      ...input.nodes[1],
      id: "node_shadow",
      scopeId: "scope_repo",
      state: "candidate",
      deliveryState: "shadow_only",
      supportCount: 0,
      updatedAt: "2026-01-01T00:00:00.000Z"
    }];

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_retire",
      actionType: "retire_stale_shadow",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_shadow"],
      affectedCandidateIds: [],
      expectedEffect: "Retire stale shadow-only guidance."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({ decision: "accept" });
  });

  it("rejects stale shadow retirement when the origin evidence is recent", () => {
    const input = baseInput();
    input.nodes = [{
      ...input.nodes[1],
      id: "node_recent_shadow",
      state: "candidate",
      deliveryState: "shadow_only",
      supportCount: 0,
      updatedAt: "2026-05-16T09:00:00.000Z"
    }];

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_retire_recent",
      actionType: "retire_stale_shadow",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_recent_shadow"],
      affectedCandidateIds: [],
      expectedEffect: "Retire recent shadow-only guidance."
    }));

    expect(result.accepted).toBe(false);
    expect(result.actions[0]).toMatchObject({
      decision: "reject",
      reasonCode: "stale_shadow_retire_criteria_not_met"
    });
  });

  it("rejects automatic merges across scope boundaries", () => {
    const input = baseInput();
    input.nodes[1] = {
      ...input.nodes[1],
      scopeId: "scope_other"
    };

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_cross_scope",
      actionType: "merge_exact_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a", "node_b"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_a",
      expectedEffect: "Merge exact duplicate guidance."
    }));

    expect(result.accepted).toBe(false);
    expect(result.actions[0]).toMatchObject({
      decision: "reject",
      reasonCode: "scope_crossing_action"
    });
  });

  it("accepts delivery promotion only as guarded conservative delivery", () => {
    const input = baseInput();
    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_promote",
      actionType: "promote_delivery",
      riskLevel: "high",
      approvalRequired: true,
      affectedNodeIds: ["node_b"],
      affectedCandidateIds: [],
      expectedEffect: "Promote conservative guidance."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({
      decision: "accept_guarded",
      reasonCode: "promotion_guarded_to_conservative_delivery"
    });
  });

  it("accepts delete records only as guarded soft-retire actions", () => {
    const input = baseInput();
    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_soft_delete",
      actionType: "delete_record",
      riskLevel: "high",
      approvalRequired: false,
      affectedNodeIds: ["node_b"],
      affectedCandidateIds: [],
      expectedEffect: "Remove stale conflicting guidance from delivery."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({
      decision: "accept_guarded",
      reasonCode: "delete_record_guarded_soft_retire"
    });
  });

  it("accepts safety downgrade when eligible guidance has harmed attribution evidence", () => {
    const input = baseInput();
    input.attributions = [{
      id: "attr_weak_harm",
      nodeId: "node_a",
      delivered: true,
      outcome: "failure",
      verdict: "weak_harmed",
      confidence: "medium",
      evidenceRefs: ["input_harmed"],
      createdAt: "2026-05-16T09:30:00.000Z"
    }];
    input.evidenceRefs.push("input_harmed");

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_downgrade",
      actionType: "downgrade_delivery",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a"],
      affectedCandidateIds: [],
      expectedEffect: "Move risky eligible guidance to conservative delivery."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({
      decision: "accept",
      reasonCode: "safety_delivery_downgrade_validated"
    });
  });

  it("accepts quarantine when live guidance has strong harmed attribution evidence", () => {
    const input = baseInput();
    input.attributions = [{
      id: "attr_strong_harm",
      nodeId: "node_a",
      delivered: true,
      outcome: "failure",
      verdict: "strong_harmed",
      confidence: "high",
      evidenceRefs: ["input_strong_harmed"],
      createdAt: "2026-05-16T09:30:00.000Z"
    }];
    input.evidenceRefs.push("input_strong_harmed");

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_quarantine",
      actionType: "quarantine",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a"],
      affectedCandidateIds: [],
      expectedEffect: "Quarantine risky live guidance."
    }));

    expect(result.accepted).toBe(true);
    expect(result.actions[0]).toMatchObject({
      decision: "accept",
      reasonCode: "safety_quarantine_validated"
    });
  });

  it("rejects plans that omit required evidence references for affected guidance", () => {
    const input = baseInput();
    input.evidenceRefs = ["input_a"];

    const result = validateHygieneGovernancePlan(input, planWithAction({
      actionId: "action_missing_evidence",
      actionType: "merge_exact_duplicate",
      riskLevel: "low",
      approvalRequired: false,
      affectedNodeIds: ["node_a", "node_b"],
      affectedCandidateIds: [],
      canonicalNodeId: "node_a",
      expectedEffect: "Merge exact duplicate guidance."
    }));

    expect(result.accepted).toBe(false);
    expect(result.actions[0]).toMatchObject({
      decision: "reject",
      reasonCode: "missing_evidence_refs"
    });
  });
});
