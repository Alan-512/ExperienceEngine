import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unmock("../../src/cli/commands/init.js");
  vi.unmock("../../src/cli/commands/pack.js");
});

describe("CLI dispatch init", () => {
  it("loads only the requested command handler for init", async () => {
    const runInitCommand = vi.fn(async () => {});

    vi.doMock("../../src/cli/commands/init.js", () => ({
      runInitCommand
    }));
    vi.doMock("../../src/cli/commands/pack.js", () => {
      throw new Error("pack command should not be imported");
    });

    const { runCliCommand } = await import("../../src/cli/dispatch.js");
    await runCliCommand("init", ["show"]);

    expect(runInitCommand).toHaveBeenCalledWith("show", []);
  });
});
