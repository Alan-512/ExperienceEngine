import { describe, expect, it } from "vitest";
import {
  buildClaudeMarketplaceAddCommand,
  buildClaudePluginInstallCommand,
  buildCodexPublicInstallCommand,
  buildHostNativeInstallGuidance,
  buildOpenClawPublicInstallCommand
} from "../../src/install/public-install.js";

describe("public install guidance", () => {
  it("builds the documented Claude marketplace distribution commands", () => {
    expect(buildClaudeMarketplaceAddCommand()).toBe(
      "/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git"
    );
    expect(buildClaudePluginInstallCommand()).toBe("/plugin install experienceengine@experienceengine");
  });

  it("summarizes current host-native readiness by host", () => {
    expect(buildHostNativeInstallGuidance()).toEqual({
      openclaw: {
        ready: false,
        reason:
          "OpenClaw's one-step install command still depends on the public npm package 'experienceengine', which is not published yet.",
        command: "openclaw plugins install experienceengine"
      },
      codex: {
        ready: false,
        reason:
          "Codex's one-step MCP install still depends on running `npx -y experienceengine`, which requires the public npm package to be published first.",
        command:
          "codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y experienceengine codex-mcp-server"
      },
      "claude-code": {
        ready: true,
        commands: [
          "/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git",
          "/plugin install experienceengine@experienceengine"
        ]
      }
    });
  });
});
