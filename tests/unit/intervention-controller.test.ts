import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideIntervention, selectInjectableNodes } from "../../src/controller/intervention-controller.js";
import type { ExperienceInput, ExperienceNode, ScopeTaskStats } from "../../src/types/domain.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";

const node = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_default",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing vitest auth test in the current workspace",
  compact_hint: "Reproduce first, then validate the fix with exec before moving on.",
  success_signal: "Verification tool output confirms the issue is resolved.",
  evidence_summary: "Captured from a successful injected turn.",
  retrieval_text: "Fix the failing vitest auth test in the current workspace\nReproduce first, then validate the fix with exec before moving on.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

const input: ExperienceInput = {
  scope_id: "scope_1",
  task_type: "test_debug",
  task_summary: "Fix the failing vitest auth test in the current workspace",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: []
};

const stats: ScopeTaskStats = {
  scope_id: "scope_1",
  task_type: "test_debug",
  total_tasks: 1,
  success_tasks: 1,
  failed_tasks: 0,
  unknown_tasks: 0,
  injected_tasks: 0,
  injected_success_tasks: 0,
  updated_at: new Date().toISOString()
};

describe("selectInjectableNodes", () => {
  it("prefers strategy nodes over warning nodes", () => {
    const selected = selectInjectableNodes(
      [
        node({ id: "warning", node_type: "warning", compact_hint: "Do not keep iterating blindly." }),
        node({ id: "strategy", node_type: "strategy" })
      ],
      3
    );

    expect(selected.map((entry) => entry.id)).toEqual(["strategy"]);
  });

  it("falls back to warning nodes when no strategy node exists", () => {
    const selected = selectInjectableNodes(
      [node({ id: "warning", node_type: "warning", compact_hint: "Narrow the failure signature first." })],
      3
    );

    expect(selected.map((entry) => entry.id)).toEqual(["warning"]);
  });
});

describe("decideIntervention", () => {
  beforeEach(() => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });
  });

  afterEach(() => {
    clearEmbeddingProviderForTests();
  });

  it("injects only strategy nodes when both types are available", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({ id: "strategy", node_type: "strategy", helped_count: 2 }),
        node({ id: "warning", node_type: "warning", compact_hint: "Do not keep iterating blindly." })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["strategy"]);
    expect(decision.text).toContain("Execution hints");
    expect(decision.text).not.toContain("Do not keep iterating blindly.");
  });

  it("uses the selected strategy trigger instead of a higher-ranked warning trigger", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "warning",
          node_type: "warning",
          trigger_pattern: "Execution hints from prior similar tasks: search around config drift first.",
          compact_hint: "Do not keep iterating blindly.",
          helped_count: 8,
          support_count: 8
        }),
        node({
          id: "strategy",
          node_type: "strategy",
          trigger_pattern: "Fix the failing vitest auth test in the current workspace",
          helped_count: 2,
          support_count: 2
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["strategy"]);
    expect(decision.text).toContain("Reproduce first, then validate the fix with exec before moving on.");
  });

  it("injects warning nodes when they are the only available guidance", async () => {
    const decision = await decideIntervention(
      input,
      [node({ id: "warning", node_type: "warning", compact_hint: "Narrow the failure signature first." })],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["warning"]);
    expect(decision.text).toContain("Narrow the failure signature first.");
  });

  it("keeps specific distilled strategy nodes ahead of legacy generic strategies", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "legacy-generic",
          compact_hint: "Reproduce first, then validate the fix with exec before moving on.",
          helped_count: 21,
          support_count: 12
        }),
        node({
          id: "specific-distilled",
          compact_hint:
            "Reproduce the failing auth baseline test with exec, make the smallest matching code change, then rerun exec.",
          trigger_pattern: "Repair the failing auth baseline test in the current workspace",
          helped_count: 1,
          support_count: 1,
          recommended_steps: [
            "Run the focused baseline test once to reproduce.",
            "Make the smallest matching change.",
            "Rerun the focused baseline test."
          ]
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected[0]?.id).toBe("specific-distilled");
  });

  it("prefers exact task-family strategies over general fallback nodes", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "general-fallback",
          task_type: "general",
          compact_hint:
            "Use exec as the verification loop for this coding task, keep the change narrow, and rerun it before moving on.",
          helped_count: 4,
          support_count: 4
        }),
        node({
          id: "exact-test-node",
          task_type: "test_debug",
          compact_hint:
            "Reproduce the failing test with exec, make the smallest code change that matches the failure, then rerun exec.",
          trigger_pattern: "Repair the failing auth baseline test in the current workspace",
          recommended_steps: [
            "Run the focused baseline test once to reproduce.",
            "Make the smallest matching change.",
            "Rerun the focused baseline test."
          ]
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected[0]?.id).toBe("exact-test-node");
  });

  it("keeps an exact candidate-family match ahead of unrelated active cross-family nodes", async () => {
    const decision = await decideIntervention(
      {
        ...input,
        task_type: "integration_fix",
        task_summary: "Repair the broken sqlite ledger migration in ExperienceEngine"
      },
      [
        node({
          id: "older-active-cross-family",
          task_type: "test_debug",
          state: "active",
          trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
          compact_hint: "Run the failing payments auth test before editing and rerun it after the fix.",
          helped_count: 3,
          support_count: 3
        }),
        node({
          id: "exact-candidate-match",
          task_type: "integration_fix",
          state: "candidate",
          trigger_pattern: "Repair the broken sqlite ledger migration in ExperienceEngine",
          compact_hint:
            "Use exec to isolate the sqlite ledger migration order mismatch, apply the smallest reordering fix, then rerun exec.",
          recommended_steps: [
            "Run the focused ledger migration verification once.",
            "Apply the smallest migration ordering fix.",
            "Rerun the focused ledger migration verification."
          ]
        })
      ],
      {
        ...stats,
        task_type: "integration_fix"
      },
      0.6,
      3
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected[0]?.id).toBe("exact-candidate-match");
  });

  it("caps conservative candidate injection at one hint", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "candidate_primary",
          state: "candidate",
          helped_count: 0,
          support_count: 1
        }),
        node({
          id: "candidate_secondary",
          state: "candidate",
          trigger_pattern: "Fix the failing vitest auth test in the same workspace by checking the mock service first",
          compact_hint: "Check the mock service before editing the auth flow.",
          helped_count: 0,
          support_count: 1
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected).toHaveLength(1);
    expect(decision.selected[0]?.state).toBe("candidate");
  });

  it("awaits the active embedding provider before selecting nodes", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const decision = await decideIntervention(
      input,
      [
        node({
          id: "semantic-local-node",
          embedding: [1, 0, 0],
          embedding_provider: "local",
          embedding_model: "Xenova/multilingual-e5-small",
          embedding_version: "local-e5-v1",
          embedding_dimensions: 3
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected[0]?.id).toBe("semantic-local-node");
  });
});
