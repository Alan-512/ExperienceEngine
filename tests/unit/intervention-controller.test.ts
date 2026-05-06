import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideIntervention, selectInjectableNodes } from "../../src/controller/intervention-controller.js";
import { clearSelectiveSecondOpinionHooksForTests, setSelectiveSecondOpinionHooksForTests } from "../../src/controller/second-opinion-gate.js";
import type { ExperienceInput, ExperienceNode, ScopeTaskStats } from "../../src/types/domain.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";

const defaultDeliveryStateByState: Record<ExperienceNode["state"], NonNullable<ExperienceNode["delivery_state"]>> = {
  candidate: "shadow_only",
  priority_candidate: "conservative_only",
  active: "eligible",
  cooling: "conservative_only",
  retired: "quarantined"
};

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
  state: overrides.state ?? "active",
  delivery_state: overrides.delivery_state ?? defaultDeliveryStateByState[overrides.state ?? "active"],
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
    clearSelectiveSecondOpinionHooksForTests();
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
    expect(decision.text).toContain("Validated prior experience:");
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

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected[0]?.id).toBe("specific-distilled");
  });

  it("prefers expectation-correction priority candidates over generic conservative candidates when the correction context matches", async () => {
    const correctionInput: ExperienceInput = {
      scope_id: "scope_1",
      task_type: "config_debug",
      task_summary:
        "Correction: a previous pass focused too much on UI aliases. In exactly one sentence, say the real issue is runtime config resolution and persisted settings precedence.",
      context_summary:
        "Previous assistant summary: The real issue is runtime config resolution and persisted settings precedence.",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const decision = await decideIntervention(
      correctionInput,
      [
        node({
          id: "generic-competing-candidate",
          task_type: "config_debug",
          state: "priority_candidate",
          trigger_pattern:
            "Diagnose why OpenClaw is selecting the wrong Gemini model. Focus only on UI labels and aliases. Do not inspect runtime config resolution or persisted settings precedence.",
          compact_hint:
            "Stay on the UI model picker and aliases when the Gemini selection looks wrong.",
          support_count: 1
        }),
        node({
          id: "matching-expectation-correction",
          task_type: "config_debug",
          state: "priority_candidate",
          experience_kind: "expectation_correction",
          confidence_signal: "supported_by_objective_success",
          validation_state: "pending_reuse_validation",
          deviation_pattern:
            "Focusing on UI/presentation layer instead of backend configuration logic.",
          corrected_constraint:
            "State the issue as runtime config resolution and persisted settings precedence.",
          trigger_pattern:
            "Agent focuses on UI labels, aliases, or cosmetic symptoms during configuration troubleshooting.",
          compact_hint:
            "Shift focus from UI labels and cosmetic aliases to runtime configuration resolution and the precedence of persisted settings."
        })
      ],
      undefined,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["matching-expectation-correction"]);
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

  it("keeps direct priority-candidate handling conservative when invoked outside the shipped runtime pool", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "priority-direct",
          state: "priority_candidate",
          task_type: "test_debug",
          compact_hint: "Start with the focused failing test before wider edits.",
          support_count: 1
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["priority-direct"]);
  });

  it("keeps cooling nodes on conservative injection even when the match is otherwise strong", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "cooling-node",
          state: "cooling",
          delivery_state: "conservative_only",
          helped_count: 6,
          support_count: 6
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["cooling-node"]);
  });

  it("freezes controller delivery-state outcomes for current lifecycle states", async () => {
    const cases: Array<{
      name: string;
      candidate: Partial<ExperienceNode>;
      expectedMode: "inject" | "inject_conservative" | "skip";
      expectedSelectedIds: string[];
    }> = [
      {
        name: "active eligible nodes inject normally",
        candidate: {
          id: "golden-active",
          state: "active",
          delivery_state: "eligible",
          helped_count: 4,
          support_count: 4
        },
        expectedMode: "inject",
        expectedSelectedIds: ["golden-active"]
      },
      {
        name: "priority candidates stay conservative",
        candidate: {
          id: "golden-priority",
          state: "priority_candidate",
          delivery_state: "conservative_only",
          support_count: 1
        },
        expectedMode: "inject_conservative",
        expectedSelectedIds: ["golden-priority"]
      },
      {
        name: "cooling nodes stay conservative",
        candidate: {
          id: "golden-cooling",
          state: "cooling",
          delivery_state: "conservative_only",
          helped_count: 4,
          support_count: 4
        },
        expectedMode: "inject_conservative",
        expectedSelectedIds: ["golden-cooling"]
      },
      {
        name: "retired nodes are quarantined by default",
        candidate: {
          id: "golden-retired",
          state: "retired",
          helped_count: 8,
          support_count: 8
        },
        expectedMode: "skip",
        expectedSelectedIds: []
      },
      {
        name: "explicitly quarantined active nodes are skipped",
        candidate: {
          id: "golden-quarantined",
          state: "active",
          delivery_state: "quarantined",
          helped_count: 8,
          support_count: 8
        },
        expectedMode: "skip",
        expectedSelectedIds: []
      }
    ];

    for (const testCase of cases) {
      const decision = await decideIntervention(
        input,
        [node(testCase.candidate)],
        stats,
        0.6,
        3
      );

      expect(
        {
          name: testCase.name,
          mode: decision.mode,
          selectedIds: decision.selected.map((entry) => entry.id)
        }
      ).toEqual({
        name: testCase.name,
        mode: testCase.expectedMode,
        selectedIds: testCase.expectedSelectedIds
      });
    }
  });

  it("skips quarantined nodes even if their lifecycle state still looks active", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "quarantined-node",
          state: "active",
          delivery_state: "quarantined",
          helped_count: 8,
          support_count: 8
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("skip");
    expect(decision.selected).toEqual([]);
    expect(decision.text).toBeUndefined();
  });

  it("lets selective sync second opinion veto a risky live injection", async () => {
    setSelectiveSecondOpinionHooksForTests({
      evaluate: async () => ({
        decision: "skip",
        confidence: "high",
        reason: "Recent harm history makes this candidate unsafe.",
        trigger: "harm_history"
      })
    });

    const decision = await decideIntervention(
      input,
      [
        node({
          id: "risky-active",
          state: "active",
          delivery_state: "eligible",
          harmed_count: 1,
          support_count: 4
        })
      ],
      stats,
      0.6,
      3,
      {
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "/tmp/experienceengine-test-embeddings",
        retrievalRerankerMode: "disabled",
        retrievalRerankerModel: "",
        syncSecondOpinionMode: "selective",
        syncSecondOpinionModel: "",
        distillerProvider: "openai_compatible",
        distillationAuthMode: "api_key",
        distillerModel: "gpt-second-opinion"
      }
    );

    expect(decision.mode).toBe("skip");
    expect(decision.selected).toEqual([]);
    expect(decision.diagnostics?.secondOpinionApplied).toBe(true);
    expect(decision.diagnostics?.secondOpinionDecision).toBe("skip");
    expect(decision.diagnostics?.secondOpinionTrigger).toBe("harm_history");
  });

  it("downgrades risky live injection to conservative when second opinion asks for caution", async () => {
    setSelectiveSecondOpinionHooksForTests({
      evaluate: async () => ({
        decision: "allow_conservative",
        confidence: "medium",
        reason: "The candidate is relevant but should ship as a single cautious hint.",
        trigger: "harm_history"
      })
    });

    const decision = await decideIntervention(
      input,
      [
        node({
          id: "top-close-margin",
          state: "active",
          delivery_state: "eligible",
          harmed_count: 1,
          helped_count: 1,
          support_count: 1
        })
      ],
      stats,
      0.6,
      3,
      {
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "/tmp/experienceengine-test-embeddings",
        retrievalRerankerMode: "disabled",
        retrievalRerankerModel: "",
        syncSecondOpinionMode: "selective",
        syncSecondOpinionModel: "",
        distillerProvider: "openai_compatible",
        distillationAuthMode: "api_key",
        distillerModel: "gpt-second-opinion"
      }
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected).toHaveLength(1);
    expect(decision.selected[0]?.id).toBe("top-close-margin");
    expect(decision.diagnostics?.secondOpinionApplied).toBe(true);
    expect(decision.diagnostics?.secondOpinionDecision).toBe("allow_conservative");
    expect(decision.diagnostics?.secondOpinionTrigger).toBe("harm_history");
  });

  it("does not let second opinion promote a shadow diagnostic candidate into live selection", async () => {
    setSelectiveSecondOpinionHooksForTests({
      evaluate: async () => ({
        decision: "allow",
        confidence: "medium",
        reason: "The diagnostic candidate looks related but was not part of the live plan.",
        trigger: "harm_history",
        bestNodeId: "shadow-diagnostic"
      })
    });

    const decision = await decideIntervention(
      input,
      [
        node({
          id: "risky-active",
          state: "active",
          delivery_state: "eligible",
          harmed_count: 1,
          helped_count: 2,
          support_count: 4
        }),
        node({
          id: "shadow-diagnostic",
          state: "candidate",
          delivery_state: "shadow_only",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing vitest auth test in the current workspace",
          compact_hint: "Inspect the auth fixture before changing runtime code."
        })
      ],
      stats,
      0.6,
      3,
      {
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "/tmp/experienceengine-test-embeddings",
        retrievalRerankerMode: "disabled",
        retrievalRerankerModel: "",
        syncSecondOpinionMode: "selective",
        syncSecondOpinionModel: "",
        distillerProvider: "openai_compatible",
        distillationAuthMode: "api_key",
        distillerModel: "gpt-second-opinion"
      }
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["risky-active"]);
    expect(decision.diagnostics?.secondOpinionApplied).toBe(true);
    expect(decision.diagnostics?.selectedCandidateIds).toEqual(["risky-active"]);
  });

  it("keeps an exact priority-candidate family match ahead of unrelated active cross-family nodes", async () => {
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
          state: "priority_candidate",
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

  it("does not append a cross-family strategy when two exact-family strategies already cover the task", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "payments-primary",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
          compact_hint: "Run the failing payments auth test before editing and rerun it after the fix.",
          helped_count: 6,
          support_count: 1
        }),
        node({
          id: "payments-secondary",
          task_type: "test_debug",
          trigger_pattern: "Check the current workspace before fixing the payments auth test",
          compact_hint: "Check the current workspace path before attempting the payments auth-test fix.",
          helped_count: 6,
          support_count: 1
        }),
        node({
          id: "sqlite-cross-family",
          task_type: "integration_fix",
          trigger_pattern: "Repair the broken sqlite ledger migration in ExperienceEngine",
          compact_hint:
            "Use exec to isolate the sqlite ledger migration order mismatch, apply the smallest reordering fix, then rerun exec.",
          helped_count: 5,
          harmed_count: 3,
          support_count: 1
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["payments-primary", "payments-secondary"]);
  });

  it("caps exact-family strategy injection at the two strongest mature hints when coverage is already strong", async () => {
    const decision = await decideIntervention(
      {
        ...input,
        task_summary: "Fix the failing vitest auth test in ExperienceEngine again"
      },
      [
        node({
          id: "family-primary",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing vitest auth test in ExperienceEngine",
          compact_hint: "Run the failing vitest auth test before editing and rerun it after the fix.",
          helped_count: 6,
          support_count: 1
        }),
        node({
          id: "family-secondary",
          task_type: "test_debug",
          trigger_pattern: "Check the current workspace before fixing the vitest auth test",
          compact_hint: "Check the current workspace path before attempting the vitest auth-test fix.",
          helped_count: 5,
          support_count: 1
        }),
        node({
          id: "family-tertiary",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing vitest auth test in ExperienceEngine again",
          compact_hint:
            "Reproduce the failing vitest auth test, make a minimal change based on the failure, and rerun vitest to confirm success.",
          helped_count: 1,
          support_count: 1
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["family-primary", "family-secondary"]);
  });

  it("injects a mature exact-family candidate even when the prompt is long and noisy", async () => {
    const decision = await decideIntervention(
      {
        ...input,
        task_summary:
          "Fix the failing payments auth test in ExperienceEngine. Keep the fix narrow, inspect the repo first, and explain the likely root cause and first corrective step. Do not modify files."
      },
      [
        node({
          id: "payments-mature",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
          compact_hint: "Run the failing payments auth test before editing and rerun it after the fix.",
          goal: "Keep the payments auth test fix narrow",
          recommended_steps: [
            "Run the focused auth test once.",
            "Apply the minimal fix.",
            "Rerun the focused auth test."
          ],
          helped_count: 9,
          support_count: 7,
          validation_state: "validated_by_reuse",
          state: "active"
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["payments-mature"]);
  });

  it("ignores immature runner-up candidates when a mature exact-family candidate is clearly reusable", async () => {
    const decision = await decideIntervention(
      {
        ...input,
        task_summary:
          "Fix the failing payments auth test in ExperienceEngine. Keep the fix narrow, inspect the repo first, and explain the likely root cause and first corrective step. Do not modify files."
      },
      [
        node({
          id: "payments-mature",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
          compact_hint: "Run the failing payments auth test before editing and rerun it after the fix.",
          helped_count: 9,
          support_count: 7,
          state: "active"
        }),
        node({
          id: "sandbox-candidate",
          task_type: "test_debug",
          trigger_pattern: "Vitest startup failure with EROFS error in read-only sandbox environment",
          compact_hint: "Treat read-only sandbox failures as environmental until a writable repro exists.",
          helped_count: 0,
          support_count: 1,
          state: "candidate"
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["payments-mature"]);
    expect(decision.diagnostics?.fastPathApplied).toBe(true);
  });

  it("keeps the injected node aligned with the top fused candidate when lexical paraphrases compete", async () => {
    const decision = await decideIntervention(
      {
        ...input,
        task_summary:
          "Investigate payments auth test regression by checking auth fixture handshake first; no file modifications."
      },
      [
        node({
          id: "payments-mature-top",
          task_type: "test_debug",
          state: "active",
          trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
          compact_hint: "Check the auth fixture handshake before changing the payments auth code path.",
          retrieval_text:
            "Fix the failing payments auth test in ExperienceEngine\nCheck the auth fixture handshake before changing the payments auth code path.",
          helped_count: 9,
          support_count: 7,
          validation_state: "validated_by_reuse"
        }),
        node({
          id: "workspace-paraphrase-runner-up",
          task_type: "test_debug",
          state: "active",
          trigger_pattern: "Investigate payments auth test regression by checking auth fixture handshake first",
          compact_hint: "Check the current workspace path before attempting the payments auth-test fix.",
          retrieval_text:
            "Investigate payments auth test regression by checking auth fixture handshake first\nCheck the current workspace path before attempting the payments auth-test fix.",
          helped_count: 1,
          support_count: 1
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.diagnostics?.topCandidates[0]?.id).toBe("payments-mature-top");
    expect(decision.diagnostics?.topCandidates[0]).toMatchObject({
      retrievalScore: expect.any(Number),
      policyAdjustment: expect.any(Number),
      retrievalReasons: expect.arrayContaining([expect.stringContaining("family:")]),
      policyReasons: expect.arrayContaining([expect.stringContaining("family:")])
    });
    expect(decision.diagnostics?.confidence).toBe("high");
    expect(decision.diagnostics?.budgetClass).toBe("single_hint");
    expect(decision.diagnostics?.selectedCandidateIds).toEqual(["payments-mature-top"]);
    expect(decision.diagnostics?.rejectedCandidates).toEqual([
      expect.objectContaining({
        id: "workspace-paraphrase-runner-up",
        reasonCodes: expect.arrayContaining([expect.any(String)])
      })
    ]);
    expect(decision.selected.map((entry) => entry.id)).toEqual(["payments-mature-top"]);
  });

  it("downgrades close same-family active matches to conservative injection when confidence is still ambiguous", async () => {
    const decision = await decideIntervention(
      {
        ...input,
        task_summary:
          "Review the payments authentication regression in ExperienceEngine, starting from fixture handshake behavior. Keep this read-only."
      },
      [
        node({
          id: "payments-close-top",
          task_type: "test_debug",
          state: "active",
          trigger_pattern: "Inspect the payments auth fixture handshake in ExperienceEngine before changing code",
          compact_hint: "Check the auth fixture handshake before changing the payments auth code path.",
          retrieval_text:
            "Inspect the payments auth fixture handshake in ExperienceEngine before changing code\nCheck the auth fixture handshake before changing the payments auth code path.",
          helped_count: 1,
          harmed_count: 0,
          support_count: 2,
          validation_state: "pending_reuse_validation"
        }),
        node({
          id: "payments-close-runner-up",
          task_type: "test_debug",
          state: "active",
          trigger_pattern: "Review the payments authentication handshake before editing the test flow",
          compact_hint: "Inspect the auth fixture handshake before editing the payments auth flow.",
          retrieval_text:
            "Review the payments authentication handshake before editing the test flow\nInspect the auth fixture handshake before editing the payments auth flow.",
          helped_count: 1,
          harmed_count: 0,
          support_count: 2,
          validation_state: "pending_reuse_validation"
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["payments-close-top"]);
    expect(decision.diagnostics?.gateReason).toBe("uncertainty_aware_routing");
    expect(decision.diagnostics?.decisionReason).toBe("ambiguous_same_family_candidate");
    expect(decision.diagnostics?.confidence).toBe("low");
    expect(decision.diagnostics?.budgetClass).toBe("single_hint");
  });

  it("does not append related-family strategies when an exact-family strategy already matches", async () => {
    const decision = await decideIntervention(
      {
        ...input,
        task_type: "integration_fix",
        task_summary: "Repair the broken sqlite ledger migration in ExperienceEngine"
      },
      [
        node({
          id: "integration-exact",
          task_type: "integration_fix",
          trigger_pattern: "Repair the broken sqlite ledger migration in ExperienceEngine",
          compact_hint:
            "Use exec to isolate the sqlite ledger migration ordering issue, apply the smallest reordering fix, then rerun exec.",
          helped_count: 6,
          harmed_count: 3,
          support_count: 1
        }),
        node({
          id: "payments-related-primary",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
          compact_hint: "Run the failing payments auth test before editing and rerun it after the fix.",
          helped_count: 8,
          support_count: 1
        }),
        node({
          id: "payments-related-secondary",
          task_type: "test_debug",
          trigger_pattern: "Check the current workspace before fixing the payments auth test",
          compact_hint: "Check the current workspace path before attempting the payments auth-test fix.",
          helped_count: 8,
          support_count: 1
        })
      ],
      {
        ...stats,
        task_type: "integration_fix"
      },
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["integration-exact"]);
  });

  it("caps conservative priority-candidate injection at one hint", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "candidate_primary",
          state: "priority_candidate",
          helped_count: 0,
          support_count: 1
        }),
        node({
          id: "candidate_secondary",
          state: "priority_candidate",
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
    expect(decision.selected[0]?.state).toBe("priority_candidate");
  });

  it("uses expectation-correction signals when deciding whether to conservatively inject a priority candidate", async () => {
    const correctionInput: ExperienceInput = {
      scope_id: "scope_1",
      task_type: "config_debug",
      task_summary:
        "This implementation technically works, but the behavior is still wrong because the fix is happening in the UI layer instead of the provider routing layer. Figure out the correct next step.",
      tool_events: [],
      outcome_signal: "unknown",
      context_summary:
        "A similar task is drifting into the UI layer even though the real correction belongs in provider routing behavior.",
      injected_node_ids: []
    };

    const correctionStats: ScopeTaskStats = {
      scope_id: "scope_1",
      task_type: "config_debug",
      total_tasks: 1,
      success_tasks: 1,
      failed_tasks: 0,
      unknown_tasks: 0,
      injected_tasks: 0,
      injected_success_tasks: 0,
      updated_at: new Date().toISOString()
    };

    const decision = await decideIntervention(
      correctionInput,
      [
        node({
          id: "expectation-candidate",
          task_type: "config_debug",
          state: "priority_candidate",
          experience_kind: "expectation_correction",
          confidence_signal: "supported_by_objective_success",
          validation_state: "pending_reuse_validation",
          correction_scope: "host_local",
          correction_category: "implementation_boundary",
          deviation_pattern:
            "Initial implementation addresses symptoms in the UI layer instead of the root cause in provider routing.",
          corrected_constraint:
            "Shift the fix from the presentation layer to the provider routing configuration.",
          trigger_pattern:
            "The first implementation technically worked, but the user corrected the approach: the problem is in provider routing behavior, not the UI.",
          compact_hint:
            "Shift the fix from the presentation layer to the provider routing configuration if the behavior originates from backend or provider logic."
        })
      ],
      correctionStats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["expectation-candidate"]);
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

  it("derives intervention strength without changing injection mode or selected nodes", async () => {
    const strongDecision = await decideIntervention(
      input,
      [
        node({
          id: "strength-strong",
          state: "active",
          delivery_state: "eligible",
          helped_count: 3,
          support_count: 3
        })
      ],
      stats,
      0.6,
      3
    );

    expect(strongDecision.mode).toBe("inject");
    expect(strongDecision.selected.map((entry) => entry.id)).toEqual(["strength-strong"]);
    expect(strongDecision.diagnostics?.interventionStrength).toBe("strong_recommendation");
    expect(strongDecision.text).toContain("Validated prior experience:");

    const softDecision = await decideIntervention(
      input,
      [
        node({
          id: "strength-soft",
          state: "priority_candidate",
          delivery_state: "conservative_only",
          support_count: 1
        })
      ],
      stats,
      0.6,
      3
    );

    expect(softDecision.mode).toBe("inject_conservative");
    expect(softDecision.selected.map((entry) => entry.id)).toEqual(["strength-soft"]);
    expect(softDecision.diagnostics?.interventionStrength).toBe("soft_recommendation");
    expect(softDecision.text).toContain("Relevant prior experience:");
  });

  it("adds retrieval policy diagnostics without changing live intervention behavior", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "retrieval-policy-compatible",
          state: "active",
          delivery_state: "eligible",
          helped_count: 3,
          support_count: 3,
          validation_state: "validated_by_reuse"
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("inject");
    expect(decision.selected.map((entry) => entry.id)).toEqual(["retrieval-policy-compatible"]);
    expect(decision.diagnostics?.interventionStrength).toBe("strong_recommendation");
    expect(decision.text).toContain("Validated prior experience:");
    expect(decision.diagnostics?.retrievalPolicyDiagnostics?.stages.map((stage) => stage.stage)).toEqual([
      "retrieval_context",
      "hard_filter",
      "shortlist",
      "semantic_rerank_backfill",
      "policy_enrichment",
      "decision_assembly"
    ]);
    expect(decision.diagnostics?.retrievalPolicyDiagnostics?.stages.at(-1)?.reasonCodes).toEqual([
      "strong_candidate_fast_path",
      "mature_validated_candidate"
    ]);
  });

  it("delivers at most one same-scope safe shadow candidate as a diagnostic hint", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "diagnostic-primary",
          state: "candidate",
          delivery_state: "shadow_only",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing vitest auth test in the current workspace",
          compact_hint: "Run the failing vitest auth test before editing and verify after the fix.",
          recommended_steps: ["Run the focused auth test first."]
        }),
        node({
          id: "diagnostic-secondary",
          state: "candidate",
          delivery_state: "shadow_only",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing vitest auth test in the current workspace",
          compact_hint: "Check the auth fixture before editing unrelated files.",
          recommended_steps: ["Inspect the auth fixture."]
        })
      ],
      stats,
      0.6,
      3,
      undefined,
      {
        scopeId: "scope_1",
        host: "codex",
        taskType: "test_debug",
        taskSummary: "Fix the failing vitest auth test in the current workspace",
        failureSignature: "failing vitest auth test",
        toolNames: ["vitest"],
        outcomeSignal: "unknown",
        injectedNodeIds: []
      }
    );

    expect(decision.mode).toBe("inject_conservative");
    expect(decision.selected).toHaveLength(1);
    expect(decision.selected[0]?.state).toBe("candidate");
    expect(decision.diagnostics?.interventionStrength).toBe("diagnostic_hint");
    expect(decision.text).toContain("Diagnostic lead from prior experience:");
  });

  it("records diagnostic candidates without delivery when the live gate rejects them", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "diagnostic-harmed",
          state: "candidate",
          delivery_state: "shadow_only",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing vitest auth test in the current workspace",
          compact_hint: "Run the failing vitest auth test before editing and verify after the fix.",
          harmed_count: 1
        })
      ],
      stats,
      0.6,
      3
    );

    expect(decision.mode).toBe("skip");
    expect(decision.selected).toEqual([]);
    expect(decision.text).toBeUndefined();
    expect(decision.diagnostics?.interventionStrength).toBe("diagnostic_hint");
    expect(decision.diagnostics?.recordOnlyDiagnosticCandidateIds).toEqual(["diagnostic-harmed"]);
  });

  it("keeps destructive shadow candidates record-only even when other diagnostic signals match", async () => {
    const decision = await decideIntervention(
      input,
      [
        node({
          id: "diagnostic-destructive",
          state: "candidate",
          delivery_state: "shadow_only",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing vitest auth test in the current workspace",
          compact_hint: "Run git reset --hard before checking the failing vitest auth test.",
          recommended_steps: ["Run git reset --hard before verifying the failure."]
        })
      ],
      stats,
      0.6,
      3,
      undefined,
      {
        scopeId: "scope_1",
        host: "codex",
        taskType: "test_debug",
        taskSummary: "Fix the failing vitest auth test in the current workspace",
        failureSignature: "failing vitest auth test",
        toolNames: ["vitest"],
        outcomeSignal: "unknown",
        injectedNodeIds: []
      }
    );

    expect(decision.mode).toBe("skip");
    expect(decision.selected).toEqual([]);
    expect(decision.diagnostics?.recordOnlyDiagnosticCandidateIds).toEqual(["diagnostic-destructive"]);
  });

});
