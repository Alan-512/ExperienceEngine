import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { LlmLearningGate } from "../../src/analyzer/llm-learning-gate.js";
import {
  negativeDirectionalCorrectionSamples,
  positiveDirectionalCorrectionSamples
} from "../fixtures/directional-correction/phase1.js";

const createFetchImpl = () =>
  vi.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const systemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
    const userPayload = JSON.parse(body.messages?.find((message) => message.role === "user")?.content ?? "{}") as {
      task_summary?: string;
      context_summary?: string;
      draft?: { compact_hint?: string };
      correction_window?: { selected?: boolean };
      evidence_gate?: { objective_support?: boolean; user_confirmation?: boolean };
    };

    const isRepair = systemPrompt.includes("repairing a coding-experience draft");
    if (isRepair) {
      if (userPayload.correction_window?.selected && (userPayload.evidence_gate?.objective_support || userPayload.evidence_gate?.user_confirmation)) {
        const lower = `${userPayload.task_summary ?? ""}\n${userPayload.context_summary ?? ""}`.toLowerCase();
        const category = lower.includes("provider routing")
          ? "implementation_boundary"
          : lower.includes("fixture handshake")
            ? "verification_order"
            : lower.includes("tests passing is not enough") || lower.includes("quality bar")
              ? "quality_bar"
              : "goal_interpretation";

        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    expectation_correction: true,
                    confidence_signal: "supported_by_objective_success",
                    validation_state: "pending_reuse_validation",
                    correction_scope: "task_local",
                    correction_category: category,
                    deviation_pattern: "the earlier direction solved the wrong problem shape",
                    corrected_constraint: "Follow the corrected task constraint before continuing."
                  })
                }
              }
            ]
          })
        };
      }

      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  expectation_correction: false
                })
              }
            }
          ]
        })
      };
    }

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: true,
                experience_kind: "execution_pattern",
                reason: "The run exposed a reusable direction or verification lesson.",
                candidate: {
                  node_type: "strategy",
                  task_type: userPayload.task_summary?.toLowerCase().includes("fixture") ? "test_debug" : "general",
                  trigger_pattern: userPayload.task_summary ?? "Handle the task carefully.",
                  compact_hint: "Follow the strongest task evidence before making broad changes.",
                  success_signal: "The targeted verification succeeds.",
                  evidence_summary: "The final path converged with better evidence."
                }
              })
            }
          }
        ]
      })
    };
  });

const createRescueFirstFetchImpl = () =>
  vi.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const systemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
    const userPayload = JSON.parse(body.messages?.find((message) => message.role === "user")?.content ?? "{}") as {
      task_summary?: string;
      context_summary?: string;
      correction_window?: { selected?: boolean };
      evidence_gate?: { objective_support?: boolean; user_confirmation?: boolean };
    };

    const isRescue = systemPrompt.includes("rescuing a missed directional correction");
    if (isRescue) {
      if (userPayload.correction_window?.selected && (userPayload.evidence_gate?.objective_support || userPayload.evidence_gate?.user_confirmation)) {
        const lower = `${userPayload.task_summary ?? ""}\n${userPayload.context_summary ?? ""}`.toLowerCase();
        const category = lower.includes("provider routing")
          ? "implementation_boundary"
          : lower.includes("fixture handshake")
            ? "verification_order"
            : lower.includes("tests passing is not enough") || lower.includes("quality bar")
              ? "quality_bar"
              : "goal_interpretation";

        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    expectation_correction: true,
                    candidate: {
                      node_type: "strategy",
                      task_type: userPayload.task_summary?.toLowerCase().includes("fixture") ? "test_debug" : "general",
                      trigger_pattern: userPayload.task_summary ?? "Follow the corrected task constraint.",
                      compact_hint: "Follow the corrected task constraint before continuing.",
                      success_signal: "The corrected verification succeeds.",
                      evidence_summary: "The later path converged with better evidence.",
                      experience_kind: "expectation_correction",
                      confidence_signal: "supported_by_objective_success",
                      validation_state: "pending_reuse_validation",
                      correction_scope: "task_local",
                      correction_category: category,
                      deviation_pattern: "the earlier direction solved the wrong problem shape",
                      corrected_constraint: "Follow the corrected task constraint before continuing."
                    }
                  })
                }
              }
            ]
          })
        };
      }

      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  expectation_correction: false
                })
              }
            }
          ]
        })
      };
    }

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                worth_capturing: false,
                experience_kind: "none",
                reason: "The run looked task-local and not broadly reusable."
              })
            }
          }
        ]
      })
    };
  });

const createGate = (fetchImpl: typeof fetch) =>
  new LlmLearningGate(
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
      fetchImpl
    }
  );

describe("Directional correction phase-1 evaluation set", () => {
  it("captures the fixed positive sample set as expectation corrections", async () => {
    const fetchImpl = createFetchImpl();
    const gate = createGate(fetchImpl as unknown as typeof fetch);

    const results = await Promise.all(
      positiveDirectionalCorrectionSamples.map(async (sample) => ({
        name: sample.name,
        result: await gate.generateCandidateDrafts(sample.input)
      }))
    );

    const captured = results.filter((entry) => entry.result.drafts[0]?.experience_kind === "expectation_correction");
    const captureRate = captured.length / positiveDirectionalCorrectionSamples.length;

    expect(captureRate).toBe(1);
    for (const entry of captured) {
      expect(entry.result.drafts[0]?.corrected_constraint).toBeTruthy();
      expect(entry.result.drafts[0]?.correction_category).toBeTruthy();
    }
  });

  it("keeps the fixed negative sample set out of expectation correction capture", async () => {
    const fetchImpl = createFetchImpl();
    const gate = createGate(fetchImpl as unknown as typeof fetch);

    const results = await Promise.all(
      negativeDirectionalCorrectionSamples.map(async (sample) => ({
        name: sample.name,
        result: await gate.generateCandidateDrafts(sample.input)
      }))
    );

    const falsePositives = results.filter(
      (entry) => entry.result.drafts[0]?.experience_kind === "expectation_correction" || entry.result.worthCapturing
    );
    const falsePositiveRate = falsePositives.length / negativeDirectionalCorrectionSamples.length;

    expect(falsePositiveRate).toBe(0);
  });

  it("rescues the fixed positive sample set when the main gate rejects generic capture", async () => {
    const fetchImpl = createRescueFirstFetchImpl();
    const gate = createGate(fetchImpl as unknown as typeof fetch);

    const results = await Promise.all(
      positiveDirectionalCorrectionSamples.map(async (sample) => ({
        name: sample.name,
        result: await gate.generateCandidateDrafts(sample.input)
      }))
    );

    const captured = results.filter((entry) => entry.result.drafts[0]?.experience_kind === "expectation_correction");
    const captureRate = captured.length / positiveDirectionalCorrectionSamples.length;

    expect(captureRate).toBe(1);
  });
});
