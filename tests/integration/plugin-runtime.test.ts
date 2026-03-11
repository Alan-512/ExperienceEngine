import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../../src/plugin/openclaw-plugin.js";
import { replayScenarios, type ReplayScenario } from "../fixtures/openclaw/index.js";

type Handler = (payload: unknown) => unknown | Promise<unknown>;

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-"));
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

describe("OpenClaw plugin runtime", () => {
  it("replays a minimal task cycle and persists records, stats, and nodes", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      config: {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3
      },
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    const beforePromptBuild = handlers.get("before_prompt_build");
    const persistToolResult = handlers.get("tool_result_persist");
    const finalize = handlers.get("message_sent");

    expect(beforePromptBuild).toBeTypeOf("function");
    expect(persistToolResult).toBeTypeOf("function");
    expect(finalize).toBeTypeOf("function");

    const firstTurnPayload = {
      session: { key: "sess_1" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" },
      context: { summary: "Fix the failing vitest auth test" }
    };

    await beforePromptBuild?.(firstTurnPayload);
    await persistToolResult?.({
      sessionKey: "sess_1",
      tool: { name: "pnpm test", args: ["auth"] },
      result: { exitCode: 0, output: "auth tests passed" },
      success: true
    });
    await finalize?.({
      session: { key: "sess_1" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    const db = new DatabaseSync(sqlitePath);
    const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };
    const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
    const statsRow = db
      .prepare(
        "SELECT total_tasks, success_tasks, failed_tasks, injected_tasks FROM scope_task_stats LIMIT 1"
      )
      .get() as {
        total_tasks: number;
        success_tasks: number;
        failed_tasks: number;
        injected_tasks: number;
      };

    expect(inputCount.count).toBe(1);
    expect(nodeCount.count).toBe(1);
    expect(statsRow).toEqual({
      total_tasks: 1,
      success_tasks: 1,
      failed_tasks: 0,
      injected_tasks: 0
    });
  });

  it("injects conservative hints on a later similar turn once a node exists", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      config: {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3
      },
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    const beforePromptBuild = handlers.get("before_prompt_build");
    const persistToolResult = handlers.get("tool_result_persist");
    const finalize = handlers.get("message_sent");

    await beforePromptBuild?.({
      session: { key: "seed" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" },
      context: { summary: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "seed",
      tool: { name: "pnpm test" },
      result: { exitCode: 0, output: "auth tests passed" },
      success: true
    });
    await finalize?.({
      session: { key: "seed" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    const secondTurn = (await beforePromptBuild?.({
      session: { key: "sess_2" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" },
      context: { summary: "Fix the failing vitest auth test" }
    })) as Record<string, unknown>;

    expect(typeof secondTurn.prependContext).toBe("string");
    expect(secondTurn.prependContext).toContain("Conservative execution hints:");
    expect(secondTurn.prependContext).toContain("Reproduce first");
  });

  it.each(replayScenarios)("replays fixture corpus: $name", async (scenario: ReplayScenario) => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      config: {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3
      },
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    const beforePromptBuild = handlers.get("before_prompt_build");
    const persistToolResult = handlers.get("tool_result_persist");
    const finalize = handlers.get("message_sent");

    await beforePromptBuild?.(structuredClone(scenario.seedPrompt));
    await persistToolResult?.(structuredClone(scenario.toolResult));
    await finalize?.(structuredClone(scenario.finalize));

    const replayPayload = structuredClone(scenario.replayPrompt);
    const replayResult = (await beforePromptBuild?.(replayPayload)) as Record<string, unknown>;

    expect(replayResult.prependContext, scenario.name).toBeTruthy();
    if (Array.isArray(scenario.replayPrompt.prependContext)) {
      expect(Array.isArray(replayResult.prependContext), scenario.name).toBe(true);
      expect((replayResult.prependContext as unknown[])[0], scenario.name).toContain("execution hints");
    } else {
      expect(String(replayResult.prependContext), scenario.name).toContain("execution hints");
    }
  });
});
