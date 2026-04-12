import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { writeExperienceEngineSettings } from "../../src/config/settings-store.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import plugin, { createExperiencePlugin } from "../../src/plugin/openclaw-plugin.js";
import { installOpenClawAdapter } from "../../src/install/openclaw-installer.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
import { nowIso } from "../../src/utils/clock.js";
import { replayScenarios, type ReplayScenario } from "../fixtures/openclaw/index.js";

type Handler = (payload: unknown, context?: unknown) => unknown | Promise<unknown>;

const tempDirs: string[] = [];
const originalAllowPassthrough = process.env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH;
const originalExperienceEngineHome = process.env.EXPERIENCE_ENGINE_HOME;

beforeAll(() => {
  process.env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH = "true";
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

afterAll(() => {
  clearEmbeddingProviderForTests();
  if (originalAllowPassthrough === undefined) {
    delete process.env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH;
  } else {
    process.env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH = originalAllowPassthrough;
  }
});

const buildFailureToolResult = (toolResult: Record<string, unknown>): Record<string, unknown> => {
  if ("sessionKey" in toolResult || "tool" in toolResult) {
    return {
      sessionKey: toolResult.sessionKey,
      tool: (toolResult as { tool?: { name?: string; args?: unknown } }).tool ?? { name: "exec" },
      result: { exitCode: 1, output: "Command failed" },
      success: false
    };
  }

  const message = toolResult.message as Record<string, unknown> | undefined;
  const toolName =
    (toolResult.toolName as string | undefined) ??
    (message?.toolName as string | undefined) ??
    (message?.name as string | undefined) ??
    "exec";
  const toolCallId = `fail_${String(toolResult.toolCallId ?? message?.toolCallId ?? "tool")}`;
  const sessionId = toolResult.sessionId as string | undefined;

  return {
    ...(sessionId ? { sessionId } : {}),
    toolName,
    toolCallId,
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text: "Command failed" }],
      details: {
        status: "failed",
        exitCode: 1,
        aggregated: "Command failed"
      },
      isError: true
    },
    isSynthetic: false
  };
};

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-"));
  tempDirs.push(dir);
  return dir;
};

const writeSharedInitialization = (runtimeDir: string): void => {
  const productHome = join(runtimeDir, ".experienceengine");
  process.env.EXPERIENCE_ENGINE_HOME = productHome;
  writeExperienceEngineSettings({
    distillation: {
      provider: "openai",
      model: "gpt-5-mini"
    }
  });
};

const waitFor = async (assertion: () => void, attempts = 25, delayMs = 20): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const registerPluginRuntime = (
  runtimeDir: string,
  pluginConfigOverrides: Record<string, unknown> = {}
): {
  sqlitePath: string;
  handlers: Map<string, Handler>;
  waitForBackgroundLearning: () => Promise<void>;
} => {
  const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
  const handlers = new Map<string, Handler>();

  const pluginInstance = createExperiencePlugin(
    {
      dataDir: join(runtimeDir, "data"),
      sqlitePath,
      triggerThreshold: 0.6,
      maxHints: 3,
      distillationMode: "rule",
      distillationAllowPassthrough: true,
      distillationAutoDrain: true,
      ...pluginConfigOverrides
    },
    undefined,
    {
      disableBackgroundLearning: false,
      disableHybridPosttask: true,
      homeDir: runtimeDir
    }
  );

  pluginInstance.register({
    on(event, handler) {
      if (event === "message_sent" || event === "session_end" || event === "agent_end") {
        handlers.set(event, async (payload, context) => {
          const result = await handler(payload, context);
          await (pluginInstance as unknown as {
            runtime: { waitForBackgroundLearning: () => Promise<void> };
          }).runtime.waitForBackgroundLearning();
          return result;
        });
        return;
      }

      handlers.set(event, handler);
    }
  });

  return {
    sqlitePath,
    handlers,
    waitForBackgroundLearning: () =>
      (pluginInstance as unknown as { runtime: { waitForBackgroundLearning: () => Promise<void> } }).runtime.waitForBackgroundLearning()
  };
};

const seedInjectedOpenClawTurn = async (
  handlers: Map<string, Handler>,
  sqlitePath: string,
  cwd = "/tmp/repo",
  waitForBackgroundLearning?: () => Promise<void>
): Promise<void> => {
  const beforePromptBuild = handlers.get("before_prompt_build");
  const persistToolResult = handlers.get("tool_result_persist");
  const finalize = handlers.get("message_sent");

  await beforePromptBuild?.({
    session: { key: "seed" },
    workspace: { cwd },
    message: { content: "Fix the failing vitest auth test" },
    context: { summary: "Fix the failing vitest auth test" }
  });
  await persistToolResult?.({
    sessionKey: "seed",
    tool: { name: "pnpm test" },
    result: { exitCode: 1, output: "auth tests failed" },
    success: false
  });
  await persistToolResult?.({
    sessionKey: "seed",
    tool: { name: "pnpm test" },
    result: { exitCode: 0, output: "auth tests passed" },
    success: true
  });
  await finalize?.({
    session: { key: "seed" },
    workspace: { cwd },
    message: { content: "Fix the failing vitest auth test" }
  });
  await waitForBackgroundLearning?.();

  const db = new DatabaseSync(sqlitePath);
  await waitFor(() => {
    const nodeRow = db
      .prepare("SELECT id, scope_id, task_type FROM experience_nodes ORDER BY updated_at DESC LIMIT 1")
      .get() as { id: string; scope_id: string; task_type: string } | undefined;
    expect(nodeRow?.id).toBeTruthy();
  });

  const nodeRow = db
    .prepare("SELECT id, scope_id, task_type FROM experience_nodes ORDER BY updated_at DESC LIMIT 1")
    .get() as { id: string; scope_id: string; task_type: string };
  db.prepare(
    `INSERT INTO experience_input_records
      (record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary, evidence_json, injected_node_ids_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `seed_injected_record:${nodeRow.scope_id}`,
    nodeRow.scope_id,
    "seed_injected",
    nodeRow.task_type,
    "Fix the failing vitest auth test",
    "success",
    "Fix the failing vitest auth test",
    "[]",
    JSON.stringify([nodeRow.id]),
    "2099-03-28T11:30:00.000Z"
  );
};

const seedSkippedOpenClawTurn = (
  sqlitePath: string,
  cwd = "/tmp/repo",
  options: {
    sessionId?: string;
    summary?: string;
    contextSummary?: string;
    outcomeSignal?: "success" | "failure" | "unknown";
    learningStatus?: "captured" | "rejected" | "not_applicable";
    learningReason?: string;
    createdAt?: string;
  } = {}
): void => {
  const db = new DatabaseSync(sqlitePath);
  const scopeId = resolveScope(cwd).scope_id;
  const sessionId = options.sessionId ?? "seed_skip";
  const summary = options.summary ?? "Inspect the current repo files";
  const createdAt = options.createdAt ?? "2099-03-28T11:31:00.000Z";

  db.prepare(
    `INSERT INTO task_runs
      (id, host, scope_id, session_id, task_type, task_summary, prompt_excerpt, context_summary, started_at, ended_at, final_status, failure_signature, learning_status, learning_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `task_run:${sessionId}`,
    "openclaw",
    scopeId,
    sessionId,
    "general",
    summary,
    summary,
    options.contextSummary ?? summary,
    createdAt,
    createdAt,
    options.outcomeSignal === "failure" ? "failure" : options.outcomeSignal === "unknown" ? "unknown" : "success",
    null,
    options.learningStatus ?? "rejected",
    options.learningReason ?? "insufficient substantive evidence: only edit or exploratory events were observed",
    createdAt,
    createdAt
  );

  db.prepare(
    `INSERT INTO experience_input_records
      (record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary, evidence_json, injected_node_ids_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `skip_record:${sessionId}`,
    scopeId,
    sessionId,
    "general",
    summary,
    options.outcomeSignal ?? "success",
    options.contextSummary ?? summary,
    "[]",
    "[]",
    createdAt
  );
};

const geminiJsonResponse = (payload: unknown): Response =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(payload) }]
          }
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

afterEach(() => {
  if (originalExperienceEngineHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalExperienceEngineHome;
  }

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
    const { sqlitePath, handlers, waitForBackgroundLearning } = registerPluginRuntime(runtimeDir);

    const beforePromptBuild = handlers.get("before_prompt_build");
    const persistToolResult = handlers.get("tool_result_persist");
    const finalize = handlers.get("message_sent");

    expect(beforePromptBuild).toBeTypeOf("function");
    expect(persistToolResult).toBeTypeOf("function");
    expect(finalize).toBeTypeOf("function");

    const syncPersistResult = persistToolResult?.({
      sessionKey: "sess_probe",
      tool: { name: "pnpm test", args: ["probe"] },
      result: { exitCode: 0, output: "probe" },
      success: true
    });
    expect(syncPersistResult).not.toBeInstanceOf(Promise);

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
      result: { exitCode: 1, output: "auth tests failed" },
      success: false
    });
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
    await waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
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
  });

  it("finalizes a session only once even when multiple end hooks fire", async () => {
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

    await handlers.get("before_prompt_build")?.({
      session: { key: "dedupe-finalize" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await handlers.get("message_sent")?.({
      session: { key: "dedupe-finalize" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await handlers.get("session_end")?.({
      session: { key: "dedupe-finalize" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    const db = new DatabaseSync(sqlitePath);
    const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };
    const taskCount = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };

    expect(inputCount.count).toBe(1);
    expect(taskCount.count).toBe(1);
  });

  it("deduplicates finalize hooks even when later hooks omit tool results from the payload", async () => {
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

    await handlers.get("before_prompt_build")?.({
      session: { key: "dedupe-finalize-payload-drift" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await handlers.get("message_sent")?.({
      session: { key: "dedupe-finalize-payload-drift" },
      workspace: { cwd: "/tmp/repo" },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Fix the failing vitest auth test" }]
        },
        {
          role: "toolResult",
          toolCallId: "call_auth_test",
          toolName: "exec",
          content: [{ type: "text", text: "vitest auth test now passes" }],
          details: {
            status: "completed",
            exitCode: 0,
            aggregated: "vitest auth test now passes"
          },
          isError: false
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "The auth test passes after the narrow fix." }]
        }
      ]
    });

    await handlers.get("session_end")?.({
      session: { key: "dedupe-finalize-payload-drift" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    const db = new DatabaseSync(sqlitePath);
    const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };
    const taskCount = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };

    expect(inputCount.count).toBe(1);
    expect(taskCount.count).toBe(1);
  });

  it("allows a later turn in the same session to finalize again after a new prompt starts", async () => {
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

    await handlers.get("before_prompt_build")?.({
      session: { key: "dedupe-finalize-repeat-turn" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await handlers.get("message_sent")?.({
      session: { key: "dedupe-finalize-repeat-turn" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await handlers.get("before_prompt_build")?.({
      session: { key: "dedupe-finalize-repeat-turn" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await handlers.get("message_sent")?.({
      session: { key: "dedupe-finalize-repeat-turn" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    const db = new DatabaseSync(sqlitePath);
    const inputCount = db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number };
    const taskCount = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };

    expect(inputCount.count).toBe(2);
    expect(taskCount.count).toBe(2);
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
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
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
  }, 10_000);

  it("injects conservative hints on a later similar turn once a node exists", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

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
      result: { exitCode: 1, output: "auth tests failed" },
      success: false
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

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
      expect(nodeCount.count).toBe(1);
    });

    const secondTurn = (await beforePromptBuild?.({
      session: { key: "sess_2" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" },
      context: { summary: "Fix the failing vitest auth test" }
    })) as Record<string, unknown>;

    expect(typeof secondTurn.prependContext).toBe("string");
    expect(String(secondTurn.prependContext).toLowerCase()).toContain("execution hints");
    expect(secondTurn.prependContext).toContain("make the smallest code change");
  });

  it("answers last-intervention review inside OpenClaw without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers, waitForBackgroundLearning } = registerPluginRuntime(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath, "/tmp/repo", waitForBackgroundLearning);

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const reviewTurn = (await beforePromptBuild?.({
      session: { key: "review_last" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "What did ExperienceEngine just inject?" }
    })) as Record<string, unknown>;

    expect(String(reviewTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(reviewTurn.prependContext)).toContain("The user is asking what ExperienceEngine just injected.");
    expect(String(reviewTurn.prependContext)).toContain("Injected nodes:");

    await finalize?.({
      session: { key: "review_last" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "What did ExperienceEngine just inject?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("treats a latest skip turn as the current OpenClaw interaction instead of falling back to an older injected turn", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath);

    const beforePromptBuild = handlers.get("before_prompt_build");
    const db = new DatabaseSync(sqlitePath);
    const scopeId = resolveScope("/tmp/repo").scope_id;
    db.prepare(
      `INSERT INTO experience_input_records
        (record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary, evidence_json, injected_node_ids_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "seed_skip_record:/tmp/repo",
      scopeId,
      "skip_turn",
      "general",
      "Inspect the current repo files",
      "success",
      "Inspect the current repo files",
      "[]",
      "[]",
      "2099-03-28T11:31:00.000Z"
    );

    const reviewTurn = (await beforePromptBuild?.({
      session: { key: "review_after_skip" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "What did ExperienceEngine just inject?" }
    })) as Record<string, unknown>;

    expect(String(reviewTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(reviewTurn.prependContext)).toContain("There is no recent injected ExperienceEngine intervention to review.");
    expect(String(reviewTurn.prependContext)).not.toContain("The user is asking what ExperienceEngine just injected.");
  });

  it("answers why the last hint matched inside OpenClaw without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath);

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const explainTurn = (await beforePromptBuild?.({
      session: { key: "explain_last" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why did that ExperienceEngine hint match?" }
    })) as Record<string, unknown>;

    expect(String(explainTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(explainTurn.prependContext)).toContain("The user is asking why the last ExperienceEngine hint matched.");
    expect(String(explainTurn.prependContext)).toContain("Why it matched:");

    await finalize?.({
      session: { key: "explain_last" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why did that ExperienceEngine hint match?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("keeps OpenClaw explain_last_match on the safe fallback path even when hybrid explain overrides are requested", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir, {
      hybridEnabled: true,
      hybridSyncExplainEnabled: true,
      hybridExplainLlmEnabled: true,
      hybridExplainProviderMode: "shared_distiller",
      hybridExplainModelProfileVersion: "hybrid-explain-llm-v1",
      distillerProvider: "openai_compatible",
      distillerModel: "gpt-5.4-mini"
    });
    await seedInjectedOpenClawTurn(handlers, sqlitePath);

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
      const beforePromptBuild = handlers.get("before_prompt_build");
      const explainTurn = (await beforePromptBuild?.({
        session: { key: "explain_last_phase2" },
        workspace: { cwd: "/tmp/repo" },
        message: { content: "Why did that ExperienceEngine hint match?" }
      })) as Record<string, unknown>;

      expect(String(explainTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
      expect(String(explainTurn.prependContext)).toContain("The user is asking why the last ExperienceEngine hint matched.");
      expect(String(explainTurn.prependContext)).toContain(
        "Why it matched: ExperienceEngine injected the best available reusable guidance for this task."
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY;
      } else {
        process.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY = originalApiKey;
      }
    }
  });

  it("records harmful feedback inside OpenClaw without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath);

    const db = new DatabaseSync(sqlitePath);
    const nodeBefore = db
      .prepare("SELECT helped_count, harmed_count FROM experience_nodes ORDER BY updated_at DESC LIMIT 1")
      .get() as { helped_count: number; harmed_count: number };
    const taskRunsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const feedbackTurn = (await beforePromptBuild?.({
      session: { key: "feedback_harmed" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Mark the last ExperienceEngine intervention as harmful." }
    })) as Record<string, unknown>;

    expect(String(feedbackTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(feedbackTurn.prependContext)).toContain("Feedback recorded: harmed.");

    await finalize?.({
      session: { key: "feedback_harmed" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Mark the last ExperienceEngine intervention as harmful." }
    });

    const nodeAfter = db
      .prepare("SELECT helped_count, harmed_count FROM experience_nodes ORDER BY updated_at DESC LIMIT 1")
      .get() as { helped_count: number; harmed_count: number };
    const taskRunsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };

    expect(nodeAfter.helped_count).toBe(nodeBefore.helped_count);
    expect(nodeAfter.harmed_count).toBe(nodeBefore.harmed_count + 1);
    expect(taskRunsAfter.count).toBe(taskRunsBefore.count);
  });

  it("records OpenClaw routine feedback against the latest injected turn in the current scope", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath, "/tmp/repo-a");
    await seedInjectedOpenClawTurn(handlers, sqlitePath, "/tmp/repo-b");
    const repoAScopeId = resolveScope("/tmp/repo-a").scope_id;
    const repoBScopeId = resolveScope("/tmp/repo-b").scope_id;

    const db = new DatabaseSync(sqlitePath);
    const nodeRowsBefore = db
      .prepare("SELECT scope_id, helped_count, harmed_count FROM experience_nodes ORDER BY scope_id ASC")
      .all() as Array<{ scope_id: string; helped_count: number; harmed_count: number }>;
    const beforePromptBuild = handlers.get("before_prompt_build");

    const feedbackTurn = (await beforePromptBuild?.({
      session: { key: "feedback_scope_a" },
      workspace: { cwd: "/tmp/repo-a" },
      message: { content: "Mark the last ExperienceEngine intervention as harmful." }
    })) as Record<string, unknown>;

    expect(String(feedbackTurn.prependContext)).toContain("Feedback recorded: harmed.");

    const nodeRowsAfter = db
      .prepare("SELECT scope_id, helped_count, harmed_count FROM experience_nodes ORDER BY scope_id ASC")
      .all() as Array<{ scope_id: string; helped_count: number; harmed_count: number }>;

    const scopeAAfter = nodeRowsAfter.find((row) => row.scope_id === repoAScopeId);
    const scopeABefore = nodeRowsBefore.find((row) => row.scope_id === repoAScopeId);
    const scopeBAfter = nodeRowsAfter.find((row) => row.scope_id === repoBScopeId);
    const scopeBBefore = nodeRowsBefore.find((row) => row.scope_id === repoBScopeId);

    expect(scopeAAfter?.harmed_count).toBe((scopeABefore?.harmed_count ?? 0) + 1);
    expect(scopeBAfter?.harmed_count).toBe(scopeBBefore?.harmed_count ?? 0);
  });

  it("answers whether ExperienceEngine is ready in the current repo without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const readinessTurn = (await beforePromptBuild?.({
      session: { key: "ready_here" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Is ExperienceEngine ready here?" }
    })) as Record<string, unknown>;

    expect(String(readinessTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(readinessTurn.prependContext)).toContain("The user is asking whether ExperienceEngine is ready in this repo.");
    expect(String(readinessTurn.prependContext)).toContain("Setup state: Ready");
    expect(String(readinessTurn.prependContext)).toContain("OpenClaw routine interaction is active in this workspace.");
    expect(String(readinessTurn.prependContext)).toContain("Next step:");

    await finalize?.({
      session: { key: "ready_here" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Is ExperienceEngine ready here?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("treats natural repo phrasing as a readiness routine interaction without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const readinessTurn = (await beforePromptBuild?.({
      session: { key: "ready_in_repo" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Is ExperienceEngine ready in this repo?" }
    })) as Record<string, unknown>;

    expect(String(readinessTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(readinessTurn.prependContext)).toContain("The user is asking whether ExperienceEngine is ready in this repo.");
    expect(String(readinessTurn.prependContext)).toContain("Setup state: Ready");

    await finalize?.({
      session: { key: "ready_in_repo" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Is ExperienceEngine ready in this repo?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("still reports OpenClaw as ready when the current plugin runtime is active but install wiring was not recorded", async () => {
    const runtimeDir = makeTempDir();
    const { handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);

    const beforePromptBuild = handlers.get("before_prompt_build");
    const readinessTurn = (await beforePromptBuild?.({
      session: { key: "ready_not_wired" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Is ExperienceEngine ready here?" }
    })) as Record<string, unknown>;

    expect(String(readinessTurn.prependContext)).toContain("Setup state: Ready");
    expect(String(readinessTurn.prependContext)).toContain("OpenClaw routine interaction is active in this workspace.");
  });

  it("answers whether ExperienceEngine is still warming up in the current repo without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const warmupTurn = (await beforePromptBuild?.({
      session: { key: "warming_up" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Is ExperienceEngine still warming up here?" }
    })) as Record<string, unknown>;

    expect(String(warmupTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(warmupTurn.prependContext)).toContain("The user is asking whether ExperienceEngine is still warming up in this repo.");
    expect(String(warmupTurn.prependContext)).toContain("Value state:");
    expect(String(warmupTurn.prependContext)).toContain("Next step:");

    await finalize?.({
      session: { key: "warming_up" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Is ExperienceEngine still warming up here?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("explains why ExperienceEngine stayed quiet on the latest scoped turn without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);

    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    await beforePromptBuild?.({
      session: { key: "skip_seed" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Inspect the current repo files" },
      context: { summary: "Inspect the current repo files" }
    });
    await finalize?.({
      session: { key: "skip_seed" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Inspect the current repo files" }
    });

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };

    const silenceTurn = (await beforePromptBuild?.({
      session: { key: "why_quiet" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why didn't ExperienceEngine inject anything just now?" }
    })) as Record<string, unknown>;

    expect(String(silenceTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(silenceTurn.prependContext)).toContain("The latest turn delivered no hint.");
    expect(String(silenceTurn.prependContext)).toContain("Reason:");

    await finalize?.({
      session: { key: "why_quiet" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why didn't ExperienceEngine inject anything just now?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("uses the warming-up silence explanation when the repo has only early skip evidence", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);
    seedSkippedOpenClawTurn(sqlitePath, "/tmp/repo", {
      sessionId: "warming_up_skip",
      summary: "Inspect the current repo files",
      createdAt: "2099-03-28T11:32:00.000Z"
    });

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const silenceTurn = (await beforePromptBuild?.({
      session: { key: "warming_up_silence" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why didn't ExperienceEngine inject anything just now?" }
    })) as Record<string, unknown>;

    expect(String(silenceTurn.prependContext)).toContain(
      "Reason: ExperienceEngine is still warming up in this repo, so it is gathering more real-task evidence before reusing guidance."
    );

    await finalize?.({
      session: { key: "warming_up_silence" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why didn't ExperienceEngine inject anything just now?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("uses the fallback silence explanation when no more specific structured reason is available", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath);
    seedSkippedOpenClawTurn(sqlitePath, "/tmp/repo", {
      sessionId: "fallback_skip",
      summary: "Inspect the current repo files",
      learningStatus: "rejected",
      learningReason: "llm gate failed: timeout",
      createdAt: "2099-03-28T11:33:00.000Z"
    });

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const silenceTurn = (await beforePromptBuild?.({
      session: { key: "fallback_silence" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why didn't ExperienceEngine inject anything just now?" }
    })) as Record<string, unknown>;

    expect(String(silenceTurn.prependContext)).toContain(
      "Reason: ExperienceEngine stayed quiet on that turn, but the stored state does not point to a more specific silence reason yet."
    );

    await finalize?.({
      session: { key: "fallback_silence" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why didn't ExperienceEngine inject anything just now?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("grounds recent-silence answers to the latest turn state when the latest turn was not actually quiet", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath);

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const silenceTurn = (await beforePromptBuild?.({
      session: { key: "why_quiet_after_hint" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why has ExperienceEngine stayed quiet lately in this repo?" }
    })) as Record<string, unknown>;

    expect(String(silenceTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(silenceTurn.prependContext)).toContain(
      "The latest turn already delivered a hint, so the latest ExperienceEngine turn was not actually quiet."
    );
    expect(String(silenceTurn.prependContext)).toContain("Latest intervention: inject");

    await finalize?.({
      session: { key: "why_quiet_after_hint" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Why has ExperienceEngine stayed quiet lately in this repo?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("answers with a compact repo-level ExperienceEngine summary inside OpenClaw without persisting a new task run", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath);

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const summaryTurn = (await beforePromptBuild?.({
      session: { key: "repo_summary" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "What is ExperienceEngine doing in this repo right now?" }
    })) as Record<string, unknown>;

    expect(String(summaryTurn.prependContext)).toContain("ExperienceEngine routine interaction:");
    expect(String(summaryTurn.prependContext)).toContain(
      "The user is asking for a compact ExperienceEngine summary of this repo."
    );
    expect(String(summaryTurn.prependContext)).toContain("Setup state:");
    expect(String(summaryTurn.prependContext)).toContain("Value state:");
    expect(String(summaryTurn.prependContext)).toContain("Latest intervention:");
    expect(String(summaryTurn.prependContext)).toContain("Repo activity:");
    expect(String(summaryTurn.prependContext)).toContain("Next step:");
    expect(String(summaryTurn.prependContext)).not.toContain("scorecard");
    expect(String(summaryTurn.prependContext)).not.toContain("Top candidate");
    expect(String(summaryTurn.prependContext)).not.toContain("retrieval notes");
    expect(String(summaryTurn.prependContext)).not.toContain("Gate reason");
    expect(String(summaryTurn.prependContext)).not.toContain("Decision reason");

    await finalize?.({
      session: { key: "repo_summary" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "What is ExperienceEngine doing in this repo right now?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("keeps the OpenClaw repo-level summary scoped to the current workspace", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    writeSharedInitialization(runtimeDir);
    await seedInjectedOpenClawTurn(handlers, sqlitePath, "/tmp/repo-a");
    seedSkippedOpenClawTurn(sqlitePath, "/tmp/repo-b", {
      sessionId: "repo_b_skip",
      summary: "Inspect repo-b files",
      createdAt: "2099-03-28T11:40:00.000Z"
    });

    const db = new DatabaseSync(sqlitePath);
    const countsBefore = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    const beforePromptBuild = handlers.get("before_prompt_build");
    const finalize = handlers.get("message_sent");

    const summaryTurn = (await beforePromptBuild?.({
      session: { key: "repo_summary_scope_a" },
      workspace: { cwd: "/tmp/repo-a" },
      message: { content: "What is ExperienceEngine doing in this repo right now?" }
    })) as Record<string, unknown>;

    expect(String(summaryTurn.prependContext)).toContain('Latest intervention: inject on "Fix the failing vitest auth test".');
    expect(String(summaryTurn.prependContext)).not.toContain("Inspect repo-b files");
    expect(String(summaryTurn.prependContext)).not.toContain("staying mostly quiet on recent turns");

    await finalize?.({
      session: { key: "repo_summary_scope_a" },
      workspace: { cwd: "/tmp/repo-a" },
      message: { content: "What is ExperienceEngine doing in this repo right now?" }
    });

    const countsAfter = db.prepare("SELECT COUNT(*) AS count FROM task_runs").get() as { count: number };
    expect(countsAfter.count).toBe(countsBefore.count);
  });

  it("injects on a later similar turn even when the host payload lacks context summary", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

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
      result: { exitCode: 1, output: "Command failed" },
      success: false
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

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
      expect(nodeCount.count).toBe(1);
    });

    const secondTurn = (await beforePromptBuild?.({
      session: { key: "replay-no-context" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test by checking the current workspace" }
    })) as Record<string, unknown>;

    expect(typeof secondTurn.prependContext).toBe("string");
    expect(String(secondTurn.prependContext).toLowerCase()).toContain("execution hints");
  });

  it("does not persist injected hint blocks back into follow-up task summaries", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

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
      result: { exitCode: 1, output: "Command failed" },
      success: false
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

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
      expect(nodeCount.count).toBeGreaterThanOrEqual(1);
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

    const latestInput = db
      .prepare(
        "SELECT task_summary FROM experience_input_records WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get("followup-clean") as { task_summary: string };
    expect(latestInput.task_summary).toBe("Fix the failing vitest auth test in the current workspace.");
  });

  it.each(replayScenarios)("replays fixture corpus: $name", async (scenario: ReplayScenario) => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

    const beforePromptBuild = handlers.get("before_prompt_build");
    const persistToolResult = handlers.get("tool_result_persist");
    const finalize = handlers.get("message_sent");

    await beforePromptBuild?.(
      structuredClone(scenario.seedPrompt),
      structuredClone(scenario.seedPromptContext)
    );
    const isRealRuntime = "message" in scenario.toolResult;
    if (isRealRuntime && scenario.seedPromptContext?.sessionId) {
      await persistToolResult?.({
        sessionKey: scenario.seedPromptContext.sessionId,
        tool: { name: "exec" },
        result: { exitCode: 1, output: "Command failed" },
        success: false
      });
    }
    const toolContext = {
      ...(scenario.toolResultContext ?? {}),
      ...(scenario.seedPromptContext ?? {})
    } as Record<string, unknown>;
    if (!isRealRuntime) {
      await persistToolResult?.(
        buildFailureToolResult(structuredClone(scenario.toolResult) as Record<string, unknown>),
        structuredClone(toolContext)
      );
    }
    await persistToolResult?.(
      structuredClone(scenario.toolResult),
      structuredClone(toolContext)
    );
    await finalize?.(
      structuredClone(scenario.finalize),
      structuredClone(scenario.finalizeContext)
    );

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
      expect(nodeCount.count).toBeGreaterThanOrEqual(1);
    });

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
        expect(String((replayResult.prependContext as unknown[])[0]), scenario.name).toMatch(/execution hints/i);
      } else {
        expect(String(replayResult.prependContext), scenario.name).toMatch(/execution hints/i);
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
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

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
        toolCallId: "call_real_fail",
        message: {
          role: "toolResult",
          toolCallId: "call_real_fail",
          toolName: "exec",
          content: [{ type: "text", text: "Command failed" }],
          details: {
            status: "failed",
            exitCode: 1,
            aggregated: "Command failed"
          },
          isError: true
        },
        isSynthetic: false
      },
      {
        agentId: "main",
        toolName: "exec",
        toolCallId: "call_real_fail"
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
            role: "toolResult",
            toolCallId: "call_real_fail",
            toolName: "exec",
            content: [{ type: "text", text: "Command failed" }],
            details: {
              status: "failed",
              exitCode: 1,
              aggregated: "Command failed"
            },
            isError: true
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

    await waitFor(() => {
      expect(JSON.parse(inputRow.evidence_json)).toContain("exec: success: /tmp/repo");
      expect(inputRow.task_type).toBe("test_debug");
      const refreshedNodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
      const refreshedStatsRow = db
        .prepare("SELECT total_tasks, success_tasks FROM scope_task_stats ORDER BY rowid DESC LIMIT 1")
        .get() as {
          total_tasks: number;
          success_tasks: number;
        };
      expect(refreshedNodeCount.count).toBe(1);
      expect(refreshedStatsRow).toEqual({
        total_tasks: 1,
        success_tasks: 1
      });
    });
  });

  it("learns an expectation correction from real OpenClaw follow-up payloads and conservatively injects it on the next similar turn", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        geminiJsonResponse({
          worth_capturing: true,
          experience_kind: "expectation_correction",
          reason: "The user corrected the implementation boundary and the follow-up succeeded only after moving the fix into provider routing.",
          candidate: {
            node_type: "strategy",
            task_type: "config_debug",
            trigger_pattern:
              "When the implementation technically works but the real correction belongs in provider routing instead of the UI layer",
            compact_hint:
              "Do not keep polishing the UI layer when the user correction says the real fix belongs in provider routing.",
            success_signal:
              "A targeted provider probe matches the requested model-selection behavior after moving the fix into routing.",
            evidence_summary:
              "A follow-up correction only succeeded after moving the fix out of the UI layer and validating provider routing.",
            experience_kind: "expectation_correction",
            confidence_signal: "supported_by_objective_success",
            validation_state: "pending_reuse_validation",
            correction_scope: "host_local",
            correction_category: "implementation_boundary",
            deviation_pattern: "implementation solves the wrong layer of the problem",
            corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
          }
        })
      )
      .mockResolvedValueOnce(
        geminiJsonResponse({
          trigger_conditions:
            "The implementation technically works, but the correction says the real fix belongs in provider routing rather than the UI layer.",
          success_criteria:
            "A targeted provider probe matches the requested model-selection behavior after moving the fix into routing.",
          risk_level: "medium",
          trigger_pattern:
            "When the implementation technically works but the real correction belongs in provider routing instead of the UI layer",
          compact_hint:
            "Do not keep polishing the UI layer when the user correction says the real fix belongs in provider routing.",
          goal: "Move the fix into provider routing rather than continuing in the UI layer.",
          recommended_steps: [
            "Check whether the current change still lives in the UI layer.",
            "Move the fix into provider routing.",
            "Run a targeted provider probe."
          ],
          avoid_steps: ["Do not continue refining UI code while the behavior mismatch still lives in provider routing."],
          fallback_steps: ["If the routing move is still ambiguous, isolate the provider path with a narrower probe."],
          success_signal:
            "A targeted provider probe matches the requested model-selection behavior after moving the fix into routing.",
          evidence_summary:
            "A prior correction only succeeded after moving the fix out of the UI layer and validating provider routing.",
          experience_kind: "expectation_correction",
          confidence_signal: "supported_by_objective_success",
          validation_state: "pending_reuse_validation",
          correction_scope: "host_local",
          correction_category: "implementation_boundary",
          deviation_pattern: "implementation solves the wrong layer of the problem",
          corrected_constraint: "Move the fix into provider routing instead of persisting in the UI layer."
        })
      );

    const pluginInstance = createExperiencePlugin(
      {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3,
        distillerProvider: "gemini",
        distillerModel: "gemini-3-flash-preview",
        distillationAuthMode: "api_key",
        distillationMode: "llm",
        distillationAllowPassthrough: true,
        distillationAutoDrain: true
      },
      undefined,
      {
        homeDir: runtimeDir,
        env: {
          GEMINI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        disableBackgroundLearning: false,
        disableHybridPosttask: true
      }
    );

    pluginInstance.register({
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    const beforePromptBuild = handlers.get("before_prompt_build");
    const persistToolResult = handlers.get("tool_result_persist");
    const finalize = handlers.get("message_sent");

    await beforePromptBuild?.(
      {
        prompt:
          "Fix the Gemini model selection issue in the current workspace. Start with the UI layer and verify the result.",
        messages: []
      },
      {
        sessionId: "expectation-runtime",
        workspaceDir: "/tmp/repo"
      }
    );
    await persistToolResult?.(
      {
        toolName: "exec",
        toolCallId: "call_ui_fix_1",
        message: {
          role: "toolResult",
          toolCallId: "call_ui_fix_1",
          toolName: "exec",
          content: [{ type: "text", text: "Updated the UI layer." }],
          details: {
            status: "completed",
            exitCode: 0,
            aggregated: "Updated the UI layer."
          },
          isError: false
        },
        isSynthetic: false
      },
      {
        agentId: "main",
        toolName: "exec",
        toolCallId: "call_ui_fix_1"
      }
    );
    await finalize?.(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Fix the Gemini model selection issue in the current workspace. Start with the UI layer and verify the result." }]
          },
          {
            role: "toolResult",
            toolCallId: "call_ui_fix_1",
            toolName: "exec",
            content: [{ type: "text", text: "Updated the UI layer." }],
            details: {
              status: "completed",
              exitCode: 0,
              aggregated: "Updated the UI layer."
            },
            isError: false
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "The UI layer has been updated." }]
          }
        ]
      },
      {
        sessionId: "expectation-runtime",
        workspaceDir: "/tmp/repo"
      }
    );
    await (pluginInstance as unknown as {
      runtime: { waitForBackgroundLearning: () => Promise<void> };
    }).runtime.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeRow = db
        .prepare(
          "SELECT experience_kind FROM experience_nodes WHERE experience_kind = 'expectation_correction' ORDER BY updated_at DESC LIMIT 1"
        )
        .get() as { experience_kind: string } | undefined;
      expect(nodeRow?.experience_kind).toBe("expectation_correction");
    });

    const followUp = (await beforePromptBuild?.(
      {
        prompt:
          "Correction: that is the wrong boundary. The UI technically works, but the real fix belongs in provider routing. Verify the model-selection behavior through provider routing instead.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Fix the Gemini model selection issue in the current workspace. Start with the UI layer and verify the result." }]
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "The UI layer has been updated." }]
          }
        ]
      },
      {
        sessionId: "expectation-runtime",
        workspaceDir: "/tmp/repo"
      }
    )) as Record<string, unknown>;
    expect(typeof followUp.prependContext).toBe("string");
    expect(String(followUp.prependContext)).toMatch(/conservative execution hints/i);

    await persistToolResult?.(
      {
        toolName: "exec",
        toolCallId: "call_provider_probe_1",
        message: {
          role: "toolResult",
          toolCallId: "call_provider_probe_1",
          toolName: "exec",
          content: [{ type: "text", text: "Provider routing now matches the requested model-selection behavior." }],
          details: {
            status: "completed",
            exitCode: 0,
            aggregated: "Provider routing now matches the requested model-selection behavior."
          },
          isError: false
        },
        isSynthetic: false
      },
      {
        agentId: "main",
        toolName: "exec",
        toolCallId: "call_provider_probe_1"
      }
    );
    await finalize?.(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Fix the Gemini model selection issue in the current workspace. Start with the UI layer and verify the result." }]
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "The UI layer has been updated." }]
          },
          {
            role: "user",
            content: [{ type: "text", text: "Correction: that is the wrong boundary. The UI technically works, but the real fix belongs in provider routing. Verify the model-selection behavior through provider routing instead." }]
          },
          {
            role: "toolResult",
            toolCallId: "call_provider_probe_1",
            toolName: "exec",
            content: [{ type: "text", text: "Provider routing now matches the requested model-selection behavior." }],
            details: {
              status: "completed",
              exitCode: 0,
              aggregated: "Provider routing now matches the requested model-selection behavior."
            },
            isError: false
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "The provider-routing fix is now behaving correctly." }]
          }
        ]
      },
      {
        sessionId: "expectation-runtime",
        workspaceDir: "/tmp/repo"
      }
    );
    await (pluginInstance as unknown as {
      runtime: { waitForBackgroundLearning: () => Promise<void> };
    }).runtime.waitForBackgroundLearning();
    await waitFor(() => {
      const nodeRow = db
        .prepare(
          "SELECT experience_kind, confidence_signal, validation_state FROM experience_nodes WHERE experience_kind = 'expectation_correction' ORDER BY updated_at DESC LIMIT 1"
        )
        .get() as {
          experience_kind: string;
          confidence_signal: string;
          validation_state: string;
        };
      expect(nodeRow).toEqual({
        experience_kind: "expectation_correction",
        confidence_signal: "supported_by_objective_success",
        validation_state: "pending_reuse_validation"
      });
    });

    const replayResult = (await beforePromptBuild?.(
      {
        prompt:
          "The UI technically works, but the behavior is still wrong because the fix is happening in the UI layer instead of provider routing. Figure out the correct next step.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Correction: that is the wrong boundary. The UI technically works, but the real fix belongs in provider routing. Verify the model-selection behavior through provider routing instead." }]
          }
        ]
      },
      {
        sessionId: "expectation-runtime-replay",
        workspaceDir: "/tmp/repo"
      }
    )) as Record<string, unknown>;

    expect(typeof replayResult.prependContext).toBe("string");
    expect(String(replayResult.prependContext)).toMatch(/execution hints/i);

    const injectionRow = db
      .prepare(
        "SELECT mode FROM injection_events WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get("expectation-runtime-replay") as { mode: string };
    expect(injectionRow.mode).toBe("inject_conservative");
  });

  it("converges repeated same-family organic lessons into one stronger node", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const rawBody = typeof init?.body === "string" ? init.body : "";
      const parsedBody = rawBody
        ? (JSON.parse(rawBody) as {
            contents?: Array<{ parts?: Array<{ text?: string }> }>;
            system_instruction?: { parts?: Array<{ text?: string }> };
          })
        : {};
      const systemPrompt =
        parsedBody.system_instruction?.parts?.find((part) => typeof part.text === "string")?.text ?? "";
      const promptText = parsedBody.contents?.[0]?.parts?.find((part) => typeof part.text === "string")?.text ?? "";

      if (systemPrompt.includes("merge into an existing node pool")) {
        const mergePayload = promptText;
        const existingNodes = mergePayload
          ? ((JSON.parse(mergePayload) as { existing_nodes?: Array<{ id: string }> }).existing_nodes ?? [])
          : [];

        return geminiJsonResponse({
          action: existingNodes.length ? "UPDATE" : "ADD",
          target_node_id: existingNodes[0]?.id,
          reason: existingNodes.length
            ? "A same-family lesson already exists and this run strengthens it."
            : "no existing nodes matched"
        });
      }

      const secondPrompt =
        rawBody.includes("authentication regression") ||
        rawBody.includes("auth regression") ||
        rawBody.includes("same read-only EROFS loop");

      if (systemPrompt.includes("coding-experience learner")) {
        return geminiJsonResponse({
          worth_capturing: true,
          experience_kind: "execution_pattern",
          reason: secondPrompt
            ? "A same-family EROFS regression was resolved by the same diagnostic pattern."
            : "The read-only EROFS investigation produced a reusable first diagnostic step.",
          candidate: {
            node_type: "strategy",
            task_type: secondPrompt ? "bug_fix" : "test_debug",
            trigger_pattern: "When read-only EROFS stops a focused test run before any file edits",
            compact_hint: "Do not keep rerunning the focused test under EROFS; switch to static inspection or a writable cache path first.",
            success_signal: "The next diagnostic step is confirmed without repeating the same EROFS loop.",
            evidence_summary: secondPrompt
              ? "A second same-family regression resolved by leaving the repeated EROFS loop immediately."
              : "A read-only regression review only progressed after switching away from the repeated EROFS test loop.",
            experience_kind: "execution_pattern",
            confidence_signal: "supported_by_objective_success",
            validation_state: "pending_reuse_validation"
          }
        });
      }

      return geminiJsonResponse({
        trigger_conditions: secondPrompt
          ? "An auth regression review hits the same read-only EROFS loop before edits."
          : "A read-only or sandboxed test run hits EROFS before any file edits.",
        success_criteria: "The regression investigation moves forward without repeating the same EROFS loop.",
        risk_level: "medium",
        trigger_pattern: "When read-only EROFS stops a focused test run before any file edits",
        compact_hint: "Do not keep rerunning the focused test under EROFS; switch to static inspection or a writable cache path first.",
        goal: "Break out of the repeated EROFS loop before widening the investigation.",
        recommended_steps: [
          "Confirm the failure is EROFS in a read-only workspace.",
          "Switch to static inspection or a writable cache path."
        ],
        avoid_steps: ["Do not keep rerunning the same focused test under the same read-only constraints."],
        fallback_steps: ["If a writable cache path is unavailable, continue with static analysis only."],
        success_signal: "The next diagnostic step is confirmed without repeating the same EROFS loop.",
        evidence_summary: secondPrompt
          ? "A second same-family regression resolved by leaving the repeated EROFS loop immediately."
          : "A read-only regression review only progressed after switching away from the repeated EROFS test loop.",
        experience_kind: "execution_pattern",
        confidence_signal: "supported_by_objective_success",
        validation_state: "pending_reuse_validation"
      });
    });

    const pluginInstance = createExperiencePlugin(
      {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3,
        distillerProvider: "gemini",
        distillerModel: "gemini-3-flash-preview",
        distillationAuthMode: "api_key",
        distillationMode: "llm",
        distillationAllowPassthrough: true,
        distillationAutoDrain: true
      },
      undefined,
      {
        homeDir: runtimeDir,
        env: {
          GEMINI_API_KEY: "secret"
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        disableBackgroundLearning: false,
        disableHybridPosttask: true
      }
    );

    pluginInstance.register({
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    const finalize = handlers.get("message_sent");
    expect(finalize).toBeTypeOf("function");

    await finalize?.(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Investigate the read-only EROFS regression before any edits and identify the first safe diagnostic step." }]
          },
          {
            role: "toolResult",
            toolCallId: "call_erofs_a",
            toolName: "exec",
            content: [{ type: "text", text: "Vitest failed with EROFS in the read-only workspace." }],
            details: {
              status: "completed",
              exitCode: 0,
              aggregated: "Vitest failed with EROFS in the read-only workspace."
            },
            isError: false
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "Switching to static inspection clarified the next diagnostic step." }]
          }
        ]
      },
      {
        sessionId: "organic-erofs-a",
        workspaceDir: "/tmp/repo"
      }
    );
    await (pluginInstance as unknown as {
      runtime: { waitForBackgroundLearning: () => Promise<void> };
    }).runtime.waitForBackgroundLearning();

    await finalize?.(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Review the authentication regression when the same read-only EROFS loop appears before edits." }]
          },
          {
            role: "toolResult",
            toolCallId: "call_erofs_b",
            toolName: "exec",
            content: [{ type: "text", text: "The auth regression hit the same EROFS loop until the review switched to static inspection." }],
            details: {
              status: "completed",
              exitCode: 0,
              aggregated: "The auth regression hit the same EROFS loop until the review switched to static inspection."
            },
            isError: false
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "The regression review moved forward after leaving the EROFS loop." }]
          }
        ]
      },
      {
        sessionId: "organic-erofs-b",
        workspaceDir: "/tmp/repo"
      }
    );
    await (pluginInstance as unknown as {
      runtime: { waitForBackgroundLearning: () => Promise<void> };
    }).runtime.waitForBackgroundLearning();

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeRows = db.prepare(
        `SELECT id, state, support_count, merge_decision
         FROM experience_nodes
         WHERE compact_hint LIKE '%EROFS%'
         ORDER BY updated_at DESC`
      ).all() as Array<{
        id: string;
        state: string;
        support_count: number;
        merge_decision: string | null;
      }>;

      expect(nodeRows).toHaveLength(1);
      expect(nodeRows[0]).toEqual({
        id: nodeRows[0].id,
        state: "active",
        support_count: 2,
        merge_decision: "UPDATE"
      });
    });
  });

  it("does not wait for background learning before the finalize hook returns", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();
    const pluginInstance = createExperiencePlugin(
      {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3,
        distillationAutoDrain: false
      }
    );
    let releaseWait: (() => void) | undefined;
    const waitForBackgroundLearning = new Promise<void>((resolve) => {
      releaseWait = resolve;
    });
    (pluginInstance as unknown as {
      runtime: {
        waitForBackgroundLearning: () => Promise<void>;
      };
    }).runtime.waitForBackgroundLearning = vi.fn(async () => waitForBackgroundLearning);

    pluginInstance.register({
      on(event, handler) {
        handlers.set(event, handler);
      }
    });

    const finalize = handlers.get("message_sent");
    expect(finalize).toBeTypeOf("function");

    let resolved = false;
    const finalizeResult = finalize?.(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Correction: the UI technically works, but the real fix belongs in provider routing." }]
          },
          {
            role: "toolResult",
            toolCallId: "call_provider_probe_wait",
            toolName: "exec",
            content: [{ type: "text", text: "Provider routing now matches the requested model-selection behavior." }],
            details: {
              status: "completed",
              exitCode: 0,
              aggregated: "Provider routing now matches the requested model-selection behavior."
            },
            isError: false
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "The provider-routing fix is now behaving correctly." }]
          }
        ]
      },
      {
        sessionId: "expectation-runtime-wait",
        workspaceDir: "/tmp/repo"
      }
    );
    const finalizePromise = Promise.resolve(finalizeResult).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolved).toBe(true);

    releaseWait?.();
    await finalizePromise;
  });

  it("persists feedback timestamps when injected turns succeed uncertainly or fail harmfully", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

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
      result: { exitCode: 1, output: "Command failed" },
      success: false
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

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
      expect(nodeCount.count).toBe(1);
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

    await waitFor(() => {
      const nodeRow = db
        .prepare("SELECT usage_count, helped_count FROM experience_nodes ORDER BY updated_at DESC LIMIT 1")
        .get() as { usage_count: number; helped_count: number };
      expect(nodeRow.usage_count).toBe(1);
      expect(nodeRow.helped_count).toBe(0);
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

    await waitFor(() => {
      const nodeRow = db
        .prepare(
          "SELECT usage_count, helped_count, harmed_count, last_used_at, last_helped_at, last_harmed_at, state, delivery_state FROM experience_nodes WHERE task_type = 'test_debug' AND node_type = 'strategy' LIMIT 1"
        )
        .get() as {
          usage_count: number;
          helped_count: number;
          harmed_count: number;
          last_used_at: string | null;
          last_helped_at: string | null;
          last_harmed_at: string | null;
          state: string;
          delivery_state: string;
        };

      expect(nodeRow.usage_count).toBe(2);
      expect(nodeRow.helped_count).toBe(0);
      expect(nodeRow.harmed_count).toBe(1);
      expect(nodeRow.last_used_at).toBeTruthy();
      expect(nodeRow.last_helped_at).toBeFalsy();
      expect(nodeRow.last_harmed_at).toBeTruthy();
      expect(nodeRow.state).toBe("candidate");
      expect(nodeRow.delivery_state).toBe("quarantined");
    });
  });

  it("keeps a meta-origin injected priority candidate below active state after the first automatic uncertain signal", async () => {
    const runtimeDir = makeTempDir();
    const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
    const handlers = new Map<string, Handler>();

    createExperiencePlugin(
      {
        dataDir: join(runtimeDir, "data"),
        sqlitePath,
        triggerThreshold: 0.6,
        maxHints: 3
      },
      undefined,
      { disableBackgroundLearning: false }
    ).register({
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
    const db = new DatabaseSync(sqlitePath);
    const scope = resolveScope("/tmp/repo");
    const nodeRepo = new NodeRepository(db);
    db.prepare(
      `INSERT INTO experience_input_records
        (record_id, scope_id, session_id, task_type, task_summary, outcome_signal, context_summary, evidence_json, injected_node_ids_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "input_meta_origin_runtime",
      scope.scope_id,
      "session_meta_origin_runtime",
      "general",
      "Review the weekly audit and inspect the latest doctor output before changing retrieval policy.",
      "success",
      "This is an audit of retrieval quality and host readiness.",
      "[]",
      "[]",
      "2026-04-03T00:00:00.000Z"
    );

    const timestamp = nowIso();
    nodeRepo.upsert({
      id: "node_meta_runtime_feedback",
      node_type: "strategy",
      scope_id: scope.scope_id,
      task_type: "test_debug",
      trigger_pattern: "Fix the failing vitest auth test",
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
      retrieval_text: "Fix the failing vitest auth test\nRun the failing auth test before editing and verify after the fix.",
      source_kind: "system_derived",
      origin_record_ids: ["input_meta_origin_runtime"],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "priority_candidate",
      promotion_signal: "high_value",
      priority_promotion_applied: true,
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

    await beforePromptBuild?.({
      session: { key: "helped-meta-promotion" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "helped-meta-promotion",
      tool: { name: "exec" },
      result: { exitCode: 0, output: "/tmp/repo" },
      success: true
    });
    await finalize?.({
      session: { key: "helped-meta-promotion" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });

    await waitFor(() => {
      const nodeRow = db
        .prepare(
          "SELECT usage_count, helped_count, support_count, state, delivery_state FROM experience_nodes WHERE id = 'node_meta_runtime_feedback' LIMIT 1"
        )
        .get() as {
          usage_count: number;
          helped_count: number;
          support_count: number;
          state: string;
          delivery_state: string;
        };

      expect(nodeRow.usage_count).toBe(1);
      expect(nodeRow.helped_count).toBe(0);
      expect(nodeRow.support_count).toBe(1);
      expect(nodeRow.state).toBe("priority_candidate");
      expect(nodeRow.delivery_state).toBe("conservative_only");
    });
  });

  it("preserves prior feedback counters when a matching candidate is stored again", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

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
      result: { exitCode: 1, output: "Command failed" },
      success: false
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

    const db = new DatabaseSync(sqlitePath);
    await waitFor(() => {
      const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number };
      expect(nodeCount.count).toBe(1);
    });

    await beforePromptBuild?.({
      session: { key: "helped-preserve" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "helped-preserve",
      tool: { name: "exec" },
      result: { exitCode: 1, output: "Command failed" },
      success: false
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

    await waitFor(() => {
      const nodeRow = db
        .prepare("SELECT usage_count, helped_count FROM experience_nodes WHERE task_type = 'test_debug' AND node_type = 'strategy' LIMIT 1")
        .get() as { usage_count: number; helped_count: number };
      expect(nodeRow.usage_count).toBe(1);
      expect(nodeRow.helped_count).toBe(0);
    });

    await beforePromptBuild?.({
      session: { key: "helped-preserve-2" },
      workspace: { cwd: "/tmp/repo" },
      message: { content: "Fix the failing vitest auth test" }
    });
    await persistToolResult?.({
      sessionKey: "helped-preserve-2",
      tool: { name: "exec" },
      result: { exitCode: 1, output: "Command failed" },
      success: false
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

    await waitFor(() => {
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
      expect(nodeRow.helped_count).toBe(0);
      expect(nodeRow.harmed_count).toBe(0);
      expect(nodeRow.support_count).toBe(3);
    });
  });

  it("ignores exploratory warning noise but stores terminal failure warnings", async () => {
    const runtimeDir = makeTempDir();
    const { sqlitePath, handlers } = registerPluginRuntime(runtimeDir);

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
      tool: { name: "apply_patch" },
      result: { exitCode: 0, output: "Applied patch to narrow the failure." },
      success: true
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
    let warningRows: Array<{
      id: string;
      compact_hint: string;
      evidence_summary: string;
      support_count: number;
    }> = [];
    await waitFor(() => {
      warningRows = db
        .prepare(
          "SELECT id, compact_hint, evidence_summary, support_count FROM experience_nodes WHERE task_type = 'test_debug' AND node_type = 'warning' ORDER BY updated_at DESC"
        )
        .all() as Array<{
          id: string;
          compact_hint: string;
          evidence_summary: string;
          support_count: number;
        }>;
      expect(warningRows.length).toBe(1);
    });

    expect(warningRows[0]?.compact_hint).toContain("process");
    expect(warningRows[0]?.compact_hint).toContain("narrow");
    expect(warningRows[0]?.evidence_summary).toContain("process failed");
    expect(warningRows[0]?.support_count).toBe(1);
  });
});
