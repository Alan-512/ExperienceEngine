import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unmock("../../src/cli/commands/pack.js");
  vi.unmock("../../src/cli/commands/claude-hook.js");
});

describe("CLI dispatch", () => {
  it("loads only the requested command handler for claude-hook", async () => {
    const runClaudeHookCommand = vi.fn(async () => {});

    vi.doMock("../../src/cli/commands/claude-hook.js", () => ({
      runClaudeHookCommand
    }));
    vi.doMock("../../src/cli/commands/pack.js", () => {
      throw new Error("pack command should not be imported");
    });

    const { runCliCommand } = await import("../../src/cli/dispatch.js");
    await runCliCommand("claude-hook", []);

    expect(runClaudeHookCommand).toHaveBeenCalledTimes(1);
  });
});
