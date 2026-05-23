import { describe, expect, it } from "vitest";
import {
  buildClaudeMarketplaceAddCommand,
  buildClaudePluginInstallCommand,
  buildCodexManualFallbackCommand,
  buildHostPostInstallOrientation,
  buildCodexPublicInstallCommand,
  buildHostInstallGuidance,
  buildOpenClawPublicInstallCommand
} from "../../src/install/public-install.js";

describe("public install guidance", () => {
  it("builds the documented Claude marketplace distribution commands", () => {
    expect(buildClaudeMarketplaceAddCommand()).toBe(
      "/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git"
    );
    expect(buildClaudePluginInstallCommand()).toBe("/plugin install experienceengine@experienceengine");
  });

  it("summarizes current host setup readiness by host", () => {
    expect(buildHostInstallGuidance()).toEqual({
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
      },
      antigravity: {
        ready: true,
        commands: [
          "ee install antigravity",
          "ee agy exec -C <project-path> \"<prompt>\""
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

  it("builds post-install orientation without changing host-native install priority", () => {
    expect(buildHostPostInstallOrientation()).toEqual({
      openclaw: {
        setupState: "Installed",
        nextStep:
          "Restart the OpenClaw gateway. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
      },
      codex: {
        setupState: "Installed",
        nextStep:
          "Start a new Codex session in this repo. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
      },
      "claude-code": {
        setupState: "Installed",
        nextStep:
          "Start a new Claude Code session. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
      },
      antigravity: {
        setupState: "Installed",
        nextStep:
          "Use `ee agy exec -C <project-path>` for headless CLI runs, or run `ee antigravity activate-project -C <project-path>` before opening Agent Desktop in a new project. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
      }
    });
  });
});
