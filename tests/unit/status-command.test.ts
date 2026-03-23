import { afterEach, describe, expect, it, vi } from "vitest";
import { runStatusCommand } from "../../src/cli/commands/status.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
  vi.resetModules();
  vi.unmock("../../src/cli/commands/status.js");
});

vi.mock("../../src/install/host-detection.js", () => ({
  detectAvailableHosts: () => [
    { id: "codex", label: "Codex", command: "codex" },
    { id: "openclaw", label: "OpenClaw", command: "openclaw" }
  ]
}));

vi.mock("../../src/install/codex-installer.js", () => ({
  inspectCodexInstall: () => ({
    installed: true
  })
}));

vi.mock("../../src/install/claude-code-doctor.js", () => ({
  inspectClaudeCodeInstall: () => ({
    installed: false
  })
}));

vi.mock("../../src/install/openclaw-installer.js", () => ({
  inspectOpenClawInstall: () => ({
    installed: true
  })
}));

vi.mock("../../src/config/load-config.js", () => ({
  loadConfig: () => ({
    distillerProvider: "gemini",
    distillerModel: "gemini-3.1-flash-lite-preview",
    embeddingProvider: "api"
  })
}));

describe("status command", () => {
  it("prints a compact product-facing summary", () => {
    process.env.EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER = "gemini";
    runStatusCommand();

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["ExperienceEngine status:"],
        ["- Available host CLIs: codex, openclaw"],
        ["- Installed hosts: codex, openclaw"],
        ["- Distillation provider: gemini"],
        ["- Distillation model: gemini-3.1-flash-lite-preview"],
        ["- Embedding provider mode: api"],
        ["- Embedding API provider override: gemini"]
      ])
    );
  });
});
