import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { LlmLearningGate } from "../../src/analyzer/llm-learning-gate.js";
import {
  negativeEvidenceDrivenReversalSamplesA,
  negativeEvidenceDrivenReversalSamplesB,
  positiveEvidenceDrivenReversalSamples
} from "../fixtures/directional-correction/phase2a.js";

const createFetchImpl = () =>
  vi.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const systemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
    const userPayload = JSON.parse(body.messages?.find((message) => message.role === "user")?.content ?? "{}") as {
      task_summary?: string;
      context_summary?: string;
      reversal_window?: { selected?: boolean };
      evidence_gate?: { invalidating_evidence?: boolean; validating_evidence?: boolean; prior_hypothesis?: boolean };
    };

    const isReversalRepair = systemPrompt.includes("evidence-driven reversal");
    if (isReversalRepair) {
      if (
        userPayload.reversal_window?.selected &&
        userPayload.evidence_gate?.invalidating_evidence &&
        userPayload.evidence_gate?.validating_evidence &&
        userPayload.evidence_gate?.prior_hypothesis
      ) {
        const lower = `${userPayload.task_summary ?? ""}\n${userPayload.context_summary ?? ""}`.toLowerCase();
        const category = lower.includes("provider routing")
          ? "implementation_boundary"
          : lower.includes("interaction logic")
            ? "quality_bar"
            : "goal_interpretation";

        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reversal_detected: true,
                    reversal_source: "task_evidence",
                    superseded_hypothesis: "The earlier path solved the wrong problem shape.",
                    replacement_constraint: "Follow the stronger replacement path instead of persisting in the disproven direction.",
                    verification_evidence: "Later targeted verification succeeded on the replacement path.",
                    pivot_summary: "The task pivoted after stronger evidence invalidated the original hypothesis.",
                    correction_scope: "task_local",
                    correction_category: category,
                    deviation_pattern: "the earlier direction was disproven by later task evidence",
                    corrected_constraint:
                      "Follow the stronger replacement path instead of persisting in the disproven direction."
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
                  reversal_detected: false
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
                reason: "The task exposed a reusable execution pattern.",
                candidate: {
                  node_type: "strategy",
                  task_type: "general",
                  trigger_pattern: userPayload.task_summary ?? "Follow the strongest evidence.",
                  compact_hint: "Keep the path narrow and validate it with targeted checks.",
                  success_signal: "The targeted verification passes.",
                  evidence_summary: "The task converged after a focused verification loop."
                }
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

describe("Directional correction phase-2A evaluation set", () => {
  it("captures evidence-driven reversal samples as expectation corrections", async () => {
    const fetchImpl = createFetchImpl();
    const gate = createGate(fetchImpl as unknown as typeof fetch);

    const results = await Promise.all(
      positiveEvidenceDrivenReversalSamples.map(async (sample) => ({
        name: sample.name,
        result: await gate.generateCandidateDrafts(sample.input)
      }))
    );

    const captured = results.filter((entry) => entry.result.drafts[0]?.experience_kind === "expectation_correction");
    const captureRate = captured.length / positiveEvidenceDrivenReversalSamples.length;

    expect(captureRate).toBe(1);
    for (const entry of captured) {
      expect(entry.result.evidenceDrivenReversalSignal?.correction_category).toBeTruthy();
      expect(entry.result.evidenceDrivenReversalSignal?.corrected_constraint).toBeTruthy();
    }
  });

  it("keeps non-invalidating stronger-evidence cases out of evidence-driven reversal capture", async () => {
    const fetchImpl = createFetchImpl();
    const gate = createGate(fetchImpl as unknown as typeof fetch);

    const results = await Promise.all(
      negativeEvidenceDrivenReversalSamplesA.map(async (sample) => ({
        name: sample.name,
        result: await gate.generateCandidateDrafts(sample.input)
      }))
    );

    const falsePositives = results.filter((entry) => entry.result.drafts[0]?.experience_kind === "expectation_correction");
    expect(falsePositives).toHaveLength(0);
  });

  it("keeps ordinary verification loops out of evidence-driven reversal capture", async () => {
    const fetchImpl = createFetchImpl();
    const gate = createGate(fetchImpl as unknown as typeof fetch);

    const results = await Promise.all(
      negativeEvidenceDrivenReversalSamplesB.map(async (sample) => ({
        name: sample.name,
        result: await gate.generateCandidateDrafts(sample.input)
      }))
    );

    const falsePositives = results.filter((entry) => entry.result.drafts[0]?.experience_kind === "expectation_correction");
    expect(falsePositives).toHaveLength(0);
  });
});
