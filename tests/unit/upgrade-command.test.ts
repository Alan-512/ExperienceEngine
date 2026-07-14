import { afterEach, describe, expect, it, vi } from "vitest";
import { runUpgradeCommand } from "../../src/cli/commands/upgrade.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
});

describe("upgrade command", () => {
  it("upgrades OpenClaw by rerunning install wiring", () => {
    runUpgradeCommand("openclaw", {
      inspectOpenClawInstall: () =>
        ({
          versionStatus: {
            recordedVersion: "0.1.0"
          }
        }) as never,
      installOpenClawAdapter: () =>
        ({
          adapter: "openclaw",
          installedVersion: "0.2.0",
          packageRoot: "/tmp/ExperienceEngine",
          paths: { activeHome: "/tmp/.experienceengine" },
          hostWiring: { restartRecommended: true }
        }) as never
    });

    expect(consoleLogSpy).toHaveBeenCalledWith("Upgraded openclaw adapter.");
    expect(consoleLogSpy).toHaveBeenCalledWith("Version: 0.1.0 -> 0.2.0");
    expect(consoleLogSpy).toHaveBeenCalledWith("OpenClaw gateway restart recommended.");
  });

  it("upgrades Claude Code and prints new-session guidance", () => {
    runUpgradeCommand("claude-code", {
      inspectClaudeCodeInstall: () =>
        ({
          versionStatus: {
            recordedVersion: null
          }
        }) as never,
      installClaudeCodeAdapter: () =>
        ({
          adapter: "claude-code",
          installedVersion: "0.2.0",
          settingsPath: "/tmp/project/.claude/settings.local.json"
        }) as never
    });

    expect(consoleLogSpy).toHaveBeenCalledWith("Upgraded claude-code adapter.");
    expect(consoleLogSpy).toHaveBeenCalledWith("Version: unknown -> 0.2.0");
    expect(consoleLogSpy).toHaveBeenCalledWith("New Claude Code sessions will use the updated hook command.");
  });

  it("upgrades Codex and prints hook review guidance", () => {
    runUpgradeCommand("codex", {
      inspectCodexInstall: () =>
        ({
          versionStatus: {
            recordedVersion: "0.2.0"
          }
        }) as never,
      installCodexAdapter: () =>
        ({
          adapter: "codex",
          installedVersion: "0.3.1",
          runtimeTarget: "posix",
          serverName: "experienceengine",
          hooks: { installedEvents: ["UserPromptSubmit", "PostToolUse", "Stop"] }
        }) as never
    });

    expect(consoleLogSpy).toHaveBeenCalledWith("Upgraded codex adapter.");
    expect(consoleLogSpy).toHaveBeenCalledWith("Version: 0.2.0 -> 0.3.1");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Codex hook review: Open /hooks in Codex and approve the ExperienceEngine hooks (UserPromptSubmit, PostToolUse, Stop)."
    );
  });

  it("shows usage for unsupported targets", () => {
    runUpgradeCommand(undefined);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Usage: ee upgrade openclaw|claude-code|codex|antigravity [--approve-host-security-scan] [--runtime-target posix|windows] [--mcp-only] [--hooks]"
    );
  });
});
