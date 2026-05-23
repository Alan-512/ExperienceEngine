import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runAgyCommand, parseAgyExecArgs } from "../../src/cli/commands/agy-exec.js";

const originalExitCode = process.exitCode;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

beforeEach(() => {
  process.exitCode = undefined;
  consoleLogSpy.mockClear();
});

afterEach(() => {
  process.exitCode = originalExitCode;
  consoleLogSpy.mockClear();
});

describe("agy exec wrapper", () => {
  it("parses project directory separately from agy passthrough args", () => {
    const parsed = parseAgyExecArgs(
      ["-C", "D:/repo", "--sandbox", "read-only", "Read README.md"],
      "C:/Users/123"
    );

    expect(parsed.cwd).toBe("D:\\repo");
    expect(parsed.passthroughArgs).toEqual(["--sandbox", "read-only"]);
    expect(parsed.prompt).toBe("Read README.md");
  });

  it("activates project wiring and invokes agy with --add-dir", async () => {
    const ensure = vi.fn().mockResolvedValue({
      cwd: "D:\\repo",
      mcpRegistered: true,
      hooksRegistered: true,
      lifecycleMode: "host_native_hooks_validated",
      hookContractSpikePassed: true,
      serverName: "experienceengine",
      serverCommand: "node dist/cli/index.js mcp-server"
    });
    const spawn = vi.fn().mockReturnValue({ status: 0 });

    await runAgyCommand("exec", ["-C", "D:/repo", "Read README.md"], {
      cwd: () => "C:\\Users\\123",
      env: () => ({ EXPERIENCE_ENGINE_HOME: "C:\\Users\\123\\.experienceengine" }),
      inspectAntigravityGlobalWiring: () => ({ hooksRegistered: false }) as never,
      ensureAntigravityProjectWiring: ensure,
      spawnSync: spawn
    });

    expect(ensure).toHaveBeenCalledWith({
      cwd: "D:\\repo",
      env: { EXPERIENCE_ENGINE_HOME: "C:\\Users\\123\\.experienceengine" }
    });
    expect(spawn).toHaveBeenCalledWith(
      "agy",
      [
        "--add-dir",
        "D:\\repo",
        "--print",
        "--dangerously-skip-permissions",
        "--print-timeout",
        "5m",
        "Read README.md"
      ],
      {
        cwd: "D:\\repo",
        env: {
          EXPERIENCE_ENGINE_HOME: "C:\\Users\\123\\.experienceengine",
          EXPERIENCE_ENGINE_PROJECT_CWD: "D:\\repo",
          EXPERIENCE_ENGINE_PROMPT: "Read README.md"
        },
        stdio: "inherit"
      }
    );
    expect(process.exitCode).toBe(0);
  });

  it("passes additional agy args before the prompt", async () => {
    const spawn = vi.fn().mockReturnValue({ status: 7 });

    await runAgyCommand("exec", ["-C", "D:/repo", "--log-file", "agy.log", "Summarize"], {
      cwd: () => "C:\\Users\\123",
      env: () => ({}),
      inspectAntigravityGlobalWiring: () => ({ hooksRegistered: true }) as never,
      ensureAntigravityProjectWiring: vi.fn().mockResolvedValue({}),
      spawnSync: spawn
    });

    expect(spawn.mock.calls[0][1]).toEqual([
      "--add-dir",
      "D:\\repo",
      "--print",
      "--dangerously-skip-permissions",
      "--print-timeout",
      "5m",
      "--log-file",
      "agy.log",
      "Summarize"
    ]);
    expect(process.exitCode).toBe(7);
  });

  it("prints usage when prompt is missing", async () => {
    await runAgyCommand("exec", ["-C", "D:/repo"], {
      cwd: () => "C:\\Users\\123"
    });

    expect(consoleLogSpy).toHaveBeenCalledWith('Usage: ee agy exec [-C <project>] [agy options...] "<prompt>"');
    expect(process.exitCode).toBe(1);
  });
});
