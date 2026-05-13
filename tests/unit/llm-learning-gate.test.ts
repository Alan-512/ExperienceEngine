import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { evaluateLearningEligibility, LlmLearningGate } from "../../src/analyzer/llm-learning-gate.js";
import type { ExperienceInput, ToolEvent } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-llm-gate-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const makeInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_1",
  task_type: "config_debug",
  task_summary: "Find a working OpenRouter free model configuration for EE distillation.",
  context_summary: "OpenRouter free models are failing or timing out during distillation.",
  tool_events: [
    {
      event_id: "evt_1",
      tool_name: "doctor",
      status: "failure",
      error_signature: "404 no endpoints found",
      output_summary: "doctor reported a routing mismatch",
      started_at: "2026-03-20T10:00:00.000Z"
    }
  ],
  outcome_signal: "failure",
  injected_node_ids: [],
  ...overrides
});

const event = (overrides: Partial<ToolEvent> = {}): ToolEvent => ({
  event_id: "evt_test",
  tool_name: "vitest",
  status: "success",
  output_summary: "Tests passed.",
  started_at: "2026-03-20T10:00:00.000Z",
  ...overrides
});

const llmCaptureResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            worth_capturing: true,
            experience_kind: "verification_loop",
            reason: "The run contains reusable execution evidence.",
            candidate: {
              node_type: "strategy",
              task_type: "test_debug",
              trigger_pattern: "When a targeted verification loop exposes a reusable constraint",
              compact_hint: "Keep the targeted verification loop tied to the concrete failure or corrected constraint.",
              success_signal: "The final targeted verification passes.",
              evidence_summary: "The task included concrete failure, correction, or verification evidence."
            }
          })
        }
      }
    ]
  })
});

describe("LlmLearningGate", () => {
  it("applies deterministic eligibility reason precedence before llm capture", () => {
    const expressionOnly = evaluateLearningEligibility(
      makeInput({
        task_summary: "Rewrite the inline notice wording so it sounds lighter.",
        context_summary: "This is a wording-only pass for notice copy.",
        tool_events: [event({ tool_name: "apply_patch", output_summary: "Updated notice wording." })],
        outcome_signal: "success"
      })
    );
    expect(expressionOnly).toMatchObject({
      eligible: false,
      reasonCode: "expression_layer_only"
    });

    const lowEvidence = evaluateLearningEligibility(
      makeInput({
        task_summary: "Inspect the repository structure.",
        context_summary: "Only exploratory reads happened.",
        tool_events: [event({ tool_name: "rg", output_summary: "Listed matching files." })],
        outcome_signal: "success"
      })
    );
    expect(lowEvidence).toMatchObject({
      eligible: false,
      reasonCode: "insufficient_substantive_evidence"
    });
  });

  it("classifies accepted learning signals with stable reason codes", () => {
    expect(
      evaluateLearningEligibility(
        makeInput({
          task_type: "test_debug",
          outcome_signal: "success",
          tool_events: [
            event({ status: "failure", error_signature: "Auth spec assertion failed" }),
            event({ status: "success", output_summary: "Auth spec passed after the fix." })
          ]
        })
      )
    ).toMatchObject({ eligible: true, reasonCode: "failure_repair_success" });

    expect(
      evaluateLearningEligibility(
        makeInput({
          outcome_signal: "failure",
          tool_events: [
            event({ event_id: "evt_1", tool_name: "doctor", status: "failure", error_signature: "429 rate limit" }),
            event({ event_id: "evt_2", tool_name: "doctor", status: "failure", error_signature: "429 rate limit" })
          ]
        })
      )
    ).toMatchObject({ eligible: true, reasonCode: "retry_pattern" });

    expect(
      evaluateLearningEligibility(
        makeInput({
          outcome_signal: "success",
          context_summary:
            "The user corrected the direction: the fix belongs in provider routing instead of the UI layer.",
          tool_events: [
            event({
              tool_name: "user-feedback",
              output_summary: "The problem is in provider routing, not the UI layer."
            }),
            event({ tool_name: "targeted-probe", output_summary: "The targeted provider probe succeeded." })
          ]
        })
      )
    ).toMatchObject({ eligible: true, reasonCode: "directional_correction" });

    expect(
      evaluateLearningEligibility(
        makeInput({
          task_type: "integration_fix",
          outcome_signal: "success",
          context_summary: "Updated the host compatibility repair and verified the Codex lifecycle hook path.",
          tool_events: [
            event({ tool_name: "codex-lifecycle", output_summary: "Codex UserPromptSubmit and Stop verification passed." })
          ]
        })
      )
    ).toMatchObject({ eligible: true, reasonCode: "verified_project_constraint" });
  });

  it("rejects ordinary successful verification before calling the llm gate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(llmCaptureResponse());
    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        task_type: "feature_add",
        task_summary: "Add a small settings toggle.",
        context_summary: "The toggle was implemented and tests passed.",
        tool_events: [event({ tool_name: "vitest", output_summary: "Settings toggle tests passed." })],
        outcome_signal: "success"
      })
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: "disabled",
      worthCapturing: false
    });
    expect(result.reason).toContain("no_transferable_execution_value");
  });

  it("allows objective verification changes through to the llm gate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(llmCaptureResponse());
    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        task_type: "build_debug",
        task_summary: "Repair the build script after the compiler check exposed the wrong output path.",
        context_summary: "Changed the build output path and verified it with tsc.",
        tool_events: [
          event({ tool_name: "apply_patch", output_summary: "Updated the build output path." }),
          event({ tool_name: "tsc", output_summary: "Typecheck passed after the output path change." })
        ],
        outcome_signal: "success"
      })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.worthCapturing).toBe(true);
  });

  it("falls back to rule analysis when no explicit provider is configured", async () => {
    const homeDir = makeTempDir();
    const gate = new LlmLearningGate(
      loadConfig({
        distillationMode: "auto",
        distillationAllowPassthrough: true
      }, { homeDir, env: {} }),
      { env: {}, homeDir }
    );

    const result = await gate.generateCandidateDrafts(makeInput());

    expect(result.source).toBe("rule");
    expect(result.worthCapturing).toBe(true);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.task_type).toBe("config_debug");
    expect(result.drafts[0]?.compact_hint).toContain("provider/config path");
  });

  it("returns no drafts when the llm marks a task as not worth capturing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: false,
                experience_kind: "none",
                reason: "Routine success with no reusable signal."
              })
            }
          }
        ]
      })
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        outcome_signal: "success",
        tool_events: [
          {
            event_id: "evt_failure",
            tool_name: "targeted-probe",
            status: "failure",
            error_signature: "provider probe failed before the repair",
            output_summary: "The provider probe failed before the repair.",
            started_at: "2026-03-20T10:04:00.000Z"
          },
          {
            event_id: "evt_probe_success",
            tool_name: "targeted-probe",
            status: "success",
            output_summary: "The targeted provider probe succeeded after the repair, but no reusable lesson emerged.",
            started_at: "2026-03-20T10:05:00.000Z"
          }
        ]
      })
    );

    expect(result.source).toBe("llm");
    expect(result.worthCapturing).toBe(false);
    expect(result.drafts).toEqual([]);
  });

  it("rescues a directional correction when the main gate rejects generic capture but semantic correction is strongly supported", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  worth_capturing: false,
                  experience_kind: "none",
                  reason: "The run looks task-local and not broadly reusable."
                })
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  expectation_correction: true,
                  candidate: {
                    node_type: "strategy",
                    task_type: "config_debug",
                    trigger_pattern: "When a technically working change still fixes the UI layer instead of provider routing",
                    compact_hint:
                      "Move the fix into provider routing when later verification shows the UI-layer change solved the wrong layer.",
                    success_signal: "The targeted provider probe reflects the corrected behavior after the routing change.",
                    evidence_summary: "A later provider probe only succeeded after replacing the earlier UI-layer direction.",
                    experience_kind: "expectation_correction",
                    confidence_signal: "supported_by_objective_success",
                    validation_state: "pending_reuse_validation",
                    correction_scope: "host_local",
                    correction_category: "implementation_boundary",
                    deviation_pattern: "implementation solves the wrong layer of the problem",
                    corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
                  }
                })
              }
            }
          ]
        })
      });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        outcome_signal: "success",
        context_summary:
          "The initial UI-layer fix technically worked, but the later provider probe showed the real correction belonged in provider routing.",
        tool_events: [
          {
            event_id: "evt_feedback",
            tool_name: "user-feedback",
            status: "success",
            output_summary: "The issue is still in provider routing, not the UI layer.",
            started_at: "2026-03-29T09:58:00.000Z"
          },
          {
            event_id: "evt_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary: "The targeted provider probe only succeeded after moving the fix into provider routing.",
            started_at: "2026-03-29T10:02:00.000Z"
          }
        ]
      })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.worthCapturing).toBe(true);
    expect(result.drafts[0]).toMatchObject({
      experience_kind: "expectation_correction",
      correction_category: "implementation_boundary",
      corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
    });
    expect(result.directionalCorrectionSignal).toMatchObject({
      detected: true,
      semantic_detected: true,
      correction_category: "implementation_boundary"
    });
  });

  it("keeps meta-like tasks capturable but downgrades aggressive promotion signals", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: true,
                experience_kind: "verification_loop",
                reason: "The audit exposed a reusable verification pattern.",
                candidate: {
                  node_type: "strategy",
                  task_type: "general",
                  trigger_pattern: "When running a weekly audit of host readiness and retrieval quality",
                  compact_hint: "Check doctor, inspect, and baseline outputs before proposing a retrieval change.",
                  success_signal: "The audit isolates the failing layer before implementation changes.",
                  evidence_summary: "The audit clarified whether the issue was runtime wiring or retrieval policy.",
                  promotion_signal: "high_value",
                  promotion_reason: "This looked broadly reusable during the audit."
                }
              })
            }
          }
        ]
      })
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        task_type: "general",
        task_summary: "Review the weekly audit and inspect the latest doctor output before changing retrieval policy.",
        context_summary: "This is an audit of host readiness and retrieval quality."
      })
    );

    expect(result.worthCapturing).toBe(true);
    expect(result.drafts[0]?.promotion_signal).toBe("normal");
    expect(result.drafts[0]?.promotion_reason).toContain("meta");
  });

  it("upgrades a generic execution-pattern capture into expectation correction for evidence-driven reversal", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  worth_capturing: true,
                  experience_kind: "execution_pattern",
                  reason: "The task exposed a reusable execution pattern.",
                  candidate: {
                    node_type: "strategy",
                    task_type: "config_debug",
                    trigger_pattern: "When the first infrastructure hypothesis looks plausible",
                    compact_hint: "Validate the current hypothesis before broad changes.",
                    success_signal: "The targeted verification passes.",
                    evidence_summary: "The task converged after a focused verification loop."
                  }
                })
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reversal_detected: true,
                  reversal_source: "task_evidence",
                  superseded_hypothesis: "Timeout tuning was the wrong active hypothesis.",
                  replacement_constraint: "Follow provider-routing evidence instead of persisting in timeout tuning.",
                  verification_evidence: "The provider-routing verification passed after the replacement fix.",
                  pivot_summary: "The task pivoted into provider routing after the stronger probe.",
                  correction_scope: "host_local",
                  correction_category: "implementation_boundary",
                  deviation_pattern: "the earlier direction was disproven by later task evidence",
                  corrected_constraint:
                    "Follow provider-routing evidence instead of persisting in timeout tuning."
                })
              }
            }
          ]
        })
      });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        outcome_signal: "success",
        task_summary: "Fix the failing request path by following the strongest root-cause evidence.",
        context_summary:
          "The initial timeout-tuning hypothesis was ruled out after a targeted provider probe showed the request was still failing inside provider routing. The investigation pivoted into provider routing, and the final integration verification passed.",
        tool_events: [
          {
            event_id: "evt_initial_hypothesis",
            tool_name: "analysis-note",
            status: "success",
            output_summary: "Initial working hypothesis: retry timeout tuning may be enough to fix the failing request path.",
            started_at: "2026-03-29T12:00:00.000Z"
          },
          {
            event_id: "evt_invalidate_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary:
              "The targeted provider probe ruled out the timeout hypothesis and showed the request was still failing inside provider routing.",
            started_at: "2026-03-29T12:04:00.000Z"
          },
          {
            event_id: "evt_pivot_routing",
            tool_name: "apply_patch",
            status: "success",
            output_summary: "Moved the fix from timeout tuning into provider routing.",
            started_at: "2026-03-29T12:08:00.000Z"
          },
          {
            event_id: "evt_validate_routing",
            tool_name: "integration-test",
            status: "success",
            output_summary: "The provider-routing integration verification passed after the routing fix.",
            started_at: "2026-03-29T12:12:00.000Z"
          }
        ]
      })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.drafts[0]).toMatchObject({
      experience_kind: "expectation_correction",
      correction_category: "implementation_boundary",
      corrected_constraint: "Follow provider-routing evidence instead of persisting in timeout tuning."
    });
    expect(result.evidenceDrivenReversalSignal).toMatchObject({
      detected: true,
      semantic_detected: true,
      reversal_source: "task_evidence",
      correction_category: "implementation_boundary"
    });
  });

  it("rejects edit-only wording tasks even when the llm tries to capture them", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: true,
                experience_kind: "expectation_correction",
                reason: "The wording correction produced a cleaner interaction pattern.",
                candidate: {
                  node_type: "strategy",
                  task_type: "general",
                  trigger_pattern: "When refining an inline wording notice in the proposal",
                  compact_hint:
                    "Use a two-layer output pattern: keep the inline wording brief and move detailed explanation into inspect surfaces.",
                  success_signal: "The final wording is lighter and clearer.",
                  evidence_summary: "The proposal became clearer after trimming the inline wording.",
                  experience_kind: "expectation_correction",
                  confidence_signal: "supported_by_objective_success",
                  validation_state: "pending_reuse_validation",
                  correction_scope: "task_local",
                  correction_category: "goal_interpretation",
                  deviation_pattern: "the inline explanation was too verbose for the main conversation",
                  corrected_constraint: "Keep inline notices lightweight and move detailed reasoning to inspect surfaces."
                }
              })
            }
          }
        ]
      })
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        task_type: "general",
        task_summary:
          "Refine the inline notice wording in the proposal so the explanation stays lightweight in the main agent window.",
        context_summary:
          "Adjusted the wording so the inline notice stays brief and the detailed reasoning moves into inspect surfaces.",
        tool_events: [
          {
            event_id: "evt_patch",
            tool_name: "apply_patch",
            status: "success",
            output_summary: "Updated the proposal wording.",
            started_at: "2026-03-27T12:26:50.000Z"
          }
        ],
        outcome_signal: "success"
      })
    );

    expect(result.source).toBe("disabled");
    expect(result.worthCapturing).toBe(false);
    expect(result.drafts).toEqual([]);
    expect(result.reason).toContain("expression_layer_only");
  });

  it("rejects expression-layer expectation corrections without objective verification", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: true,
                experience_kind: "expectation_correction",
                reason: "The user corrected the inline notice style.",
                candidate: {
                  node_type: "strategy",
                  task_type: "general",
                  trigger_pattern: "When refining inline notice phrasing",
                  compact_hint: "Keep inline notices brief.",
                  success_signal: "The wording reads better.",
                  evidence_summary: "The inline notice became shorter after the rewrite.",
                  experience_kind: "expectation_correction",
                  confidence_signal: "unconfirmed",
                  validation_state: "pending_reuse_validation",
                  correction_scope: "task_local",
                  correction_category: "style_constraint",
                  deviation_pattern: "the inline notice sounded too heavy",
                  corrected_constraint: "Prefer lighter inline notice wording."
                }
              })
            }
          }
        ]
      })
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        task_type: "general",
        task_summary: "Rewrite the inline notice wording so it sounds lighter.",
        context_summary: "The user asked for lighter copy in the inline notice.",
        tool_events: [
          {
            event_id: "evt_feedback",
            tool_name: "user-feedback",
            status: "success",
            output_summary: "The user said the inline message is too heavy and should be lighter.",
            started_at: "2026-03-27T12:27:00.000Z"
          }
        ],
        outcome_signal: "success"
      })
    );

    expect(result.source).toBe("disabled");
    expect(result.worthCapturing).toBe(false);
    expect(result.drafts).toEqual([]);
    expect(result.reason).toContain("expression-layer refinement");
  });

  it("builds a normalized candidate draft from llm output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: true,
                experience_kind: "config_troubleshooting",
                reason: "Provider routing debugging exposed a reusable configuration pattern.",
                candidate: {
                  node_type: "warning",
                  task_type: "config_debug",
                  correction_scope: "repo_local",
                  correction_category: "verification_order",
                  deviation_pattern: "verification happened too late",
                  corrected_constraint: "Probe the provider route before changing retry behavior.",
                  trigger_pattern: "When an OpenRouter free model returns 404 or times out during EE distillation",
                  compact_hint:
                    "Do not keep retrying the same OpenRouter free route while doctor still shows 404 or timeout; isolate the first routing, credential, or endpoint mismatch first.",
                  success_signal: "doctor or the distillation probe succeeds with a narrowed provider/model path",
                  evidence_summary: "OpenRouter free model troubleshooting converged only after isolating provider routing and timeout behavior.",
                  avoid_steps: ["Retry the same route unchanged"],
                  fallback_steps: ["Switch to a narrower free model route and verify again"]
                }
              })
            }
          }
        ]
      })
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(makeInput());

    expect(result.source).toBe("llm");
    expect(result.worthCapturing).toBe(true);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      scope_id: "scope_1",
      task_type: "config_debug",
      node_type: "warning",
      source_kind: "system_derived",
      correction_scope: "repo_local",
      correction_category: "verification_order",
      deviation_pattern: "verification happened too late.",
      corrected_constraint: "Probe the provider route before changing retry behavior."
    });
    expect(result.drafts[0]?.compact_hint).toContain("OpenRouter free route");
  });

  it("repairs a generic successful draft into expectation_correction when the follow-up llm call provides correction metadata", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  worth_capturing: true,
                  experience_kind: "execution_pattern",
                  reason: "The direction was corrected from the UI layer to the provider routing layer after user feedback.",
                  candidate: {
                    node_type: "strategy",
                    task_type: "config_debug",
                    trigger_pattern: "When a technically working fix is applied in the wrong layer",
                    compact_hint: "Move the fix from the UI layer into provider routing when the user corrects the abstraction boundary.",
                    success_signal: "The targeted provider probe reflects the requested behavior.",
                    evidence_summary: "The final working change came from moving the fix into provider routing."
                  }
                })
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  expectation_correction: true,
                  confidence_signal: "supported_by_objective_success",
                  validation_state: "pending_reuse_validation",
                  correction_scope: "host_local",
                  correction_category: "implementation_boundary",
                  deviation_pattern: "implementation solves the wrong layer of the problem",
                  corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
                })
              }
            }
          ]
        })
      });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        outcome_signal: "success",
        context_summary:
          "The user corrected the direction: the fix belongs in provider routing instead of the UI layer. The final targeted provider probe succeeded after moving the change.",
        tool_events: [
          {
            event_id: "evt_feedback",
            tool_name: "user-feedback",
            status: "success",
            output_summary: "The user said the problem is in provider routing, not in the UI layer.",
            started_at: "2026-03-29T09:58:00.000Z"
          },
          {
            event_id: "evt_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary: "The targeted provider probe succeeded after moving the fix into provider routing.",
            started_at: "2026-03-29T10:02:00.000Z"
          }
        ]
      })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const repairRequestBody = JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const repairPayload = JSON.parse(
      repairRequestBody.messages?.find((message) => message.role === "user")?.content ?? "{}"
    ) as {
      correction_window?: { selected: boolean; snippets?: string[]; sources?: string[] };
      evidence_gate?: { objective_support: boolean; user_confirmation: boolean };
    };
    expect(repairPayload.correction_window?.selected).toBe(true);
    expect(repairPayload.correction_window?.sources).toContain("context_summary");
    expect(repairPayload.evidence_gate?.objective_support).toBe(true);
    expect(result.directionalCorrectionSignal).toMatchObject({
      detected: true,
      semantic_detected: true,
      correction_category: "implementation_boundary",
      deviation_pattern: "implementation solves the wrong layer of the problem",
      corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
    });
    expect(result.drafts[0]).toMatchObject({
      experience_kind: "expectation_correction",
      confidence_signal: "supported_by_objective_success",
      validation_state: "pending_reuse_validation",
      correction_scope: "host_local",
      correction_category: "implementation_boundary",
      deviation_pattern: "implementation solves the wrong layer of the problem.",
      corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
    });
  });

  it("does not trigger semantic repair when no directional correction window is present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: true,
                experience_kind: "verification_loop",
                reason: "The task established a reusable targeted verification loop.",
                candidate: {
                  node_type: "strategy",
                  task_type: "test_debug",
                  experience_kind: "verification_loop",
                  trigger_pattern: "When debugging a flaky integration test",
                  compact_hint: "Run the targeted integration probe before broad code changes.",
                  success_signal: "The targeted probe isolates the failing integration path.",
                  evidence_summary: "A focused probe clarified the flaky path before changes."
                }
              })
            }
          }
        ]
      })
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        task_type: "test_debug",
        task_summary: "Stabilize the flaky integration probe for the payments fixture.",
        context_summary: "The targeted probe isolated the flaky path and the final verification passed.",
        tool_events: [
          {
            event_id: "evt_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary: "The targeted payments integration probe reproduced and isolated the flaky path.",
            started_at: "2026-03-29T10:00:00.000Z"
          },
          {
            event_id: "evt_verify",
            tool_name: "integration-test",
            status: "success",
            output_summary: "The payments integration test passed after the probe-driven fix.",
            started_at: "2026-03-29T10:05:00.000Z"
          }
        ],
        outcome_signal: "success"
      })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.drafts[0]).toMatchObject({
      experience_kind: "verification_loop"
    });
  });

  it("does not trigger semantic repair for ordinary user feedback followed by successful verification", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: true,
                experience_kind: "execution_pattern",
                reason: "The task converged after a small review-driven refinement.",
                candidate: {
                  node_type: "strategy",
                  task_type: "general",
                  experience_kind: "execution_pattern",
                  trigger_pattern: "When polishing a button label after review",
                  compact_hint: "Apply the reviewed copy change and verify the rendered label.",
                  success_signal: "The browser verification shows the updated label.",
                  evidence_summary: "The label rendered correctly after the reviewed copy change."
                }
              })
            }
          }
        ]
      })
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-nano",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-nano",
          OPENAI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(
      makeInput({
        task_type: "general",
        task_summary: "Polish the button label after review.",
        context_summary: "The button label was clarified after review and the final browser verification passed.",
        tool_events: [
          {
            event_id: "evt_feedback_copy",
            tool_name: "user-feedback",
            status: "success",
            output_summary: "Use a clearer label on the button.",
            started_at: "2026-03-29T10:20:00.000Z"
          },
          {
            event_id: "evt_verify_copy",
            tool_name: "browser-verify",
            status: "success",
            output_summary: "The updated label renders correctly in the browser verification.",
            started_at: "2026-03-29T10:24:00.000Z"
          }
        ],
        outcome_signal: "success"
      })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.drafts[0]).toMatchObject({
      experience_kind: "execution_pattern"
    });
  });

  it("falls back to rule analysis when the llm gate request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429
    });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openrouter",
        distillerModel: "openrouter/free",
        distillationMode: "llm",
        distillationAllowPassthrough: true
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "openrouter/free",
          OPENROUTER_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(makeInput());

    expect(result.source).toBe("rule");
    expect(result.worthCapturing).toBe(true);
    expect(result.reason).toContain("llm gate failed");
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.task_type).toBe("config_debug");
  });

  it("retries once when the llm gate hits a transient 429 and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  worth_capturing: true,
                  experience_kind: "config_troubleshooting",
                  reason: "Provider routing debugging exposed a reusable configuration pattern.",
                  candidate: {
                    node_type: "warning",
                    task_type: "config_debug",
                    trigger_pattern: "When an OpenRouter free model returns 404 or times out during EE distillation",
                    compact_hint:
                      "Do not keep retrying the same OpenRouter free route while doctor still shows 404 or timeout; isolate the first routing, credential, or endpoint mismatch first.",
                    success_signal: "doctor or the distillation probe succeeds with a narrowed provider/model path",
                    evidence_summary: "OpenRouter free model troubleshooting converged only after isolating provider routing and timeout behavior."
                  }
                })
              }
            }
          ]
        })
      });

    const gate = new LlmLearningGate(
      loadConfig({
        distillerProvider: "openrouter",
        distillerModel: "openrouter/free",
        distillationMode: "llm"
      }),
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "openrouter/free",
          OPENROUTER_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );

    const result = await gate.generateCandidateDrafts(makeInput({ outcome_signal: "success" }));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("llm");
    expect(result.worthCapturing).toBe(true);
    expect(result.drafts[0]?.task_type).toBe("config_debug");
  });
});
