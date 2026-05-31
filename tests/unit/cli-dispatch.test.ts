import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unmock("../../src/cli/commands/claude-hook.js");
  vi.unmock("../../src/cli/commands/codex.js");
  vi.unmock("../../src/cli/commands/config.js");
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

  it("loads only the requested command handler for codex exec", async () => {
    const runCodexCommand = vi.fn(async () => {});

    vi.doMock("../../src/cli/commands/codex.js", () => ({
      runCodexCommand
    }));

    const { runCliCommand } = await import("../../src/cli/dispatch.js");
    await runCliCommand("codex", ["exec", "-C", "/repo", "Say ok"]);

    expect(runCodexCommand).toHaveBeenCalledTimes(1);
    expect(runCodexCommand).toHaveBeenCalledWith("exec", ["-C", "/repo", "Say ok"]);
  });

  it("rejoins comma-list config values split by the shell", async () => {
    const runConfigCommand = vi.fn(async () => {});

    vi.doMock("../../src/cli/commands/config.js", () => ({
      runConfigCommand
    }));

    const { runCliCommand } = await import("../../src/cli/dispatch.js");
    await runCliCommand("config", ["set", "distillation.fallback_codes", "429", "503"]);
    await runCliCommand("config", [
      "set",
      "distillation.fallback_chain",
      "gemini:gemini-2.5-flash",
      "openai:gpt-4o-mini"
    ]);

    expect(runConfigCommand).toHaveBeenNthCalledWith(1, "set", "distillation.fallback_codes", "429,503");
    expect(runConfigCommand).toHaveBeenNthCalledWith(
      2,
      "set",
      "distillation.fallback_chain",
      "gemini:gemini-2.5-flash,openai:gpt-4o-mini"
    );
  });

  it("does not advertise the removed pack route in CLI usage", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const { printCliUsage } = await import("../../src/cli/dispatch.js");
    printCliUsage();

    const output = consoleLog.mock.calls.map((call) => String(call[0] ?? "")).join("\n");
    expect(output).not.toContain("pack <");
    expect(output).toContain("Get started:");
    expect(output).toContain("OpenClaw (host-native plugin): openclaw plugins install @alan512/experienceengine");
    expect(output).toContain("Claude Code (host-native marketplace): /plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git");
    expect(output).toContain("Then install the plugin: /plugin install experienceengine@experienceengine");
    expect(output).toContain("Codex (EE-managed wiring): ee install codex");
    expect(output).toContain("ee init");
    expect(output).toContain("Routine workflows:");
    expect(output).toContain("Host-first review/feedback");
    expect(output).toContain("ee status | ee doctor <openclaw|claude-code|codex|antigravity> | ee inspect --last | ee helped | ee harmed");
    expect(output).toContain("ee inspect --last");
    expect(output).toContain("Operator workflows:");
    expect(output).toContain("ee install|upgrade|repair <openclaw|claude-code|codex|antigravity>");
    expect(output).toContain("ee inspect review | ee inspect hygiene | ee inspect export-drafts | ee inspect repo");
    expect(output).toContain("Advanced / experimental workflows:");
    expect(output).toContain("Full command reference:");
    expect(output).toContain("Usage: ee <");

    consoleLog.mockRestore();
  });
});
