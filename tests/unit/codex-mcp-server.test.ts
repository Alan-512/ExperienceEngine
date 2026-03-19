import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCodexBehaviorLoop,
  createCodexInteractionSurface,
  createCodexMcpServer
} from "../../src/adapters/codex/mcp-server.js";
import { loadConfig } from "../../src/config/load-config.js";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { ExperiencePackRegistry } from "../../src/packs/fs-registry.js";
import { ExperiencePackIndexSync } from "../../src/packs/index-sync.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ExperiencePackRepository } from "../../src/store/sqlite/repositories/pack-repo.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
import { nowIso } from "../../src/utils/clock.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mcp-"));
  tempDirs.push(dir);
  return dir;
};

beforeEach(() => {
  setEmbeddingProviderForTests({
    provider: "local",
    model: "Xenova/multilingual-e5-small",
    version: "local-e5-v1",
    dimensions: 3,
    async embedQuery() {
      return [1, 0, 0];
    },
    async embedPassage() {
      return [1, 0, 0];
    }
  });
});

afterEach(() => {
  clearEmbeddingProviderForTests();
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const parseTextPayload = <T>(result: { content: Array<{ type: string; text?: string }> }): T =>
  JSON.parse(result.content[0]?.text ?? "null") as T;

const getRegisteredTool = (server: ReturnType<typeof createCodexMcpServer>, name: string) =>
  (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })
    ._registeredTools[name];

const getRegisteredResource = (server: ReturnType<typeof createCodexMcpServer>, uri: string) =>
  (
    server as unknown as {
      _registeredResources: Record<string, { readCallback: (uri: URL, extra: unknown) => Promise<unknown> }>;
    }
  )._registeredResources[uri];

const getRegisteredResourceTemplate = (server: ReturnType<typeof createCodexMcpServer>, name: string) =>
  (
    server as unknown as {
      _registeredResourceTemplates: Record<
        string,
        { readCallback: (uri: URL, variables: Record<string, string>, extra: unknown) => Promise<unknown> }
      >;
    }
  )._registeredResourceTemplates[name];

const getRegisteredPrompt = (server: ReturnType<typeof createCodexMcpServer>, name: string) =>
  (
    server as unknown as {
      _registeredPrompts: Record<string, { callback: (args: unknown) => Promise<unknown> }>;
    }
  )._registeredPrompts[name];

const seedStrategyNode = (
  nodeRepo: NodeRepository,
  cwd: string,
  timestamp: string,
  id: string,
  state: ExperienceNode["state"] = "active"
): void => {
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
    state,
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

const seedPack = (
  homeDir: string,
  db: ReturnType<typeof openDatabase>,
  nodeRepo: NodeRepository,
  cwd: string,
  timestamp: string,
  packId: string,
  nodeId: string
): void => {
  seedStrategyNode(nodeRepo, cwd, timestamp, nodeId);
  const registry = new ExperiencePackRegistry({
    packsDir: join(homeDir, ".experienceengine", "packs")
  });
  const packRepo = new ExperiencePackRepository(db);
  const indexSync = new ExperiencePackIndexSync(registry, packRepo);
  const node = nodeRepo.getById(nodeId);

  if (!node) {
    throw new Error(`Missing seeded node ${nodeId}`);
  }

  registry.createDraft({
    packId,
    name: "Auth Recovery Pack",
    description: "Recover the auth test flow",
    owner: "tester",
    scopeHints: [`scope:${resolveScope(cwd).scope_id}`],
    taskFamilies: [node.task_type],
    hostCompatibility: ["codex", "claude-code"],
    nodes: [node]
  });
  registry.reviewPack(packId, {
      description: "Reviewed auth recovery guidance",
      evidenceSummary: "Recovered the auth test failure twice",
      riskLevel: "medium"
  });
  registry.publishPack(packId);
  indexSync.syncPack(packId);
  packRepo.upsertActivation({
    scope_id: resolveScope(cwd).scope_id,
    pack_id: packId,
    enabled: true,
    pinned_version: "v1",
    created_at: timestamp,
    updated_at: timestamp
  });
};

const seedReviewedPack = (
  homeDir: string,
  db: ReturnType<typeof openDatabase>,
  nodeRepo: NodeRepository,
  cwd: string,
  timestamp: string,
  packId: string,
  nodeId: string
): void => {
  seedStrategyNode(nodeRepo, cwd, timestamp, nodeId);
  const registry = new ExperiencePackRegistry({
    packsDir: join(homeDir, ".experienceengine", "packs")
  });
  const packRepo = new ExperiencePackRepository(db);
  const indexSync = new ExperiencePackIndexSync(registry, packRepo);
  const node = nodeRepo.getById(nodeId);

  if (!node) {
    throw new Error(`Missing seeded node ${nodeId}`);
  }

  registry.createDraft({
    packId,
    name: "Reviewed Pack",
    description: "Needs publish confirmation",
    owner: "tester",
    scopeHints: [`scope:${resolveScope(cwd).scope_id}`],
    taskFamilies: [node.task_type],
    hostCompatibility: ["codex"],
    nodes: [node]
  });
  registry.reviewPack(packId, {
    description: "Reviewed pack waiting for publish",
    evidenceSummary: "Reviewed once",
    riskLevel: "medium"
  });
  indexSync.syncPack(packId);
};

const seedRollbackablePack = (
  homeDir: string,
  db: ReturnType<typeof openDatabase>,
  nodeRepo: NodeRepository,
  cwd: string,
  timestamp: string,
  packId: string
): void => {
  seedStrategyNode(nodeRepo, cwd, timestamp, `${packId}_node_v1`);
  seedStrategyNode(nodeRepo, cwd, timestamp, `${packId}_node_v2`);
  const registry = new ExperiencePackRegistry({
    packsDir: join(homeDir, ".experienceengine", "packs")
  });
  const packRepo = new ExperiencePackRepository(db);
  const indexSync = new ExperiencePackIndexSync(registry, packRepo);
  const nodeV1 = nodeRepo.getById(`${packId}_node_v1`);
  const nodeV2 = nodeRepo.getById(`${packId}_node_v2`);

  if (!nodeV1 || !nodeV2) {
    throw new Error("Missing rollbackable seeded nodes");
  }

  registry.createDraft({
    packId,
    name: "Rollback Pack",
    description: "Rollback pack",
    owner: "tester",
    scopeHints: [`scope:${resolveScope(cwd).scope_id}`],
    taskFamilies: [nodeV1.task_type],
    hostCompatibility: ["codex"],
    nodes: [nodeV1]
  });
  registry.reviewPack(packId, {
    description: "Rollback pack v1",
    evidenceSummary: "First reviewed version",
    riskLevel: "medium"
  });
  registry.publishPack(packId);

  registry.createDraft({
    packId,
    name: "Rollback Pack",
    description: "Rollback pack v2",
    owner: "tester",
    scopeHints: [`scope:${resolveScope(cwd).scope_id}`],
    taskFamilies: [nodeV2.task_type],
    hostCompatibility: ["codex"],
    nodes: [nodeV2]
  });
  registry.reviewPack(packId, {
    description: "Rollback pack v2",
    evidenceSummary: "Second reviewed version",
    riskLevel: "medium"
  });
  registry.publishPack(packId);
  indexSync.syncPack(packId);
};

describe("Codex MCP behavior loop", () => {
  it("looks up experience hints through the shared core runtime", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_prompt_injection", "candidate");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const result = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-session-a"
    });

    expect(result.mode).toBe("inject_conservative");
    expect(result.text).toContain("Run the failing auth test before editing and verify after the fix.");
    expect(result.notice).toBe(
      "[ExperienceEngine] Injected 1 strategy hint for this task (risk: high). Run ee inspect --last to review why it matched."
    );
    expect(result.injectedNodeIds).toEqual(["node_codex_prompt_injection"]);
    expect(result.scorecard).toMatchObject({
      riskLevel: "high",
      nodes: [
        expect.objectContaining({
          id: "node_codex_prompt_injection",
          riskLevel: "high"
        })
      ]
    });
  });

  it("returns shadow evaluation metadata when delivery is suppressed", async () => {
    const homeDir = makeTempDir();
    const env = {
      EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine"),
      EXPERIENCE_ENGINE_EVALUATION_MODE: "shadow"
    };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME }, { env });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_shadow");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const result = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-session-shadow"
    });

    expect(result.mode).toBe("skip");
    expect(result.text).toBeUndefined();
    expect(result.notice).toBeUndefined();
    expect(result.injectedNodeIds).toEqual([]);
    expect(result.deliveryMode).toBe("shadow");
    expect(result.delivered).toBe(false);
    expect(result.scorecard).toMatchObject({
      mode: "inject",
      riskLevel: "low",
      nodes: [
        expect.objectContaining({
          id: "node_codex_shadow"
        })
      ]
    });
  });

  it("records a successful tool result and finalizes helped feedback", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_helped");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const lookup = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-helped-session"
    });
    expect(lookup.injectedNodeIds).toEqual(["node_codex_helped"]);

    const toolResult = await loop.recordToolResult({
      sessionId: "codex-helped-session",
      toolName: "Bash",
      inputSummary: "pnpm test auth",
      outputSummary: "auth test now passes",
      status: "success"
    });
    expect(toolResult.status).toBe("success");

    const finalized = await loop.finalizeTask({
      sessionId: "codex-helped-session",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    expect(finalized.outcomeSignal).toBe("success");
    expect(finalized.injectedNodeIds).toEqual(["node_codex_helped"]);
    expect(finalized.evidence).toContain("Bash: success: auth test now passes");

    const node = nodeRepo.getById("node_codex_helped");
    expect(node?.usage_count).toBe(1);
    expect(node?.helped_count).toBe(1);
    expect(node?.harmed_count).toBe(0);
  });

  it("records a failed tool result and finalizes harmed feedback", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_harmed");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const lookup = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-harmed-session"
    });
    expect(lookup.injectedNodeIds).toEqual(["node_codex_harmed"]);

    const toolResult = await loop.recordToolResult({
      sessionId: "codex-harmed-session",
      toolName: "Bash",
      inputSummary: "pnpm test auth",
      errorSignature: "1 failed",
      outputSummary: "1 failed",
      status: "failure"
    });
    expect(toolResult.status).toBe("failure");

    const finalized = await loop.finalizeTask({
      sessionId: "codex-harmed-session",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    expect(finalized.outcomeSignal).toBe("failure");
    expect(finalized.injectedNodeIds).toEqual(["node_codex_harmed"]);
    expect(finalized.evidence).toContain("Bash: failure: 1 failed");

    const node = nodeRepo.getById("node_codex_harmed");
    expect(node?.usage_count).toBe(1);
    expect(node?.helped_count).toBe(0);
    expect(node?.harmed_count).toBe(1);
  });

  it("skips intervention when the current scope has been disabled", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const scopeRepo = new ScopeRepository(db);
    const scope = resolveScope("/repo");
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_disabled_scope");
    scopeRepo.upsert({
      ...scope,
      is_disabled: true
    });

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const result = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-disabled-scope"
    });

    expect(result.mode).toBe("skip");
    expect(result.text).toBeUndefined();
    expect(result.notice).toBeUndefined();
    expect(result.injectedNodeIds).toEqual([]);
  });

  it("serves inspect views through the codex interaction surface", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_surface_view");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-surface-view"
    });
    await loop.recordToolResult({
      sessionId: "codex-surface-view",
      toolName: "Bash",
      inputSummary: "pnpm test auth",
      outputSummary: "auth test now passes",
      status: "success"
    });
    await loop.finalizeTask({
      sessionId: "codex-surface-view",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    const surface = createCodexInteractionSurface({ homeDir, env });
    const last = await surface.inspectLast();
    const recent = await surface.inspectRecent({ mode: "injected", limit: 5 });
    const activeNodes = await surface.listNodesByState({ state: "active" });
    const node = await surface.inspectNode({ nodeId: "node_codex_surface_view" });

    expect(last?.sessionId).toBe("codex-surface-view");
    expect(last?.intervention).toBe("inject");
    expect(last?.autoFeedback).toBe("helped");
    expect(last?.autoFeedbackReason).toBe("success_outcome");
    expect(last?.timeline).toEqual([
      expect.objectContaining({
        kind: "decision",
        summary: "inject: Delivered 1 node for the task."
      }),
      expect.objectContaining({
        kind: "outcome",
        summary: "success: Fix the failing auth test"
      }),
      expect.objectContaining({
        kind: "feedback",
        summary: "helped: Automatic attribution marked the injection as helpful."
      })
    ]);
    expect(last?.injectedNodes[0]?.sourceKind).toBe("system_derived");
    expect(last?.scorecard).toMatchObject({
      riskLevel: "low",
      nodes: [
        expect.objectContaining({
          id: "node_codex_surface_view"
        })
      ]
    });
    expect(recent).toHaveLength(1);
    expect(activeNodes.map((entry) => entry.id)).toContain("node_codex_surface_view");
    expect(node?.id).toBe("node_codex_surface_view");
    expect(node?.recommendedSteps).toEqual([
      "Run the failing test",
      "Apply the minimal fix",
      "Re-run the test"
    ]);
  });

  it("registers MCP resources for inspect views", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_resource_view");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-resource-view"
    });
    await loop.recordToolResult({
      sessionId: "codex-resource-view",
      toolName: "Bash",
      inputSummary: "pnpm test auth",
      outputSummary: "auth test now passes",
      status: "success"
    });
    await loop.finalizeTask({
      sessionId: "codex-resource-view",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    const server = createCodexMcpServer({ homeDir, env });
    const lastResource = getRegisteredResource(server, "experienceengine://last");
    const recentResource = getRegisteredResourceTemplate(server, "experienceengine_recent");
    const learningResource = getRegisteredResource(server, "experienceengine://learning/summary");
    const nodeResource = getRegisteredResourceTemplate(server, "experienceengine_node");

    const lastPayload = await lastResource.readCallback(new URL("experienceengine://last"), {});
    const recentPayload = await recentResource.readCallback(
      new URL("experienceengine://recent/injected/5"),
      { mode: "injected", limit: "5" },
      {}
    );
    const learningPayload = await learningResource.readCallback(
      new URL("experienceengine://learning/summary"),
      {}
    );
    const nodePayload = await nodeResource.readCallback(
      new URL("experienceengine://node/node_codex_resource_view"),
      { id: "node_codex_resource_view" },
      {}
    );

    expect(JSON.parse((lastPayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      sessionId: "codex-resource-view",
      intervention: "inject",
      autoFeedback: "helped",
      autoFeedbackReason: "success_outcome",
      timeline: [
        expect.objectContaining({
          kind: "decision",
          summary: "inject: Delivered 1 node for the task."
        }),
        expect.objectContaining({
          kind: "outcome",
          summary: "success: Fix the failing auth test"
        }),
        expect.objectContaining({
          kind: "feedback",
          summary: "helped: Automatic attribution marked the injection as helpful."
        })
      ],
      scorecard: expect.objectContaining({
        riskLevel: "low"
      })
    });
    expect(JSON.parse((recentPayload as { contents: Array<{ text: string }> }).contents[0].text)).toHaveLength(1);
    expect(JSON.parse((learningPayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      candidates: expect.objectContaining({
        distilled: expect.any(Number)
      }),
      jobs: expect.objectContaining({
        succeeded: expect.any(Number)
      }),
      nodes: expect.objectContaining({
        active: expect.any(Number)
      })
    });
    expect(JSON.parse((nodePayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      id: "node_codex_resource_view",
      type: "strategy",
      sourceKind: "system_derived",
      originRecordIds: ["input_origin"]
    });
  });

  it("serves pack views through the codex interaction surface and MCP resources", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedPack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_auth_recovery", "node_pack_auth_recovery");

    const surface = createCodexInteractionSurface({ homeDir, env });
    const packs = await surface.listPacks();
    const pack = await surface.inspectPack({ packId: "pack_auth_recovery" });

    expect(packs).toEqual([
      expect.objectContaining({
        packId: "pack_auth_recovery",
        status: "published",
        currentVersion: "v1"
      })
    ]);
    expect(pack).toMatchObject({
      packId: "pack_auth_recovery",
      status: "published",
      currentVersion: "v1",
      manifest: expect.objectContaining({
        version: "v1",
        statusSnapshot: "published"
      }),
      nodeIds: ["node_pack_auth_recovery"],
      activations: [
        expect.objectContaining({
          enabled: true,
          pinnedVersion: "v1"
        })
      ]
    });

    const server = createCodexMcpServer({ homeDir, env });
    const packsResource = getRegisteredResource(server, "experienceengine://packs");
    const packResource = getRegisteredResourceTemplate(server, "experienceengine_pack");

    const packsPayload = await packsResource.readCallback(new URL("experienceengine://packs"), {});
    const packPayload = await packResource.readCallback(
      new URL("experienceengine://pack/pack_auth_recovery"),
      { id: "pack_auth_recovery" },
      {}
    );

    expect(JSON.parse((packsPayload as { contents: Array<{ text: string }> }).contents[0].text)).toEqual([
      expect.objectContaining({
        packId: "pack_auth_recovery",
        status: "published"
      })
    ]);
    expect(JSON.parse((packPayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      packId: "pack_auth_recovery",
      manifest: expect.objectContaining({
        version: "v1"
      }),
      nodeIds: ["node_pack_auth_recovery"],
      activations: [
        expect.objectContaining({
          enabled: true
        })
      ]
    });
  });

  it("supports pack status, compile, and deploy preview through the codex interaction surface", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedPack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_compile_flow", "node_pack_compile_flow");
    const repoPath = join(homeDir, "target-repo");
    mkdirSync(repoPath, { recursive: true });

    const surface = createCodexInteractionSurface({ homeDir, env });
    const initialStatus = await surface.inspectPackDeploymentStatus({
      packId: "pack_compile_flow",
      target: "codex",
      repoPath
    });
    const compiled = await surface.compilePack({
      packId: "pack_compile_flow",
      target: "codex"
    });
    const preview = await surface.deployPackPreview({
      packId: "pack_compile_flow",
      target: "codex",
      repoPath
    });

    expect(initialStatus).toMatchObject({
      target: "codex",
      deploymentStatus: "missing",
      statusOnly: true
    });
    expect(compiled).toMatchObject({
      packId: "pack_compile_flow",
      version: "v1",
      target: "codex"
    });
    expect(preview).toMatchObject({
      target: "codex",
      deploymentStatus: "missing",
      dryRun: true,
      statusOnly: false
    });
  });

  it("registers pack management MCP tools for status, compile, and deploy preview", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedPack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_codex_tools", "node_pack_codex_tools");
    const repoPath = join(homeDir, "repo-under-test");
    mkdirSync(repoPath, { recursive: true });

    const server = createCodexMcpServer({ homeDir, env });
    const statusTool = getRegisteredTool(server, "experienceengine_pack_status");
    const compileTool = getRegisteredTool(server, "experienceengine_pack_compile");
    const deployPreviewTool = getRegisteredTool(server, "experienceengine_pack_deploy_preview");

    const statusResult = parseTextPayload<{ deploymentStatus: string; statusOnly: boolean }>(
      (await statusTool.handler({
        packId: "pack_codex_tools",
        target: "codex",
        repoPath
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const compileResult = parseTextPayload<{ packId: string; version: string; target: string }>(
      (await compileTool.handler({
        packId: "pack_codex_tools",
        target: "codex"
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const deployPreviewResult = parseTextPayload<{ deploymentStatus: string; dryRun: boolean }>(
      (await deployPreviewTool.handler({
        packId: "pack_codex_tools",
        target: "codex",
        repoPath
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(statusResult).toMatchObject({
      deploymentStatus: "missing",
      statusOnly: true
    });
    expect(compileResult).toMatchObject({
      packId: "pack_codex_tools",
      version: "v1",
      target: "codex"
    });
    expect(deployPreviewResult).toMatchObject({
      deploymentStatus: "missing",
      dryRun: true
    });
  });

  it("registers pack list and inspect MCP tools", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedPack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_tool_views", "node_pack_tool_views");

    const server = createCodexMcpServer({ homeDir, env });
    const listTool = getRegisteredTool(server, "experienceengine_pack_list");
    const inspectTool = getRegisteredTool(server, "experienceengine_pack_inspect");

    const listResult = parseTextPayload<{ packs: Array<{ packId: string; status: string }> }>(
      (await listTool.handler({})) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const inspectResult = parseTextPayload<{ packId: string; nodeIds: string[] }>(
      (await inspectTool.handler({ packId: "pack_tool_views" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(listResult).toMatchObject({
      packs: [
        expect.objectContaining({
          packId: "pack_tool_views",
          status: "published"
        })
      ]
    });
    expect(inspectResult).toMatchObject({
      packId: "pack_tool_views",
      nodeIds: ["node_pack_tool_views"]
    });
  });

  it("supports enabling and disabling a pack for the current scope through the codex interaction surface and MCP tools", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedPack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_toggle_scope", "node_pack_toggle_scope");

    const surface = createCodexInteractionSurface({ homeDir, env });
    const enabled = await surface.enablePack({
      packId: "pack_toggle_scope",
      cwd: "/repo"
    });
    const disabled = await surface.disablePack({
      packId: "pack_toggle_scope",
      cwd: "/repo"
    });

    expect(enabled).toMatchObject({
      scopeId: resolveScope("/repo").scope_id,
      packId: "pack_toggle_scope",
      enabled: true,
      pinnedVersion: "v1"
    });
    expect(disabled).toMatchObject({
      scopeId: resolveScope("/repo").scope_id,
      packId: "pack_toggle_scope",
      enabled: false,
      pinnedVersion: "v1"
    });

    const server = createCodexMcpServer({ homeDir, env });
    const enableTool = getRegisteredTool(server, "experienceengine_pack_enable");
    const disableTool = getRegisteredTool(server, "experienceengine_pack_disable");

    const enabledViaTool = parseTextPayload<{ enabled: boolean; packId: string }>(
      (await enableTool.handler({ packId: "pack_toggle_scope", cwd: "/repo" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const disabledViaTool = parseTextPayload<{ enabled: boolean; packId: string }>(
      (await disableTool.handler({ packId: "pack_toggle_scope", cwd: "/repo" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(enabledViaTool).toMatchObject({
      packId: "pack_toggle_scope",
      enabled: true
    });
    expect(disabledViaTool).toMatchObject({
      packId: "pack_toggle_scope",
      enabled: false
    });
  });

  it("registers plan-and-confirm MCP tools for pack publish and rollback", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedReviewedPack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_publish_plan", "node_publish_plan");
    seedRollbackablePack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_rollback_plan");

    const server = createCodexMcpServer({ homeDir, env });
    const planPublishTool = getRegisteredTool(server, "experienceengine_plan_pack_publish");
    const planRollbackTool = getRegisteredTool(server, "experienceengine_plan_pack_rollback");
    const executeTool = getRegisteredTool(server, "experienceengine_execute_planned_pack_operation");
    const inspectSurface = createCodexInteractionSurface({ homeDir, env });

    const publishPlan = parseTextPayload<{ planId: string; confirmationToken: string; commandHint: string }>(
      (await planPublishTool.handler({ packId: "pack_publish_plan" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const publishExecution = parseTextPayload<{ status: string; result: { currentVersion: string; status: string } }>(
      (await executeTool.handler({
        planId: publishPlan.planId,
        confirmationToken: publishPlan.confirmationToken
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(publishPlan.commandHint).toContain("pack publish pack_publish_plan");
    expect(publishExecution).toMatchObject({
      status: "executed",
      result: {
        currentVersion: "v1",
        status: "published"
      }
    });

    const rollbackPlan = parseTextPayload<{ planId: string; confirmationToken: string; commandHint: string }>(
      (await planRollbackTool.handler({ packId: "pack_rollback_plan", version: "v1" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const rollbackExecution = parseTextPayload<{ status: string; result: { currentVersion: string; status: string } }>(
      (await executeTool.handler({
        planId: rollbackPlan.planId,
        confirmationToken: rollbackPlan.confirmationToken
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(rollbackPlan.commandHint).toContain("pack rollback pack_rollback_plan v1");
    expect(rollbackExecution).toMatchObject({
      status: "executed",
      result: {
        currentVersion: "v1",
        status: "rolled_back"
      }
    });

    const publishedPack = await inspectSurface.inspectPack({ packId: "pack_publish_plan" });
    const rolledBackPack = await inspectSurface.inspectPack({ packId: "pack_rollback_plan" });
    expect(publishedPack?.status).toBe("published");
    expect(rolledBackPack).toMatchObject({
      status: "rolled_back",
      currentVersion: "v1"
    });
  });

  it("registers plan-and-confirm MCP tools for pack deploy", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedPack(homeDir, db, nodeRepo, "/repo", nowIso(), "pack_deploy_plan", "node_deploy_plan");

    const server = createCodexMcpServer({ homeDir, env });
    const planDeployTool = getRegisteredTool(server, "experienceengine_plan_pack_deploy");
    const executeTool = getRegisteredTool(server, "experienceengine_execute_planned_pack_operation");
    const repoPath = join(homeDir, "target-repo");

    const deployPlan = parseTextPayload<{
      planId: string;
      confirmationToken: string;
      commandHint: string;
      summary: string;
    }>(
      (await planDeployTool.handler({
        packId: "pack_deploy_plan",
        target: "codex",
        repoPath
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(deployPlan.commandHint).toContain("pack deploy pack_deploy_plan");
    expect(deployPlan.summary).toContain("Deploy Experience Pack");

    const deployExecution = parseTextPayload<{
      status: string;
      operation: string;
      result: {
        target: string;
        destinationPath: string;
        deploymentStatus: string;
      };
    }>(
      (await executeTool.handler({
        planId: deployPlan.planId,
        confirmationToken: deployPlan.confirmationToken
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(deployExecution).toMatchObject({
      status: "executed",
      operation: "deploy",
      result: {
        target: "codex",
        destinationPath: join(repoPath, "CODEX.md"),
        deploymentStatus: "missing"
      }
    });
    expect(existsSync(join(repoPath, "CODEX.md"))).toBe(true);
  });

  it("registers low-risk MCP tools for feedback and scope toggles", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_mcp_feedback");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-mcp-feedback"
    });
    await loop.finalizeTask({
      sessionId: "codex-mcp-feedback",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    const server = createCodexMcpServer({ homeDir, env });
    const feedbackLastTool = getRegisteredTool(server, "experienceengine_feedback_last");
    const disableScopeTool = getRegisteredTool(server, "experienceengine_disable_scope");
    const enableScopeTool = getRegisteredTool(server, "experienceengine_enable_scope");

    const feedbackResult = parseTextPayload<{ status: string; nodeIds?: string[] }>(
      (await feedbackLastTool.handler({ feedback: "helped" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const disableResult = parseTextPayload<{ isDisabled: boolean; changed: boolean }>(
      (await disableScopeTool.handler({ cwd: "/repo" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const enableResult = parseTextPayload<{ isDisabled: boolean; changed: boolean }>(
      (await enableScopeTool.handler({ cwd: "/repo" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(feedbackResult).toMatchObject({
      status: "updated",
      nodeIds: ["node_codex_mcp_feedback"]
    });
    expect(disableResult).toMatchObject({
      isDisabled: true,
      changed: true
    });
    expect(enableResult).toMatchObject({
      isDisabled: false,
      changed: true
    });

    const node = nodeRepo.getById("node_codex_mcp_feedback");
    expect(node?.helped_count).toBe(1);
  });

  it("registers a quick-feedback MCP tool for the last injected guidance", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_mcp_quick_feedback");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-mcp-quick-feedback"
    });
    await loop.finalizeTask({
      sessionId: "codex-mcp-quick-feedback",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    const server = createCodexMcpServer({ homeDir, env });
    const quickFeedbackTool = getRegisteredTool(server, "experienceengine_quick_feedback");

    const feedbackResult = parseTextPayload<{ status: string; nodeIds?: string[] }>(
      (await quickFeedbackTool.handler({ feedback: "harmed" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(feedbackResult).toMatchObject({
      status: "updated",
      nodeIds: ["node_codex_mcp_quick_feedback"]
    });

    const node = nodeRepo.getById("node_codex_mcp_quick_feedback");
    expect(node?.harmed_count).toBe(1);
  });

  it("registers MCP prompts for review and control workflows", async () => {
    const server = createCodexMcpServer();
    const showLastPrompt = getRegisteredPrompt(server, "experienceengine_show_last_intervention");
    const recentPrompt = getRegisteredPrompt(server, "experienceengine_review_recent_injected");
    const pausePrompt = getRegisteredPrompt(server, "experienceengine_pause_current_project");
    const harmfulPrompt = getRegisteredPrompt(server, "experienceengine_mark_last_experience_harmful");
    const reviewPackStatusPrompt = getRegisteredPrompt(server, "experienceengine_review_pack_status");
    const preparePackPublishPrompt = getRegisteredPrompt(server, "experienceengine_prepare_pack_publish");
    const preparePackRollbackPrompt = getRegisteredPrompt(server, "experienceengine_prepare_pack_rollback");
    const preparePackDeployPrompt = getRegisteredPrompt(server, "experienceengine_prepare_pack_deploy");

    const showLast = (await showLastPrompt.callback({})) as {
      messages: Array<{ role: string; content: { type: string; text?: string; uri?: string } }>;
    };
    const recent = (await recentPrompt.callback({ limit: "3" })) as {
      messages: Array<{ role: string; content: { type: string; text?: string; uri?: string } }>;
    };
    const pause = (await pausePrompt.callback({ cwd: "/repo" })) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };
    const harmful = (await harmfulPrompt.callback({})) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };
    const reviewPackStatus = (await reviewPackStatusPrompt.callback({
      packId: "compiler-blackbox-pack",
      target: "codex",
      repoPath: "/repo"
    })) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };
    const preparePackPublish = (await preparePackPublishPrompt.callback({
      packId: "compiler-blackbox-pack"
    })) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };
    const preparePackRollback = (await preparePackRollbackPrompt.callback({
      packId: "compiler-blackbox-pack",
      version: "v1"
    })) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };
    const preparePackDeploy = (await preparePackDeployPrompt.callback({
      packId: "compiler-blackbox-pack",
      target: "codex",
      repoPath: "/repo"
    })) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };
    expect(showLast.messages[0].content.text).toContain("Summarize whether guidance was injected");
    expect(showLast.messages[1].content).toMatchObject({
      type: "resource_link",
      uri: "experienceengine://last"
    });
    expect(recent.messages[1].content).toMatchObject({
      type: "resource_link",
      uri: "experienceengine://recent/injected/3"
    });
    expect(pause.messages[0].content.text).toContain("experienceengine_disable_scope");
    expect(pause.messages[0].content.text).toContain("/repo");
    expect(harmful.messages[0].content.text).toContain("feedback=harmed");
    expect(reviewPackStatus.messages[0].content.text).toContain("experienceengine_pack_status");
    expect(reviewPackStatus.messages[0].content.text).toContain("experienceengine_pack_inspect");
    expect(preparePackPublish.messages[0].content.text).toContain("experienceengine_plan_pack_publish");
    expect(preparePackPublish.messages[0].content.text).toContain("experienceengine_execute_planned_pack_operation");
    expect(preparePackRollback.messages[0].content.text).toContain("experienceengine_plan_pack_rollback");
    expect(preparePackRollback.messages[0].content.text).toContain("v1");
    expect(preparePackDeploy.messages[0].content.text).toContain("experienceengine_plan_pack_deploy");
    expect(preparePackDeploy.messages[0].content.text).toContain("experienceengine_execute_planned_pack_operation");
  });

  it("registers operational MCP resources and read-only tools", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          tag_name: "v0.2.0",
          html_url: "https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0",
          published_at: "2026-03-13T00:00:00Z"
        }),
        { status: 200 }
      );

    const server = createCodexMcpServer({ fetchImpl });
    const doctorResource = getRegisteredResourceTemplate(server, "experienceengine_doctor");
    const updateResource = getRegisteredResourceTemplate(server, "experienceengine_updates_latest");
    const doctorTool = getRegisteredTool(server, "experienceengine_doctor");
    const updateTool = getRegisteredTool(server, "experienceengine_check_update");

    const doctorPayload = await doctorResource.readCallback(
      new URL("experienceengine://doctor/codex"),
      { adapter: "codex" },
      {}
    );
    const updatePayload = await updateResource.readCallback(
      new URL("experienceengine://updates/latest/codex"),
      { adapter: "codex" },
      {}
    );
    const doctorToolPayload = parseTextPayload<{ adapter: string }>(
      (await doctorTool.handler({ adapter: "codex" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const updateToolPayload = parseTextPayload<{ adapter: string; remote: { latestVersion: string | null } }>(
      (await updateTool.handler({ adapter: "codex" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(JSON.parse((doctorPayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      adapter: "codex"
    });
    expect(JSON.parse((updatePayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      adapter: "codex",
      remote: {
        latestVersion: "0.2.0"
      }
    });
    expect(doctorToolPayload).toMatchObject({
      adapter: "codex"
    });
    expect(updateToolPayload).toMatchObject({
      adapter: "codex",
      remote: {
        latestVersion: "0.2.0"
      }
    });
  });

  it("registers MCP tools for node lifecycle control", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_lifecycle");

    const server = createCodexMcpServer({ homeDir, env });
    const coolTool = getRegisteredTool(server, "experienceengine_cool_node");
    const retireTool = getRegisteredTool(server, "experienceengine_retire_node");

    const coolPayload = parseTextPayload<{ status: string; state?: string }>(
      (await coolTool.handler({ nodeId: "node_codex_lifecycle" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const retirePayload = parseTextPayload<{ status: string; state?: string }>(
      (await retireTool.handler({ nodeId: "node_codex_lifecycle" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(coolPayload).toMatchObject({
      status: "updated",
      state: "cooling"
    });
    expect(retirePayload).toMatchObject({
      status: "updated",
      state: "retired"
    });
    expect(nodeRepo.getById("node_codex_lifecycle")?.state).toBe("retired");
  });

  it("registers plan-and-confirm MCP tools for high-impact operations", async () => {
    const server = createCodexMcpServer({
      operationalActionsDeps: {
        tokenFactory: (() => {
          let count = 0;
          return () => `plan-${++count}`;
        })(),
        inspectCodexInstall: () => ({
          versionStatus: {
            recordedVersion: "0.1.0"
          }
        }),
        installCodexAdapter: () => ({
          adapter: "codex",
          installedVersion: "0.2.0"
        })
      }
    });
    const planUpgradeTool = getRegisteredTool(server, "experienceengine_plan_upgrade");
    const executeTool = getRegisteredTool(server, "experienceengine_execute_planned_operation");
    const repairTool = getRegisteredTool(server, "experienceengine_plan_repair");
    const prompt = getRegisteredPrompt(server, "experienceengine_prepare_operational_change");

    const planPayload = parseTextPayload<{
      adapter: string;
      operation: string;
      planId: string;
      confirmationToken: string;
      commandHint: string;
    }>((await planUpgradeTool.handler({ adapter: "codex" })) as {
      content: Array<{ type: string; text?: string }>;
    });

    expect(planPayload).toMatchObject({
      adapter: "codex",
      operation: "upgrade",
      commandHint: "ee upgrade codex"
    });

    const executePayload = parseTextPayload<{
      status: string;
      adapter: string;
      operation: string;
      result: { previousVersion?: string; installedVersion?: string };
    }>((await executeTool.handler({
      planId: planPayload.planId,
      confirmationToken: planPayload.confirmationToken
    })) as {
      content: Array<{ type: string; text?: string }>;
    });

    expect(executePayload).toMatchObject({
      status: "executed",
      adapter: "codex",
      operation: "upgrade"
    });

    await expect(repairTool.handler({ adapter: "claude-code" })).rejects.toThrow(
      "Unsupported repair operation for claude-code"
    );

    const promptPayload = (await prompt.callback({
      adapter: "openclaw",
      operation: "repair"
    })) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };

    expect(promptPayload.messages[0].content.text).toContain("experienceengine_plan_repair");
    expect(promptPayload.messages[0].content.text).toContain("experienceengine_execute_planned_operation");
  });

  it("registers backup inventory resources and state-operation MCP tools", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    mkdirSync(join(env.EXPERIENCE_ENGINE_HOME, "adapters", "codex"), { recursive: true });
    writeFileSync(
      join(env.EXPERIENCE_ENGINE_HOME, "adapters", "codex", "install.json"),
      `${JSON.stringify({ adapter: "codex", installedVersion: "0.1.0" }, null, 2)}\n`,
      "utf8"
    );

    const server = createCodexMcpServer({
      homeDir,
      env,
      stateArtifactService: new ExperienceStateArtifactService({
        env,
        homeDir,
        now: () => "2026-03-13T06:40:00.000Z",
        idFactory: (() => {
          let count = 0;
          return () => `artifact-${++count}`;
        })()
      })
    });
    const planBackupTool = getRegisteredTool(server, "experienceengine_plan_backup");
    const executeStateTool = getRegisteredTool(server, "experienceengine_execute_planned_state_operation");
    const backupsResource = getRegisteredResource(server, "experienceengine://backups");
    const prompt = getRegisteredPrompt(server, "experienceengine_prepare_state_operation");

    const planPayload = parseTextPayload<{
      planId: string;
      confirmationToken: string;
      operation: string;
    }>((await planBackupTool.handler({})) as {
      content: Array<{ type: string; text?: string }>;
    });
    await executeStateTool.handler({
      planId: planPayload.planId,
      confirmationToken: planPayload.confirmationToken
    });

    const backupsPayload = await backupsResource.readCallback(new URL("experienceengine://backups"), {});
    const promptPayload = (await prompt.callback({
      operation: "rollback",
      backupId: "backup-1"
    })) as {
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    };

    expect(
      JSON.parse((backupsPayload as { contents: Array<{ text: string }> }).contents[0].text)
    ).toHaveLength(1);
    expect(promptPayload.messages[0].content.text).toContain("experienceengine_plan_rollback");
    expect(promptPayload.messages[0].content.text).toContain("experienceengine_execute_planned_state_operation");
  });
});
