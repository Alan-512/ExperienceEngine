import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/config/load-config.js";
import { buildHybridPhase1RolloutSummary } from "../../../src/evaluation/hybrid-phase1-rollout-summary.js";
import { resolveHybridExplainProviderEndpoint } from "../../../src/hybrid/explain-provider-client.js";
import { HybridWorkerClient } from "../../../src/hybrid/worker-client.js";
import { phase2ExplainFixtures } from "../../fixtures/hybrid-phase2/explain/index.js";
import { runExplainDecisionLlmWorker } from "../../../src/hybrid/workers/explain-decision-llm.js";

const openAiEndpoint = {
  kind: "openai" as const,
  provider: "openai_compatible" as const,
  model: "gpt-5.4-mini",
  baseUrl: "https://api.openai.com/v1/chat/completions",
  headers: {
    Authorization: "Bearer test-key"
  },
  source: "explicit" as const
};

describe("hybrid phase 2 explain eval gate", () => {
  it("keeps provider-backed explain faithful on the fixed phase 2 explain fixture set", async () => {
    const graded = await Promise.all(
      phase2ExplainFixtures.map(async (fixture) => {
        const output = await runExplainDecisionLlmWorker(fixture.capsule, {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: fixture.responseJson
                    }
                  }
                ]
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            ),
          endpoint: openAiEndpoint
        });
        return {
          fixture,
          output
        };
      })
    );

    for (const entry of graded) {
      expect(entry.output.decision).toContain(entry.fixture.expectedDecisionFragment);
      expect(entry.output.reason).toContain(entry.fixture.expectedReasonFragment);
    }
  });

  it("fails the phase 2 explain gate when the provider output is not valid structured explain JSON", async () => {
    const fixture = phase2ExplainFixtures[0];

    await expect(
      runExplainDecisionLlmWorker(fixture.capsule, {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      decision: "ExperienceEngine injected reusable guidance for this task."
                    })
                  }
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          ),
        endpoint: openAiEndpoint
      })
    ).rejects.toThrow(/Required|non-empty string/i);
  });

  it("fails closed when the shared provider configuration is unavailable", () => {
    const config = loadConfig({
      hybridExplainLlmEnabled: true,
      hybridExplainProviderMode: "shared_distiller",
      distillerProvider: "openai_compatible",
      distillerModel: "gpt-5.4-mini"
    });

    const resolved = resolveHybridExplainProviderEndpoint(config, {
      env: {}
    });

    expect(resolved).toEqual({
      status: "unavailable",
      reason: "Shared ExperienceEngine distillation provider resolution is unavailable."
    });
  });

  it("records timeout pressure as a phase 2 explain fallback at the gate layer", async () => {
    const client = new HybridWorkerClient({
      explainDecisionEnabled: true,
      explainDecisionLlmEnabled: true,
      explainDecisionTimeoutMs: 1,
      explainDecisionProviderTimeoutMs: 1,
      explainDecisionLlmExecutor: () => new Promise(() => undefined)
    });
    const fixture = phase2ExplainFixtures[0];
    const result = await client.runExplainDecision(fixture.capsule, {
      mode: "provider",
      endpoint: openAiEndpoint
    });

    expect(result).toEqual({
      status: "fallback",
      reason: "timeout"
    });
  });

  it("blocks the phase 2 rollout recommendation when fallback pressure exceeds the explain gate", () => {
    const traces = [
      {
        id: "trace_phase2_ok",
        surface: "interaction" as const,
        route: "ESCALATE_SYNC_EXPLAIN" as const,
        route_policy_version: "hybrid-phase1-v1",
        capsule_schema_version: "hybrid-capsule-v1",
        worker_profile_version: "hybrid-explain-llm-v1",
        rollout_mode: "shadow" as const,
        rollout_reason: "shadow",
        worker_task: "explain_decision" as const,
        worker_ran: true,
        validation_status: "accepted" as const,
        output_action: "none" as const,
        created_at: "2026-03-30T00:00:00.000Z"
      },
      {
        id: "trace_phase2_timeout",
        surface: "interaction" as const,
        route: "ESCALATE_SYNC_EXPLAIN" as const,
        route_policy_version: "hybrid-phase1-v1",
        capsule_schema_version: "hybrid-capsule-v1",
        worker_profile_version: "hybrid-explain-llm-v1",
        rollout_mode: "shadow" as const,
        rollout_reason: "shadow",
        worker_task: "explain_decision" as const,
        worker_ran: true,
        validation_status: "fallback" as const,
        output_action: "none" as const,
        fallback_reason: "timeout",
        created_at: "2026-03-30T00:00:01.000Z"
      },
      {
        id: "trace_phase2_provider_unavailable",
        surface: "interaction" as const,
        route: "ESCALATE_SYNC_EXPLAIN" as const,
        route_policy_version: "hybrid-phase1-v1",
        capsule_schema_version: "hybrid-capsule-v1",
        worker_profile_version: "hybrid-explain-llm-v1",
        rollout_mode: "shadow" as const,
        rollout_reason: "shadow",
        worker_task: "explain_decision" as const,
        worker_ran: false,
        validation_status: "fallback" as const,
        output_action: "none" as const,
        fallback_reason: "provider_unavailable",
        created_at: "2026-03-30T00:00:02.000Z"
      }
    ];

    const summary = buildHybridPhase1RolloutSummary({
      traces,
      artifacts: [],
      phase2ExplainGate: {
        stage: "shadow",
        explainFaithfulnessPassed: true,
        explainFallbackRatePassed: false,
        explainTimeoutRatePassed: false
      }
    });

    expect(summary.phase2ExplainSummary).toEqual({
      llmBackedAttempts: 3,
      llmBackedFallbacks: 2,
      recommendation: "blocked"
    });
  });
});
