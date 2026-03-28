import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unmock("../../src/cli/commands/claude-hook.js");
});

describe("CLI dispatch", () => {
  it("loads only the requested command handler for claude-hook", async () => {
    const runClaudeHookCommand = vi.fn(async () => {});

    vi.doMock("../../src/cli/commands/claude-hook.js", () => ({
      runClaudeHookCommand
    }));

    const { runCliCommand } = await import("../../src/cli/dispatch.js");
    await runCliCommand("claude-hook", []);

    expect(runClaudeHookCommand).toHaveBeenCalledTimes(1);
  });

  it("does not advertise the removed pack route in CLI usage", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const { printCliUsage } = await import("../../src/cli/dispatch.js");
    printCliUsage();

    const output = consoleLog.mock.calls.map((call) => String(call[0] ?? "")).join("\n");
    expect(output).not.toContain("pack <");
    expect(output).toContain("Common first steps:");
    expect(output).toContain("ee install codex");
    expect(output).toContain("ee init");
    expect(output).toContain("ee doctor codex");
    expect(output).toContain("Routine follow-up in Codex/Claude Code:");
    expect(output).toContain("Ask the host what ExperienceEngine just injected");
    expect(output).toContain("CLI fallback/operator path:");
    expect(output).toContain("Advanced usage:");

    consoleLog.mockRestore();
  });
});
