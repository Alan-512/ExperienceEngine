import { describe, expect, it } from "vitest";
import {
  buildClaudeMarketplaceAddCommand,
  buildClaudePluginInstallCommand,
  buildCodexPublicInstallCommand,
  buildHostNativeInstallGuidance,
  buildOpenClawPublicInstallCommand
} from "../../src/install/public-install.js";

describe("public install guidance", () => {
  it("builds the documented OpenClaw one-step install command", () => {
    expect(buildOpenClawPublicInstallCommand()).toBe("openclaw plugins install experienceengine");
  });

  it("builds the documented Codex one-step install command", () => {
    expect(buildCodexPublicInstallCommand()).toBe(
      "codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y experienceengine codex-mcp-server"
    );
  });

  it("builds the documented Claude marketplace distribution commands", () => {
    expect(buildClaudeMarketplaceAddCommand()).toBe("/plugin marketplace add Alan-512/ExperienceEngine");
    expect(buildClaudePluginInstallCommand()).toBe("/plugin install experienceengine@experienceengine");
  });

  it("summarizes current host-native readiness by host", () => {
    expect(buildHostNativeInstallGuidance()).toEqual({
      openclaw: {
        ready: true,
        command: "openclaw plugins install experienceengine"
      },
      codex: {
        ready: true,
        command:
          "codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y experienceengine codex-mcp-server"
      },
      "claude-code": {
        ready: false,
        reason:
          "Claude Code now ships an official marketplace manifest and npm-backed plugin package, but Claude's official install flow still requires marketplace add plus plugin install rather than a single one-step command.",
        commands: [
          "/plugin marketplace add Alan-512/ExperienceEngine",
          "/plugin install experienceengine@experienceengine"
        ]
      }
    });
  });
});
