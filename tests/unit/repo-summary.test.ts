import { afterEach, describe, expect, it } from "vitest";
import { buildRepoSummary } from "../../src/interaction/repo-summary.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { ExperienceInteractionService } from "../../src/interaction/service.js";
import { ExperiencePackRegistry } from "../../src/packs/fs-registry.js";
import { ExperiencePackIndexSync } from "../../src/packs/index-sync.js";
import { compilePack } from "../../src/compiler/compiler.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { ExperiencePackRepository } from "../../src/store/sqlite/repositories/pack-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-repo-summary-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_repo_summary",
  node_type: "strategy",
  scope_id: resolveScope("/repo").scope_id,
  task_type: "test_debug",
  trigger_pattern: "Fix the failing auth test",
  applicability_notes: "Same repo",
  env_signature: undefined,
  compact_hint: "Run the failing auth test before editing and verify after the fix.",
  goal: "Stabilize the auth test",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "The test passes",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "Recovered the same auth test failure.",
  retrieval_text: "Fix the failing auth test\nRun the failing auth test before editing and verify after the fix.",
  source_kind: "system_derived",
  distillation_mode_used: "rule",
  distillation_source: "rule",
  origin_record_ids: ["input_origin"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: "2026-03-20T00:00:00.000Z",
  updated_at: "2026-03-20T00:00:00.000Z",
  ...overrides
});

const seedPack = (
  homeDir: string,
  db: ReturnType<typeof openDatabase>,
  nodeRepo: NodeRepository,
  cwd: string,
  packId: string,
  nodeId: string
): void => {
  const node = makeNode({
    id: nodeId,
    scope_id: resolveScope(cwd).scope_id
  });
  nodeRepo.upsert(node);

  const registry = new ExperiencePackRegistry({
    packsDir: join(homeDir, ".experienceengine", "packs")
  });
  const packRepo = new ExperiencePackRepository(db);
  const indexSync = new ExperiencePackIndexSync(registry, packRepo);

  registry.createDraft({
    packId,
    name: "Auth Pack",
    description: "Auth guidance",
    owner: "tester",
    scopeHints: [`scope:${resolveScope(cwd).scope_id}`],
    taskFamilies: [node.task_type],
    hostCompatibility: ["codex"],
    nodes: [node]
  });
  registry.reviewPack(packId, {
    description: "Reviewed auth guidance",
    evidenceSummary: "Reviewed",
    riskLevel: "medium"
  });
  registry.publishPack(packId);
  indexSync.syncPack(packId);
  packRepo.upsertActivation({
    scope_id: resolveScope(cwd).scope_id,
    pack_id: packId,
    enabled: true,
    pinned_version: "v1",
    created_at: nowIso(),
    updated_at: nowIso()
  });
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  delete process.env.EXPERIENCE_ENGINE_HOME;
});

describe("repo summary", () => {
  it("builds a stable summary with benchmark, packs, deployment, and recommendation", () => {
    const summary = buildRepoSummary({
      scope: {
        scopeId: "scope_a",
        scopeName: "repo",
        rootPath: "/repo"
      },
      latest: {
        sessionId: "session_a",
        scopeId: "scope_a",
        taskType: "test_debug",
        intervention: "inject",
        autoFeedback: "helped",
        autoFeedbackReason: "success_outcome",
        outcome: "success",
        injectedNodes: [],
        hints: [],
        evidence: [],
        timeline: [],
        activePacks: [],
        matchedPacks: [],
        summary: "Fix auth test",
        createdAt: "2026-03-20T00:00:00.000Z"
      },
      learning: {
        candidates: { pending: 0, distilled: 0, failed: 0, discarded: 0 },
        jobs: { pending: 0, processing: 0, succeeded: 0, failed: 0, discarded: 0 },
        nodes: { candidate: 0, active: 1, cooling: 0, retired: 0 },
        nodeSources: {
          explicit_provider: 0,
          host_endpoint: 0,
          host_mediated: 0,
          rule: 1,
          disabled: 0
        },
        effectiveness: {
          decisions: 5,
          live: 5,
          shadow: 0,
          holdout: 0,
          delivered: 5,
          suppressed: 0,
          automaticHelped: 3,
          automaticHarmed: 0
        },
        benchmark: {
          deliveryRate: 1,
          suppressionRate: 0,
          helpfulRate: 0.6,
          harmfulRate: 0,
          netHelpfulRate: 0.6,
          verdict: "healthy",
          recommendation: "Stay live.",
          suggestedMode: "live"
        },
        attributionReasons: {
          success_outcome: 3,
          relevant_failure: 0,
          environmental_failure: 0,
          exploratory_failure: 0,
          no_relevant_failure: 0,
          suppressed_delivery: 0,
          unknown_outcome: 0
        },
        runtime: { records: 5, taskRuns: 5, outcomes: 5, reviews: 3 },
        compiler: {
          publishedPacks: 1,
          compiledTargets: 2,
          stalePublishedPacks: 0,
          latestCompiledArtifact: {
            packId: "auth-pack",
            target: "codex",
            version: "v1",
            generatedAt: "2026-03-20T00:00:00.000Z",
            outputPath: "/packs/auth-pack/CODEX.md",
            reportPath: "/packs/auth-pack/compile-report.json",
            renderedNodeCount: 1
          }
        },
        latestRecordCreatedAt: "2026-03-20T00:00:00.000Z"
      },
      activePacks: [
        {
          scopeId: "scope_a",
          packId: "auth-pack",
          status: "published",
          currentVersion: "v1",
          pinnedVersion: "v1",
          enabled: true,
          updatedAt: "2026-03-20T00:00:00.000Z"
        }
      ],
      matchedPacks: [],
      deployments: [
        {
          target: "codex",
          status: "up_to_date",
          destination: "/repo/CODEX.md"
        }
      ]
    });

    expect(summary.scope.scopeId).toBe("scope_a");
    expect(summary.benchmark.verdict).toBe("healthy");
    expect(summary.packs.enabledCount).toBe(1);
    expect(summary.packs.latestCompiledTarget).toBe("codex");
    expect(summary.deployment).toEqual([
      expect.objectContaining({
        target: "codex",
        status: "up_to_date"
      })
    ]);
    expect(summary.recommendedNextAction).toContain("live");
  });

  it("stays conservative when there is no active pack or deploy state", () => {
    const summary = buildRepoSummary({
      scope: {
        scopeId: "scope_b"
      },
      learning: {
        candidates: { pending: 0, distilled: 0, failed: 0, discarded: 0 },
        jobs: { pending: 0, processing: 0, succeeded: 0, failed: 0, discarded: 0 },
        nodes: { candidate: 0, active: 0, cooling: 0, retired: 0 },
        nodeSources: {
          explicit_provider: 0,
          host_endpoint: 0,
          host_mediated: 0,
          rule: 0,
          disabled: 0
        },
        effectiveness: {
          decisions: 0,
          live: 0,
          shadow: 0,
          holdout: 0,
          delivered: 0,
          suppressed: 0,
          automaticHelped: 0,
          automaticHarmed: 0
        },
        benchmark: {
          deliveryRate: 0,
          suppressionRate: 0,
          helpfulRate: 0,
          harmfulRate: 0,
          netHelpfulRate: 0,
          verdict: "warming_up",
          recommendation: "Warm up first.",
          suggestedMode: "shadow"
        },
        attributionReasons: {
          success_outcome: 0,
          relevant_failure: 0,
          environmental_failure: 0,
          exploratory_failure: 0,
          no_relevant_failure: 0,
          suppressed_delivery: 0,
          unknown_outcome: 0
        },
        runtime: { records: 0, taskRuns: 0, outcomes: 0, reviews: 0 },
        compiler: {
          publishedPacks: 0,
          compiledTargets: 0,
          stalePublishedPacks: 0
        }
      },
      activePacks: [],
      matchedPacks: [],
      deployments: []
    });

    expect(summary.packs.enabledCount).toBe(0);
    expect(summary.recommendedNextAction).toContain("No packs are active");
  });

  it("builds a repo summary from the interaction service for the current cwd", () => {
    const homeDir = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const config = loadConfig();
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedPack(homeDir, db, nodeRepo, process.cwd(), "repo-summary-pack", "node_repo_summary_scope");
    compilePack({
      packsDir: join(homeDir, ".experienceengine", "packs"),
      packId: "repo-summary-pack",
      target: "codex",
      generatedAt: "2026-03-20T02:00:00.000Z"
    });

    const interaction = new ExperienceInteractionService(config);
    const summary = interaction.inspectRepoSummary(process.cwd());

    expect(summary.scope.scopeId).toBe(resolveScope(process.cwd()).scope_id);
    expect(summary.packs.enabledCount).toBe(1);
    expect(summary.packs.active).toEqual([
      expect.objectContaining({
        packId: "repo-summary-pack",
        enabled: true
      })
    ]);
    expect(summary.packs.latestCompiledTarget).toBe("codex");
    expect(summary.deployment).toEqual([
      expect.objectContaining({
        target: "codex",
        status: "missing"
      }),
      expect.objectContaining({
        target: "agents",
        status: "missing"
      }),
      expect.objectContaining({
        target: "claude",
        status: "missing"
      }),
      expect.objectContaining({
        target: "github",
        status: "missing"
      })
    ]);
    expect(summary.recommendedNextAction.length).toBeGreaterThan(0);
  });
});
