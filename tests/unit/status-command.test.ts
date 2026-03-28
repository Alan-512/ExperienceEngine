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
    installed: true,
    learningLoop: {
      state: "instruction_installed",
      instructionState: "present",
      recentTaskRuns: 0
    }
  })
}));

vi.mock("../../src/install/claude-code-doctor.js", () => ({
  inspectClaudeCodeInstall: () => ({
    installed: true
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
    embeddingProvider: "api",
    embeddingApiProvider: "gemini"
  })
}));

vi.mock("../../src/interaction/service.js", () => ({
  ExperienceInteractionService: class {
    inspectDecisionHealth() {
      return {
        scopeId: "scope_repo",
        recentDecisions: 3,
        recentInjects: 1,
        recentConservativeInjects: 1,
        recentSkips: 1,
        recentFastPathActivations: 1,
        recentRerankParticipations: 2,
        recentQueryRewriteUsages: 1,
        currentPriorityCandidates: 2,
        recentConvergedUpdates: 3,
        recentPriorityPromotions: 1,
        lastDecisionMode: "inject_conservative"
      };
    }

    inspectFirstValueReadiness() {
      return {
        rawRecords: 2,
        taskRuns: 2,
        candidates: 1,
        nodes: 0,
        nextStep:
          "Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence."
      };
    }
  }
}));

describe("status command", () => {
  it("prints a compact product-facing summary", () => {
    runStatusCommand();

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["ExperienceEngine status:"],
        ["- Available host CLIs: codex, openclaw"],
        ["- Installed hosts: codex, claude-code, openclaw"],
        ["- Distillation provider: gemini"],
        ["- Distillation model: gemini-3.1-flash-lite-preview"],
        ["- Embedding provider mode: api"],
        ["- Embedding API provider override: gemini"],
        ["- Codex learning loop: instruction_installed"],
        ["- Codex instruction block: present"],
        ["- Codex task runs in current repo: 0"],
        ["- Recent retrieval decisions in current repo: 3"],
        ["- Recent standard hints: 1"],
        ["- Recent cautious hints: 1"],
        ["- Recent no-hint decisions: 1"],
        ["- Recent fast matches: 1"],
        ["- Recent rerank reviews: 2"],
        ["- Recent query normalizations: 1"],
        ["- Current rising patterns: 2"],
        ["- Recent merged refinements: 3"],
        ["- Recent newly promoted hints: 1"],
        ["- Retrieval pattern: ExperienceEngine is finding matches in this repo, but some tasks still need smaller hints or no hint yet."]
      ])
    );
  });

  it("prints setup state, value state, and a product next step", () => {
    runStatusCommand();

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["- Setup state: Ready"],
        ["- Value state: Warming up"],
        [
          "- Next step: Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence."
        ]
      ])
    );
  });
});
