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
    expect(output).toContain("Get started:");
    expect(output).toContain("ee install <openclaw|claude-code|codex>");
    expect(output).toContain("ee init");
    expect(output).toContain("ee doctor <openclaw|claude-code|codex>");
    expect(output).toContain("See what ExperienceEngine is doing:");
    expect(output).toContain("ee status");
    expect(output).toContain("ee inspect --last");
    expect(output).toContain("Fix a problem:");
    expect(output).toContain("ee upgrade <openclaw|claude-code|codex>");
    expect(output).toContain("Routine review/feedback in Codex and Claude Code stays in the host first.");
    expect(output).toContain("OpenClaw uses the same product language, but CLI/operator fallback is still more visible today.");
    expect(output).toContain("Advanced operator commands:");
    expect(output).toContain("Usage: ee <");

    consoleLog.mockRestore();
  });
});
