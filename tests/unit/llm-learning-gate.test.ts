import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { LlmLearningGate } from "../../src/analyzer/llm-learning-gate.js";
import type { ExperienceInput } from "../../src/types/domain.js";

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

describe("LlmLearningGate", () => {
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
            event_id: "evt_probe",
            tool_name: "targeted-probe",
            status: "success",
            output_summary: "The targeted provider probe succeeded, but no reusable lesson emerged.",
            started_at: "2026-03-20T10:05:00.000Z"
          }
        ]
      })
    );

    expect(result.source).toBe("llm");
    expect(result.worthCapturing).toBe(false);
    expect(result.drafts).toEqual([]);
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
    expect(result.reason).toContain("insufficient substantive evidence");
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

    const result = await gate.generateCandidateDrafts(makeInput({ outcome_signal: "success" }));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
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

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.source).toBe("llm");
    expect(result.worthCapturing).toBe(true);
    expect(result.drafts[0]?.task_type).toBe("config_debug");
  });
});
