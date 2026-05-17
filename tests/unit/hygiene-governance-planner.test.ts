import { describe, expect, it } from "vitest";
import {
  buildHygieneGovernanceInput,
  planHygieneGovernance
} from "../../src/maintenance/hygiene-governance-planner.js";
import { LlmHygieneGovernancePlanner } from "../../src/maintenance/hygiene-governance-llm-planner.js";
import { providerConfigConflictNodes } from "../fixtures/hygiene-governance/provider-config-conflict.js";
import type { AttributionRecord, ExperienceCandidate, ExperienceNode } from "../../src/types/domain.js";

const NOW = "2026-05-16T10:00:00.000Z";

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_a",
  node_type: "strategy",
  scope_id: "scope_repo",
  task_type: "test_debug",
  trigger_pattern: "Fix provider config mismatch",
  compact_hint: "Inspect runtime provider config before changing generated config.",
  recommended_steps: ["inspect runtime provider config"],
  avoid_steps: ["edit generated config first"],
  fallback_steps: [],
  success_signal: "provider config test passes",
  evidence_summary: "Recovered provider config mismatch in a prior task.",
  retrieval_text: "Fix provider config mismatch Inspect runtime provider config",
  source_kind: "system_derived",
  origin_record_ids: ["input_a"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 2,
  helped_count: 1,
  harmed_count: 0,
  support_count: 2,
  last_used_at: "2026-05-15T00:00:00.000Z",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-15T00:00:00.000Z",
  ...overrides
});

const makeCandidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_a",
  source_record_id: "input_candidate",
  scope_id: "scope_repo",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix provider config mismatch",
  compact_hint: "Inspect runtime provider config before changing generated config.",
  recommended_steps: ["inspect runtime provider config"],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "provider config test passes",
  evidence_summary: "Candidate from provider config recovery.",
  retrieval_text: "Fix provider config mismatch Inspect runtime provider config",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_signal: {
    task_summary: "Fix provider config mismatch",
    outcome_signal: "success",
    tool_events: [],
    evidence: [],
    retry_count: 0,
    correction_signals: [],
    tool_event_summary: []
  },
  lifecycle_state: "pending",
  retry_count: 0,
  created_at: "2026-05-15T00:00:00.000Z",
  updated_at: "2026-05-15T00:00:00.000Z",
  ...overrides
});

const makeAttribution = (overrides: Partial<AttributionRecord> = {}): AttributionRecord => ({
  id: "attr_a",
  node_id: "node_live_risk",
  delivered: true,
  outcome: "failure",
  attribution_verdict: "strong_harmed",
  confidence: "high",
  evidence_refs: ["input_harmed", "inject_a"],
  source: "automatic",
  created_at: "2026-05-15T00:00:00.000Z",
  ...overrides
});

describe("hygiene governance planner input", () => {
  it("builds a bounded auditable input package from hygiene findings and scope data", () => {
    const liveRiskNode = makeNode({
      id: "node_live_risk",
      helped_count: 4,
      harmed_count: 2,
      harmed_record_ids: ["input_harmed"],
      last_harmed_at: "2026-05-15T00:00:00.000Z"
    });
    const duplicate = makeNode({
      id: "node_duplicate",
      updated_at: "2026-05-14T00:00:00.000Z"
    });

    const input = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      scopeName: "ExperienceEngine",
      scopeType: "repo",
      nodes: [duplicate, liveRiskNode],
      candidates: [makeCandidate()],
      attributionRecords: [makeAttribution()],
      now: NOW,
      maxFindings: 3,
      maxNodes: 1,
      maxCandidates: 1,
      exportRiskEnabled: true
    });

    expect(input.scope).toEqual({
      scopeId: "scope_repo",
      scopeName: "ExperienceEngine",
      scopeType: "repo"
    });
    expect(input.findings.length).toBeLessThanOrEqual(3);
    expect(input.nodes).toHaveLength(1);
    expect(input.candidates).toHaveLength(1);
    expect(input.exportRiskNotes).toEqual([
      expect.objectContaining({
        nodeId: "node_live_risk",
        reason: "eligible guidance has recent harmed attribution"
      })
    ]);
    expect(input.evidenceRefs).toEqual(expect.arrayContaining(["input_a", "input_harmed", "inject_a"]));
    expect(input.findingHash).toMatch(/^hygiene_findings_/);
  });

  it("keeps the finding hash stable when equivalent findings arrive in a different input order", () => {
    const first = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      nodes: [
        makeNode({ id: "node_a" }),
        makeNode({ id: "node_b", updated_at: "2026-05-14T00:00:00.000Z" })
      ],
      candidates: [],
      attributionRecords: [],
      now: NOW
    });
    const second = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      nodes: [
        makeNode({ id: "node_b", updated_at: "2026-05-14T00:00:00.000Z" }),
        makeNode({ id: "node_a" })
      ],
      candidates: [],
      attributionRecords: [],
      now: NOW
    });

    expect(second.findingHash).toBe(first.findingHash);
  });

  it("keeps provider/config debug conflicts available as a planner fixture", () => {
    const input = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      nodes: providerConfigConflictNodes,
      candidates: [],
      attributionRecords: [],
      now: NOW
    });

    expect(input.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "conflicting_guidance",
          affectedNodeIds: ["node_provider_config_runtime", "node_provider_config_generated"]
        })
      ])
    );
  });

  it("creates deterministic fallback actions for exact duplicates and stale shadow-only guidance", async () => {
    const input = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      nodes: [
        makeNode({
          id: "node_canonical",
          trigger_pattern: "Fix provider config mismatch",
          compact_hint: "Inspect runtime provider config before changing generated config.",
          helped_count: 2,
          support_count: 3
        }),
        makeNode({
          id: "node_duplicate",
          trigger_pattern: "Fix provider config mismatch",
          compact_hint: "Inspect runtime provider config before changing generated config.",
          helped_count: 0,
          support_count: 1
        }),
        makeNode({
          id: "node_shadow_stale",
          state: "candidate",
          delivery_state: "shadow_only",
          usage_count: 0,
          helped_count: 0,
          support_count: 0,
          last_used_at: undefined,
          updated_at: "2026-01-01T00:00:00.000Z"
        })
      ],
      candidates: [],
      attributionRecords: [],
      now: NOW
    });

    const plan = await planHygieneGovernance(input);

    expect(plan.source).toBe("deterministic_fallback");
    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: "merge_exact_duplicate",
          canonicalNodeId: "node_canonical",
          affectedNodeIds: ["node_canonical", "node_duplicate"],
          approvalRequired: false
        }),
        expect.objectContaining({
          actionType: "retire_stale_shadow",
          affectedNodeIds: ["node_shadow_stale"],
          approvalRequired: false
        })
      ])
    );
  });

  it("accepts only strict JSON plans from an LLM planner", async () => {
    const input = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      nodes: [makeNode(), makeNode({ id: "node_b" })],
      candidates: [],
      attributionRecords: [],
      now: NOW
    });

    await expect(planHygieneGovernance(input, {
      planner: {
        plan: async () => JSON.stringify({
          source: "llm",
          scopeId: "scope_repo",
          findingHash: input.findingHash,
          clusters: [],
          actions: [
            {
              actionId: "bad_action",
              actionType: "delete_everything",
              riskLevel: "low",
              approvalRequired: false,
              affectedNodeIds: ["node_a"],
              affectedCandidateIds: [],
              expectedEffect: "invalid"
            }
          ]
        })
      }
    })).rejects.toThrow(/invalid hygiene governance plan/i);
  });

  it("uses the configured distiller endpoint for LLM governance planning", async () => {
    const input = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      nodes: [makeNode(), makeNode({ id: "node_b" })],
      candidates: [],
      attributionRecords: [],
      now: NOW
    });
    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const planner = new LlmHygieneGovernancePlanner({
      config: {
        distillerProvider: "openai",
        distillerModel: "gpt-governance",
        distillationAuthMode: "api_key"
      },
      resolveEndpoint: (options) => ({
        kind: "openai",
        provider: options?.configProvider ?? "openai",
        model: options?.configModel ?? "",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        headers: { authorization: "Bearer test" },
        source: "explicit"
      }),
      fetchImpl: async (url, init) => {
        fetchCalls.push({
          url: String(url),
          body: JSON.parse(String(init?.body))
        });
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  source: "llm",
                  scopeId: input.scope.scopeId,
                  findingHash: input.findingHash,
                  clusters: [],
                  actions: []
                })
              }
            }
          ]
        }), { status: 200 });
      }
    });

    const plan = await planHygieneGovernance(input, { planner });

    expect(planner.hasEndpoint()).toBe(true);
    expect(plan.source).toBe("llm");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toMatchObject({
      model: "gpt-governance",
      response_format: { type: "json_object" }
    });
    expect(JSON.stringify(fetchCalls[0].body)).toContain("guarded action");
  });

  it("retries transient LLM planner provider failures", async () => {
    const input = buildHygieneGovernanceInput({
      scopeId: "scope_repo",
      nodes: [makeNode(), makeNode({ id: "node_b" })],
      candidates: [],
      attributionRecords: [],
      now: NOW
    });
    let calls = 0;
    const planner = new LlmHygieneGovernancePlanner({
      config: {
        distillerProvider: "openai",
        distillerModel: "gpt-governance",
        distillationAuthMode: "api_key"
      },
      maxRetries: 1,
      retryDelayMs: 0,
      resolveEndpoint: () => ({
        kind: "openai",
        provider: "openai",
        model: "gpt-governance",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        headers: {},
        source: "explicit"
      }),
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("temporary unavailable", { status: 503 });
        }
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  source: "llm",
                  scopeId: input.scope.scopeId,
                  findingHash: input.findingHash,
                  clusters: [],
                  actions: []
                })
              }
            }
          ]
        }), { status: 200 });
      }
    });

    await expect(planHygieneGovernance(input, { planner })).resolves.toMatchObject({ source: "llm" });
    expect(calls).toBe(2);
  });
});
