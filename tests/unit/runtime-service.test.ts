import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { ExperienceRuntimeService } from "../../src/runtime/service.js";
import { decidePosttaskHybridRoute } from "../../src/runtime/service.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-runtime-service-"));
  tempDirs.push(dir);
  return dir;
};

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

const seedStrategyNode = (sqlitePath: string, cwd: string, id: string): void => {
  const db = openDatabase(loadConfig({ sqlitePath }));
  bootstrapDatabase(db);
  const nodeRepo = new NodeRepository(db);
  const scope = resolveScope(cwd);
  const timestamp = nowIso();
  nodeRepo.upsert({
    id,
    node_type: "strategy",
    scope_id: scope.scope_id,
    task_type: "test_debug",
    trigger_pattern: "Fix the failing vitest auth test",
    applicability_notes: "Use the same repo and test scope",
    env_signature: undefined,
    compact_hint: "Run the failing vitest auth test before editing and verify after the fix.",
    goal: "Stabilize the failing vitest auth test",
    recommended_steps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
    avoid_steps: [],
    fallback_steps: [],
    success_signal: "The targeted vitest test passes",
    stop_condition: undefined,
    escalation_condition: undefined,
    evidence_summary: "Recovered the same vitest auth test in a prior task.",
    retrieval_text:
      "Fix the failing vitest auth test\nRun the failing vitest auth test before editing and verify after the fix.",
    source_kind: "system_derived",
    origin_record_ids: ["input_origin"],
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
    created_at: timestamp,
    updated_at: timestamp
  });
};

afterEach(() => {
  clearEmbeddingProviderForTests();
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("ExperienceRuntimeService finalize transaction", () => {
  it("routes an eligible completed run into async hybrid postmortem when enabled", () => {
    const decision = decidePosttaskHybridRoute({
      hybridEnabled: true,
      hybridAsyncPostmortemEnabled: true,
      hybridRoutePolicyVersion: "hybrid-phase1-v1"
    } as ReturnType<typeof loadConfig>, {
      task_summary: "Fix the failing vitest auth test",
      context_summary: "The test failed first, then passed after moving the fix to the provider path."
    }, {
      taskStage: "posttask",
      completedRun: true,
      terminalOutcomeRecorded: true,
      boundedPosttaskCapsuleAvailable: true,
      postmortemAlreadyRecorded: false,
      lightweightOrExcludedTask: false,
      directionalCorrectionPresent: true,
      injectedNodeInteractionPresent: false,
      retryOrInvalidationSignaturePresent: false,
      meaningfulFailureSignaturePresent: false,
      conservativeTransitionReviewWorthy: false
    });

    expect(decision).toMatchObject({
      route: "ESCALATE_ASYNC_POSTMORTEM",
      reasonCode: "eligible_async_postmortem_review"
    });
  });

  it("keeps wording-only completed runs on the fast path even after task completion", () => {
    const decision = decidePosttaskHybridRoute({
      hybridEnabled: true,
      hybridAsyncPostmortemEnabled: true,
      hybridRoutePolicyVersion: "hybrid-phase1-v1"
    } as ReturnType<typeof loadConfig>, {
      task_summary: "Refine the inline notice wording so it feels lighter.",
      context_summary: "This is a wording-only pass for the inline notice copy."
    }, {
      taskStage: "posttask",
      completedRun: true,
      terminalOutcomeRecorded: true,
      boundedPosttaskCapsuleAvailable: true,
      postmortemAlreadyRecorded: false,
      lightweightOrExcludedTask: true,
      directionalCorrectionPresent: false,
      injectedNodeInteractionPresent: false,
      retryOrInvalidationSignaturePresent: false,
      meaningfulFailureSignaturePresent: true,
      conservativeTransitionReviewWorthy: false
    });

    expect(decision).toMatchObject({
      route: "FAST_PATH",
      reasonCode: "default_fast_path"
    });
  });

  it("keeps async postmortem on the fast path when canary excludes the run", () => {
    const decision = decidePosttaskHybridRoute({
      hybridEnabled: true,
      hybridAsyncPostmortemEnabled: true,
      hybridRolloutMode: "canary",
      hybridCanaryRate: 0,
      hybridKillSwitch: false,
      hybridRoutePolicyVersion: "hybrid-phase1-v1"
    } as ReturnType<typeof loadConfig>, {
      task_summary: "Fix the failing vitest auth test",
      context_summary: "The test failed first, then passed after moving the fix to the provider path."
    }, {
      taskStage: "posttask",
      completedRun: true,
      terminalOutcomeRecorded: true,
      boundedPosttaskCapsuleAvailable: true,
      postmortemAlreadyRecorded: false,
      lightweightOrExcludedTask: false,
      directionalCorrectionPresent: true,
      injectedNodeInteractionPresent: false,
      retryOrInvalidationSignaturePresent: false,
      meaningfulFailureSignaturePresent: false,
      conservativeTransitionReviewWorthy: false
    }, "session:control");

    expect(decision).toMatchObject({
      route: "FAST_PATH",
      reasonCode: "default_fast_path"
    });
  });

  it("keeps async postmortem on the fast path when the hybrid kill switch is enabled", () => {
    const decision = decidePosttaskHybridRoute({
      hybridEnabled: true,
      hybridAsyncPostmortemEnabled: true,
      hybridRolloutMode: "live",
      hybridCanaryRate: 1,
      hybridKillSwitch: true,
      hybridRoutePolicyVersion: "hybrid-phase1-v1"
    } as ReturnType<typeof loadConfig>, {
      task_summary: "Fix the failing vitest auth test",
      context_summary: "The test failed first, then passed after moving the fix to the provider path."
    }, {
      taskStage: "posttask",
      completedRun: true,
      terminalOutcomeRecorded: true,
      boundedPosttaskCapsuleAvailable: true,
      postmortemAlreadyRecorded: false,
      lightweightOrExcludedTask: false,
      directionalCorrectionPresent: true,
      injectedNodeInteractionPresent: false,
      retryOrInvalidationSignaturePresent: false,
      meaningfulFailureSignaturePresent: false,
      conservativeTransitionReviewWorthy: false
    }, "session:kill");

    expect(decision).toMatchObject({
      route: "FAST_PATH",
      reasonCode: "default_fast_path"
    });
  });

  it("lets a high-value first-seen lesson enter priority_candidate", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const geminiJsonResponse = (payload: unknown) =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(payload) }]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const rawBody = typeof init?.body === "string" ? init.body : "";
      const parsedBody = rawBody ? (JSON.parse(rawBody) as { system_instruction?: { parts?: Array<{ text?: string }> } }) : {};
      const systemPrompt = parsedBody.system_instruction?.parts?.find((part) => typeof part.text === "string")?.text ?? "";

      if (systemPrompt.includes("merge into an existing node pool")) {
        return geminiJsonResponse({
          action: "ADD",
          reason: "no existing nodes matched"
        });
      }

      if (systemPrompt.includes("coding-experience learner")) {
        return geminiJsonResponse({
          worth_capturing: true,
          experience_kind: "execution_pattern",
          reason: "The run produced a reusable troubleshooting loop with clear verification and avoidance guidance.",
          candidate: {
            node_type: "strategy",
            task_type: "test_debug",
            trigger_pattern: "When a focused regression review should start by isolating the failing check before wider edits",
            compact_hint: "Start with the focused failing check, then verify the first diagnostic step before broad changes.",
            goal: "Keep the investigation inside the smallest failing loop first.",
            recommended_steps: [
              "Run the focused failing check first.",
              "Inspect the first likely diagnostic step before wider edits."
            ],
            avoid_steps: ["Do not broaden the investigation before the focused check is isolated."],
            success_signal: "A focused reproduction identifies the first reliable diagnostic step.",
            evidence_summary: "The focused regression review succeeded after isolating the failing check before wider edits.",
            experience_kind: "execution_pattern",
            confidence_signal: "supported_by_objective_success",
            validation_state: "pending_reuse_validation",
            promotion_signal: "high_value",
            promotion_reason: "The lesson includes a reusable verification loop plus explicit avoidance guidance."
          }
        });
      }

      return geminiJsonResponse({
        trigger_conditions: "A regression review should stay inside the smallest failing loop before wider edits.",
        success_criteria: "A focused reproduction identifies the first reliable diagnostic step.",
        risk_level: "medium",
        trigger_pattern: "When a focused regression review should start by isolating the failing check before wider edits",
        compact_hint: "Start with the focused failing check, then verify the first diagnostic step before broad changes.",
        goal: "Keep the investigation inside the smallest failing loop first.",
        recommended_steps: [
          "Run the focused failing check first.",
          "Inspect the first likely diagnostic step before wider edits."
        ],
        avoid_steps: ["Do not broaden the investigation before the focused check is isolated."],
        fallback_steps: ["If the focused check is inconclusive, widen the scope one boundary at a time."],
        success_signal: "A focused reproduction identifies the first reliable diagnostic step.",
        evidence_summary: "The focused regression review succeeded after isolating the failing check before wider edits.",
        experience_kind: "execution_pattern",
        confidence_signal: "supported_by_objective_success",
        validation_state: "pending_reuse_validation",
        promotion_signal: "high_value",
        promotion_reason: "The lesson includes a reusable verification loop plus explicit avoidance guidance."
      });
    });

    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          distillerProvider: "gemini",
          distillerModel: "gemini-3-flash-preview",
          distillationAuthMode: "api_key",
          distillationMode: "llm",
          distillationAutoDrain: true,
          distillationAllowPassthrough: true
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {
          GEMINI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const prompt =
      "Review the regression in read-only mode and identify the first diagnostic step by isolating the smallest failing check before wider edits.";

    const lookup = await service.beforePromptBuild({
      sessionId: "priority-candidate-a",
      cwd: "/repo",
      userMessage: prompt,
      taskSummary: prompt,
      contextSummary: "A focused regression review should isolate the smallest failing check first."
    });
    expect(lookup.mode).toBe("skip");

    await service.persistToolResult({
      sessionId: "priority-candidate-a",
      toolName: "exec",
      inputSummary: "run the focused failing check",
      outputSummary: "The focused failing check isolated the first reliable diagnostic step.",
      status: "success"
    });
    await service.finalizeTask({
      sessionId: "priority-candidate-a",
      cwd: "/repo",
      userMessage: prompt,
      taskSummary: prompt,
      contextSummary: "The focused regression review succeeded after isolating the failing check first."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const storedNode = db.prepare(
      `SELECT state, promotion_signal, promotion_reason, merge_decision, priority_promotion_applied
       FROM experience_nodes
       ORDER BY updated_at DESC
       LIMIT 1`
    ).get() as {
      state: string;
      promotion_signal: string | null;
      promotion_reason: string | null;
      merge_decision: string | null;
      priority_promotion_applied: number;
    };

    expect(storedNode).toEqual({
      state: "priority_candidate",
      promotion_signal: "high_value",
      promotion_reason: "The lesson includes a reusable verification loop plus explicit avoidance guidance.",
      merge_decision: "ADD",
      priority_promotion_applied: 1
    });
  });

  it("keeps beforePromptBuild on the exact-scope shipped pool and excludes priority candidates", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const db = openDatabase(loadConfig({ sqlitePath }));
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const timestamp = nowIso();

    nodeRepo.upsert({
      id: "scope-priority",
      node_type: "strategy",
      scope_id: "scope_repo",
      task_type: "test_debug",
      trigger_pattern: "Fix the failing vitest auth test",
      compact_hint: "This should stay in learning-only state.",
      success_signal: "The focused test passes.",
      evidence_summary: "Recovered from a prior scoped run.",
      retrieval_text: "Fix the failing vitest auth test\nThis should stay in learning-only state.",
      source_kind: "system_derived",
      origin_record_ids: [],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "priority_candidate",
      usage_count: 0,
      helped_count: 0,
      harmed_count: 0,
      support_count: 1,
      created_at: timestamp,
      updated_at: timestamp
    });
    nodeRepo.upsert({
      id: "other-scope-active",
      node_type: "strategy",
      scope_id: "scope_other",
      task_type: "test_debug",
      trigger_pattern: "Fix the failing vitest auth test",
      compact_hint: "This should stay outside the exact scope.",
      success_signal: "The focused test passes.",
      evidence_summary: "Recovered from a prior scoped run.",
      retrieval_text: "Fix the failing vitest auth test\nThis should stay outside the exact scope.",
      source_kind: "system_derived",
      origin_record_ids: [],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "active",
      usage_count: 0,
      helped_count: 0,
      harmed_count: 0,
      support_count: 1,
      created_at: timestamp,
      updated_at: timestamp
    });

    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        distillationAutoDrain: false,
        distillationAllowPassthrough: true
      }, { homeDir: runtimeDir }),
      undefined,
      { homeDir: runtimeDir, env: {} }
    );

    const prompt = await service.beforePromptBuild({
      sessionId: "exact-scope-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    expect(prompt.mode).toBe("skip");
    expect(prompt.text).toBeUndefined();
    expect(prompt.input.injected_node_ids).toEqual([]);
  });

  it("learns an expectation correction in one run and conservatively injects it on the next similar run", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const geminiJsonResponse = (payload: unknown) =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(payload) }]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        geminiJsonResponse({
          worth_capturing: true,
          experience_kind: "expectation_correction",
          reason: "The successful fix corrected the implementation boundary after the user rejected the first direction.",
          candidate: {
            node_type: "strategy",
            task_type: "config_debug",
            trigger_pattern: "When the implementation technically works but keeps the fix in the UI layer instead of provider routing",
            compact_hint:
              "Do not keep the fix in the UI layer when the real correction belongs in provider routing behavior.",
            success_signal: "The provider probe matches the expected behavior after moving the fix into routing.",
            evidence_summary: "The issue cleared only after moving the fix from the UI layer into provider routing.",
            experience_kind: "expectation_correction",
            confidence_signal: "supported_by_objective_success",
            validation_state: "pending_reuse_validation",
            correction_scope: "host_local",
            correction_category: "implementation_boundary",
            deviation_pattern: "implementation solves the wrong layer of the problem",
            corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
          }
        })
      )
      .mockResolvedValueOnce(
        geminiJsonResponse({
          trigger_conditions:
            "When the implementation technically works but keeps the fix in the UI layer instead of provider routing.",
          success_criteria: "The targeted provider probe reflects the requested behavior after the routing change.",
          risk_level: "medium",
          trigger_pattern: "When the implementation technically works but keeps the fix in the UI layer instead of provider routing",
          compact_hint:
            "Do not keep the fix in the UI layer when the real correction belongs in provider routing behavior.",
          goal: "Move the fix into provider routing rather than polishing the UI layer.",
          recommended_steps: [
            "Check whether the current change is still in the UI layer.",
            "Move the behavior fix into provider routing.",
            "Re-run the targeted provider probe."
          ],
          avoid_steps: ["Do not continue refining UI code when the behavior mismatch is still in provider routing."],
          fallback_steps: ["If the routing move is still ambiguous, isolate the provider path with a narrower probe."],
          success_signal: "The targeted provider probe reflects the requested behavior after the routing change.",
          evidence_summary: "A prior correction only succeeded after moving the fix out of the UI layer.",
          experience_kind: "expectation_correction",
          confidence_signal: "supported_by_objective_success",
          validation_state: "pending_reuse_validation",
          correction_scope: "host_local",
          correction_category: "implementation_boundary",
          deviation_pattern: "implementation solves the wrong layer of the problem",
          corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
        })
      );

    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          distillerProvider: "gemini",
          distillerModel: "gemini-3-flash-preview",
          distillationAuthMode: "api_key",
          distillationMode: "llm",
          distillationAutoDrain: true,
          distillationAllowPassthrough: true
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {
          GEMINI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const firstPrompt =
      "The first implementation technically worked, but the user corrected the approach: the problem is in provider routing behavior, not the UI. Rework the fix around the provider configuration path.";
    const secondPrompt =
      "This implementation technically works, but the behavior is still wrong because the fix is happening in the UI layer instead of the provider routing layer. Figure out the correct next step.";

    const firstLookup = await service.beforePromptBuild({
      sessionId: "expectation-a",
      cwd: "/repo",
      userMessage: firstPrompt,
      taskSummary: firstPrompt,
      contextSummary:
        "The first pass technically succeeded but the user corrected the approach: the fix belongs in provider routing, not the UI layer."
    });
    expect(firstLookup.mode).toBe("skip");

    await service.persistToolResult({
      sessionId: "expectation-a",
      toolName: "user-feedback",
      inputSummary: "user review of the first result",
      outputSummary: "The user said the issue is not the UI; the correction must happen in the provider routing configuration path.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "expectation-a",
      toolName: "targeted-probe",
      inputSummary: "probe provider routing after moving the fix into the configuration layer",
      outputSummary: "The targeted provider probe now matches the expected behavior after moving the fix out of the UI layer.",
      status: "success"
    });
    await service.finalizeTask({
      sessionId: "expectation-a",
      cwd: "/repo",
      userMessage: firstPrompt,
      taskSummary: firstPrompt,
      contextSummary:
        "The task required correcting a technically working but directionally wrong implementation. No explicit user re-confirmation was recorded after the provider-side fix."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const storedNode = db.prepare(
      `SELECT experience_kind, state, validation_state, correction_category, deviation_pattern, corrected_constraint
       FROM experience_nodes
       WHERE experience_kind = 'expectation_correction'
       ORDER BY created_at DESC
       LIMIT 1`
    ).get() as {
      experience_kind: string;
      state: string;
      validation_state: string;
      correction_category: string;
      deviation_pattern: string;
      corrected_constraint: string;
    } | undefined;

    expect(storedNode).toMatchObject({
      experience_kind: "expectation_correction",
      state: "candidate",
      validation_state: "pending_reuse_validation",
      correction_category: "implementation_boundary",
      deviation_pattern: "implementation solves the wrong layer of the problem",
      corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
    });

    const storedCandidate = db.prepare(
      `SELECT source_signal_json
       FROM experience_candidates
       WHERE experience_kind = 'expectation_correction'
       ORDER BY created_at DESC
       LIMIT 1`
    ).get() as { source_signal_json: string } | undefined;

    const sourceSignal = storedCandidate ? (JSON.parse(storedCandidate.source_signal_json) as { directional_correction?: Record<string, unknown> }) : undefined;

    expect(sourceSignal?.directional_correction).toMatchObject({
      detected: true,
      semantic_detected: true,
      correction_category: "implementation_boundary",
      deviation_pattern: "implementation solves the wrong layer of the problem.",
      corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
    });

    const secondLookup = await service.beforePromptBuild({
      sessionId: "expectation-b",
      cwd: "/repo",
      userMessage: secondPrompt,
      taskSummary: secondPrompt,
      contextSummary:
        "A similar task is drifting into the UI layer even though the real correction belongs in provider routing behavior."
    });

    expect(secondLookup.mode).toBe("inject_conservative");
    expect(secondLookup.input.injected_node_ids).toHaveLength(1);
    expect(secondLookup.text).toContain("provider routing");
  });

  it("persists evidence-driven reversal semantics into candidate source signals", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const geminiJsonResponse = (payload: unknown) =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(payload) }]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        geminiJsonResponse({
          worth_capturing: true,
          experience_kind: "execution_pattern",
          reason: "The task exposed a reusable execution pattern.",
          candidate: {
            node_type: "strategy",
            task_type: "config_debug",
            trigger_pattern: "When the first hypothesis looks plausible but needs stronger verification",
            compact_hint: "Validate the current hypothesis with a targeted check before broad edits.",
            success_signal: "The targeted verification passes.",
            evidence_summary: "The task converged after a focused verification loop."
          }
        })
      )
      .mockResolvedValueOnce(
        geminiJsonResponse({
          reversal_detected: true,
          reversal_source: "task_evidence",
          superseded_hypothesis: "Timeout tuning was the wrong active hypothesis.",
          replacement_constraint: "Follow provider-routing evidence instead of persisting in timeout tuning.",
          verification_evidence: "The provider-routing verification passed after the replacement fix.",
          pivot_summary: "The task pivoted into provider routing after the stronger probe.",
          correction_scope: "host_local",
          correction_category: "implementation_boundary",
          deviation_pattern: "the earlier direction was disproven by later task evidence",
          corrected_constraint: "Follow provider-routing evidence instead of persisting in timeout tuning."
        })
      )
      .mockResolvedValueOnce(
        geminiJsonResponse({
          trigger_conditions: "When a stronger probe disproves the current timeout hypothesis",
          success_criteria: "The replacement-path verification passes",
          risk_level: "medium",
          compact_hint: "Follow provider-routing evidence instead of persisting in timeout tuning.",
          recommended_steps: [
            "Identify the current active hypothesis.",
            "Use the strongest invalidating probe to rule it out.",
            "Pivot into the replacement path and re-verify."
          ],
          avoid_steps: ["Do not continue tuning timeouts after the stronger probe disproves that path."],
          fallback_steps: ["If the replacement path is still ambiguous, narrow the provider-routing probe further."],
          evidence_summary: "The provider-routing verification only passed after replacing the timeout hypothesis."
        })
      );

    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          distillerProvider: "gemini",
          distillerModel: "gemini-3-flash-preview",
          distillationAuthMode: "api_key",
          distillationMode: "llm",
          distillationAutoDrain: true,
          distillationAllowPassthrough: true
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {
          GEMINI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const prompt =
      "The timeout tuning path looked plausible, but the stronger provider probe showed the issue was still in provider routing. Fix the failing request path using the strongest evidence.";

    await service.beforePromptBuild({
      sessionId: "reversal-a",
      cwd: "/repo",
      userMessage: prompt,
      taskSummary: prompt,
      contextSummary:
        "The initial timeout-tuning hypothesis was later disproven by a stronger provider-routing probe."
    });

    await service.persistToolResult({
      sessionId: "reversal-a",
      toolName: "analysis-note",
      inputSummary: "document the first hypothesis",
      outputSummary: "Initial working hypothesis: retry timeout tuning may be enough to fix the failing request path.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "reversal-a",
      toolName: "targeted-probe",
      inputSummary: "probe provider routing",
      outputSummary:
        "The targeted provider probe ruled out the timeout hypothesis and showed the request was still failing inside provider routing.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "reversal-a",
      toolName: "apply_patch",
      inputSummary: "move the fix into provider routing",
      outputSummary: "Moved the fix from timeout tuning into provider routing.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "reversal-a",
      toolName: "integration-test",
      inputSummary: "verify provider routing after the pivot",
      outputSummary: "The provider-routing integration verification passed after the routing fix.",
      status: "success"
    });
    await service.finalizeTask({
      sessionId: "reversal-a",
      cwd: "/repo",
      userMessage: prompt,
      taskSummary: prompt,
      contextSummary:
        "The initial timeout-tuning hypothesis was ruled out after a targeted provider probe showed the request was still failing inside provider routing. The investigation pivoted into provider routing, and the final integration verification passed."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const storedCandidate = db.prepare(
      `SELECT source_signal_json
       FROM experience_candidates
       WHERE experience_kind = 'expectation_correction'
       ORDER BY created_at DESC
       LIMIT 1`
    ).get() as { source_signal_json: string } | undefined;

    const sourceSignal = storedCandidate
      ? (JSON.parse(storedCandidate.source_signal_json) as { evidence_driven_reversal?: Record<string, unknown> })
      : undefined;

    expect(sourceSignal?.evidence_driven_reversal).toMatchObject({
      detected: true,
      semantic_detected: true,
      reversal_source: "task_evidence",
      correction_category: "implementation_boundary",
      corrected_constraint: "Follow provider-routing evidence instead of persisting in timeout tuning."
    });
  });

  it("keeps finalized state when background candidate persistence fails", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures")
      }, { homeDir: runtimeDir }),
      undefined,
      { homeDir: runtimeDir, env: {} }
    );

    await service.beforePromptBuild({
      sessionId: "txn-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });
    await service.persistToolResult({
      sessionId: "txn-session",
      toolName: "pnpm test",
      outputSummary: "auth tests passed",
      status: "success"
    });

    const originalPersistCandidatesAsync = (
      service as unknown as {
        persistCandidatesAsync: (input: unknown, originRecordId: string, taskRunId?: string, sessionId?: string) => Promise<void>;
      }
    ).persistCandidatesAsync;
    (
      service as unknown as {
        persistCandidatesAsync: (input: unknown, originRecordId: string, taskRunId?: string, sessionId?: string) => Promise<void>;
      }
    ).persistCandidatesAsync = async () => {
      throw new Error("persist candidate failure");
    };

    await expect(
      service.finalizeTask({
        sessionId: "txn-session",
        cwd: "/repo",
        userMessage: "Fix the failing vitest auth test",
        taskSummary: "Fix the failing vitest auth test"
      })
    ).resolves.toMatchObject({
      task_type: "test_debug",
      outcome_signal: "success"
    });

    await (service as unknown as { waitForBackgroundLearning: () => Promise<void> }).waitForBackgroundLearning();

    (
      service as unknown as {
        persistCandidatesAsync: (input: unknown, originRecordId: string, taskRunId?: string, sessionId?: string) => Promise<void>;
      }
    ).persistCandidatesAsync = originalPersistCandidatesAsync;

    const db = new DatabaseSync(sqlitePath);
    const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };
    const statsCount = db.prepare("SELECT COUNT(*) AS count FROM scope_task_stats").get() as { count: number };
    const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
    const candidateCount = db.prepare("SELECT COUNT(*) AS count FROM experience_candidates").get() as { count: number };

    expect(inputCount.count).toBe(1);
    expect(statsCount.count).toBe(1);
    expect(nodeCount.count).toBe(0);
    expect(candidateCount.count).toBe(0);
  });

  it("persists candidates and distillation jobs before promoting nodes asynchronously", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_scorecard");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        distillationAutoDrain: false,
        distillationAllowPassthrough: true
      }, { homeDir: runtimeDir }),
      undefined,
      { homeDir: runtimeDir, env: {} }
    );

    await service.beforePromptBuild({
      sessionId: "candidate-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });
    await service.persistToolResult({
      sessionId: "candidate-session",
      toolName: "vitest",
      outputSummary: "Auth tests failed",
      status: "failure"
    });
    await service.persistToolResult({
      sessionId: "candidate-session",
      toolName: "vitest",
      outputSummary: "Auth tests passed",
      status: "success"
    });

    await service.finalizeTask({
      sessionId: "candidate-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const taskRunRow = db.prepare(
      "SELECT session_id, task_type, final_status, failure_signature, learning_status, learning_reason FROM task_runs LIMIT 1"
    ).get() as {
      session_id: string | null;
      task_type: string;
      final_status: string;
      failure_signature: string | null;
      learning_status: string | null;
      learning_reason: string | null;
    };
    const outcomeRow = db.prepare(
      "SELECT outcome_signal, failure_signature, summary FROM outcome_records LIMIT 1"
    ).get() as {
      outcome_signal: string;
      failure_signature: string | null;
      summary: string;
    };
    const candidateRow = db.prepare(
      "SELECT lifecycle_state, retry_count, task_run_id, candidate_kind, raw_summary, failure_signature FROM experience_candidates LIMIT 1"
    ).get() as {
      lifecycle_state: string;
      retry_count: number;
      task_run_id: string | null;
      candidate_kind: string | null;
      raw_summary: string | null;
      failure_signature: string | null;
    };
    const jobRow = db.prepare("SELECT status, extractor_profile FROM distillation_jobs LIMIT 1").get() as {
      status: string;
      extractor_profile: string;
    };
    const reviewRows = db
      .prepare("SELECT event_type, source, task_run_id FROM review_events ORDER BY created_at ASC")
      .all() as Array<{
      event_type: string;
      source: string;
      task_run_id: string | null;
    }>;
    const injectionRow = db.prepare(
      "SELECT session_id, task_summary, mode, scorecard_json, was_successful, harm_observed, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      session_id: string | null;
      task_summary: string;
      mode: string;
      scorecard_json: string | null;
      was_successful: number | null;
      harm_observed: number | null;
      attribution_reason: string | null;
    };
    const nodeCountBeforeDrain = db
      .prepare("SELECT COUNT(*) AS count FROM experience_nodes WHERE id != 'node_runtime_scorecard'")
      .get() as { count: number };

    expect(taskRunRow.session_id).toBe("candidate-session");
    expect(taskRunRow.task_type).toBe("test_debug");
    expect(taskRunRow.final_status).toBe("success");
    expect(taskRunRow.failure_signature).toBeTruthy();
    expect(taskRunRow.learning_status).toBe("captured");
    expect(taskRunRow.learning_reason).toBeTruthy();
    expect(outcomeRow.outcome_signal).toBe("success");
    expect(outcomeRow.failure_signature).toBeTruthy();
    expect(outcomeRow.summary).toContain("Fix the failing vitest auth test");
    expect(candidateRow.lifecycle_state).toBe("pending");
    expect(candidateRow.retry_count).toBe(0);
    expect(candidateRow.task_run_id).toBeTruthy();
    expect(candidateRow.candidate_kind).toBe("successful_fix");
    expect(candidateRow.raw_summary).toContain("Auth tests");
    expect(candidateRow.failure_signature).toBeTruthy();
    expect(jobRow.status).toBe("pending");
    expect(jobRow.extractor_profile).toBe("balanced");
    expect(reviewRows).toEqual([
      expect.objectContaining({
        event_type: "mark_helped",
        source: "automatic"
      })
    ]);
    expect(reviewRows[0]?.task_run_id).toBeTruthy();
    expect(injectionRow.session_id).toBe("candidate-session");
    expect(injectionRow.task_summary).toContain("Fix the failing vitest auth test");
    expect(injectionRow.mode).toBe("inject");
    expect(JSON.parse(injectionRow.scorecard_json ?? "{}")).toMatchObject({
      riskLevel: "low",
      topCandidateScore: expect.any(Number),
      scoreMargin: expect.any(Number),
      fastPathApplied: false,
      gateReason: expect.any(String),
      decisionReason: expect.any(String),
      topCandidates: [
        expect.objectContaining({
          semanticScore: expect.any(Number),
          lexicalScore: expect.any(Number),
          fusedScore: expect.any(Number)
        })
      ],
      nodes: [
        expect.objectContaining({
          riskLevel: "low",
          helped: 0,
          harmed: 0
        })
      ]
    });
    expect(injectionRow.was_successful).toBe(1);
    expect(injectionRow.harm_observed).toBe(0);
    expect(injectionRow.attribution_reason).toBe("success_outcome");
    expect(nodeCountBeforeDrain.count).toBe(0);

    await service.drainDistillationQueue();

    const distilledCandidate = db.prepare(
      "SELECT lifecycle_state, distilled_node_id FROM experience_candidates LIMIT 1"
    ).get() as {
      lifecycle_state: string;
      distilled_node_id: string | null;
    };
    const completedJob = db.prepare("SELECT status FROM distillation_jobs LIMIT 1").get() as { status: string };
    const nodeCountAfterDrain = db
      .prepare("SELECT COUNT(*) AS count FROM experience_nodes WHERE id != 'node_runtime_scorecard'")
      .get() as { count: number };

    expect(distilledCandidate.lifecycle_state).toBe("distilled");
    expect(distilledCandidate.distilled_node_id).toBeTruthy();
    expect(completedJob.status).toBe("succeeded");
    expect(nodeCountAfterDrain.count).toBeLessThanOrEqual(1);
  });

  it("marks expression-layer-only tasks as rejected for learning", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          distillationMode: "llm"
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {}
      }
    );

    await service.persistToolResult({
      sessionId: "wording-session",
      toolName: "user-feedback",
      outputSummary: "The inline notice wording is too heavy and should be lighter.",
      status: "success"
    });

    await service.finalizeTask({
      sessionId: "wording-session",
      cwd: "/repo",
      userMessage: "Refine the inline notice wording so it feels lighter.",
      taskSummary: "Refine the inline notice wording so it feels lighter.",
      contextSummary: "This is a wording-only pass for the inline notice copy."
    });

    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const taskRunRow = db.prepare(
      "SELECT learning_status, learning_reason FROM task_runs WHERE session_id = 'wording-session' LIMIT 1"
    ).get() as {
      learning_status: string | null;
      learning_reason: string | null;
    };
    const candidateCount = db.prepare("SELECT COUNT(*) AS count FROM experience_candidates").get() as { count: number };

    expect(taskRunRow.learning_status).toBe("rejected");
    expect(taskRunRow.learning_reason).toContain("expression-layer refinement");
    expect(candidateCount.count).toBe(0);
  });

  it("suppresses delivery in shadow mode but persists the evaluated intervention", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_shadow");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        evaluationMode: "shadow"
      }, { homeDir: runtimeDir }),
      undefined,
      { homeDir: runtimeDir, env: {} }
    );

    const prompt = await service.beforePromptBuild({
      sessionId: "shadow-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    expect(prompt.mode).toBe("skip");
    expect(prompt.text).toBeUndefined();
    expect(prompt.notice).toBeUndefined();
    expect(prompt.scorecard?.mode).toBe("inject");

    await service.finalizeTask({
      sessionId: "shadow-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    const db = new DatabaseSync(sqlitePath);
    const injectionRow = db.prepare(
      "SELECT mode, delivery_mode, delivered, injected_node_ids_json, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      mode: string;
      delivery_mode: string;
      delivered: number;
      injected_node_ids_json: string;
      attribution_reason: string | null;
    };
    const latestRecord = db.prepare(
      "SELECT injected_node_ids_json FROM experience_input_records LIMIT 1"
    ).get() as { injected_node_ids_json: string };
    const reviewCount = db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as { count: number };

    expect(injectionRow.mode).toBe("inject");
    expect(injectionRow.delivery_mode).toBe("shadow");
    expect(injectionRow.delivered).toBe(0);
    expect(injectionRow.attribution_reason).toBe("suppressed_delivery");
    expect(JSON.parse(injectionRow.injected_node_ids_json)).toEqual(["node_runtime_shadow"]);
    expect(JSON.parse(latestRecord.injected_node_ids_json)).toEqual([]);
    expect(reviewCount.count).toBe(0);
  });

  it("suppresses delivery in holdout mode when the holdout bucket wins", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_holdout");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        evaluationMode: "holdout",
        holdoutRate: 1
      }, { homeDir: runtimeDir }),
      undefined,
      { homeDir: runtimeDir, env: {} }
    );

    const prompt = await service.beforePromptBuild({
      sessionId: "holdout-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    expect(prompt.mode).toBe("skip");
    expect(prompt.text).toBeUndefined();
    expect(prompt.notice).toBeUndefined();
    expect(prompt.scorecard?.mode).toBe("inject");

    await service.finalizeTask({
      sessionId: "holdout-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    const db = new DatabaseSync(sqlitePath);
    const injectionRow = db.prepare(
      "SELECT delivery_mode, delivered, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      delivery_mode: string;
      delivered: number;
      attribution_reason: string | null;
    };
    const latestRecord = db.prepare(
      "SELECT injected_node_ids_json FROM experience_input_records LIMIT 1"
    ).get() as { injected_node_ids_json: string };
    const reviewCount = db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as { count: number };

    expect(injectionRow.delivery_mode).toBe("holdout");
    expect(injectionRow.delivered).toBe(0);
    expect(injectionRow.attribution_reason).toBe("suppressed_delivery");
    expect(JSON.parse(latestRecord.injected_node_ids_json)).toEqual([]);
    expect(reviewCount.count).toBe(0);
  });

  it("persists relevant failure attribution when injected guidance appears harmful", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    seedStrategyNode(sqlitePath, "/repo", "node_runtime_harm");
    const service = new ExperienceRuntimeService(
      loadConfig({
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureDir: join(runtimeDir, "captures"),
        distillationAutoDrain: false
      }, { homeDir: runtimeDir }),
      undefined,
      { homeDir: runtimeDir, env: {} }
    );

    await service.beforePromptBuild({
      sessionId: "harm-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });
    await service.persistToolResult({
      sessionId: "harm-session",
      toolName: "vitest",
      outputSummary: "Fix the failing vitest auth test still fails with the same assertion",
      errorSignature: "Fix the failing vitest auth test still fails with the same assertion",
      status: "failure"
    });

    await service.finalizeTask({
      sessionId: "harm-session",
      cwd: "/repo",
      userMessage: "Fix the failing vitest auth test",
      taskSummary: "Fix the failing vitest auth test"
    });

    const db = new DatabaseSync(sqlitePath);
    const injectionRow = db.prepare(
      "SELECT was_successful, harm_observed, attribution_reason FROM injection_events LIMIT 1"
    ).get() as {
      was_successful: number | null;
      harm_observed: number | null;
      attribution_reason: string | null;
    };
    const reviewRows = db
      .prepare("SELECT event_type, source FROM review_events ORDER BY created_at ASC")
      .all() as Array<{ event_type: string; source: string }>;

    expect(injectionRow.was_successful).toBe(0);
    expect(injectionRow.harm_observed).toBe(1);
    expect(injectionRow.attribution_reason).toBe("relevant_failure");
    expect(reviewRows).toEqual([
      expect.objectContaining({
        event_type: "mark_harmed",
        source: "automatic"
      })
    ]);
  });

  it("schedules an async postmortem review and stores only a non-authoritative artifact", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          hybridEnabled: true,
          hybridAsyncPostmortemEnabled: true
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {},
        hybridWorkerClientOptions: {
          postmortemReviewExecutor: async () => ({
            task: "postmortem_review",
            review_verdict: "review_artifact",
            candidate_recommendation: "capture",
            feedback_followup_recommendation: "none",
            confidence: "high",
            reason: "The run shows a reusable provider-path correction.",
            review_artifact: {
              summary: "The run shows a reusable provider-path correction.",
              notes: ["Keep this as a non-authoritative review artifact."]
            }
          })
        }
      }
    );

    await service.persistToolResult({
      sessionId: "hybrid-postmortem-session",
      toolName: "user-feedback",
      outputSummary: "The first approach was wrong; the fix belongs in the provider path.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "hybrid-postmortem-session",
      toolName: "vitest",
      outputSummary: "The focused auth test passed after the provider-path correction.",
      status: "success"
    });

    await service.finalizeTask({
      sessionId: "hybrid-postmortem-session",
      cwd: "/repo",
      userMessage: "Fix the auth test by moving the fix into the provider path",
      taskSummary: "Fix the auth test by moving the fix into the provider path",
      contextSummary: "The first attempt was wrong until the fix moved into provider routing."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const artifactRows = db
      .prepare(
        "SELECT worker_task, approval_class, recommendation, summary FROM hybrid_review_artifacts ORDER BY created_at ASC"
      )
      .all() as Array<{
      worker_task: string;
      approval_class: string;
      recommendation: string;
      summary: string;
    }>;
    const traceRows = db
      .prepare(
        "SELECT worker_task, rollout_mode, validation_status, output_action FROM hybrid_invocation_traces ORDER BY created_at ASC"
      )
      .all() as Array<{
      worker_task: string;
      rollout_mode: string;
      validation_status: string;
      output_action: string;
    }>;
    const nodeCount = (db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number }).count;
    const candidateCount = (db.prepare("SELECT COUNT(*) AS count FROM experience_candidates").get() as { count: number })
      .count;

    expect(artifactRows).toEqual([
      expect.objectContaining({
        worker_task: "postmortem_review",
        approval_class: "review_artifact",
        recommendation: "capture"
      })
    ]);
    expect(traceRows).toEqual([
      expect.objectContaining({
        worker_task: "postmortem_review",
        rollout_mode: "live",
        validation_status: "accepted",
        output_action: "stored"
      })
    ]);
    expect(nodeCount).toBe(0);
    expect(candidateCount).toBe(0);
  });

  it("records a rejected postmortem trace when repeated timeouts force safe fallback", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          hybridEnabled: true,
          hybridAsyncPostmortemEnabled: true
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {},
        hybridWorkerClientOptions: {
          timeoutCircuitThreshold: 1,
          postmortemReviewTimeoutMs: 5,
          postmortemReviewExecutor: async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              task: "postmortem_review",
              review_verdict: "review_artifact",
              candidate_recommendation: "observe",
              feedback_followup_recommendation: "none",
              confidence: "low",
              reason: "late",
              review_artifact: {
                summary: "late",
                notes: ["late"]
              }
            };
          }
        }
      }
    );

    await service.persistToolResult({
      sessionId: "hybrid-postmortem-timeout",
      toolName: "user-feedback",
      outputSummary: "The first direction was wrong; the fix belongs in the provider path.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "hybrid-postmortem-timeout",
      toolName: "vitest",
      outputSummary: "The focused auth test passed after the provider-path correction.",
      status: "success"
    });

    await service.finalizeTask({
      sessionId: "hybrid-postmortem-timeout",
      cwd: "/repo",
      userMessage: "Fix the auth test by moving the fix into the provider path",
      taskSummary: "Fix the auth test by moving the fix into the provider path",
      contextSummary: "The first attempt was wrong until the provider-path correction passed the targeted auth test."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const traces = db
      .prepare("SELECT validation_status, output_action, fallback_reason FROM hybrid_invocation_traces ORDER BY created_at ASC")
      .all() as Array<{ validation_status: string; output_action: string; fallback_reason: string | null }>;

    expect(traces).toEqual([
      expect.objectContaining({
        validation_status: "fallback",
        output_action: "rejected",
        fallback_reason: "timeout"
      })
    ]);
  });

  it("records shadow postmortem telemetry without persisting an artifact", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          hybridEnabled: true,
          hybridAsyncPostmortemEnabled: true,
          hybridRolloutMode: "shadow"
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {},
        hybridWorkerClientOptions: {
          postmortemReviewExecutor: async () => ({
            task: "postmortem_review",
            review_verdict: "review_artifact",
            candidate_recommendation: "capture",
            feedback_followup_recommendation: "none",
            confidence: "high",
            reason: "bounded shadow artifact",
            review_artifact: {
              summary: "bounded shadow artifact",
              notes: ["telemetry only"]
            }
          })
        }
      }
    );

    await service.persistToolResult({
      sessionId: "hybrid-postmortem-shadow",
      toolName: "vitest",
      outputSummary: "The targeted auth test passed after moving the fix into provider routing.",
      status: "success"
    });

    await service.finalizeTask({
      sessionId: "hybrid-postmortem-shadow",
      cwd: "/repo",
      userMessage: "Fix the auth test by moving the fix into the provider path",
      taskSummary: "Fix the auth test by moving the fix into the provider path",
      contextSummary: "The provider-path correction converged after the first direction was invalidated."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const artifactCount = (
      db.prepare("SELECT COUNT(*) AS count FROM hybrid_review_artifacts").get() as { count: number }
    ).count;
    const traces = db
      .prepare("SELECT rollout_mode, validation_status, output_action FROM hybrid_invocation_traces ORDER BY created_at ASC")
      .all() as Array<{ rollout_mode: string; validation_status: string; output_action: string }>;

    expect(artifactCount).toBe(0);
    expect(traces).toEqual([
      expect.objectContaining({
        rollout_mode: "shadow",
        validation_status: "accepted",
        output_action: "rejected"
      })
    ]);
  });

  it("runs async postmortem after learning status is finalized on the task run", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const seenLearningStatuses: Array<string | null | undefined> = [];
    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          hybridEnabled: true,
          hybridAsyncPostmortemEnabled: true,
          distillationMode: "disabled"
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {},
        hybridWorkerClientOptions: {
          postmortemReviewExecutor: async (capsule) => {
            seenLearningStatuses.push(capsule.trusted.run.learningStatus);
            return {
              task: "postmortem_review",
              review_verdict: "review_artifact",
              candidate_recommendation: "observe",
              feedback_followup_recommendation: "none",
              confidence: "medium",
              reason: "The run is only worth keeping as a bounded diagnostic artifact.",
              review_artifact: {
                summary: "bounded diagnostic artifact",
                notes: ["learning status should already be finalized"]
              }
            };
          }
        }
      }
    );

    await service.persistToolResult({
      sessionId: "hybrid-postmortem-learning-status",
      toolName: "user-feedback",
      outputSummary: "The first approach was wrong; the fix belongs in the provider path.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "hybrid-postmortem-learning-status",
      toolName: "vitest",
      outputSummary: "The focused auth test passed after the provider-path correction.",
      status: "success"
    });

    await service.finalizeTask({
      sessionId: "hybrid-postmortem-learning-status",
      cwd: "/repo",
      userMessage: "Fix the auth test by moving the fix into the provider path",
      taskSummary: "Fix the auth test by moving the fix into the provider path",
      contextSummary: "The first attempt was wrong until the provider-path correction passed the targeted auth test."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const taskRun = db
      .prepare("SELECT learning_status FROM task_runs WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
      .get("hybrid-postmortem-learning-status") as { learning_status: string | null } | undefined;

    expect(seenLearningStatuses).toEqual([taskRun?.learning_status]);
    expect(seenLearningStatuses[0]).toBeTruthy();
  });

  it("does not create duplicate postmortem artifacts for the same completed run", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const service = new ExperienceRuntimeService(
      loadConfig(
        {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          captureDir: join(runtimeDir, "captures"),
          hybridEnabled: true,
          hybridAsyncPostmortemEnabled: true
        },
        { homeDir: runtimeDir }
      ),
      undefined,
      {
        homeDir: runtimeDir,
        env: {},
        hybridWorkerClientOptions: {
          postmortemReviewExecutor: async () => ({
            task: "postmortem_review",
            review_verdict: "review_artifact",
            candidate_recommendation: "observe",
            feedback_followup_recommendation: "none",
            confidence: "medium",
            reason: "The run suggests a reusable correction.",
            review_artifact: {
              summary: "The run suggests a reusable correction.",
              notes: ["Keep this review bounded and non-authoritative."]
            }
          })
        }
      }
    );

    await service.persistToolResult({
      sessionId: "hybrid-postmortem-dup",
      toolName: "vitest",
      outputSummary: "The auth test still fails in the UI-layer path with the same assertion.",
      errorSignature: "auth test still fails in the UI-layer path",
      status: "failure"
    });
    await service.persistToolResult({
      sessionId: "hybrid-postmortem-dup",
      toolName: "user-feedback",
      outputSummary: "The first direction was wrong; the fix belongs in the provider path instead of the UI layer.",
      status: "success"
    });
    await service.persistToolResult({
      sessionId: "hybrid-postmortem-dup",
      toolName: "vitest",
      outputSummary: "The focused auth test passed after the provider-path correction.",
      status: "success"
    });
    await service.finalizeTask({
      sessionId: "hybrid-postmortem-dup",
      cwd: "/repo",
      userMessage: "Fix the auth test by moving the fix into the provider path",
      taskSummary: "Fix the auth test by moving the fix into the provider path",
      contextSummary: "The initial UI-layer approach was wrong until the provider-path correction passed the targeted auth test."
    });
    await service.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    const artifactCount = (
      db.prepare("SELECT COUNT(*) AS count FROM hybrid_review_artifacts").get() as { count: number }
    ).count;

    expect(artifactCount).toBe(1);
  });

});
