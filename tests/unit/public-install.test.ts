import { describe, expect, it } from "vitest";
import {
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
        reason: "Claude Code still needs a marketplace/plugin packaging path to become a true one-step host-native install."
      }
    });
  });
});
