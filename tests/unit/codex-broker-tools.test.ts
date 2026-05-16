import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodexBehaviorLoop, createCodexMcpServer } from "../../src/adapters/codex/mcp-server.js";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-broker-"));
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
      removeTempDirForTests(dir);
    }
  }
});

const parseTextPayload = <T>(result: { content: Array<{ type: string; text?: string }> }): T =>
  JSON.parse(result.content[0]?.text ?? "null") as T;

const getRegisteredTool = (server: ReturnType<typeof createCodexMcpServer>, name: string) =>
  (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<unknown>; description?: string; title?: string }
      >;
    }
  )._registeredTools[name];

describe("codex broker tools", () => {
  it("lists brokerable long-tail actions without exposing full schemas", async () => {
    const server = createCodexMcpServer();
    const listTool = getRegisteredTool(server, "experienceengine_list_actions");

    const payload = parseTextPayload<{ actions: Array<{ id: string; category: string; surfaceTier: string; riskLevel: string }> }>(
      (await listTool.handler({})) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(payload.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "plan_upgrade", category: "admin", surfaceTier: "operator", riskLevel: "high" }),
        expect.objectContaining({ id: "feedback_node", category: "state", surfaceTier: "routine", riskLevel: "low" }),
        expect.objectContaining({ id: "inspect_recent_history", category: "inspect", surfaceTier: "operator", riskLevel: "low" })
      ])
    );

    const routinePayload = parseTextPayload<{ actions: Array<{ id: string; surfaceTier: string }> }>(
      (await listTool.handler({ surfaceTier: "routine" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    expect(routinePayload.actions).toEqual([
      expect.objectContaining({ id: "feedback_node", surfaceTier: "routine" })
    ]);
  });

  it("prepares action details and executes low-risk inspect actions", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const loop = createCodexBehaviorLoop({ homeDir, env });
    await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-broker-inspect"
    });

    const server = createCodexMcpServer({ homeDir, env });
    const prepareTool = getRegisteredTool(server, "experienceengine_prepare_action");
    const executeTool = getRegisteredTool(server, "experienceengine_execute_action");

    const preparePayload = parseTextPayload<{
      action: { id: string; category: string; surfaceTier: string; riskLevel: string; requiresConfirmation: boolean };
      parameter_contract: {
        type: string;
        required: string[];
        properties: Record<string, { type: string; optional?: boolean; enum?: string[]; integer?: boolean; positive?: boolean }>;
      };
      example_payload: Record<string, unknown>;
      surface_tier_description: string;
      risk_description: string;
      impact_summary: string;
      suggested_next_step: string;
    }>((await prepareTool.handler({ actionId: "inspect_recent_history" })) as {
      content: Array<{ type: string; text?: string }>;
    });

    expect(preparePayload.action).toMatchObject({
      id: "inspect_recent_history",
      category: "inspect",
      surfaceTier: "operator",
      riskLevel: "low",
      requiresConfirmation: false
    });
    expect(preparePayload.parameter_contract).toMatchObject({
      type: "object",
      required: [],
      properties: {
        mode: {
          type: "string",
          enum: ["all", "injected"],
          optional: true
        },
        limit: {
          type: "number",
          integer: true,
          optional: true
        }
      }
    });
    expect(preparePayload.example_payload).toEqual({
      mode: "injected",
      limit: 10
    });
    expect(preparePayload.risk_description).toContain("Low-risk action");
    expect(preparePayload.surface_tier_description).toContain("Explicit install");
    expect(preparePayload.impact_summary).toContain("recent EE history");
    expect(preparePayload.suggested_next_step).toContain("experienceengine_execute_action");

    const executePayload = parseTextPayload<{ result: unknown }>(
      (await executeTool.handler({ actionId: "inspect_recent_history", payload: { mode: "all", limit: 5 } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(executePayload.result).toEqual(expect.any(Array));
  }, 10_000);

  it("keeps removed inspect and maintenance paths reachable through broker actions", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    mkdirSync(join(env.EXPERIENCE_ENGINE_HOME, "adapters", "codex"), { recursive: true });
    writeFileSync(
      join(env.EXPERIENCE_ENGINE_HOME, "adapters", "codex", "install.json"),
      `${JSON.stringify({ adapter: "codex", installedVersion: "0.1.0" }, null, 2)}\n`,
      "utf8"
    );

    const server = createCodexMcpServer({
      homeDir,
      env,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            tag_name: "v0.2.0",
            html_url: "https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0",
            published_at: "2026-03-13T00:00:00Z"
          }),
          { status: 200 }
        ),
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
    const executeTool = getRegisteredTool(server, "experienceengine_execute_action");

    const updatePayload = parseTextPayload<{ actionId: string; result: { remote: { latestVersion: string | null } } }>(
      (await executeTool.handler({ actionId: "check_update", payload: { adapter: "codex" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const learningPayload = parseTextPayload<{ actionId: string; result: { candidates: object; jobs: object; nodes: object } }>(
      (await executeTool.handler({ actionId: "inspect_learning_summary" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const recentPayload = parseTextPayload<{ actionId: string; result: unknown[] }>(
      (await executeTool.handler({ actionId: "inspect_recent_history", payload: { mode: "all", limit: 5 } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const nodeDetailPayload = parseTextPayload<{ actionId: string; result: { status?: string } }>(
      (await executeTool.handler({ actionId: "inspect_node_detail", payload: { nodeId: "missing-node" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const nodesByStatePayload = parseTextPayload<{ actionId: string; result: unknown[] }>(
      (await executeTool.handler({ actionId: "inspect_nodes_by_state", payload: { state: "active" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const nodesByTypePayload = parseTextPayload<{ actionId: string; result: unknown[] }>(
      (await executeTool.handler({ actionId: "inspect_nodes_by_type", payload: { nodeType: "warning" } })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );
    const backupsPayload = parseTextPayload<{ actionId: string; result: unknown[] }>(
      (await executeTool.handler({ actionId: "inspect_backup_inventory" })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(updatePayload).toMatchObject({
      actionId: "check_update",
      result: {
        remote: {
          latestVersion: "0.2.0"
        }
      }
    });
    expect(learningPayload.actionId).toBe("inspect_learning_summary");
    expect(learningPayload.result).toMatchObject({
      candidates: expect.any(Object),
      jobs: expect.any(Object),
      nodes: expect.any(Object)
    });
    expect(recentPayload.actionId).toBe("inspect_recent_history");
    expect(recentPayload.result).toEqual(expect.any(Array));
    expect(nodeDetailPayload.actionId).toBe("inspect_node_detail");
    expect(nodeDetailPayload.result).toBeUndefined();
    expect(nodesByStatePayload.actionId).toBe("inspect_nodes_by_state");
    expect(nodesByStatePayload.result).toEqual(expect.any(Array));
    expect(nodesByTypePayload.actionId).toBe("inspect_nodes_by_type");
    expect(nodesByTypePayload.result).toEqual(expect.any(Array));
    expect(backupsPayload).toMatchObject({
      actionId: "inspect_backup_inventory"
    });
    expect(backupsPayload.result).toEqual(expect.any(Array));
  });

  it("keeps node lifecycle updates reachable through broker execution", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const loop = createCodexBehaviorLoop({ homeDir, env });
    await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-broker-lifecycle"
    });

    const server = createCodexMcpServer({ homeDir, env });
    const executeTool = getRegisteredTool(server, "experienceengine_execute_action");

    const payload = parseTextPayload<{ actionId: string; result: { status: string; state?: string } }>(
      (await executeTool.handler({
        actionId: "set_node_lifecycle",
        payload: { action: "cool", nodeId: "node_codex_broker_lifecycle" }
      })) as {
        content: Array<{ type: string; text?: string }>;
      }
    );

    expect(payload).toMatchObject({
      actionId: "set_node_lifecycle",
      result: {
        status: "not_found"
      }
    });
  });

  it("returns a machine-usable contract for guarded actions", async () => {
    const server = createCodexMcpServer();
    const prepareTool = getRegisteredTool(server, "experienceengine_prepare_action");

    const payload = parseTextPayload<{
      action: { id: string; requiresConfirmation: boolean; surfaceTier: string; riskLevel: string };
      parameter_contract: {
        type: string;
        required: string[];
        properties: Record<string, { type: string; enum?: string[] }>;
      };
      example_payload: Record<string, unknown>;
      risk_description: string;
      suggested_next_step: string;
    }>((await prepareTool.handler({ actionId: "plan_upgrade" })) as {
      content: Array<{ type: string; text?: string }>;
    });

    expect(payload.action).toMatchObject({
      id: "plan_upgrade",
      requiresConfirmation: true,
      surfaceTier: "operator",
      riskLevel: "high"
    });
    expect(payload.parameter_contract).toMatchObject({
      type: "object",
      required: ["adapter"],
      properties: {
        adapter: {
          type: "string",
          enum: ["openclaw", "claude-code", "codex"]
        }
      }
    });
    expect(payload.example_payload).toEqual({
      adapter: "codex"
    });
    expect(payload.risk_description).toContain("High-impact action");
    expect(payload.suggested_next_step).toContain("explicit confirmation");
  });
});
