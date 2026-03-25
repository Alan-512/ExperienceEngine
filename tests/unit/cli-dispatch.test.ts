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

    expect(consoleLog).toHaveBeenCalledTimes(1);
    expect(String(consoleLog.mock.calls[0]?.[0] ?? "")).not.toContain("pack <");

    consoleLog.mockRestore();
  });
});
