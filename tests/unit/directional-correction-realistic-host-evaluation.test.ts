import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { LlmLearningGate } from "../../src/analyzer/llm-learning-gate.js";
import type { ExperienceInput } from "../../src/types/domain.js";

const makeInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_directional_realistic_host",
  task_type: "general",
  task_summary: "Follow the strongest evidence and correct the task direction when needed.",
  context_summary: "The task involved a realistic coding-agent correction flow.",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: [],
  ...overrides
});

const explicitUserCorrectionSample = makeInput({
  task_type: "bug_fix",
  outcome_signal: "success",
  task_summary: "Fix the duplicate-check regression without persisting the fix in the wrong layer.",
  context_summary:
    "The initial attempts chased cache, timing, and deploy explanations. The user explicitly corrected the direction and said the bug was still in callback state handling, not in deployment timing. A later browser verification confirmed the duplicate-check flow behaved correctly after fixing the callback path.",
  tool_events: [
    {
      event_id: "evt_initial_wrong_hypothesis",
      tool_name: "analysis-note",
      status: "success",
      output_summary: "Initial working theory: the duplicate-check regression may come from cache timing or a stale deploy.",
      started_at: "2026-03-29T16:00:00.000Z"
    },
    {
      event_id: "evt_user_correction",
      tool_name: "user-feedback",
      status: "success",
      output_summary:
        "The user said the issue is still in callback state handling and closure capture, not in cache timing or deployment.",
      started_at: "2026-03-29T16:03:00.000Z"
    },
    {
      event_id: "evt_callback_fix",
      tool_name: "apply_patch",
      status: "success",
      output_summary: "Updated callback state handling so the duplicate-check path reads the latest value.",
      started_at: "2026-03-29T16:07:00.000Z"
    },
    {
      event_id: "evt_browser_verify",
      tool_name: "browser-verify",
      status: "success",
      output_summary: "Browser verification confirmed the duplicate-check flow no longer regressed after the callback fix.",
      started_at: "2026-03-29T16:11:00.000Z"
    }
  ]
});

const evidenceDrivenReversalSample = makeInput({
  task_type: "bug_fix",
  outcome_signal: "success",
  task_summary: "Fix the duplicate-check regression by following the strongest runtime evidence.",
  context_summary:
    "The initial theory blamed debounce timing, but a focused browser reproduction plus runtime trace disproved that path and showed stale callback state handling instead. The implementation then shifted into the callback path, and later browser verification passed.",
  tool_events: [
    {
      event_id: "evt_initial_debounce_theory",
      tool_name: "analysis-note",
      status: "success",
      output_summary: "Initial working hypothesis: the duplicate-check regression is caused by debounce timing.",
      started_at: "2026-03-29T16:20:00.000Z"
    },
    {
      event_id: "evt_invalidate_debounce",
      tool_name: "browser-verify",
      status: "success",
      output_summary:
        "Focused browser reproduction disproved the debounce theory and showed the stale callback state was still driving the wrong duplicate-check behavior.",
      started_at: "2026-03-29T16:24:00.000Z"
    },
    {
      event_id: "evt_trace_callback",
      tool_name: "targeted-probe",
      status: "success",
      output_summary: "The runtime trace showed the callback path was still reading a stale captured value.",
      started_at: "2026-03-29T16:26:00.000Z"
    },
    {
      event_id: "evt_apply_callback_fix",
      tool_name: "apply_patch",
      status: "success",
      output_summary: "Reworked callback state handling instead of continuing the debounce-timing fix.",
      started_at: "2026-03-29T16:29:00.000Z"
    },
    {
      event_id: "evt_validate_callback_fix",
      tool_name: "browser-verify",
      status: "success",
      output_summary: "The later browser verification confirmed the duplicate-check flow behaved correctly after the callback-state fix.",
      started_at: "2026-03-29T16:33:00.000Z"
    }
  ]
});

const createFetchImpl = () =>
  vi.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const systemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
    const userPayload = JSON.parse(body.messages?.find((message) => message.role === "user")?.content ?? "{}") as {
      task_summary?: string;
      context_summary?: string;
      correction_window?: { selected?: boolean };
      reversal_window?: { selected?: boolean };
      evidence_gate?: {
        objective_support?: boolean;
        user_confirmation?: boolean;
        invalidating_evidence?: boolean;
        validating_evidence?: boolean;
        prior_hypothesis?: boolean;
      };
    };

    const lower = `${userPayload.task_summary ?? ""}\n${userPayload.context_summary ?? ""}`.toLowerCase();

    if (systemPrompt.includes("evidence-driven reversal")) {
      if (
        userPayload.reversal_window?.selected &&
        userPayload.evidence_gate?.invalidating_evidence &&
        userPayload.evidence_gate?.validating_evidence &&
        userPayload.evidence_gate?.prior_hypothesis
      ) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reversal_detected: true,
                    reversal_source: "task_evidence",
                    superseded_hypothesis: "The debounce-timing theory solved the wrong problem shape.",
                    replacement_constraint: "Follow the callback-state evidence instead of persisting in the debounce path.",
                    verification_evidence: "Later browser verification passed on the callback-state replacement path.",
                    pivot_summary: "The task pivoted after stronger runtime evidence invalidated the original hypothesis.",
                    correction_scope: "task_local",
                    correction_category: "implementation_boundary",
                    deviation_pattern: "the earlier direction was disproven by later task evidence",
                    corrected_constraint:
                      "Follow the callback-state evidence instead of persisting in the debounce path."
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
          choices: [{ message: { content: JSON.stringify({ reversal_detected: false }) } }]
        })
      };
    }

    if (systemPrompt.includes("repairing a coding-experience draft")) {
      if (userPayload.correction_window?.selected && (userPayload.evidence_gate?.objective_support || userPayload.evidence_gate?.user_confirmation)) {
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
                    correction_category: "implementation_boundary",
                    deviation_pattern: "the earlier direction stayed in cache or deploy explanations instead of callback-state handling",
                    corrected_constraint:
                      "When browser or user evidence points at callback-state handling, stop chasing cache or deploy explanations."
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
          choices: [{ message: { content: JSON.stringify({ expectation_correction: false }) } }]
        })
      };
    }

    if (systemPrompt.includes("rescuing a missed directional correction")) {
      if (userPayload.correction_window?.selected && (userPayload.evidence_gate?.objective_support || userPayload.evidence_gate?.user_confirmation)) {
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
                      task_type: "bug_fix",
                      trigger_pattern: userPayload.task_summary ?? "Follow the corrected task constraint.",
                      compact_hint:
                        "When the bug is still in callback-state handling, stop chasing cache or deploy explanations.",
                      success_signal: "The browser verification succeeds after the callback-state fix.",
                      evidence_summary: "The later browser path converged after following the corrected implementation boundary.",
                      experience_kind: "expectation_correction",
                      confidence_signal: "supported_by_objective_success",
                      validation_state: "pending_reuse_validation",
                      correction_scope: "task_local",
                      correction_category: "implementation_boundary",
                      deviation_pattern:
                        "the earlier direction stayed in cache or deploy explanations instead of callback-state handling",
                      corrected_constraint:
                        "When browser or user evidence points at callback-state handling, stop chasing cache or deploy explanations."
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
          choices: [{ message: { content: JSON.stringify({ expectation_correction: false }) } }]
        })
      };
    }

    if (lower.includes("duplicate-check")) {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  worth_capturing: true,
                  experience_kind: "execution_pattern",
                  reason: "The run exposed a reusable debugging pattern.",
                  candidate: {
                    node_type: "strategy",
                    task_type: "bug_fix",
                    trigger_pattern: userPayload.task_summary ?? "Follow the strongest evidence.",
                    compact_hint: "Use focused browser/runtime evidence before broad fixes.",
                    success_signal: "The focused browser verification passes after the targeted fix.",
                    evidence_summary: "The task converged after a focused verification loop."
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

describe("Directional correction realistic host-style evaluation", () => {
  it("captures an explicit user-correction scenario inspired by real coding-agent redirection", async () => {
    const gate = createGate(createFetchImpl() as unknown as typeof fetch);

    const result = await gate.generateCandidateDrafts(explicitUserCorrectionSample);

    expect(result.drafts[0]?.experience_kind).toBe("expectation_correction");
    expect(result.drafts[0]?.correction_category).toBe("implementation_boundary");
    expect(result.drafts[0]?.corrected_constraint).toContain("callback-state");
  });

  it("captures an evidence-driven reversal scenario without explicit user correction", async () => {
    const gate = createGate(createFetchImpl() as unknown as typeof fetch);

    const result = await gate.generateCandidateDrafts(evidenceDrivenReversalSample);

    expect(result.drafts[0]?.experience_kind).toBe("expectation_correction");
    expect(result.evidenceDrivenReversalSignal?.semantic_detected).toBe(true);
    expect(result.evidenceDrivenReversalSignal?.correction_category).toBe("implementation_boundary");
    expect(result.evidenceDrivenReversalSignal?.corrected_constraint).toContain("callback-state");
  });
});
