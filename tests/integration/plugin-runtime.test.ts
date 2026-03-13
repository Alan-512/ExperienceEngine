import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../../src/plugin/openclaw-plugin.js";
import { installOpenClawAdapter } from "../../src/install/openclaw-installer.js";
import { replayScenarios, type ReplayScenario } from "../fixtures/openclaw/index.js";

type Handler = (payload: unknown, context?: unknown) => unknown | Promise<unknown>;

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
      pluginConfig: {
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

  it("bootstraps from module-relative schema paths even when cwd differs", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();
    const originalCwd = process.cwd();

    process.chdir(runtimeDir);

    try {
      plugin.register({
        pluginConfig: {
          dataDir: join(runtimeDir, "data"),
          sqlitePath,
          triggerThreshold: 0.6,
          maxHints: 3
        },
        on(event, handler) {
          handlers.set(event, handler);
        }
      });

      await handlers.get("before_prompt_build")?.({
        session: { key: "cwd-shift" },
        workspace: { cwd: "/tmp/repo" },
        message: { content: "Fix schema bootstrap when cwd differs" }
      });
      await handlers.get("message_sent")?.({
        session: { key: "cwd-shift" },
        workspace: { cwd: "/tmp/repo" },
        message: { content: "Fix schema bootstrap when cwd differs" }
      });

      const db = new DatabaseSync(sqlitePath);
      const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };

      expect(inputCount.count).toBe(1);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("uses the installed product data home when no explicit plugin config is provided", async () => {
    const homeDir = makeTempDir();
    const originalHome = process.env.HOME;
    const handlers = new Map<string, Handler>();

    process.env.HOME = homeDir;
    const installReport = installOpenClawAdapter({
      homeDir,
      runner() {
        return;
      }
    });

    try {
      plugin.register({
        on(event, handler) {
          handlers.set(event, handler);
        }
      });

      await handlers.get("before_prompt_build")?.({
        session: { key: "installed-home" },
        workspace: { cwd: "/tmp/repo" },
        message: { content: "Fix installed path resolution" }
      });
      await handlers.get("message_sent")?.({
        session: { key: "installed-home" },
        workspace: { cwd: "/tmp/repo" },
        message: { content: "Fix installed path resolution" }
      });

      expect(existsSync(installReport.pluginConfig.sqlitePath)).toBe(true);
      const db = new DatabaseSync(installReport.pluginConfig.sqlitePath);
      const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };

      expect(inputCount.count).toBe(1);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("injects conservative hints on a later similar turn once a node exists", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
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
    expect(secondTurn.prependContext).toContain("make the smallest code change");
  });

  it("injects on a later similar turn even when the host payload lacks context summary", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
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
      session: { key: "seed-no-context" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test by checking the current workspace" }
    });
    await persistToolResult?.({
      sessionKey: "seed-no-context",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "seed-no-context" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test by checking the current workspace" }
    });

    const secondTurn = (await beforePromptBuild?.({
      session: { key: "replay-no-context" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test by checking the current workspace" }
    })) as Record<string, unknown>;

    expect(typeof secondTurn.prependContext).toBe("string");
    expect(secondTurn.prependContext).toContain("Conservative execution hints:");
  });

  it("does not persist injected hint blocks back into follow-up task summaries", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
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
      session: { key: "seed-clean" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test in the current workspace." }
    });
    await persistToolResult?.({
      sessionKey: "seed-clean",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "seed-clean" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test in the current workspace." }
    });

    const replayPayload = {
      session: { key: "followup-clean" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test in the current workspace." }
    };
    const secondTurn = (await beforePromptBuild?.(structuredClone(replayPayload))) as Record<string, unknown>;
    expect(typeof secondTurn.prependContext).toBe("string");

    await persistToolResult?.({
      sessionKey: "followup-clean",
      tool: { name: "read" },
      result: { exitCode: 1, error: "ENOENT: auth.spec.ts" },
      success: false
    });
    await finalize?.(
      {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${String(secondTurn.prependContext)}\n\n[Thu 2026-03-12 09:56 GMT+8] Fix the failing vitest auth test in the current workspace.`
              }
            ]
          }
        ]
      },
      {
        sessionId: "followup-clean",
        workspaceDir: "/tmp/repo"
      }
    );

    const db = new DatabaseSync(sqlitePath);
    const latestInput = db
      .prepare(
        "SELECT task_summary FROM experience_input_records WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get("followup-clean") as { task_summary: string };
    expect(latestInput.task_summary).toBe("Fix the failing vitest auth test in the current workspace.");
  });

  it.each(replayScenarios)("replays fixture corpus: $name", async (scenario: ReplayScenario) => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
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

    await beforePromptBuild?.(
      structuredClone(scenario.seedPrompt),
      structuredClone(scenario.seedPromptContext)
    );
    await persistToolResult?.(
      structuredClone(scenario.toolResult),
      structuredClone(scenario.toolResultContext)
    );
    await finalize?.(
      structuredClone(scenario.finalize),
      structuredClone(scenario.finalizeContext)
    );

    const replayPayload = structuredClone(scenario.replayPrompt);
    const replayResult = (await beforePromptBuild?.(
      replayPayload,
      structuredClone(scenario.replayPromptContext)
    )) as Record<string, unknown>;

    if (scenario.expectInjection === false) {
      expect(replayResult.prependContext, scenario.name).toBeFalsy();
    } else {
      expect(replayResult.prependContext, scenario.name).toBeTruthy();
      if (Array.isArray(scenario.replayPrompt.prependContext)) {
        expect(Array.isArray(replayResult.prependContext), scenario.name).toBe(true);
        expect((replayResult.prependContext as unknown[])[0], scenario.name).toContain("execution hints");
      } else {
        expect(String(replayResult.prependContext), scenario.name).toContain("execution hints");
      }
    }
  });

  it("captures raw payload files when runtime capture is enabled", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const captureDir = join(runtimeDir, "captures");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        captureRawPayloads: true,
        captureDir,
        triggerThreshold: 0.6,
        maxHints: 3
      },
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    await handlers.get("before_prompt_build")?.({
      session: { key: "capture-1" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Inspect a real OpenClaw payload" }
    });
    await handlers.get("tool_result_persist")?.({
      sessionKey: "capture-1",
      tool: { name: "pnpm test" },
      result: { exitCode: 0, output: "ok" },
      success: true
    });
    await handlers.get("message_sent")?.({
      session: { key: "capture-1" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Inspect a real OpenClaw payload" }
    });

    const captureFiles = readdirSync(captureDir).filter((file) => file.endsWith(".json"));

    expect(captureFiles.length).toBe(4);

    const capture = JSON.parse(readFileSync(join(captureDir, captureFiles[0]), "utf8")) as {
      event: string;
      sessionId: string | null;
      payload: Record<string, unknown>;
    };

    expect(["plugin_register", "before_prompt_build", "tool_result_persist", "finalize"]).toContain(capture.event);
    expect(capture.payload).toBeTypeOf("object");

    const sessionEvents = captureFiles
      .map((file) =>
        JSON.parse(readFileSync(join(captureDir, file), "utf8")) as {
          event: string;
          sessionId: string | null;
        }
      )
      .filter((entry) => entry.event !== "plugin_register");

    expect(sessionEvents).toHaveLength(3);
    expect(sessionEvents.every((entry) => entry.sessionId === "capture-1")).toBe(true);
  });

  it("recovers tool evidence from finalize payloads when tool_result_persist lacks session context", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3
      },
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    await handlers.get("before_prompt_build")?.(
      {
        prompt: "Fix the failing vitest auth test by checking the current workspace",
        messages: []
      },
      {
        sessionId: "real-openclaw-shape",
        workspaceDir: "/tmp/repo"
      }
    );

    await handlers.get("tool_result_persist")?.(
      {
        toolName: "exec",
        toolCallId: "call_real_1",
        message: {
          role: "toolResult",
          toolCallId: "call_real_1",
          toolName: "exec",
          content: [{ type: "text", text: "/tmp/repo" }],
          details: {
            status: "completed",
            exitCode: 0,
            aggregated: "/tmp/repo"
          },
          isError: false
        },
        isSynthetic: false
      },
      {
        agentId: "main",
        toolName: "exec",
        toolCallId: "call_real_1"
      }
    );

    await handlers.get("message_sent")?.(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Fix the failing vitest auth test by checking the current workspace" }]
          },
          {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call_real_1",
                name: "exec",
                arguments: { command: "pwd" }
              }
            ]
          },
          {
            role: "toolResult",
            toolCallId: "call_real_1",
            toolName: "exec",
            content: [{ type: "text", text: "/tmp/repo" }],
            details: {
              status: "completed",
              exitCode: 0,
              aggregated: "/tmp/repo"
            },
            isError: false
          }
        ]
      },
      {
        sessionId: "real-openclaw-shape",
        workspaceDir: "/tmp/repo"
      }
    );

    const db = new DatabaseSync(sqlitePath);
    const inputRow = db
      .prepare("SELECT evidence_json, task_type FROM experience_input_records ORDER BY created_at DESC LIMIT 1")
      .get() as {
        evidence_json: string;
        task_type: string;
      };
    const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
    const statsRow = db
      .prepare("SELECT total_tasks, success_tasks FROM scope_task_stats ORDER BY rowid DESC LIMIT 1")
      .get() as {
        total_tasks: number;
        success_tasks: number;
      };

    expect(JSON.parse(inputRow.evidence_json)).toContain("exec: success: /tmp/repo");
    expect(inputRow.task_type).toBe("test_debug");
    expect(nodeCount.count).toBe(1);
    expect(statsRow).toEqual({
      total_tasks: 1,
      success_tasks: 1
    });
  });

  it("persists feedback timestamps when injected turns succeed or fail", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
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
      session: { key: "seed-feedback" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "seed-feedback",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "seed-feedback" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await beforePromptBuild?.({
      session: { key: "helped-feedback" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "helped-feedback",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "helped-feedback" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await beforePromptBuild?.({
      session: { key: "harmed-feedback" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "harmed-feedback",
      tool: { name: "exec" },
      result: { exitCode: 1, output: "Command exited with code 1" },
      success: false
    });
    await finalize?.({
      session: { key: "harmed-feedback" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    const db = new DatabaseSync(sqlitePath);
    const nodeRow = db
      .prepare(
        "SELECT usage_count, helped_count, harmed_count, last_used_at, last_helped_at, last_harmed_at, state FROM experience_nodes ORDER BY updated_at DESC LIMIT 1"
      )
      .get() as {
        usage_count: number;
        helped_count: number;
        harmed_count: number;
        last_used_at: string | null;
        last_helped_at: string | null;
        last_harmed_at: string | null;
        state: string;
      };

    expect(nodeRow.usage_count).toBe(2);
    expect(nodeRow.helped_count).toBe(1);
    expect(nodeRow.harmed_count).toBe(1);
    expect(nodeRow.last_used_at).toBeTruthy();
    expect(nodeRow.last_helped_at).toBeTruthy();
    expect(nodeRow.last_harmed_at).toBeTruthy();
    expect(nodeRow.state).toBe("active");
  });

  it("preserves prior feedback counters when a matching candidate is stored again", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
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
      session: { key: "seed-preserve" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "seed-preserve",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "seed-preserve" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await beforePromptBuild?.({
      session: { key: "helped-preserve" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "helped-preserve",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "helped-preserve" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await beforePromptBuild?.({
      session: { key: "helped-preserve-2" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "helped-preserve-2",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "helped-preserve-2" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    const db = new DatabaseSync(sqlitePath);
    const nodeRow = db
      .prepare(
        "SELECT usage_count, helped_count, harmed_count, support_count FROM experience_nodes WHERE task_type = 'test_debug' AND node_type = 'strategy' LIMIT 1"
      )
      .get() as {
        usage_count: number;
        helped_count: number;
        harmed_count: number;
        support_count: number;
      };

    expect(nodeRow.usage_count).toBe(2);
    expect(nodeRow.helped_count).toBe(2);
    expect(nodeRow.harmed_count).toBe(0);
    expect(nodeRow.support_count).toBe(3);
  });

  it("ignores exploratory warning noise but stores terminal failure warnings", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    plugin.register({
      pluginConfig: {
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
      session: { key: "warning-read" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test in the current workspace." }
    });
    await persistToolResult?.({
      sessionKey: "warning-read",
      tool: { name: "read" },
      result: { exitCode: 1, error: "ENOENT: auth.spec.ts" },
      success: false
    });
    await finalize?.({
      session: { key: "warning-read" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test in the current workspace." }
    });

    await beforePromptBuild?.({
      session: { key: "warning-process" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test in the current workspace." }
    });
    await persistToolResult?.({
      sessionKey: "warning-process",
      tool: { name: "process" },
      result: { exitCode: 1, error: "Process still running" },
      success: false
    });
    await finalize?.({
      session: { key: "warning-process" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test in the current workspace." }
    });

    const db = new DatabaseSync(sqlitePath);
    const warningRows = db
      .prepare(
        "SELECT id, compact_hint, evidence_summary, support_count FROM experience_nodes WHERE task_type = 'test_debug' AND node_type = 'warning' ORDER BY updated_at DESC"
      )
      .all() as Array<{
        id: string;
        compact_hint: string;
        evidence_summary: string;
        support_count: number;
      }>;

    expect(warningRows).toHaveLength(1);
    expect(warningRows[0]?.compact_hint).toContain("process");
    expect(warningRows[0]?.compact_hint).toContain("narrow");
    expect(warningRows[0]?.evidence_summary).toContain("process failed");
    expect(warningRows[0]?.support_count).toBe(1);
  });
});
