import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import {
  decideHybridExplainRoute,
  deriveStructuredSilenceReason,
  ExperienceInteractionService,
  type ExperienceLastInspection
} from "../../src/interaction/service.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { InjectionRepository } from "../../src/store/sqlite/repositories/injection-repo.js";
import { AttributionRecordRepository } from "../../src/store/sqlite/repositories/attribution-record-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-interaction-service-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const seedStrategyNode = (nodeRepo: NodeRepository, cwd: string, timestamp: string, id: string): void => {
  const scope = resolveScope(cwd);
  nodeRepo.upsert({
    id,
    node_type: "strategy",
    scope_id: scope.scope_id,
    task_type: "test_debug",
    trigger_pattern: "Fix the failing auth test",
    applicability_notes: "Use the same repo and test scope",
    env_signature: undefined,
    compact_hint: "Run the failing auth test before editing and verify after the fix.",
    goal: "Stabilize the failing auth test",
    recommended_steps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
    avoid_steps: [],
    fallback_steps: [],
    success_signal: "The targeted test passes",
    stop_condition: undefined,
    escalation_condition: undefined,
    evidence_summary: "Recovered the same failing auth test in a prior task.",
    retrieval_text: "Fix the failing auth test\nRun the failing auth test before editing and verify after the fix.",
    source_kind: "system_derived",
    origin_record_ids: ["input_origin"],
    helped_record_ids: ["input_helped"],
    harmed_record_ids: ["input_harmed"],
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

const seedLatestInspectionRecord = (homeDir: string, cwd: string): void => {
  const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
  const db = openDatabase(config);
  bootstrapDatabase(db);
  const scope = resolveScope(cwd);
  const inputRepo = new InputRecordRepository(db);
  const injectionRepo = new InjectionRepository(db);
  const timestamp = nowIso();

  inputRepo.upsert({
    record_id: "input_latest_explain",
    episode_id: "episode_latest_explain",
    scope_id: scope.scope_id,
    session_id: "session_latest_explain",
    task_type: "test_debug",
    task_summary: "Fix the failing auth test",
    outcome_signal: "success",
    context_summary: "The targeted auth test now passes after using the validated recovery loop.",
    evidence: ["vitest: success: targeted auth test now passes"],
    injected_node_ids: ["node_interaction_detail"],
    created_at: timestamp
  });

  injectionRepo.upsert({
    injection_id: "inject_latest_explain",
    episode_id: "episode_latest_explain",
    session_id: "session_latest_explain",
    scope_id: scope.scope_id,
    task_type: "test_debug",
    task_summary: "Fix the failing auth test",
    mode: "inject",
    delivery_mode: "live",
    delivered: true,
    injected_node_ids: ["node_interaction_detail"],
    injection_count: 1,
    scorecard: {
      scopeId: scope.scope_id,
      taskType: "test_debug",
      taskSummary: "Fix the failing auth test",
      mode: "inject",
      riskLevel: "low",
      recommendation: "Inject the strongest validated auth-test recovery hint.",
      reasons: ["The best candidate is validated by reuse."],
      decisionReason: "mature_validated_candidate",
      nodes: [],
      createdAt: timestamp
    },
    was_successful: null,
    harm_observed: null,
    created_at: timestamp
  });
};

const seedMetaOriginRecord = (db: ReturnType<typeof openDatabase>, cwd: string, recordId = "input_meta_origin"): void => {
  const scope = resolveScope(cwd);
  const inputRepo = new InputRecordRepository(db);
  inputRepo.upsert({
    record_id: recordId,
    scope_id: scope.scope_id,
    session_id: "session_meta_origin",
    task_type: "general",
    task_summary: "Review the weekly audit and inspect the latest doctor output before changing retrieval policy.",
    outcome_signal: "success",
    context_summary: "This is an audit of retrieval quality and host readiness.",
    evidence: [],
    injected_node_ids: [],
    created_at: nowIso()
  });
};

describe("ExperienceInteractionService", () => {
  it("routes explicit explanation questions into hybrid sync explain", () => {
    expect(decideHybridExplainRoute("Why did ExperienceEngine inject that hint here?")).toMatchObject({
      route: "ESCALATE_SYNC_EXPLAIN",
      reasonCode: "explicit_explanation_request"
    });
  });

  it("keeps routine repo questions on the fast path", () => {
    expect(decideHybridExplainRoute("Show me the current ExperienceEngine repo summary.")).toMatchObject({
      route: "FAST_PATH",
      reasonCode: "default_fast_path"
    });
  });

  it("derives no_strong_match for a mature repo skip without a stronger structured silence reason", () => {
    const inspection: ExperienceLastInspection = {
      scopeId: "scope_repo",
      taskType: "general",
      intervention: "skip",
      outcome: "success",
      autoFeedback: "none",
      attributionRecords: [],
      injectedNodes: [],
      hints: [],
      evidence: [],
      retrievalNotes: [],
      timeline: [],
      learningStatus: "rejected",
      learningReason: "no reusable candidate crossed the delivery bar for this turn",
      summary: "Inspect the current repo files",
      createdAt: nowIso()
    };

    expect(
      deriveStructuredSilenceReason({
        inspection,
        readiness: {
          rawRecords: 4,
          taskRuns: 4,
          candidates: 0,
          nodes: 1,
          nextStep: "Keep working in the same repo."
        }
      })
    ).toBe("no_strong_match");
  });

  it("returns structured node views", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");

    const service = new ExperienceInteractionService(config);
    const active = service.listActiveNodes();
    const detail = service.inspectNode("node_interaction_detail");

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: "node_interaction_detail",
      type: "strategy",
      state: "active",
      sourceKind: "system_derived"
    });
    expect(detail).toMatchObject({
      id: "node_interaction_detail",
      scopeId: resolveScope("/repo").scope_id,
      recommendedSteps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
      originRecordIds: ["input_origin"],
      helpedRecordIds: ["input_helped"],
      harmedRecordIds: ["input_harmed"]
    });
  });

  it("uses the hybrid explain worker for explicit explanation requests and keeps deterministic fallback safe", async () => {
    const homeDir = makeTempDir();
    const config = loadConfig({
      dataDir: join(homeDir, ".experienceengine"),
      hybridEnabled: true,
      hybridSyncExplainEnabled: true
    });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");
    seedLatestInspectionRecord(homeDir, "/repo");

    const service = new ExperienceInteractionService(config);
    const explanation = await service.explainLastDecision("/repo", "Why did ExperienceEngine inject that hint here?");

    expect(explanation).toContain("ExperienceEngine");
    expect(explanation).toContain("validated");
  });

  it("falls back to the deterministic explanation when hybrid explain is disabled", async () => {
    const homeDir = makeTempDir();
    const config = loadConfig({
      dataDir: join(homeDir, ".experienceengine"),
      hybridEnabled: false,
      hybridSyncExplainEnabled: false
    });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");
    seedLatestInspectionRecord(homeDir, "/repo");

    const service = new ExperienceInteractionService(config);
    const explanation = await service.explainLastDecision("/repo", "Why did ExperienceEngine inject that hint here?");

    expect(explanation).toContain("ExperienceEngine injected");
  });

  it("includes episode id in latest inspection when compatible rows have one", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");
    seedLatestInspectionRecord(homeDir, "/repo");

    const service = new ExperienceInteractionService(config);

    expect(service.inspectLast("/repo")).toMatchObject({
      episodeId: "episode_latest_explain",
      episodeProjection: expect.objectContaining({
        episode_id: "episode_latest_explain",
        input_records: [expect.objectContaining({ record_id: "input_latest_explain" })],
        injection_events: [expect.objectContaining({ injection_id: "inject_latest_explain" })]
      })
    });
  });

  it("keeps shadow-mode hybrid explanations non-user-visible", async () => {
    const homeDir = makeTempDir();
    const config = loadConfig({
      dataDir: join(homeDir, ".experienceengine"),
      hybridEnabled: true,
      hybridSyncExplainEnabled: true,
      hybridRolloutMode: "shadow"
    });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");
    seedLatestInspectionRecord(homeDir, "/repo");

    const service = new ExperienceInteractionService(config);
    const explanation = await service.explainLastDecision("/repo", "Why did ExperienceEngine inject that hint here?");
    const traceRows = db
      .prepare("SELECT worker_task, rollout_mode, output_action FROM hybrid_invocation_traces ORDER BY created_at ASC")
      .all() as Array<{ worker_task: string; rollout_mode: string; output_action: string }>;

    expect(explanation).toContain("ExperienceEngine injected");
    expect(explanation).not.toContain("clear the fast path");
    expect(traceRows).toEqual([
      expect.objectContaining({
        worker_task: "explain_decision",
        rollout_mode: "shadow",
        output_action: "none"
      })
    ]);
  });

  it("uses the provider-backed explain path when explicitly enabled and records the phase 2 model profile", async () => {
    const homeDir = makeTempDir();
    const config = loadConfig({
      dataDir: join(homeDir, ".experienceengine"),
      hybridEnabled: true,
      hybridSyncExplainEnabled: true,
      hybridExplainLlmEnabled: true,
      hybridExplainProviderMode: "shared_distiller",
      hybridExplainModelProfileVersion: "hybrid-explain-llm-v1",
      distillerProvider: "openai_compatible",
      distillerModel: "gpt-5.4-mini"
    });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");
    seedLatestInspectionRecord(homeDir, "/repo");

    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY;
    process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY = "test-key";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "ExperienceEngine injected reusable guidance for this task.",
                  reason: "The candidate was already validated and cleared the fast path.",
                  confidence: "high",
                  evidence_summary: "task summary, retrieval note"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    try {
      const service = new ExperienceInteractionService(config);
      const explanation = await service.explainLastDecision("/repo", "Why did ExperienceEngine inject that hint here?");
      const traceRows = db
        .prepare(
          "SELECT worker_task, rollout_mode, output_action, worker_profile_version FROM hybrid_invocation_traces ORDER BY created_at ASC"
        )
        .all() as Array<{
        worker_task: string;
        rollout_mode: string;
        output_action: string;
        worker_profile_version: string;
      }>;

      expect(explanation).toContain("validated and cleared the fast path");
      expect(traceRows).toEqual([
        expect.objectContaining({
          worker_task: "explain_decision",
          rollout_mode: "live",
          output_action: "surfaced",
          worker_profile_version: "hybrid-explain-llm-v1"
        })
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY;
      } else {
        process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY = originalApiKey;
      }
    }
  });

  it("records an explicit phase 2 fallback trace when provider-backed explain is enabled but provider resolution is unavailable", async () => {
    const homeDir = makeTempDir();
    const config = loadConfig({
      dataDir: join(homeDir, ".experienceengine"),
      hybridEnabled: true,
      hybridSyncExplainEnabled: true,
      hybridExplainLlmEnabled: true,
      hybridExplainProviderMode: "shared_distiller",
      hybridExplainModelProfileVersion: "hybrid-explain-llm-v1",
      distillerProvider: "openai_compatible",
      distillerModel: "gpt-5.4-mini"
    });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");
    seedLatestInspectionRecord(homeDir, "/repo");

    const originalApiKey = process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY;
    delete process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY;

    try {
      const service = new ExperienceInteractionService(config);
      const explanation = await service.explainLastDecision("/repo", "Why did ExperienceEngine inject that hint here?");
      const traceRows = db
        .prepare(
          "SELECT worker_task, rollout_mode, output_action, worker_profile_version, validation_status, fallback_reason FROM hybrid_invocation_traces ORDER BY created_at ASC"
        )
        .all() as Array<{
          worker_task: string;
          rollout_mode: string;
          output_action: string;
          worker_profile_version: string;
          validation_status: string;
          fallback_reason: string | null;
        }>;

      expect(explanation).toContain("ExperienceEngine injected");
      expect(traceRows).toEqual([
        expect.objectContaining({
          worker_task: "explain_decision",
          rollout_mode: "live",
          output_action: "none",
          worker_profile_version: "hybrid-explain-llm-v1",
          validation_status: "fallback",
          fallback_reason: "provider_unavailable"
        })
      ]);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY;
      } else {
        process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY = originalApiKey;
      }
    }
  });

  it("returns not_found for feedback when no injected record exists", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const service = new ExperienceInteractionService(config);

    expect(service.feedbackLast("helped")).toEqual({
      status: "not_found",
      reason: "last_injected_missing"
    });
  });

  it("mirrors feedbackLast into manual attribution override evidence", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const attributionRepo = new AttributionRecordRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");
    seedLatestInspectionRecord(homeDir, "/repo");

    const service = new ExperienceInteractionService(config);

    expect(service.feedbackLast("helped", "/repo")).toEqual({
      status: "updated",
      feedback: "helped",
      nodeIds: ["node_interaction_detail"]
    });
    expect(attributionRepo.listByInjectionId("inject_latest_explain")).toEqual([
      expect.objectContaining({
        node_id: "node_interaction_detail",
        source: "manual_override",
        user_override: "helped",
        attribution_verdict: "strong_helped",
        confidence: "high"
      })
    ]);
  });

  it("toggles scope state and reports whether the state changed", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const scopeRepo = new ScopeRepository(db);
    const scope = resolveScope("/repo");
    scopeRepo.upsert(scope);

    const service = new ExperienceInteractionService(config);
    const disabled = service.disableScope("/repo");
    const disabledAgain = service.disableScope("/repo");
    const enabled = service.enableScope("/repo");

    expect(disabled).toMatchObject({
      scopeId: scope.scope_id,
      isDisabled: true,
      changed: true
    });
    expect(disabledAgain).toMatchObject({
      scopeId: scope.scope_id,
      isDisabled: true,
      changed: false
    });
    expect(enabled).toMatchObject({
      scopeId: scope.scope_id,
      isDisabled: false,
      changed: true
    });
  });

  it("updates node lifecycle state through the shared interaction service", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const reviewRepo = new ReviewEventRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_lifecycle");

    const service = new ExperienceInteractionService(config);
    const cooled = service.coolNode("node_interaction_lifecycle");
    const retired = service.retireNode("node_interaction_lifecycle");

    expect(cooled).toEqual({
      status: "updated",
      nodeId: "node_interaction_lifecycle",
      state: "cooling"
    });
    expect(retired).toEqual({
      status: "updated",
      nodeId: "node_interaction_lifecycle",
      state: "retired"
    });
    expect(reviewRepo.listByNodeId("node_interaction_lifecycle").map((event) => event.event_type)).toEqual([
      "retire",
      "cool"
    ]);
  });

  it("lets explicit harmful feedback drive the node into cooling", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const reviewRepo = new ReviewEventRepository(db);
    const attributionRepo = new AttributionRecordRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_feedback");
    nodeRepo.upsert({
      ...nodeRepo.getById("node_interaction_feedback")!,
      helped_count: 1,
      state: "active"
    });

    const service = new ExperienceInteractionService(config);
    service.feedbackNode("node_interaction_feedback", "harmed");
    service.feedbackNode("node_interaction_feedback", "harmed");

    expect(nodeRepo.getById("node_interaction_feedback")).toMatchObject({
      state: "cooling",
      helped_count: 1,
      harmed_count: 2
    });
    expect(reviewRepo.listByNodeId("node_interaction_feedback")).toHaveLength(2);
    expect(reviewRepo.listByNodeId("node_interaction_feedback").every((event) => event.event_type === "mark_harmed")).toBe(true);
    expect(attributionRepo.listByNodeId("node_interaction_feedback")).toEqual([
      expect.objectContaining({
        source: "manual_override",
        user_override: "harmed",
        attribution_verdict: "strong_harmed"
      }),
      expect.objectContaining({
        source: "manual_override",
        user_override: "harmed",
        attribution_verdict: "strong_harmed"
      })
    ]);
  });

  it("does not automatically revive explicitly retired nodes through feedback", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_retired_feedback");
    nodeRepo.upsert({
      ...nodeRepo.getById("node_interaction_retired_feedback")!,
      state: "retired"
    });

    const service = new ExperienceInteractionService(config);
    service.feedbackNode("node_interaction_retired_feedback", "helped");

    expect(nodeRepo.getById("node_interaction_retired_feedback")).toMatchObject({
      state: "retired",
      helped_count: 1
    });
  });

  it("keeps a meta-origin candidate in candidate state after the first explicit helped signal", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedMetaOriginRecord(db, "/repo");
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_meta_feedback");
    nodeRepo.upsert({
      ...nodeRepo.getById("node_interaction_meta_feedback")!,
      state: "candidate",
      origin_record_ids: ["input_meta_origin"]
    });

    const service = new ExperienceInteractionService(config);
    service.feedbackNode("node_interaction_meta_feedback", "helped");

    expect(nodeRepo.getById("node_interaction_meta_feedback")).toMatchObject({
      state: "candidate",
      helped_count: 1
    });
  });

});
