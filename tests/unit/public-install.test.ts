import { describe, expect, it } from "vitest";
import {
  buildClaudeMarketplaceAddCommand,
  buildClaudePluginInstallCommand,
  buildCodexManualFallbackCommand,
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
        ready: true,
        command: "openclaw plugins install @alan512/experienceengine"
      },
      codex: {
        ready: true,
        commands: [
          "ee install codex",
          "codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server"
        ]
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

  it("keeps the raw Codex MCP command as a manual fallback", () => {
    expect(buildCodexPublicInstallCommand()).toBe("ee install codex");
    expect(buildCodexManualFallbackCommand()).toBe(
      "codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server"
    );
  });
});
