import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStatusCommand } from "../../src/cli/commands/status.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;

let mockCodexStatus = {
  installed: true,
  hostWiring: {
    enabled: true
  },
  learningLoop: {
    state: "instruction_installed",
    instructionState: "present",
    recentTaskRuns: 0
  }
};

let mockClaudeStatus = {
  installed: true,
  hostWiring: {
    wired: true
  },
  hooksPresent: {
    userPromptSubmit: true,
    sessionEnd: true
  },
  interactionReady: true
};

let mockOpenClawStatus = {
  installed: true,
  hostState: {
    enabled: true
  }
};

let mockDecisionHealth = {
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

let mockFirstValueReadiness = {
  rawRecords: 2,
  taskRuns: 2,
  candidates: 1,
  nodes: 0,
  nextStep:
    "Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence."
};

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-status-command-"));
  tempDirs.push(dir);
  return dir;
};

const writeSharedSettings = (productHome: string): void => {
  mkdirSync(productHome, { recursive: true });
  writeFileSync(
    join(productHome, "settings.json"),
    JSON.stringify({ distillation: { provider: "gemini", model: "gemini-3.1-flash-lite-preview" } })
  );
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
  vi.resetModules();
  vi.unmock("../../src/cli/commands/status.js");

  mockCodexStatus = {
    installed: true,
    hostWiring: {
      enabled: true
    },
    learningLoop: {
      state: "instruction_installed",
      instructionState: "present",
      recentTaskRuns: 0
    }
  };
  mockClaudeStatus = {
    installed: true,
    hostWiring: {
      wired: true
    },
    hooksPresent: {
      userPromptSubmit: true,
      sessionEnd: true
    },
    interactionReady: true
  };
  mockOpenClawStatus = {
    installed: true,
    hostState: {
      enabled: true
    }
  };
  mockDecisionHealth = {
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
  mockFirstValueReadiness = {
    rawRecords: 2,
    taskRuns: 2,
    candidates: 1,
    nodes: 0,
    nextStep:
      "Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence."
  };
});

vi.mock("../../src/install/host-detection.js", () => ({
  detectAvailableHosts: () => [
    { id: "codex", label: "Codex", command: "codex" },
    { id: "openclaw", label: "OpenClaw", command: "openclaw" }
  ]
}));

vi.mock("../../src/install/codex-installer.js", () => ({
  inspectCodexInstall: () => mockCodexStatus
}));

vi.mock("../../src/install/claude-code-doctor.js", () => ({
  inspectClaudeCodeInstall: () => mockClaudeStatus
}));

vi.mock("../../src/install/openclaw-installer.js", () => ({
  inspectOpenClawInstall: () => mockOpenClawStatus
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
      return mockDecisionHealth;
    }

    inspectFirstValueReadiness() {
      return mockFirstValueReadiness;
    }
  }
}));

describe("status command", () => {
  it("prints a compact product-facing summary", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    writeSharedSettings(process.env.EXPERIENCE_ENGINE_HOME);

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
        ["- Recent standard hints (inject): 1"],
        ["- Recent cautious hints (inject_conservative): 1"],
        ["- Recent no-hint decisions (skip): 1"],
        ["- Recent fast matches (fast path): 1"],
        ["- Recent rerank reviews (rerank): 2"],
        ["- Recent query normalizations (query rewrites): 1"],
        ["- Current rising patterns (priority candidates): 2"],
        ["- Recent merged refinements (converged updates): 3"],
        ["- Recent newly promoted hints (priority promotions): 1"],
        ["- Retrieval pattern: ExperienceEngine is finding matches in this repo, but some tasks still need smaller hints or no hint yet."]
      ])
    );
  });

  it("prints setup state, value state, and a product next step", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    writeSharedSettings(process.env.EXPERIENCE_ENGINE_HOME);

    runStatusCommand();

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["- Setup state: Ready"],
        ["- Value state: First value reached"],
        [
          "- Next step: Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence."
        ]
      ])
    );
  });

  it("prints Installed when hosts exist but shared state is not initialized yet", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    mockCodexStatus.hostWiring.enabled = false;
    mockClaudeStatus.interactionReady = false;
    mockClaudeStatus.hostWiring.wired = false;
    mockOpenClawStatus.hostState.enabled = false;
    mockFirstValueReadiness = {
      rawRecords: 0,
      taskRuns: 0,
      candidates: 0,
      nodes: 0,
      nextStep: "Run a few real coding tasks in this repo so ExperienceEngine can start capturing task signals."
    };

    runStatusCommand();

    expect(consoleLogSpy).toHaveBeenCalledWith("- Setup state: Installed");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Value state: Warming up");
  });

  it("prints Initialized when shared state exists but the current host session is not ready", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    writeSharedSettings(process.env.EXPERIENCE_ENGINE_HOME);
    mockCodexStatus.hostWiring.enabled = false;
    mockClaudeStatus.interactionReady = false;
    mockClaudeStatus.hostWiring.wired = false;
    mockOpenClawStatus.hostState.enabled = false;
    mockFirstValueReadiness = {
      rawRecords: 0,
      taskRuns: 0,
      candidates: 0,
      nodes: 0,
      nextStep: "Run a few real coding tasks in this repo so ExperienceEngine can start capturing task signals."
    };

    runStatusCommand();

    expect(consoleLogSpy).toHaveBeenCalledWith("- Setup state: Initialized");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Value state: Warming up");
  });
});
