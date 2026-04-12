import type { SpawnSyncReturns } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCodexCommand } from "../../src/cli/commands/codex.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
  process.exitCode = undefined;
});

describe("codex exec wrapper command", () => {
  it("prints usage when no prompt is provided", async () => {
    await runCodexCommand("exec", ["-C", "/repo"]);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Usage: ee codex exec [codex exec options...] "<prompt>"'
    );
  });

  it("rejects stdin prompts in the first phase", async () => {
    await runCodexCommand("exec", ["-C", "/repo", "-"]);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Usage: ee codex exec [codex exec options...] "<prompt>"'
    );
  });

  it("wraps a child codex exec run with outer ExperienceEngine lifecycle ownership", async () => {
    const lookupHints = vi.fn(async () => ({
      mode: "inject_conservative" as const,
      text: "Run the failing auth test before editing and verify after the fix.",
      notice: "[ExperienceEngine] Injected 1 strategy hint for this task.",
      injectedNodeIds: ["node_exec"]
    }));
    const recordToolResult = vi.fn(async () => ({
      status: "recorded",
      toolName: "codex_exec",
      eventStatus: "success"
    }));
    const finalizeTask = vi.fn(async () => ({
      status: "finalized",
      outcomeSignal: "success",
      injectedNodeIds: ["node_exec"],
      recordedToolEvents: 1
    }));
    const cleanup = vi.fn();
    const spawnSync = vi.fn<
      (command: string, args: string[], options: Record<string, unknown>) => SpawnSyncReturns<string>
    >(() => ({
      pid: 123,
      output: [],
      stdout: "",
      stderr: "",
      status: 0,
      signal: null
    }));

    await runCodexCommand(
      "exec",
      ["-C", "/repo", "-s", "read-only", "Fix the failing auth test"],
      {
        createSessionId: () => "codex_exec_test_session",
        createBehaviorLoop: () => ({
          lookupHints,
          recordToolResult,
          finalizeTask,
          waitForBackgroundLearning: vi.fn(async () => {})
        }),
        createIsolatedConfig: () => ({
          configPath: "/tmp/codex-wrapper.toml",
          cleanup
        }),
        spawnSync,
        cwd: () => "/workspace"
      }
    );

    expect(lookupHints).toHaveBeenCalledWith({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex_exec_test_session"
    });
    expect(spawnSync).toHaveBeenCalledWith(
      "codex",
      [
        "exec",
        "-C",
        "/repo",
        "-s",
        "read-only",
        expect.stringContaining("ExperienceEngine lifecycle is managed externally for this run.")
      ],
      expect.objectContaining({
        cwd: "/repo",
        stdio: ["ignore", "inherit", "inherit"],
        env: expect.objectContaining({
          CODEX_CONFIG_PATH: "/tmp/codex-wrapper.toml"
        })
      })
    );
    expect(spawnSync.mock.calls[0]?.[1]?.at(-1)).toContain("Run the failing auth test before editing and verify after the fix.");
    expect(recordToolResult).toHaveBeenCalledWith({
      sessionId: "codex_exec_test_session",
      toolName: "codex_exec",
      inputSummary: "codex exec -C /repo -s read-only",
      outputSummary: "codex exec exited with code 0.",
      errorSignature: undefined,
      exitCode: 0,
      status: "success"
    });
    expect(finalizeTask).toHaveBeenCalledWith({
      sessionId: "codex_exec_test_session",
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      contextSummary: "Wrapped codex exec completed with exit code 0."
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it("finalizes and propagates a non-zero child exit status", async () => {
    const lookupHints = vi.fn(async () => ({
      mode: "skip" as const,
      text: undefined,
      notice: undefined,
      injectedNodeIds: []
    }));
    const recordToolResult = vi.fn(async () => ({
      status: "recorded",
      toolName: "codex_exec",
      eventStatus: "failure"
    }));
    const finalizeTask = vi.fn(async () => ({
      status: "finalized",
      outcomeSignal: "failure",
      injectedNodeIds: [],
      recordedToolEvents: 1
    }));
    const cleanup = vi.fn();
    const spawnSync = vi.fn<
      (command: string, args: string[], options: Record<string, unknown>) => SpawnSyncReturns<string>
    >(() => ({
      pid: 123,
      output: [],
      stdout: "",
      stderr: "",
      status: 2,
      signal: null
    }));

    await runCodexCommand("exec", ["Fix the failing auth test"], {
      createSessionId: () => "codex_exec_failure_session",
      createBehaviorLoop: () => ({
        lookupHints,
        recordToolResult,
        finalizeTask,
        waitForBackgroundLearning: vi.fn(async () => {})
      }),
      createIsolatedConfig: () => ({
        configPath: "/tmp/codex-wrapper.toml",
        cleanup
      }),
      spawnSync,
      cwd: () => "/repo"
    });

    expect(recordToolResult).toHaveBeenCalledWith({
      sessionId: "codex_exec_failure_session",
      toolName: "codex_exec",
      inputSummary: "codex exec",
      outputSummary: "codex exec exited with code 2.",
      errorSignature: "codex_exit_2",
      exitCode: 2,
      status: "failure"
    });
    expect(finalizeTask).toHaveBeenCalledWith({
      sessionId: "codex_exec_failure_session",
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      contextSummary: "Wrapped codex exec completed with exit code 2."
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(2);
  });
});
