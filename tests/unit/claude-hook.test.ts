import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { processClaudeHookPayload, persistClaudeHookCapture } from "../../src/cli/commands/claude-hook.js";
import { persistClaudeNormalizedEvent } from "../../src/adapters/claude-code/event-store.js";
import { normalizeClaudeHookPayload } from "../../src/adapters/claude-code/hook-normalizer.js";
import { loadClaudeSession } from "../../src/adapters/claude-code/session-store.js";
import { openDatabase } from "../../src/store/sqlite/db.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { loadConfig } from "../../src/config/load-config.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-hook-"));
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

describe("Claude hook capture", () => {
  it("persists hook payload JSON into the Claude adapter capture directory", () => {
    const homeDir = makeTempDir();
    const capturePath = persistClaudeHookCapture(
      JSON.stringify({
        session_id: "session-123",
        hook_event_name: "PostToolUse",
        tool_name: "Bash"
      }),
      { homeDir }
    );

    expect(capturePath).toBeTruthy();
    const captureDir = join(homeDir, ".experienceengine", "adapters", "claude-code", "captures");
    const files = readdirSync(captureDir);
    expect(files).toHaveLength(1);

    const capture = JSON.parse(readFileSync(join(captureDir, files[0]), "utf8")) as {
      payload?: { session_id?: string; hook_event_name?: string; tool_name?: string };
      raw?: string;
    };
    expect(capture.payload?.session_id).toBe("session-123");
    expect(capture.payload?.hook_event_name).toBe("PostToolUse");
    expect(capture.payload?.tool_name).toBe("Bash");
    expect(capture.raw).toContain("session-123");
  });

  it("appends normalized Claude events under the adapter state directory", () => {
    const homeDir = makeTempDir();
    const filePath = persistClaudeNormalizedEvent(
      normalizeClaudeHookPayload({
        hook_event_name: "SessionEnd",
        session_id: "session-789",
        message: "done"
      }),
      { homeDir }
    );

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const event = JSON.parse(lines[0]) as {
      adapter: string;
      eventName: string;
      sessionId?: string;
      promptText?: string;
    };
    expect(event.adapter).toBe("claude-code");
    expect(event.eventName).toBe("SessionEnd");
    expect(event.sessionId).toBe("session-789");
    expect(event.promptText).toBe("done");
  });

  it("persists session state across prompt and tool hooks, then replays on session end", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "session-replay",
        cwd: "/repo",
        prompt: "Fix the failing auth test"
      }),
      { homeDir, env }
    );
    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "session-replay",
        tool_name: "Bash",
        payload: {
          tool_input: { command: "pnpm test" },
          tool_result: { output: "auth test now passes" }
        },
        status: "success"
      }),
      { homeDir, env }
    );

    const stored = loadClaudeSession("session-replay", { homeDir, env });
    expect(stored?.promptContext?.taskSummary).toBe("Fix the failing auth test");
    expect(stored?.toolResults).toHaveLength(1);

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-replay"
      }),
      { homeDir, env }
    );

    expect(loadClaudeSession("session-replay", { homeDir, env })).toBeNull();

    const db = openDatabase(loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME },));
    const row = db
      .prepare(
        "SELECT session_id, task_summary, outcome_signal, evidence_json FROM experience_input_records WHERE session_id = ?"
      )
      .get("session-replay") as
      | {
          session_id: string;
          task_summary: string;
          outcome_signal: string;
          evidence_json: string;
        }
      | undefined;

    expect(row?.session_id).toBe("session-replay");
    expect(row?.task_summary).toBe("Fix the failing auth test");
    expect(row?.outcome_signal).toBe("success");
    expect(row?.evidence_json).toContain("Bash: success: auth test now passes");
  });

  it("replays a real captured Claude UserPromptSubmit payload fixture", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const fixture = JSON.parse(
      readFileSync(
        resolve("tests/fixtures/claude-code/scenario-real-user-prompt-submit.json"),
        "utf8"
      )
    ) as {
      events: Array<unknown>;
    };

    for (const event of fixture.events) {
      await processClaudeHookPayload(JSON.stringify(event), {
        homeDir,
        env
      });
    }

    const files = readdirSync(join(homeDir, ".experienceengine", "captures"));
    expect(files).toHaveLength(1);

    const session = loadClaudeSession("real-session-user-prompt", { homeDir, env });
    expect(session?.promptContext?.userMessage).toBe("Reply with exactly OK.");
    expect(session?.promptContext?.cwd).toBe("/tmp/example-claude-project");
  });
});
