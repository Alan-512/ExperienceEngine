import { describe, expect, it } from "vitest";
import { enrichPolicyForCandidate } from "../../src/controller/policy-enricher.js";
import type { ExperienceInput, ExperienceNode, RetrievalContext } from "../../src/types/domain.js";

const input = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_repo",
  task_type: "config_debug",
  task_summary: "Correction: the provider routing layer is still wrong.",
  tool_events: [],
  outcome_signal: "unknown",
  context_summary: "The real issue is provider routing instead of the UI layer.",
  injected_node_ids: [],
  ...overrides
});

const node = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_correction",
  node_type: "strategy",
  scope_id: "scope_repo",
  task_type: "config_debug",
  trigger_pattern: "Correct the provider routing layer before touching UI state.",
  compact_hint: "Move the fix into provider routing instead of the UI layer.",
  success_signal: "The provider routing path resolves the issue.",
  evidence_summary: "Recovered after moving the fix away from the UI layer.",
  retrieval_text: "Correct the provider routing layer before touching UI state.\nMove the fix into provider routing instead of the UI layer.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "candidate",
  usage_count: 0,
  helped_count: 1,
  harmed_count: 0,
  support_count: 1,
  experience_kind: "expectation_correction",
  confidence_signal: "supported_by_objective_success",
  validation_state: "pending_reuse_validation",
  correction_category: "implementation_boundary",
  deviation_pattern: "The previous pass fixed the UI layer instead of provider routing.",
  corrected_constraint: "Move the fix into provider routing instead of the UI layer.",
  created_at: "2026-04-03T00:00:00.000Z",
  updated_at: "2026-04-03T00:00:00.000Z",
  ...overrides
});

const retrievalContext = (overrides: Partial<RetrievalContext> = {}): RetrievalContext => ({
  scopeId: "scope_repo",
  host: "codex",
  taskType: "config_debug",
  taskSummary: "Correction: the provider routing layer is still wrong.",
  contextSummary: "The real issue is provider routing instead of the UI layer.",
  toolNames: ["exec_command"],
  failureSignature: "provider routing layer instead of the UI layer",
  outcomeSignal: "unknown",
  injectedNodeIds: [],
  isReadOnly: true,
  modulePaths: ["src/provider/routing.ts"],
  expectationCorrectionIntent: true,
  ...overrides
});

describe("enrichPolicyForCandidate", () => {
  it("splits family and policy adjustments without changing candidate semantics", () => {
    const enrichment = enrichPolicyForCandidate(input(), node(), retrievalContext());

    expect(enrichment.familyScore).toBe(1);
    expect(enrichment.policyAdjustment).toBe(enrichment.policyScore);
    expect(enrichment.policyScore).toBeGreaterThan(0);
    expect(enrichment.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("family:"),
        expect.stringContaining("maturity:"),
        expect.stringContaining("expectation_correction:"),
        "host:codex",
        "tool_names:1",
        "read_only:yes",
        "module_paths:1"
      ])
    );
  });

  it("applies a generic-hint penalty when the candidate is a legacy generic strategy", () => {
    const enrichment = enrichPolicyForCandidate(
      input({ task_type: "test_debug", task_summary: "Fix the failing auth test" }),
      node({
        task_type: "test_debug",
        experience_kind: undefined,
        compact_hint: "Reproduce first, then validate the fix with exec before moving on.",
        corrected_constraint: undefined,
        correction_category: undefined,
        deviation_pattern: undefined
      })
    );

    expect(enrichment.reasons).toContain("generic_penalty:0.2200");
  });
});
