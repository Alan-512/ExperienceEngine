import { describe, expect, it } from "vitest";
import { deriveSelectiveSecondOpinionTrigger, evaluateSelectiveSecondOpinion } from "../../src/controller/second-opinion-gate.js";
import type { ExperienceInput, ExperienceNode } from "../../src/types/domain.js";
import type { RetrievedCandidate } from "../../src/controller/candidate-retriever.js";

const node = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_default",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "Fix the failing test in the current workspace",
  compact_hint: "Reproduce, make the narrow fix, rerun the test.",
  success_signal: "Focused verification passes.",
  evidence_summary: "Captured from a successful run.",
  retrieval_text: "Fix the failing test in the current workspace\nReproduce, make the narrow fix, rerun the test.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

const input: ExperienceInput = {
  scope_id: "scope_1",
  task_type: "test_debug",
  task_summary: "Fix the failing test in the current workspace",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: []
};

const candidate = (entry: ExperienceNode, overrides: Partial<RetrievedCandidate> = {}): RetrievedCandidate => ({
  node: entry,
  semanticScore: 0.8,
  lexicalScore: 0.8,
  fusedScore: 0.8,
  retrievalScore: 0.8,
  policyAdjustment: 0,
  policyScore: 0.8,
  totalScore: 0.8,
  familyScore: 1,
  scopeMatch: true,
  taskFamilyMatch: true,
  retrievalReasons: [],
  policyReasons: [],
  scoreMargin: 0.02,
  ...overrides
});

describe("evaluateSelectiveSecondOpinion", () => {
  it("only escalates conservative delivery state for active nodes", () => {
    expect(
      deriveSelectiveSecondOpinionTrigger(
        input,
        [node({ id: "top-node", state: "active", delivery_state: "conservative_only" })],
        [candidate(node({ id: "top-node", state: "active", delivery_state: "conservative_only" }))]
      )
    ).toBe("conservative_delivery_state");

    expect(
      deriveSelectiveSecondOpinionTrigger(
        input,
        [node({ id: "priority-node", state: "priority_candidate", delivery_state: "conservative_only" })],
        [candidate(node({ id: "priority-node", state: "priority_candidate", delivery_state: "conservative_only" }))]
      )
    ).toBe("close_score_margin");
  });

  it("only escalates expectation correction on the live inject path", () => {
    expect(
      deriveSelectiveSecondOpinionTrigger(
        {
          ...input,
          task_summary: "The previous pass focused too much on the wrong layer."
        },
        [node({ id: "top-node", state: "active", delivery_state: "eligible" })],
        [candidate(node({ id: "top-node", state: "active", delivery_state: "eligible" }))]
      )
    ).toBe("expectation_correction");

    expect(
      deriveSelectiveSecondOpinionTrigger(
        {
          ...input,
          task_summary: "The previous pass focused too much on the wrong layer."
        },
        [node({ id: "top-node", state: "active", delivery_state: "conservative_only" })],
        [candidate(node({ id: "top-node", state: "active", delivery_state: "conservative_only" }))]
      )
    ).toBe("conservative_delivery_state");
  });

  it("tightens the close-score margin trigger threshold", () => {
    expect(
      deriveSelectiveSecondOpinionTrigger(
        input,
        [node({ id: "top-node" })],
        [candidate(node({ id: "top-node" }), { scoreMargin: 0.03 })]
      )
    ).toBe("close_score_margin");

    expect(
      deriveSelectiveSecondOpinionTrigger(
        input,
        [node({ id: "top-node" })],
        [candidate(node({ id: "top-node" }), { scoreMargin: 0.04 })]
      )
    ).toBeNull();
  });

  it("returns null when disabled", async () => {
    const result = await evaluateSelectiveSecondOpinion(
      {
        input,
        plannedMode: "inject",
        selected: [node({ id: "top-node" })],
        scoredCandidates: [candidate(node({ id: "top-node" }))],
        trigger: "close_score_margin"
      },
      {
        config: {
          syncSecondOpinionMode: "disabled",
          syncSecondOpinionModel: "",
          distillerProvider: "openai_compatible",
          distillationAuthMode: "api_key",
          distillerModel: ""
        }
      }
    );

    expect(result).toBeNull();
  });

  it("returns a structured recommendation from the provider", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const result = await evaluateSelectiveSecondOpinion(
      {
        input,
        plannedMode: "inject",
        selected: [node({ id: "top-node", harmed_count: 1 })],
        scoredCandidates: [candidate(node({ id: "top-node", harmed_count: 1 }))],
        trigger: "harm_history"
      },
      {
        config: {
          syncSecondOpinionMode: "selective",
          syncSecondOpinionModel: "gpt-second-opinion-mini",
          distillerProvider: "openai_compatible",
          distillationAuthMode: "api_key",
          distillerModel: "gpt-distiller"
        },
        resolveEndpoint: () => ({
          kind: "openai",
          baseUrl: "https://example.test/v1",
          model: "gpt-second-opinion-mini",
          headers: { authorization: "Bearer test" },
          source: "explicit",
          provider: "openai_compatible"
        }),
        fetchImpl: async (_url, init) => {
          capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      decision: "allow_conservative",
                      best_node_id: "top-node",
                      confidence: "medium",
                      reason: "The node matches but carries recent harm history."
                    })
                  }
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    );

    expect(result).toEqual({
      decision: "allow_conservative",
      bestNodeId: "top-node",
      confidence: "medium",
      reason: "The node matches but carries recent harm history.",
      trigger: "harm_history"
    });
    expect(capturedBody?.max_tokens).toBe(160);
  });
});
