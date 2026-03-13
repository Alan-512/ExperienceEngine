import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCodexBehaviorLoop,
  createCodexInteractionSurface,
  createCodexMcpServer
} from "../../src/adapters/codex/mcp-server.js";
import { loadConfig } from "../../src/config/load-config.js";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mcp-"));
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
    state: "candidate",
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

describe("Codex MCP behavior loop", () => {
  it("looks up experience hints through the shared core runtime", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_prompt_injection");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const result = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-session-a"
    });

    expect(result.mode).toBe("inject_conservative");
    expect(result.text).toContain("Run the failing auth test before editing and verify after the fix.");
    expect(result.notice).toBe("[ExperienceEngine] Injected 1 strategy hint for this task.");
    expect(result.injectedNodeIds).toEqual(["node_codex_prompt_injection"]);
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
    await loop.finalizeTask({
      sessionId: "codex-surface-view",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    const surface = createCodexInteractionSurface({ homeDir, env });
    const last = await surface.inspectLast();
    const recent = await surface.inspectRecent({ mode: "injected", limit: 5 });
    const candidateNodes = await surface.listNodesByState({ state: "candidate" });
    const node = await surface.inspectNode({ nodeId: "node_codex_surface_view" });

    expect(last?.sessionId).toBe("codex-surface-view");
    expect(last?.intervention).toBe("inject");
    expect(last?.injectedNodes[0]?.sourceKind).toBe("system_derived");
    expect(recent).toHaveLength(1);
    expect(candidateNodes.map((entry) => entry.id)).toContain("node_codex_surface_view");
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
    await loop.finalizeTask({
      sessionId: "codex-resource-view",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    const server = createCodexMcpServer({ homeDir, env });
    const lastResource = getRegisteredResource(server, "experienceengine://last");
    const recentResource = getRegisteredResourceTemplate(server, "experienceengine_recent");
    const nodeResource = getRegisteredResourceTemplate(server, "experienceengine_node");

    const lastPayload = await lastResource.readCallback(new URL("experienceengine://last"), {});
    const recentPayload = await recentResource.readCallback(
      new URL("experienceengine://recent/injected/5"),
      { mode: "injected", limit: "5" },
      {}
    );
    const nodePayload = await nodeResource.readCallback(
      new URL("experienceengine://node/node_codex_resource_view"),
      { id: "node_codex_resource_view" },
      {}
    );

    expect(JSON.parse((lastPayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      sessionId: "codex-resource-view",
      intervention: "inject"
    });
    expect(JSON.parse((recentPayload as { contents: Array<{ text: string }> }).contents[0].text)).toHaveLength(1);
    expect(JSON.parse((nodePayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      id: "node_codex_resource_view",
      type: "strategy",
      sourceKind: "system_derived",
      originRecordIds: ["input_origin"]
    });
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

  it("registers MCP prompts for review and control workflows", async () => {
    const server = createCodexMcpServer();
    const showLastPrompt = getRegisteredPrompt(server, "experienceengine_show_last_intervention");
    const recentPrompt = getRegisteredPrompt(server, "experienceengine_review_recent_injected");
    const pausePrompt = getRegisteredPrompt(server, "experienceengine_pause_current_project");
    const harmfulPrompt = getRegisteredPrompt(server, "experienceengine_mark_last_experience_harmful");
    const rememberPrompt = getRegisteredPrompt(server, "experienceengine_author_manual_experience");

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
    const remember = (await rememberPrompt.callback({
      triggerPattern: "When the auth test fails after a refactor",
      hint: "Run the auth test after each refactor slice."
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
    expect(remember.messages[0].content.text).toContain("experienceengine_remember");
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

  it("registers a manual authoring MCP tool", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const server = createCodexMcpServer({ homeDir, env });
    const rememberTool = getRegisteredTool(server, "experienceengine_remember");

    const rememberPayload = parseTextPayload<{
      status: string;
      node?: { sourceKind: string; taskType: string; hint: string };
    }>(
      (await rememberTool.handler({
        cwd: "/repo",
        triggerPattern: "When the auth test fails after a refactor",
        hint: "Run the auth test after each refactor slice.",
        taskType: "refactor",
        nodeType: "strategy"
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(rememberPayload).toMatchObject({
      status: "created",
      node: {
        sourceKind: "user_authored_candidate_promoted",
        taskType: "refactor",
        hint: "Run the auth test after each refactor slice."
      }
    });
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
