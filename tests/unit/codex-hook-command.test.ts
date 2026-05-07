import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainCodexHookQueue, handleCodexHookPayload } from "../../src/cli/commands/codex-hook.js";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(() => ({
    unref: vi.fn()
  }))
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

const originalExperienceEngineHome = process.env.EXPERIENCE_ENGINE_HOME;
const originalCodexHookTrace = process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE;
const originalCodexHookTracePath = process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE_PATH;

let homeDir: string | undefined;

const behaviorLoop = () => ({
  lookupHints: vi.fn(async () => ({
    mode: "inject",
    text: "Reuse the established installer helper.",
    notice: "[ExperienceEngine] Injected guidance.",
    injectedNodeIds: ["node_1"]
  })),
  recordToolResult: vi.fn(async () => ({
    status: "recorded",
    toolName: "Bash",
    eventStatus: "success"
  })),
  finalizeTask: vi.fn(async () => ({
    status: "finalized",
    taskType: "integration_fix",
    outcomeSignal: "success",
    injectedNodeIds: ["node_1"],
    recordedToolEvents: 1
  }))
});

describe("Codex hook command", () => {
  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "experienceengine-codex-hook-"));
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    spawnMock.mockClear();
  });

  afterEach(() => {
    if (originalExperienceEngineHome === undefined) {
      delete process.env.EXPERIENCE_ENGINE_HOME;
    } else {
      process.env.EXPERIENCE_ENGINE_HOME = originalExperienceEngineHome;
    }
    if (originalCodexHookTrace === undefined) {
      delete process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE;
    } else {
      process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE = originalCodexHookTrace;
    }
    if (originalCodexHookTracePath === undefined) {
      delete process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE_PATH;
    } else {
      process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE_PATH = originalCodexHookTracePath;
    }
    if (homeDir && existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
    homeDir = undefined;
  });

  it("returns Codex-valid additional context for UserPromptSubmit", async () => {
    const loop = behaviorLoop();
    const output = await handleCodexHookPayload(
      {
        hook_event_name: "UserPromptSubmit",
        turn_id: "turn_1",
        cwd: "/repo",
        prompt: "Fix the installer"
      },
      loop as never
    );

    expect(loop.lookupHints).toHaveBeenCalledWith({
      cwd: "/repo",
      prompt: "Fix the installer",
      sessionId: "turn_1"
    });
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "[ExperienceEngine] Injected guidance.\nExperienceEngine guidance:\nReuse the established installer helper."
      }
    });
  });

  it("records PostToolUse results without emitting unsupported plain text", async () => {
    const loop = behaviorLoop();
    const output = await handleCodexHookPayload(
      {
        hook_event_name: "PostToolUse",
        turn_id: "turn_1",
        tool_name: "Bash",
        tool_input: { command: "pnpm test" },
        tool_response: { exit_code: 0, stdout: "ok" }
      },
      loop as never
    );

    expect(output).toEqual({});
    expect(loop.recordToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "turn_1",
        toolName: "Bash",
        exitCode: 0,
        status: "success"
      })
    );
  });

  it("returns an empty JSON object for Stop after finalization", async () => {
    const loop = behaviorLoop();
    const output = await handleCodexHookPayload(
      {
        hook_event_name: "Stop",
        turn_id: "turn_1",
        cwd: "/repo",
        last_assistant_message: "Done"
      },
      loop as never
    );

    expect(output).toEqual({});
    expect(loop.finalizeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "turn_1",
        cwd: "/repo",
        contextSummary: "Done"
      })
    );
  });

  it("queues PostToolUse by default and drains it through the behavior loop", async () => {
    const output = await handleCodexHookPayload({
      hook_event_name: "PostToolUse",
      turn_id: "turn_1",
      tool_name: "Bash",
      tool_input: { command: "pnpm test" },
      tool_response: { exit_code: 0, stdout: "ok" }
    });

    expect(output).toEqual({});
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(["codex-hook", "--drain-queue"]),
      expect.objectContaining({ detached: true, stdio: "ignore" })
    );

    const queuePath = join(process.env.EXPERIENCE_ENGINE_HOME ?? "", "hook-queue");
    expect(readdirSync(queuePath).filter((entry) => entry.endsWith(".json"))).toHaveLength(1);

    const loop = behaviorLoop();
    await expect(drainCodexHookQueue(loop as never)).resolves.toEqual({ processed: 1, failed: 0 });
    expect(loop.recordToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "turn_1",
        toolName: "Bash",
        exitCode: 0,
        status: "success"
      })
    );
    expect(readdirSync(queuePath).filter((entry) => entry.endsWith(".json"))).toHaveLength(0);
  });

  it("writes redacted hook fingerprints only when trace is explicitly enabled", async () => {
    const tracePath = join(homeDir ?? "", "codex-hook-trace.jsonl");

    await handleCodexHookPayload(
      {
        hook_event_name: "PreToolUse",
        turn_id: "turn_1",
        tool_name: "Bash",
        tool_input: { command: "echo secret" }
      },
      behaviorLoop() as never
    );
    expect(existsSync(tracePath)).toBe(false);

    process.env.EXPERIENCE_ENGINE_CODEX_HOOK_TRACE_PATH = tracePath;
    await handleCodexHookPayload(
      {
        hook_event_name: "PreToolUse",
        turn_id: "turn_1",
        tool_name: "Bash",
        tool_input: { command: "echo secret" }
      },
      behaviorLoop() as never
    );

    const lines = readFileSync(tracePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record).toEqual(expect.objectContaining({
      event: "PreToolUse",
      turnId: "turn_1",
      toolName: "Bash",
      queued: false
    }));
    expect(record.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(lines[0]).not.toContain("echo secret");
  });
});
