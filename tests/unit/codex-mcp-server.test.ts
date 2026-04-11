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
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";
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

const parseTextPayload = <T>(result: { content: Array<{ type: string; text?: string }> }): T => {
  const textEntry = [...result.content].reverse().find((entry) => typeof entry.text === "string");
  return JSON.parse(textEntry?.text ?? "null") as T;
};

const getRegisteredTool = (server: ReturnType<typeof createCodexMcpServer>, name: string) =>
  (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<unknown>; description?: string; title?: string }
      >;
    }
  )._registeredTools[name];

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
    promotion_signal: state === "priority_candidate" ? "high_value" : undefined,
    priority_promotion_applied: state === "priority_candidate",
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

describe("Codex MCP behavior loop", () => {
  it("looks up experience hints through the shared core runtime", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_prompt_injection", "priority_candidate");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const result = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-session-a"
    });

    expect(result.mode).toBe("inject_conservative");
    expect(result.text).toContain("Run the failing auth test before editing and verify after the fix.");
    expect(result.notice).toBe(
      "[ExperienceEngine] Injected 1 strategy hint for this task (risk: medium). Run ee inspect --last to review why it matched."
    );
    expect(result.injectedNodeIds).toEqual(["node_codex_prompt_injection"]);
    expect(result.summary).toMatchObject({
      actionReason: "ExperienceEngine chose conservative injection because the best match still needs more runtime evidence.",
      riskLevel: "medium",
      trustSummary: "medium-risk low-confidence priority_candidate guidance with 0 helped and 0 harmed signal(s).",
      confidence: "low",
      budgetClass: "single_hint",
      selectedCandidateIds: ["node_codex_prompt_injection"],
      nodes: [
        expect.objectContaining({
          id: "node_codex_prompt_injection",
          riskLevel: "medium"
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
    expect(result.summary).toMatchObject({
      actionReason: "Candidate quality was strong enough to justify intervention for this task.",
      mode: "inject",
      riskLevel: "low",
      trustSummary: "low-risk high-confidence active guidance with 0 helped and 0 harmed signal(s).",
      confidence: "high",
      nodes: [
        expect.objectContaining({
          id: "node_codex_shadow"
        })
      ]
    });
  });

  it("records a successful tool result and finalizes uncertain feedback", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const taskRunRepo = new TaskRunRepository(db);
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
    expect(toolResult).toMatchObject({
      status: "recorded",
      toolName: "Bash",
      eventStatus: "success",
      hasErrorSignature: false
    });

    const finalized = await loop.finalizeTask({
      sessionId: "codex-helped-session",
      cwd: "/repo"
    });

    expect(finalized.status).toBe("finalized");
    expect(finalized.outcomeSignal).toBe("success");
    expect(finalized.injectedNodeIds).toEqual(["node_codex_helped"]);
    expect(finalized.recordedToolEvents).toBe(1);

    const node = nodeRepo.getById("node_codex_helped");
    const taskRun = taskRunRepo.getLatestBySessionId("codex-helped-session");
    expect(node?.usage_count).toBe(1);
    expect(node?.helped_count).toBe(0);
    expect(node?.harmed_count).toBe(0);
    expect(taskRun?.host).toBe("codex");
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
    expect(toolResult).toMatchObject({
      status: "recorded",
      toolName: "Bash",
      eventStatus: "failure",
      hasErrorSignature: true,
      exitCode: undefined
    });

    const finalized = await loop.finalizeTask({
      sessionId: "codex-harmed-session",
      cwd: "/repo"
    });

    expect(finalized.status).toBe("finalized");
    expect(finalized.outcomeSignal).toBe("failure");
    expect(finalized.injectedNodeIds).toEqual(["node_codex_harmed"]);
    expect(finalized.recordedToolEvents).toBe(1);

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
    expect(last?.autoFeedback).toBe("none");
    expect(last?.autoFeedbackReason).toBe("success_outcome");
    expect(last?.decisionExplanation).toBe("Candidate quality was strong enough to justify intervention for this task.");
    expect(last?.trustSummary).toBe("low-risk high-confidence active guidance with 0 helped and 0 harmed signal(s).");
    expect(last?.timeline).toEqual([
      expect.objectContaining({
        kind: "decision",
        summary: "inject: Delivered 1 node for the task."
      }),
      expect.objectContaining({
        kind: "outcome",
        summary: "success: Fix the failing auth test"
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
    expect(node?.qualityBand).toBe("building");
    expect(node?.applicabilityProfile.bestFit).toBe("test_debug tasks in this repo scope");
    expect(node?.recommendedSteps).toEqual([
      "Run the failing test",
      "Apply the minimal fix",
      "Re-run the test"
    ]);
  });

  it("serves routine read views publicly and inspect-heavy views through broker actions", async () => {
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
    const repoSummaryResource = getRegisteredResource(server, "experienceengine://repo-summary");
    const executeActionTool = getRegisteredTool(server, "experienceengine_execute_action");

    const lastPayload = await lastResource.readCallback(new URL("experienceengine://last"), {});
    const repoSummaryPayload = await repoSummaryResource.readCallback(
      new URL("experienceengine://repo-summary"),
      {}
    );
    const recentPayload = parseTextPayload<{ actionId: string; result: unknown[] }>(
      (await executeActionTool.handler({
        actionId: "inspect_recent_history",
        payload: { mode: "injected", limit: 5 }
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const nodePayload = parseTextPayload<{ actionId: string; result: ExperienceNode }>(
      (await executeActionTool.handler({
        actionId: "inspect_node_detail",
        payload: { nodeId: "node_codex_resource_view" }
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(JSON.parse((lastPayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      sessionId: "codex-resource-view",
      intervention: "inject",
      autoFeedback: "none",
      autoFeedbackReason: "success_outcome",
      decisionExplanation: "Candidate quality was strong enough to justify intervention for this task.",
      trustSummary: "low-risk high-confidence active guidance with 0 helped and 0 harmed signal(s).",
      timeline: [
        expect.objectContaining({
          kind: "decision",
          summary: "inject: Delivered 1 node for the task."
        }),
        expect.objectContaining({
          kind: "outcome",
          summary: "success: Fix the failing auth test"
        })
      ],
      scorecard: expect.objectContaining({
        riskLevel: "low"
      })
    });
    expect(recentPayload.actionId).toBe("inspect_recent_history");
    expect(recentPayload.result).toHaveLength(1);
    expect(getRegisteredResource(server, "experienceengine://learning/summary")).toBeUndefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_recent")).toBeUndefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_node")).toBeUndefined();
    const learningPayload = parseTextPayload<{
      actionId: string;
      result: {
        candidates: object;
        jobs: object;
        nodes: object;
      };
    }>((await executeActionTool.handler({ actionId: "inspect_learning_summary" })) as {
      content: Array<{ type: string; text?: string }>;
    });
    expect(learningPayload).toMatchObject({
      actionId: "inspect_learning_summary",
      result: {
        candidates: expect.any(Object),
        jobs: expect.any(Object),
        nodes: expect.any(Object)
      }
    });
    expect(learningPayload.result).toMatchObject({
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
    expect(JSON.parse((repoSummaryPayload as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      scope: expect.objectContaining({
        scopeId: resolveScope(process.cwd()).scope_id
      }),
      benchmark: expect.objectContaining({
        verdict: expect.any(String)
      }),
      recommendedNextAction: expect.any(String)
    });
    expect(
      JSON.parse((repoSummaryPayload as { contents: Array<{ text: string }> }).contents[0].text).recent.latestDecisionExplanation
    ).toBeUndefined();
    expect(nodePayload).toMatchObject({
      actionId: "inspect_node_detail",
      result: {
        id: "node_codex_resource_view",
        type: "strategy",
        sourceKind: "system_derived",
        originRecordIds: ["input_origin"],
        qualityBand: "building",
        applicabilityProfile: expect.objectContaining({
          bestFit: "test_debug tasks in this repo scope"
        })
      }
    });
  });

  it("routes long-tail feedback and scope state changes through broker actions", async () => {
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
    const executeActionTool = getRegisteredTool(server, "experienceengine_execute_action");

    const feedbackResult = parseTextPayload<{ status: string; nodeIds?: string[] }>(
      (await feedbackLastTool.handler({ feedback: "helped" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const disableResult = parseTextPayload<{ actionId: string; result: { isDisabled: boolean; changed: boolean } }>(
      (await executeActionTool.handler({ actionId: "set_scope_intervention_state", payload: { action: "disable", cwd: "/repo" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const enableResult = parseTextPayload<{ actionId: string; result: { isDisabled: boolean; changed: boolean } }>(
      (await executeActionTool.handler({ actionId: "set_scope_intervention_state", payload: { action: "enable", cwd: "/repo" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const feedbackNodeResult = parseTextPayload<{ actionId: string; result: { status: string; nodeIds?: string[] } }>(
      (await executeActionTool.handler({
        actionId: "feedback_node",
        payload: { nodeId: "node_codex_mcp_feedback", feedback: "helped" }
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(feedbackResult).toMatchObject({
      status: "updated",
      nodeIds: ["node_codex_mcp_feedback"]
    });
    expect(disableResult).toMatchObject({
      actionId: "set_scope_intervention_state",
      result: {
        isDisabled: true,
        changed: true
      }
    });
    expect(enableResult).toMatchObject({
      actionId: "set_scope_intervention_state",
      result: {
        isDisabled: false,
        changed: true
      }
    });
    expect(feedbackNodeResult).toMatchObject({
      actionId: "feedback_node",
      result: {
        status: "updated",
        nodeIds: ["node_codex_mcp_feedback"]
      }
    });
    expect(getRegisteredTool(server, "experienceengine_feedback_node")).toBeUndefined();
    expect(getRegisteredTool(server, "experienceengine_set_scope_intervention_state")).toBeUndefined();

    const node = nodeRepo.getById("node_codex_mcp_feedback");
    expect(node?.helped_count).toBe(2);
  });

  it("does not expose a separate quick-feedback MCP tool", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const server = createCodexMcpServer({ homeDir, env });
    expect(getRegisteredTool(server, "experienceengine_quick_feedback")).toBeUndefined();
  });

  it("describes the Codex tools as a default learning workflow", () => {
    const server = createCodexMcpServer();
    const lookupTool = getRegisteredTool(server, "experienceengine_lookup_hints");
    const recordTool = getRegisteredTool(server, "experienceengine_record_tool_result");
    const finalizeTool = getRegisteredTool(server, "experienceengine_finalize_task");
    const feedbackTool = getRegisteredTool(server, "experienceengine_feedback_last");

    expect(lookupTool.description).toContain("once at task start");
    expect(lookupTool.description).toContain("real coding or debugging task");
    expect(recordTool.description).toContain("important tool outcomes");
    expect(recordTool.description).toContain("before finalization");
    expect(finalizeTool.description).toContain("task end");
    expect(finalizeTool.description).toContain("persist the learning loop");
    expect(feedbackTool.description).toContain("after injected guidance");
    expect(feedbackTool.description).toContain("helped or harmed");
  });

  it("surfaces inline notice text separately for lookup_hints while preserving the JSON payload", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_notice_surface", "priority_candidate");

    const server = createCodexMcpServer({ homeDir, env });
    const lookupTool = getRegisteredTool(server, "experienceengine_lookup_hints");
    const toolResult = (await lookupTool.handler({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-notice-surface"
    })) as {
      content: Array<{ type: string; text?: string }>;
      structuredContent?: {
        mode: string;
        notice?: string;
        injectedNodeIds: string[];
      };
    };

    expect(toolResult.content[0]?.text).toBe(
      "[ExperienceEngine] Injected 1 strategy hint for this task (risk: medium). Run ee inspect --last to review why it matched."
    );
    expect(parseTextPayload<{ mode: string; injectedNodeIds: string[] }>(toolResult)).toMatchObject({
      mode: "inject_conservative",
      injectedNodeIds: ["node_codex_notice_surface"]
    });
    expect(toolResult.structuredContent).toMatchObject({
      mode: "inject_conservative",
      notice:
        "[ExperienceEngine] Injected 1 strategy hint for this task (risk: medium). Run ee inspect --last to review why it matched.",
      injectedNodeIds: ["node_codex_notice_surface"]
    });
  });

  it("does not expose public prompts after broker migration", () => {
    const server = createCodexMcpServer();

    expect(getRegisteredPrompt(server, "experienceengine_review_capabilities")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_review_repo_status")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_show_last_intervention")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_review_recent_injected")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_review_warning_nodes")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_pause_current_project")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_resume_current_project")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_mark_last_experience_helpful")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_mark_last_experience_harmful")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_prepare_operational_change")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_prepare_state_operation")).toBeUndefined();
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
    const capabilitiesResource = getRegisteredResource(server, "experienceengine://capabilities");
    const capabilitiesTool = getRegisteredTool(server, "experienceengine_get_capabilities");
    const doctorTool = getRegisteredTool(server, "experienceengine_doctor");
    const executeActionTool = getRegisteredTool(server, "experienceengine_execute_action");

    const capabilitiesPayload = await capabilitiesResource.readCallback(
      new URL("experienceengine://capabilities"),
      {}
    );
    const capabilitiesToolPayload = parseTextPayload<{
      core_actions: string[];
      routine_read_surfaces: string[];
      advanced_actions: string[];
      high_risk_actions: string[];
      surface_model: string;
      prompts?: unknown;
      resources?: unknown;
      cliFallbacks?: unknown;
    }>((await capabilitiesTool.handler({})) as {
      content: Array<{ type: string; text?: string }>;
    });
    const doctorToolPayload = parseTextPayload<{ adapter: string }>(
      (await doctorTool.handler({ adapter: "codex" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const updateToolPayload = parseTextPayload<{ actionId: string; result: { adapter: string; remote: { latestVersion: string | null } } }>(
      (await executeActionTool.handler({ actionId: "check_update", payload: { adapter: "codex" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    const capabilitiesResourcePayload = JSON.parse(
      (capabilitiesPayload as { contents: Array<{ text: string }> }).contents[0].text
    ) as {
      core_actions: string[];
      routine_read_surfaces: string[];
      advanced_actions: string[];
      high_risk_actions: string[];
      surface_model: string;
      prompts?: unknown;
      resources?: unknown;
      cliFallbacks?: unknown;
    };

    expect(capabilitiesResourcePayload).toMatchObject({
      core_actions: expect.arrayContaining([
        "experienceengine_lookup_hints",
        "experienceengine_record_tool_result",
        "experienceengine_finalize_task",
        "experienceengine_feedback_last",
        "experienceengine_get_capabilities",
        "experienceengine_doctor"
      ]),
      routine_read_surfaces: expect.arrayContaining([
        "experienceengine://doctor/{adapter}",
        "experienceengine://capabilities",
        "experienceengine://last",
        "experienceengine://repo-summary"
      ]),
      advanced_actions: expect.arrayContaining([
        "brokered admin actions",
        "brokered maintenance actions",
        "brokered inspect actions"
      ]),
      high_risk_actions: expect.arrayContaining([
        "install / repair / upgrade",
        "backup / export / import / rollback"
      ]),
      surface_model: "public core loop + public routine reads + brokered long-tail actions"
    });
    expect(capabilitiesResourcePayload.prompts).toBeUndefined();
    expect(capabilitiesResourcePayload.resources).toBeUndefined();
    expect(capabilitiesResourcePayload.cliFallbacks).toBeUndefined();
    expect(capabilitiesToolPayload).toMatchObject(capabilitiesResourcePayload);
    expect(capabilitiesToolPayload.prompts).toBeUndefined();
    expect(capabilitiesToolPayload.resources).toBeUndefined();
    expect(capabilitiesToolPayload.cliFallbacks).toBeUndefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_doctor")).toBeDefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_updates_latest")).toBeUndefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_recent")).toBeUndefined();
    expect(getRegisteredResource(server, "experienceengine://nodes/active")).toBeUndefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_node")).toBeUndefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_nodes_by_state")).toBeUndefined();
    expect(getRegisteredResourceTemplate(server, "experienceengine_nodes_by_type")).toBeUndefined();
    expect(doctorToolPayload).toMatchObject({
      adapter: "codex"
    });
    expect(updateToolPayload).toMatchObject({
      actionId: "check_update",
      result: {
        adapter: "codex",
        remote: {
          latestVersion: "0.2.0"
        }
      }
    });
    expect(getRegisteredTool(server, "experienceengine_check_update")).toBeUndefined();
  });

  it("keeps repo summary as a resource-only MCP surface", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, process.cwd(), nowIso(), "node_repo_summary_tool");

    const server = createCodexMcpServer({ homeDir, env });
    const repoSummaryResource = getRegisteredResource(server, "experienceengine://repo-summary");

    const result = JSON.parse(
      ((await repoSummaryResource.readCallback(new URL("experienceengine://repo-summary"), {})) as {
        contents: Array<{ text: string }>;
      }).contents[0]?.text ?? "null"
    ) as {
      scope: { scopeId: string };
      benchmark: { verdict: string };
      recommendedNextAction: string;
    };

    expect(result).toMatchObject({
      scope: {
        scopeId: resolveScope(process.cwd()).scope_id
      },
      benchmark: {
        verdict: expect.any(String)
      },
      recommendedNextAction: expect.any(String)
    });
    expect(getRegisteredTool(server, "experienceengine_get_repo_summary")).toBeUndefined();
  });

  it("registers a direct explain-last-decision tool that writes a hybrid explain trace", async () => {
    const homeDir = makeTempDir();
    const env = {
      EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine"),
      EXPERIENCE_ENGINE_DISTILLER_API_KEY: "test-key",
      EXPERIENCE_ENGINE_HYBRID_ENABLED: "true",
      EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED: "true",
      EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED: "true",
      EXPERIENCE_ENGINE_HYBRID_EXPLAIN_PROVIDER_MODE: "shared_distiller",
      EXPERIENCE_ENGINE_HYBRID_EXPLAIN_MODEL_PROFILE_VERSION: "hybrid-explain-llm-v1",
      EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai_compatible",
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-mini"
    };
    const config = loadConfig({
      dataDir: env.EXPERIENCE_ENGINE_HOME,
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
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_explain_detail");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-session-explain"
    });

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
      const server = createCodexMcpServer({ homeDir, env });
      const explainTool = getRegisteredTool(server, "experienceengine_explain_last_decision");

      expect(explainTool).toBeDefined();

      const payload = parseTextPayload<string>(
        (await explainTool.handler({
          cwd: "/repo",
          userMessage: "Why did that ExperienceEngine hint match?"
        })) as { content: Array<{ type: string; text?: string }> }
      );
      const traceRows = db
        .prepare(
          "SELECT worker_task, route, worker_profile_version, rollout_mode, validation_status, output_action FROM hybrid_invocation_traces ORDER BY created_at ASC"
        )
        .all() as Array<{
          worker_task: string;
          route: string;
          worker_profile_version: string;
          rollout_mode: string;
          validation_status: string;
          output_action: string;
        }>;

      expect(payload).toContain("validated and cleared the fast path");
      expect(traceRows).toEqual([
        expect.objectContaining({
          worker_task: "explain_decision",
          route: "ESCALATE_SYNC_EXPLAIN",
          worker_profile_version: "hybrid-explain-llm-v1",
          rollout_mode: "live",
          validation_status: "accepted",
          output_action: "surfaced"
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

  it("registers MCP tools for node lifecycle state changes", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_lifecycle_action");

    const server = createCodexMcpServer({ homeDir, env });
    const executeActionTool = getRegisteredTool(server, "experienceengine_execute_action");

    const coolPayload = parseTextPayload<{ actionId: string; result: { status: string; state?: string } }>(
      (await executeActionTool.handler({ actionId: "set_node_lifecycle", payload: { action: "cool", nodeId: "node_codex_lifecycle_action" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const retirePayload = parseTextPayload<{ actionId: string; result: { status: string; state?: string } }>(
      (await executeActionTool.handler({ actionId: "set_node_lifecycle", payload: { action: "retire", nodeId: "node_codex_lifecycle_action" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(coolPayload).toMatchObject({
      actionId: "set_node_lifecycle",
      result: {
        status: "updated",
        state: "cooling"
      }
    });
    expect(retirePayload).toMatchObject({
      actionId: "set_node_lifecycle",
      result: {
        status: "updated",
        state: "retired"
      }
    });
    expect(nodeRepo.getById("node_codex_lifecycle_action")?.state).toBe("retired");
    expect(getRegisteredTool(server, "experienceengine_set_node_lifecycle")).toBeUndefined();
    expect(getRegisteredTool(server, "experienceengine_cool_node")).toBeUndefined();
    expect(getRegisteredTool(server, "experienceengine_retire_node")).toBeUndefined();
  });

  it("registers plan-and-confirm MCP tools for high-impact operations without public prompts", async () => {
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
    const prepareActionTool = getRegisteredTool(server, "experienceengine_prepare_action");
    const executeActionTool = getRegisteredTool(server, "experienceengine_execute_action");
    const planPayload = parseTextPayload<{
      action: { id: string; category: string; riskLevel: string; requiresConfirmation: boolean };
      inputSchema: string;
    }>((await prepareActionTool.handler({ actionId: "plan_upgrade" })) as {
      content: Array<{ type: string; text?: string }>;
    });

    expect(planPayload).toMatchObject({
      action: {
        id: "plan_upgrade",
        category: "admin",
        riskLevel: "high",
        requiresConfirmation: true
      }
    });

    const executePayload = parseTextPayload<{
      actionId: string;
      result: { adapter: string; operation: string; planId: string; confirmationToken: string; commandHint: string };
    }>((await executeActionTool.handler({
      actionId: "plan_upgrade",
      payload: { adapter: "codex" }
    })) as {
      content: Array<{ type: string; text?: string }>;
    });

    expect(executePayload).toMatchObject({
      actionId: "plan_upgrade",
      result: {
        adapter: "codex",
        operation: "upgrade",
        commandHint: "ee upgrade codex"
      }
    });

    await expect(
      executeActionTool.handler({
        actionId: "plan_repair",
        payload: { adapter: "claude-code" }
      })
    ).rejects.toThrow(
      "Unsupported repair operation for claude-code"
    );

    expect(getRegisteredTool(server, "experienceengine_plan_upgrade")).toBeUndefined();
    expect(getRegisteredTool(server, "experienceengine_plan_repair")).toBeUndefined();
    expect(getRegisteredTool(server, "experienceengine_execute_planned_operation")).toBeUndefined();
    expect(getRegisteredPrompt(server, "experienceengine_prepare_operational_change")).toBeUndefined();
  });

  it("registers backup inventory resources and state-operation MCP tools without public prompts", async () => {
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
    const prepareActionTool = getRegisteredTool(server, "experienceengine_prepare_action");
    const executeActionTool = getRegisteredTool(server, "experienceengine_execute_action");
    const planPayload = parseTextPayload<{
      action: { id: string; category: string; riskLevel: string; requiresConfirmation: boolean };
    }>((await prepareActionTool.handler({ actionId: "plan_backup" })) as {
      content: Array<{ type: string; text?: string }>;
    });
    expect(planPayload.action).toMatchObject({
      id: "plan_backup",
      category: "maintenance",
      riskLevel: "high",
      requiresConfirmation: true
    });

    const backupPlanPayload = parseTextPayload<{
      actionId: string;
      result: { planId: string; confirmationToken: string; operation: string };
    }>((await executeActionTool.handler({ actionId: "plan_backup" })) as {
      content: Array<{ type: string; text?: string }>;
    });
    await executeActionTool.handler({
      actionId: "execute_state_plan",
      payload: {
        planId: backupPlanPayload.result.planId,
        confirmationToken: backupPlanPayload.result.confirmationToken
      }
    });

    const backupsPayload = parseTextPayload<{ actionId: string; result: unknown[] }>(
      (await executeActionTool.handler({ actionId: "inspect_backup_inventory" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(getRegisteredResource(server, "experienceengine://backups")).toBeUndefined();
    expect(getRegisteredTool(server, "experienceengine_plan_backup")).toBeUndefined();
    expect(getRegisteredTool(server, "experienceengine_execute_planned_state_operation")).toBeUndefined();
    expect(backupsPayload.actionId).toBe("inspect_backup_inventory");
    expect(backupsPayload.result).toHaveLength(1);
    expect(getRegisteredPrompt(server, "experienceengine_prepare_state_operation")).toBeUndefined();
  });
});
