import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStatusCommand } from "../../src/cli/commands/status.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;

let mockCodexStatus: {
  installed: boolean;
  hostWiring: {
    enabled: boolean;
  };
  learningLoop: {
    state: string;
    instructionState: string;
    recentTaskRuns: number;
  };
  cliFallback: {
    command: string;
    available: boolean;
    path?: string;
    recommendation?: string;
  };
  codexCli?: {
    command: string;
    available: boolean;
    path?: string;
    windowsAppsShim: boolean;
    warning?: string;
    recommendation?: string;
  };
  hooks?: {
    state: string;
    featureEnabled: boolean;
    missingEvents?: string[];
    codexHookCommands?: string[];
  };
  paths?: {
    productHome: string;
  };
  runtimeTarget?: string;
} = {
  installed: true,
  hostWiring: {
    enabled: true
  },
  learningLoop: {
    state: "instruction_installed",
    instructionState: "present",
    recentTaskRuns: 0
  },
  cliFallback: {
    command: "ee",
    available: true,
    path: "/usr/local/bin/ee"
  },
  hooks: {
    state: "healthy",
    featureEnabled: true,
    missingEvents: [],
    codexHookCommands: ["cmd.exe /c /repo/.codex/experienceengine-codex-hook.cmd"]
  },
  paths: {
    productHome: "/tmp/.experienceengine"
  },
  runtimeTarget: "windows"
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

let mockOpenClawStatus: {
  installed: boolean;
  runtimeDefaults: {
    learningLoopState: string;
    backgroundLearningEnabled: boolean;
    hybridPosttaskEnabled: boolean;
  };
  hostState: {
    enabled: boolean;
  };
  workspace: {
    path?: string;
    globalWorkspace: boolean;
    isolationBehavior: "project_scope" | "session_isolated";
  };
} = {
  installed: true,
  runtimeDefaults: {
    learningLoopState: "interaction_only",
    backgroundLearningEnabled: false,
    hybridPosttaskEnabled: false
  },
  hostState: {
    enabled: true
  },
  workspace: {
    path: "/home/seed/.openclaw/workspace",
    globalWorkspace: true,
    isolationBehavior: "session_isolated"
  }
};

let mockDecisionHealth = {
  scopeId: "scope_repo",
  recentDecisions: 3,
  recentInjects: 1,
  recentConservativeInjects: 1,
  recentSkips: 1,
  recentPotentialMisfires: 1,
  recentMetaDominantSelections: 1,
  recentRealDevAlignedSelections: 2,
  recentFastPathActivations: 1,
  recentRerankParticipations: 2,
  recentQueryRewriteUsages: 1,
  recentSecondOpinionActivations: 1,
  recentSecondOpinionSkips: 0,
  recentSecondOpinionConservativeDowngrades: 1,
  currentPriorityCandidates: 2,
  recentConvergedUpdates: 3,
  recentPriorityPromotions: 1,
  lastDecisionMode: "inject_conservative"
};

let mockLearningQualityHealth = {
  scopeId: "scope_repo",
  recentTaskRuns: 5,
  learningApplicableRuns: 4,
  capturedRuns: 1,
  rejectedRuns: 3,
  notApplicableRuns: 1,
  candidateAdmissionRate: 0.25,
  rejectionReasons: {
    expression_only: 1,
    no_transferable_value: 1,
    insufficient_evidence: 0,
    generic_advice: 1,
    gate_failure: 0,
    ordinary_success: 0,
    other: 0
  },
  topRejectionReasons: [],
  genericAdviceRejections: 2,
  feedbackClosure: {
    recentResolvedInterventions: 3,
    helped: 1,
    harmed: 1,
    unresolved: 1
  }
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
    },
    cliFallback: {
      command: "ee",
      available: true,
      path: "/usr/local/bin/ee"
    },
    hooks: {
      state: "healthy",
      featureEnabled: true,
      missingEvents: [],
      codexHookCommands: ["cmd.exe /c /repo/.codex/experienceengine-codex-hook.cmd"]
    },
    paths: {
      productHome: "/tmp/.experienceengine"
    },
    runtimeTarget: "windows"
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
    runtimeDefaults: {
      learningLoopState: "interaction_only",
      backgroundLearningEnabled: false,
      hybridPosttaskEnabled: false
    },
    hostState: {
      enabled: true
    },
    workspace: {
      path: "/home/seed/.openclaw/workspace",
      globalWorkspace: true,
      isolationBehavior: "session_isolated"
    }
  };
  mockDecisionHealth = {
    scopeId: "scope_repo",
    recentDecisions: 3,
    recentInjects: 1,
    recentConservativeInjects: 1,
    recentSkips: 1,
    recentPotentialMisfires: 1,
    recentMetaDominantSelections: 1,
    recentRealDevAlignedSelections: 2,
    recentFastPathActivations: 1,
    recentRerankParticipations: 2,
    recentQueryRewriteUsages: 1,
    recentSecondOpinionActivations: 1,
    recentSecondOpinionSkips: 0,
    recentSecondOpinionConservativeDowngrades: 1,
    currentPriorityCandidates: 2,
    recentConvergedUpdates: 3,
    recentPriorityPromotions: 1,
    lastDecisionMode: "inject_conservative"
  };
  mockLearningQualityHealth = {
    scopeId: "scope_repo",
    recentTaskRuns: 5,
    learningApplicableRuns: 4,
    capturedRuns: 1,
    rejectedRuns: 3,
    notApplicableRuns: 1,
    candidateAdmissionRate: 0.25,
    rejectionReasons: {
      expression_only: 1,
      no_transferable_value: 1,
      insufficient_evidence: 0,
      generic_advice: 1,
      gate_failure: 0,
      ordinary_success: 0,
      other: 0
    },
    topRejectionReasons: [],
    genericAdviceRejections: 2,
    feedbackClosure: {
      recentResolvedInterventions: 3,
      helped: 1,
      harmed: 1,
      unresolved: 1
    }
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
    embeddingApiProvider: "gemini",
    syncSecondOpinionMode: "selective",
    syncSecondOpinionModel: ""
  })
}));

vi.mock("../../src/interaction/service.js", () => ({
  ExperienceInteractionService: class {
    inspectDecisionHealth() {
      return mockDecisionHealth;
    }

    inspectLearningQualityHealth() {
      return mockLearningQualityHealth;
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
        ["- Sync second-opinion mode: selective"],
        ["- Sync second-opinion model: gemini-3.1-flash-lite-preview"],
        ["- Codex learning loop: instruction_installed"],
        ["- Codex instruction block: present"],
        ["- Codex task runs in current repo: 0"],
        ["- Codex hooks: healthy"],
        ["- Codex hooks feature: enabled"],
        ["- Codex hook events: UserPromptSubmit, PostToolUse, Stop"],
        ["- Codex PreToolUse: disabled by default; enable only for synchronous gating experiments"],
        ["- Codex PostToolUse: per-tool capture; one entry after each tool call is expected"],
        ["- Codex project hook home: /tmp/.experienceengine"],
        ["- Codex runtime target: windows"],
        ["- Codex CLI fallback available: yes"],
        ["- OpenClaw learning loop: interaction_only"],
        ["- OpenClaw background learning default: disabled"],
        ["- OpenClaw async posttask default: disabled"],
        ["- OpenClaw workspace scope mode: session_isolated"],
        ["- OpenClaw workspace note: global workspace turns are session-isolated until a project root is available"],
        ["- Recent retrieval decisions in current repo: 3"],
        ["- Recent standard hints (inject): 1"],
        ["- Recent cautious hints (inject_conservative): 1"],
        ["- Recent no-hint decisions (skip): 1"],
        ["- Recent harmful or misfired hints: 1"],
        ["- Recent meta-dominant selections: 1"],
        ["- Recent real-dev-aligned selections: 2"],
        ["- Recent fast matches (fast path): 1"],
        ["- Recent rerank reviews (rerank): 2"],
        ["- Recent query normalizations (query rewrites): 1"],
        ["- Recent sync second-opinion reviews: 1"],
        ["- Recent second-opinion skips: 0"],
        ["- Recent second-opinion conservative downgrades: 1"],
        ["- Current rising patterns (priority candidates): 2"],
        ["- Recent merged refinements (converged updates): 3"],
        ["- Recent newly promoted hints (priority promotions): 1"],
        ["- Retrieval pattern: ExperienceEngine is finding matches in this repo, but some tasks still need smaller hints or no hint yet."],
        ["Learning quality:"],
        ["- Recent task runs considered: 5"],
        ["- Learning outcomes: captured 1, rejected 3, not applicable 1"],
        ["- Candidate admission rate: 25%"],
        ["- Rejection reason distribution: expression_only:1, no_transferable_value:1, generic_advice:1"],
        ["- Generic/non-transferable rejections: 2"],
        ["- Feedback closure: helped 1, harmed 1, unresolved 1 of 3 resolved interventions"]
      ])
    );
  });

  it("prints when Codex MCP is ready but the ee CLI fallback is not on PATH", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    writeSharedSettings(process.env.EXPERIENCE_ENGINE_HOME);
    mockCodexStatus.cliFallback = {
      command: "ee",
      available: false,
      recommendation:
        "Codex MCP can still run ExperienceEngine, but CLI fallback commands like `ee inspect --last` need the `ee` binary on PATH or an explicit npx invocation."
    };

    runStatusCommand();

    expect(consoleLogSpy).toHaveBeenCalledWith("- Codex CLI fallback available: no");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- Codex CLI fallback note: Codex MCP can still run ExperienceEngine, but CLI fallback commands like `ee inspect --last` need the `ee` binary on PATH or an explicit npx invocation."
    );
  });

  it("prints WSL Codex CLI PATH shim warnings", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    writeSharedSettings(process.env.EXPERIENCE_ENGINE_HOME);
    mockCodexStatus.codexCli = {
      command: "codex",
      available: true,
      path: "/mnt/c/Users/seed/AppData/Local/Microsoft/WindowsApps/codex",
      windowsAppsShim: true,
      warning: "WSL PATH resolves `codex` to the WindowsApps shim, which can fail with permission errors inside Linux.",
      recommendation:
        "Install or use the Linux Codex CLI earlier on PATH, or invoke the Linux binary directly before running EE host validation."
    };

    runStatusCommand();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- Codex CLI PATH warning: WSL PATH resolves `codex` to the WindowsApps shim, which can fail with permission errors inside Linux."
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- Codex CLI PATH note: Install or use the Linux Codex CLI earlier on PATH, or invoke the Linux binary directly before running EE host validation."
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
