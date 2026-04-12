import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../config/load-config.js";
import { createCodexBehaviorLoop } from "../adapters/codex/mcp-server.js";
import { resolveScope } from "../input/scope-resolver.js";
import { openDatabase, bootstrapDatabase } from "../store/sqlite/db.js";
import { HybridInvocationTraceRepository } from "../store/sqlite/repositories/hybrid-invocation-trace-repo.js";
import { HybridReviewArtifactRepository } from "../store/sqlite/repositories/hybrid-review-artifact-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import { buildLegacyEmbedding } from "../store/vector/embeddings.js";
import type { ExperienceNode } from "../types/domain.js";

export type CodexLifecycleValidationOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  outputDir?: string;
  repoRoot?: string;
  now?: () => string;
};

export type CodexLifecycleValidationReport = {
  generatedAt: string;
  repoRoot: string;
  prompt: string;
  sessionId: string;
  outputDir: string;
  runtimeHome: string;
  sqlitePath: string;
  captureDir: string;
  seededNodeId: string;
  lookup: {
    mode: "skip" | "inject_conservative" | "inject";
    injectedNodeIds: string[];
    deliveryMode?: "live" | "shadow" | "holdout";
    delivered?: boolean;
    notice?: string;
  };
  toolResult: {
    status: string;
    eventStatus: string;
    toolName: string;
  };
  finalize: {
    status: string;
    outcomeSignal: string;
    recordedToolEvents: number;
  };
  persistence: {
    taskRunCount: number;
    injectionEventCount: number;
    reviewEventCount: number;
    hybridArtifactCount: number;
    hybridTraceCount: number;
    reviewEventTypes: string[];
  };
  node: {
    id: string;
    state: string;
    deliveryState: string;
    usageCount: number;
    helpedCount: number;
    harmedCount: number;
    lastFeedbackVerdict?: string;
  };
};

export type CodexLifecycleValidationRunResult = {
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
  report: CodexLifecycleValidationReport;
};

const DEFAULT_SESSION_ID = "codex-lifecycle-validation";
const DEFAULT_NODE_ID = "node_codex_lifecycle_validation";
const DEFAULT_PROMPT = "Fix the failing auth test";

const sanitizeStamp = (value: string): string => value.replace(/[:.]/g, "-");

const mkdirIfMissing = (path: string): void => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
};

const defaultOutputDir = (timestamp: string): string =>
  resolve("artifacts", "evaluations", "codex", sanitizeStamp(timestamp));

const seedLifecycleNode = (
  repo: NodeRepository,
  repoRoot: string,
  timestamp: string,
  nodeId: string,
  prompt: string
): void => {
  const scope = resolveScope(repoRoot);
  const retrievalText = `${prompt}\nRun the failing auth test before editing and verify after the fix.`;
  const embedding = buildLegacyEmbedding(retrievalText);
  const node: ExperienceNode = {
    id: nodeId,
    node_type: "strategy",
    scope_id: scope.scope_id,
    task_type: "test_debug",
    trigger_pattern: prompt,
    applicability_notes: "Use the same repo and test scope",
    env_signature: undefined,
    compact_hint: "Run the failing auth test before editing and verify after the fix.",
    goal: "Stabilize the failing auth test",
    recommended_steps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
    avoid_steps: [],
    fallback_steps: [],
    success_signal: "The targeted auth test passes",
    stop_condition: undefined,
    escalation_condition: undefined,
    evidence_summary: "Recovered the same failing auth test in a prior Codex lifecycle validation run.",
    retrieval_text: retrievalText,
    embedding: embedding.embedding,
    embedding_provider: embedding.space.provider,
    embedding_model: embedding.space.model,
    embedding_version: embedding.space.version,
    embedding_dimensions: embedding.space.dimensions,
    distillation_mode_used: "rule",
    distillation_source: "rule",
    source_kind: "system_derived",
    origin_record_ids: ["input_codex_validation_origin"],
    helped_record_ids: [],
    harmed_record_ids: [],
    state: "active",
    delivery_state: "eligible",
    usage_count: 0,
    helped_count: 0,
    harmed_count: 0,
    consecutive_harmed_count: 0,
    support_count: 1,
    created_at: timestamp,
    updated_at: timestamp
  };

  repo.upsert(node);
};

export const renderCodexLifecycleValidationMarkdown = (
  report: CodexLifecycleValidationReport
): string =>
  [
    "# Codex lifecycle validation",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Repo root: ${report.repoRoot}`,
    `- Session id: ${report.sessionId}`,
    `- Seeded node: ${report.seededNodeId}`,
    `- Lookup mode: ${report.lookup.mode}`,
    `- Injected node ids: ${report.lookup.injectedNodeIds.join(", ") || "none"}`,
    `- Final outcome: ${report.finalize.outcomeSignal}`,
    `- Persisted task runs: ${report.persistence.taskRunCount}`,
    `- Persisted injection events: ${report.persistence.injectionEventCount}`,
    `- Persisted review events: ${report.persistence.reviewEventCount}`,
    `- Persisted hybrid artifacts: ${report.persistence.hybridArtifactCount}`,
    `- Persisted hybrid traces: ${report.persistence.hybridTraceCount}`,
    `- Review event types: ${report.persistence.reviewEventTypes.join(", ") || "none"}`,
    `- Node lifecycle: ${report.node.state}`,
    `- Node delivery: ${report.node.deliveryState}`,
    `- Node helped/harmed: ${report.node.helpedCount}/${report.node.harmedCount}`
  ].join("\n");

export const runCodexLifecycleValidation = async (
  options: CodexLifecycleValidationOptions = {}
): Promise<CodexLifecycleValidationRunResult> => {
  const generatedAt = options.now?.() ?? new Date().toISOString();
  const outputDir = resolve(options.outputDir ?? defaultOutputDir(generatedAt));
  const runtimeHome = resolve(options.homeDir ?? join(outputDir, "runtime-home"));
  const experienceHome = join(runtimeHome, ".experienceengine");
  const repoRoot = options.repoRoot ? resolve(options.repoRoot) : process.cwd();
  const prompt = DEFAULT_PROMPT;

  mkdirIfMissing(outputDir);
  mkdirIfMissing(runtimeHome);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    EXPERIENCE_ENGINE_HOME: experienceHome,
    EXPERIENCE_ENGINE_EMBEDDING_PROVIDER: "legacy",
    EXPERIENCE_ENGINE_DISTILLATION_MODE: "disabled",
    EXPERIENCE_ENGINE_HYBRID_ENABLED: "true",
    EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED: "true",
    EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_LLM_ENABLED: "false",
    EXPERIENCE_ENGINE_HYBRID_ROLLOUT_MODE: "live"
  };

  const config = loadConfig({}, { env, homeDir: runtimeHome });
  const db = openDatabase(config);
  bootstrapDatabase(db);

  const nodeRepo = new NodeRepository(db);
  seedLifecycleNode(nodeRepo, repoRoot, generatedAt, DEFAULT_NODE_ID, prompt);

  const loop = createCodexBehaviorLoop({
    env,
    homeDir: runtimeHome,
    runtimeOptions: {
      env,
      homeDir: runtimeHome,
      hybridWorkerClientOptions: {
        postmortemReviewExecutor: async () => ({
          task: "postmortem_review",
          review_verdict: "policy_gated",
          candidate_recommendation: "observe",
          feedback_followup_recommendation: "none",
          confidence: "high",
          reason: "The injected node materially contributed to the successful Codex lifecycle validation run.",
          review_artifact: {
            summary: "The injected node materially contributed to the successful Codex lifecycle validation run.",
            notes: ["Apply bounded helped writeback for the injected node."]
          },
          injected_node_reviews: [
            {
              node_id: DEFAULT_NODE_ID,
              feedback_verdict: "helped",
              confidence: "high",
              delivery_recommendation: "keep",
              reason: "The deterministic validation flow followed the injected verification loop and completed successfully."
            }
          ]
        })
      }
    }
  });

  const lookup = await loop.lookupHints({
    cwd: repoRoot,
    prompt,
    sessionId: DEFAULT_SESSION_ID
  });
  const toolResult = await loop.recordToolResult({
    sessionId: DEFAULT_SESSION_ID,
    toolName: "vitest",
    inputSummary: "pnpm vitest run auth",
    outputSummary: "The targeted auth test passed after following the injected hint.",
    status: "success"
  });
  const finalized = await loop.finalizeTask({
    sessionId: DEFAULT_SESSION_ID,
    cwd: repoRoot,
    prompt
  });
  await loop.waitForBackgroundLearning();

  const taskRunRepo = new TaskRunRepository(db);
  const injectionRepo = new InjectionRepository(db);
  const reviewRepo = new ReviewEventRepository(db);
  const artifactRepo = new HybridReviewArtifactRepository(db);
  const traceRepo = new HybridInvocationTraceRepository(db);

  const taskRun = taskRunRepo.getLatestBySessionId(DEFAULT_SESSION_ID);
  if (!taskRun) {
    throw new Error("Codex lifecycle validation expected a persisted task run.");
  }
  const node = nodeRepo.getById(DEFAULT_NODE_ID);
  if (!node) {
    throw new Error("Codex lifecycle validation expected the seeded node to remain persisted.");
  }

  const reviewEvents = reviewRepo.listByTaskRunId(taskRun.id).reverse();
  const report: CodexLifecycleValidationReport = {
    generatedAt,
    repoRoot,
    prompt,
    sessionId: DEFAULT_SESSION_ID,
    outputDir,
    runtimeHome,
    sqlitePath: config.sqlitePath,
    captureDir: config.captureDir,
    seededNodeId: DEFAULT_NODE_ID,
    lookup: {
      mode: lookup.mode,
      injectedNodeIds: lookup.injectedNodeIds,
      deliveryMode: lookup.deliveryMode,
      delivered: lookup.delivered,
      notice: lookup.notice
    },
    toolResult: {
      status: toolResult.status,
      eventStatus: toolResult.eventStatus,
      toolName: toolResult.toolName
    },
    finalize: {
      status: finalized.status,
      outcomeSignal: finalized.outcomeSignal,
      recordedToolEvents: finalized.recordedToolEvents
    },
    persistence: {
      taskRunCount: taskRunRepo.count(),
      injectionEventCount: injectionRepo.count(),
      reviewEventCount: reviewRepo.count(),
      hybridArtifactCount: artifactRepo.count(),
      hybridTraceCount: traceRepo.count(),
      reviewEventTypes: reviewEvents.map((event) => event.event_type)
    },
    node: {
      id: node.id,
      state: node.state,
      deliveryState: node.delivery_state ?? "eligible",
      usageCount: node.usage_count,
      helpedCount: node.helped_count,
      harmedCount: node.harmed_count,
      lastFeedbackVerdict: node.last_feedback_verdict
    }
  };

  const jsonPath = join(outputDir, "codex-lifecycle.json");
  const markdownPath = join(outputDir, "codex-lifecycle.md");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(markdownPath, renderCodexLifecycleValidationMarkdown(report));

  return {
    outputDir,
    jsonPath,
    markdownPath,
    report
  };
};
