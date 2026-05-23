import { afterEach, describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "../../src/cli/commands/doctor.js";
import { loadConfig } from "../../src/config/load-config.js";
import { loadOfflineManifestForModel } from "../../src/store/vector/offline-manifest.js";

vi.mock("../../src/config/load-config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/config/load-config.js")>();
  return {
    ...original,
    loadConfig: vi.fn(original.loadConfig)
  };
});

vi.mock("../../src/store/vector/offline-manifest.js", () => ({
  loadOfflineManifestForModel: vi.fn()
}));

const consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const originalEvaluationMode = process.env.EXPERIENCE_ENGINE_EVALUATION_MODE;
const originalHoldoutRate = process.env.EXPERIENCE_ENGINE_HOLDOUT_RATE;

afterEach(() => {
  consoleTableSpy.mockClear();
  consoleLogSpy.mockClear();
  vi.mocked(loadConfig).mockReset();
  vi.mocked(loadOfflineManifestForModel).mockReset();
  if (originalEvaluationMode === undefined) {
    delete process.env.EXPERIENCE_ENGINE_EVALUATION_MODE;
  } else {
    process.env.EXPERIENCE_ENGINE_EVALUATION_MODE = originalEvaluationMode;
  }
  if (originalHoldoutRate === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOLDOUT_RATE;
  } else {
    process.env.EXPERIENCE_ENGINE_HOLDOUT_RATE = originalHoldoutRate;
  }
});

const codexStatus = (overrides: Record<string, unknown> = {}) =>
  ({
    adapter: "codex",
    installed: true,
    versionStatus: {
      recordedVersion: "0.1.0",
      currentVersion: "0.1.0",
      state: "current",
      updateAvailable: false
    },
    serverName: "experienceengine",
    hostWiring: {
      wired: true,
      enabled: true,
      transport: "stdio",
      command: "node dist/cli/index.js codex-mcp-server"
    },
    instruction: {
      path: "/repo/AGENTS.md",
      state: "present"
    },
    learningLoop: {
      instructionState: "present",
      recentTaskRuns: 0,
      state: "instruction_installed"
    },
    distillationStatus: {
      distillationMode: "rule",
      distillationSource: "rule",
      provider: "openai_compatible",
      reason: "No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
      diagnostics: {
        configured: false,
        provider: "openai_compatible",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        missingEnv: ["EXPERIENCE_ENGINE_DISTILLER_MODEL", "EXPERIENCE_ENGINE_DISTILLER_API_KEY"]
      }
    },
    captureDir: "/tmp/.experienceengine/adapters/codex/captures",
    paths: {
      productHome: "/tmp/.experienceengine"
    },
    runtimeTarget: "windows",
    hooks: {
      state: "healthy",
      featureEnabled: true,
      missingEvents: [],
      codexHookCommands: ["cmd.exe /c /repo/.codex/experienceengine-codex-hook.cmd"]
    },
    cliFallback: {
      command: "ee",
      available: true,
      path: "/usr/local/bin/ee"
    },
    ...overrides
  }) as never;

const learningQualityHealth = () => ({
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
});

describe("doctor command", () => {
  it("prints a consolidated summary when no host target is provided", async () => {
    await runDoctorCommand(undefined, {
      inspectCodexInstall: () => codexStatus(),
      inspectClaudeCodeInstall: () =>
        ({
          adapter: "claude-code",
          installed: true,
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          hooksPresent: {
            userPromptSubmit: true,
            preToolUse: true,
            postToolUse: true,
            postToolUseFailure: true,
            sessionEnd: true
          },
          hostWiring: {
            wired: true
          }
        }) as never,
      inspectOpenClawInstall: () =>
        ({
          adapter: "openclaw",
          installed: true,
          runtimeDefaults: {
            learningLoopState: "interaction_only",
            backgroundLearningEnabled: false,
            hybridPosttaskEnabled: false
          },
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          hostWiring: {
            wired: true
          },
          hostState: {
            enabled: true
          }
        }) as never
    });

    expect(consoleTableSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["CLI summary:"],
        ["- Install entrypoint: use the host setup path that matches each host."],
        ["- OpenClaw install (host-native plugin): ready"],
        ["  1. openclaw plugins install @alan512/experienceengine"],
        ["- Codex install (EE-managed setup): ready"],
        ["  1. ee install codex"],
        [
          "  2. codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server"
        ],
        ["- Claude Code install (host-native marketplace): ready"],
        ["  1. /plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git"],
        ["  2. /plugin install experienceengine@experienceengine"],
        ["- Codex learning loop: instruction_installed"],
        ["- Codex instruction block: present"],
        ["- OpenClaw learning loop: interaction_only"],
        ["- OpenClaw background learning default: disabled"],
        ["- OpenClaw async posttask default: disabled"],
        ["- Host health details: ee doctor <codex|claude-code|openclaw|antigravity>"],
        ["Distillation summary:"],
        ["Embedding summary:"]
      ])
    );
  });

  it("does not mark Claude Code as enabled when hooks exist but MCP wiring is missing", async () => {
    await runDoctorCommand(undefined, {
      inspectCodexInstall: () => codexStatus(),
      inspectClaudeCodeInstall: () =>
        ({
          adapter: "claude-code",
          installed: true,
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          hooksPresent: {
            userPromptSubmit: true,
            preToolUse: true,
            postToolUse: true,
            postToolUseFailure: true,
            sessionEnd: true
          },
          hostWiring: {
            wired: false
          }
        }) as never,
      inspectOpenClawInstall: () =>
        ({
          adapter: "openclaw",
          installed: true,
          runtimeDefaults: {
            learningLoopState: "interaction_only",
            backgroundLearningEnabled: false,
            hybridPosttaskEnabled: false
          },
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          hostWiring: {
            wired: true
          },
          hostState: {
            enabled: true
          }
        }) as never
    });

    expect(consoleTableSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          host: "claude-code",
          wired: false,
          enabled: false
        })
      ])
    );
  });

  it("reports remote package updates separately from host wiring upgrades", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () => codexStatus(),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.2.0",
        releaseUrl: "https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0",
        publishedAt: "2026-03-12T12:00:00Z",
        state: "update-available",
        updateAvailable: true
      })
    });

    expect(consoleTableSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Recommended next step: update local ExperienceEngine package to 0.2.0, then run ee upgrade codex"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Latest release: https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0"
    );
  }, 15000);

  it("reports codex instruction state and learning-loop health for targeted doctor", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          instruction: {
            path: "/repo/AGENTS.md",
            state: "present"
          },
          learningLoop: {
            instructionState: "present",
            recentTaskRuns: 2,
            state: "learning_loop_active"
          }
        }),
      inspectDecisionHealth: () => ({
        scopeId: "scope_repo",
        recentDecisions: 4,
        recentInjects: 2,
        recentConservativeInjects: 1,
        recentSkips: 1,
        recentPotentialMisfires: 0,
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
        lastDecisionMode: "inject"
      }),
      inspectLearningQualityHealth: learningQualityHealth,
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        state: "current",
        updateAvailable: false
      })
    });

    expect(consoleTableSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          adapter: "codex",
          cli_fallback: true,
          instruction_state: "present",
          learning_loop: "learning_loop_active"
        })
      ])
    );
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Codex learning loop:"],
        ["- Instruction block: present"],
        ["- Instruction path: /repo/AGENTS.md"],
        ["- State: learning_loop_active"],
        ["- Codex task runs in current repo: 2"],
        ["Codex runtime target:"],
        ["- CLI fallback command: ee"],
        ["- CLI fallback available on PATH: yes"],
        ["- CLI fallback path: /usr/local/bin/ee"],
        ["Recent retrieval activity:"],
        ["- Decisions in current repo: 4"],
        ["- Standard hints (inject): 2"],
        ["- Cautious hints (inject_conservative): 1"],
        ["- No-hint decisions (skip): 1"],
        ["- Harmful or misfired hints: 0"],
        ["- Meta-dominant selections: 1"],
        ["- Real-dev-aligned selections: 2"],
        ["- Fast matches (fast path): 1"],
        ["- Rerank reviews (rerank): 2"],
        ["- Query normalizations (query rewrites): 1"],
        ["- Sync second-opinion reviews: 1"],
        ["- Second-opinion skips: 0"],
        ["- Second-opinion conservative downgrades: 1"],
        ["- Rising patterns (priority candidates): 2"],
        ["- Merged refinements (converged updates): 3"],
        ["- Newly promoted hints (priority promotions): 1"],
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

  it("reports when Codex host wiring works but ee CLI fallback is missing", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          cliFallback: {
            command: "ee",
            available: false,
            recommendation:
              "Codex MCP can still run ExperienceEngine, but CLI fallback commands like `ee inspect --last` need the `ee` binary on PATH or an explicit npx invocation."
          }
        }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        state: "current",
        updateAvailable: false
      })
    });

    expect(consoleTableSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          adapter: "codex",
          host_wired: true,
          cli_fallback: false
        })
      ])
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("- CLI fallback available on PATH: no");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- CLI fallback note: Codex MCP can still run ExperienceEngine, but CLI fallback commands like `ee inspect --last` need the `ee` binary on PATH or an explicit npx invocation."
    );
  });

  it("reports WSL Codex CLI PATH shim warnings separately from the ee fallback", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          runtimeTarget: "posix",
          codexCli: {
            command: "codex",
            available: true,
            path: "/mnt/c/Users/seed/AppData/Local/Microsoft/WindowsApps/codex",
            windowsAppsShim: true,
            warning: "WSL PATH resolves `codex` to the WindowsApps shim, which can fail with permission errors inside Linux.",
            recommendation:
              "Install or use the Linux Codex CLI earlier on PATH, or invoke the Linux binary directly before running EE host validation."
          }
        }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        state: "current",
        updateAvailable: false
      })
    });

    expect(consoleTableSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          adapter: "codex",
          codex_cli_warning: true
        })
      ])
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- Codex CLI PATH warning: WSL PATH resolves `codex` to the WindowsApps shim, which can fail with permission errors inside Linux."
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- Codex CLI PATH note: Install or use the Linux Codex CLI earlier on PATH, or invoke the Linux binary directly before running EE host validation."
    );
  });

  it("suggests the next codex action when the instruction exists but no codex task runs are recorded yet", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          instruction: {
            path: "/repo/AGENTS.md",
            state: "present"
          },
          learningLoop: {
            instructionState: "present",
            recentTaskRuns: 0,
            state: "instruction_installed"
          }
        }),
      inspectDecisionHealth: () => ({
        scopeId: "scope_repo",
        recentDecisions: 3,
        recentInjects: 0,
        recentConservativeInjects: 0,
        recentSkips: 3,
        recentPotentialMisfires: 0,
        recentMetaDominantSelections: 0,
        recentRealDevAlignedSelections: 0,
        recentFastPathActivations: 0,
        recentRerankParticipations: 0,
        recentQueryRewriteUsages: 0,
        recentSecondOpinionActivations: 0,
        recentSecondOpinionSkips: 0,
        recentSecondOpinionConservativeDowngrades: 0,
        currentPriorityCandidates: 0,
        recentConvergedUpdates: 0,
        recentPriorityPromotions: 0,
        lastDecisionMode: "skip"
      }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        state: "current",
        updateAvailable: false
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- Recommended next step: use Codex on a real coding task so ExperienceEngine can persist codex task runs."
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "- Recommended next step: ExperienceEngine is seeing nearby tasks in this repo but still skipping most of them. Run `ee inspect --last` after the next close-match task to review the route and trust summary."
    );
  });

  it("keeps doctor usable when remote release lookup is unavailable", async () => {
    await runDoctorCommand("claude-code", {
      inspectClaudeCodeInstall: () =>
        ({
          adapter: "claude-code",
          installed: true,
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          projectDir: "/tmp/project",
          settingsPath: "/tmp/project/.claude/settings.local.json",
          captureDir: "/tmp/.experienceengine/adapters/claude-code/captures",
          hooksPresent: {
            userPromptSubmit: true,
            preToolUse: true,
            postToolUse: true,
            postToolUseFailure: true,
            sessionEnd: true
          },
          runtimeTarget: "windows",
          launcherPaths: {
            hook: "D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-claude-hook.cmd",
            mcpServer: "D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-mcp-server.cmd"
          },
          distillationStatus: {
            distillationMode: "rule",
            distillationSource: "rule",
            provider: "openai_compatible",
            reason:
              "No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
            diagnostics: {
              configured: false,
              provider: "openai_compatible",
              baseUrl: "https://api.openai.com/v1/chat/completions",
              missingEnv: ["EXPERIENCE_ENGINE_DISTILLER_MODEL", "EXPERIENCE_ENGINE_DISTILLER_API_KEY"]
            }
          }
        }) as never,
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        state: "unavailable",
        updateAvailable: false,
        error: "GitHub latest release lookup failed with HTTP 404."
      })
    });

    expect(consoleTableSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Remote release check unavailable: GitHub latest release lookup failed with HTTP 404."
    );
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Distillation status:"],
        ["- Mode: rule"],
        ["- Source: rule"],
        ["- Provider: openai_compatible"],
        [
          "- Reason: No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation."
        ],
        ["- Explicit provider configured: no"],
        ["- Base URL: https://api.openai.com/v1/chat/completions"],
        [
          "- Missing env: EXPERIENCE_ENGINE_DISTILLER_MODEL, EXPERIENCE_ENGINE_DISTILLER_API_KEY"
        ],
        ["Claude runtime target:"],
        ["- Target: windows"],
        [
          "- Hook launcher: D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-claude-hook.cmd"
        ],
        [
          "- MCP launcher: D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-mcp-server.cmd"
        ]
      ])
    );
  });

  it("prints registry advisories when npm or pnpm uses a non-official registry", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () => codexStatus(),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      readRegistryHealth: () => ({
        checks: [
          {
            tool: "npm",
            registry: "https://registry.npmmirror.com",
            official: false
          }
        ],
        hasNonOfficialRegistry: true,
        warnings: [
          "npm registry is set to https://registry.npmmirror.com. Managed installs are most reliable with https://registry.npmjs.org/."
        ]
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Registry advisory: npm registry is set to https://registry.npmmirror.com. Managed installs are most reliable with https://registry.npmjs.org/."
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Recommended next step: npm config set registry https://registry.npmjs.org --global"
    );
  });

  it("prints a cold-start readiness summary when formal experience is still warming up", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () => codexStatus(),
      inspectSharedSetupState: () => ({ initialized: true }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 2,
        taskRuns: 2,
        candidates: 1,
        nodes: 0,
        nextStep:
          "Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence."
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["First-value readiness:"],
        ["- Setup state: Ready"],
        ["- Value state: First value reached"],
        ["- Raw task records: 2"],
        ["- Task runs: 2"],
        ["- Candidates waiting for promotion: 1"],
        ["- Formal experience nodes: 0"],
        [
          "Recommended next step: Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence."
        ]
      ])
    );
  });

  it("does not claim first value reached when only static guidance exists without real task output", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () => codexStatus(),
      inspectSharedSetupState: () => ({ initialized: true }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 0,
        taskRuns: 0,
        candidates: 0,
        nodes: 0,
        nextStep: "Run a few real coding tasks in this repo so ExperienceEngine can start capturing task signals."
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith("- Value state: Warming up");
    expect(consoleLogSpy).not.toHaveBeenCalledWith("- Value state: First value reached");
  });

  it("prints Initialized when shared state exists but host wiring is not ready yet", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          hostWiring: {
            wired: false,
            enabled: false,
            transport: "stdio",
            command: "node dist/cli/index.js codex-mcp-server"
          }
        }),
      inspectSharedSetupState: () => ({ initialized: true }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 0,
        taskRuns: 0,
        candidates: 0,
        nodes: 0,
        nextStep: "Run a few real coding tasks in this repo so ExperienceEngine can start capturing task signals."
      }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith("- Setup state: Initialized");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Value state: Warming up");
  });

  it("does not report Claude Code as Ready when MCP wiring exists but required hooks are incomplete", async () => {
    await runDoctorCommand("claude-code", {
      inspectClaudeCodeInstall: () =>
        ({
          adapter: "claude-code",
          installed: true,
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          hooksPresent: {
            userPromptSubmit: true,
            preToolUse: true,
            postToolUse: true,
            postToolUseFailure: true,
            sessionEnd: false
          },
          hostWiring: {
            wired: true
          },
          interactionReady: true,
          distillationStatus: {
            distillationMode: "rule",
            distillationSource: "rule",
            provider: "openai_compatible",
            reason:
              "No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
            diagnostics: {
              configured: false,
              provider: "openai_compatible",
              baseUrl: "https://api.openai.com/v1/chat/completions",
              missingEnv: ["EXPERIENCE_ENGINE_DISTILLER_MODEL", "EXPERIENCE_ENGINE_DISTILLER_API_KEY"]
            }
          },
          projectDir: "/repo",
          settingsPath: "/repo/.claude/settings.local.json",
          hookSource: "project-local",
          captureDir: "/tmp/.experienceengine/adapters/claude-code/captures"
        }) as never,
      inspectSharedSetupState: () => ({ initialized: true }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 0,
        taskRuns: 0,
        candidates: 0,
        nodes: 0,
        nextStep: "Start a new Claude Code session after the required hooks are fully wired."
      }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith("- Setup state: Initialized");
    expect(consoleLogSpy).not.toHaveBeenCalledWith("- Setup state: Ready");
  });

  it("prints distillation mode and explicit-provider diagnostics", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          runtimeTarget: "windows",
          launcherPaths: {
            mcpServer: "D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-codex-mcp-server.cmd"
          }
        }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 3,
        taskRuns: 1,
        candidates: 1,
        nodes: 0,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Distillation status:"],
        ["- Mode: rule"],
        ["- Source: rule"],
        ["- Provider: openai_compatible"],
        [
          "- Reason: No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation."
        ],
        ["- Explicit provider configured: no"],
        ["- Base URL: https://api.openai.com/v1/chat/completions"],
        [
          "- Missing env: EXPERIENCE_ENGINE_DISTILLER_MODEL, EXPERIENCE_ENGINE_DISTILLER_API_KEY"
        ],
        ["Codex runtime target:"],
        ["- Target: windows"],
        [
          "- MCP launcher: D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-codex-mcp-server.cmd"
        ]
      ])
    );
  });

  it("prints gemini google_adc setup guidance when adc is missing", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          distillationStatus: {
            distillationMode: "rule",
            distillationSource: "rule",
            provider: "gemini",
            reason: "Gemini google_adc is configured, but no local ADC credentials are available.",
            diagnostics: {
              configured: false,
              provider: "gemini",
              model: "gemini-2.5-flash",
              baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
              missingEnv: []
            },
            authMode: "google_adc",
            authDiagnostics: {
              status: "adc_missing",
              message: "Run: gcloud auth application-default login"
            }
          }
        }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Distillation status:"],
        ["- Provider: gemini"],
        ["- Auth mode: google_adc"],
        ["- Auth status: adc_missing"],
        ["- Auth hint: Run: gcloud auth application-default login"]
      ])
    );
  });

  it("prints resolved explicit-provider details when llm distillation is configured", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          distillationStatus: {
            distillationMode: "llm",
            distillationSource: "explicit_provider",
            provider: "openai",
            reason: "Resolved from explicit ExperienceEngine distiller provider configuration.",
            diagnostics: {
              configured: true,
              provider: "openai",
              model: "gpt-5.4",
              baseUrl: "https://api.openai.com/v1/chat/completions",
              missingEnv: []
            }
          }
        }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 3,
        taskRuns: 1,
        candidates: 1,
        nodes: 0,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Distillation status:"],
        ["- Mode: llm"],
        ["- Source: explicit_provider"],
        ["- Provider: openai"],
        ["- Explicit provider configured: yes"],
        ["- Model: gpt-5.4"],
        ["- Base URL: https://api.openai.com/v1/chat/completions"]
      ])
    );
  });

  it("explains Codex hook events and project hook home", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () => codexStatus(),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 3,
        taskRuns: 1,
        candidates: 1,
        nodes: 0,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Codex hook behavior:"],
        ["- Registered events: UserPromptSubmit, PostToolUse, Stop"],
        ["- PreToolUse: disabled by default; set EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED=1 and run `ee repair codex` for synchronous gating experiments."],
        ["- PostToolUse: per-tool capture; seeing one ExperienceEngine PostToolUse after each tool call is expected."],
        ["- Project hook home: /tmp/.experienceengine"],
        ["- Runtime target: windows"]
      ])
    );
  });

  it("prints provider-specific guidance for gemini when credentials are missing", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          distillationStatus: {
            distillationMode: "rule",
            distillationSource: "rule",
            provider: "gemini",
            reason: "No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
            diagnostics: {
              configured: false,
              provider: "gemini",
              model: "gemini-2.5-flash",
              baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
              missingEnv: ["GEMINI_API_KEY"]
            }
          }
        }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 3,
        taskRuns: 1,
        candidates: 1,
        nodes: 0,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["- Provider: gemini"],
        ["- Missing env: GEMINI_API_KEY"],
        [
          "- Setup hint: Run `ee models list gemini`, then `ee config set distillation.provider gemini`, `ee config set distillation.auth_mode google_adc`, `ee config set distillation.model <modelId>`, and if needed run `gcloud auth application-default login`."
        ]
      ])
    );
  });

  it("prints provider-specific guidance for bedrock when aws credentials are missing", async () => {
    await runDoctorCommand("codex", {
      inspectCodexInstall: () =>
        codexStatus({
          distillationStatus: {
            distillationMode: "rule",
            distillationSource: "rule",
            provider: "bedrock",
            reason: "No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
            diagnostics: {
              configured: false,
              provider: "bedrock",
              model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
              baseUrl: "https://bedrock-runtime.<region>.amazonaws.com/model/<model>/converse",
              missingEnv: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]
            }
          }
        }),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 3,
        taskRuns: 1,
        candidates: 1,
        nodes: 0,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["- Provider: bedrock"],
        ["- Missing env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION"],
        ["- Setup hint: Run `ee models list bedrock`, then `ee config set distillation.provider bedrock`, `ee config set distillation.model <modelId>`, and configure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION."]
      ])
    );
  });

  it("prints the current evaluation mode and holdout rate", async () => {
    process.env.EXPERIENCE_ENGINE_EVALUATION_MODE = "holdout";
    process.env.EXPERIENCE_ENGINE_HOLDOUT_RATE = "0.5";

    await runDoctorCommand("codex", {
      inspectCodexInstall: () => codexStatus(),
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 1,
        taskRuns: 1,
        candidates: 0,
        nodes: 0,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Evaluation mode:"],
        ["- Mode: holdout"],
        ["- Holdout rate: 0.5"]
      ])
    );
  });

  it("reports openclaw install drift and recommends repair", async () => {
    await runDoctorCommand("openclaw", {
      inspectOpenClawInstall: () =>
        ({
          adapter: "openclaw",
          installed: true,
          runtimeDefaults: {
            learningLoopState: "learning_loop_active",
            backgroundLearningEnabled: true,
            hybridPosttaskEnabled: false
          },
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          pathMode: "product",
          activeHome: "/tmp/.experienceengine",
          sqlitePath: "/tmp/.experienceengine/adapters/openclaw/sqlite/experienceengine.db",
          captureDir: "/tmp/.experienceengine/adapters/openclaw/captures",
          installStatePath: "/tmp/.experienceengine/install-state/openclaw.json",
          packageRoot: "/mnt/d/project/experienceengine",
          installMode: "copied-plugin",
          hostWiring: {
            wired: true,
            restartRecommended: false
          },
          workspace: {
            path: "/home/seed/.openclaw/workspace",
            globalWorkspace: true,
            isolationBehavior: "session_isolated"
          },
          hostState: {
            warnings: [],
            configMatches: true,
            status: "loaded",
            enabled: true,
            sourcePath: "/home/seed/.openclaw/extensions/experienceengine",
            installPath: "/home/seed/.openclaw/extensions/experienceengine",
            driftDetected: true,
            driftReason:
              "Installed OpenClaw plugin bundle differs from the current ExperienceEngine package at dist/runtime/service.js."
          }
        }) as never,
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 2,
        taskRuns: 1,
        candidates: 0,
        nodes: 1,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleTableSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Host drift: Installed OpenClaw plugin bundle differs from the current ExperienceEngine package at dist/runtime/service.js."],
        ["OpenClaw workspace note: default workspace is the global OpenClaw workspace; ExperienceEngine will session-isolate unresolved turns instead of reusing broad workspace experience."],
        ["Recommended next step: ee repair openclaw"]
      ])
    );
  });

  it("reports local offline readiness, manifest id, and verified assets status when embedding is local", async () => {
    const defaultConfig = loadConfig();
    vi.mocked(loadConfig).mockReturnValue({
      ...defaultConfig,
      embeddingProvider: "local",
      embeddingProfile: "strict-offline",
      embeddingModel: "test-model-abc",
      embeddingCacheDir: "/tmp/cache"
    });
    vi.mocked(loadOfflineManifestForModel).mockReturnValue({
      id: "manifest-12345",
      model: "test-model-abc",
      assets: {}
    } as any);

    const defaultDeps = {
      inspectCodexInstall: () => codexStatus(),
      inspectClaudeCodeInstall: () => ({
        adapter: "claude-code",
        installed: true,
        versionStatus: { recordedVersion: "0.1.0", currentVersion: "0.1.0", state: "current", updateAvailable: false },
        hooksPresent: { userPromptSubmit: true, preToolUse: true, postToolUse: true, postToolUseFailure: true, sessionEnd: true },
        hostWiring: { wired: true }
      }) as never,
      inspectOpenClawInstall: () => ({
        adapter: "openclaw",
        installed: true,
        runtimeDefaults: { learningLoopState: "interaction_only", backgroundLearningEnabled: false, hybridPosttaskEnabled: false },
        versionStatus: { recordedVersion: "0.1.0", currentVersion: "0.1.0", state: "current", updateAvailable: false },
        hostWiring: { wired: true },
        hostState: { enabled: true }
      }) as never,
      inspectFirstValueReadiness: () => ({
        rawRecords: 0,
        taskRuns: 0,
        candidates: 0,
        nodes: 0,
        nextStep: "Warm up"
      }),
      inspectDecisionHealth: () => ({
        totalDecisions: 0,
        liveDecisions: 0,
        shadowDecisions: 0,
        holdoutDecisions: 0,
        deliveredDecisions: 0,
        suppressedDecisions: 0,
        automaticHelpedCount: 0,
        automaticHarmedCount: 0,
        manualHelpedCount: 0,
        manualHarmedCount: 0,
        netHelpfulDecisions: 0
      } as any),
      inspectLearningQualityHealth: () => learningQualityHealth(),
      inspectSharedSetupState: () => ({
        initialized: true,
        version: "0.1.0"
      })
    };

    await runDoctorCommand(undefined, defaultDeps);

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["- Mode: local"],
        ["- Profile: strict-offline"],
        ["- Offline readiness: Ready"],
        ["- Offline manifest ID: manifest-12345"],
        ["- Offline assets: verified (checksums match)"]
      ])
    );
  });

  it("reports error diagnostics when loading local offline manifest fails", async () => {
    const defaultConfig = loadConfig();
    vi.mocked(loadConfig).mockReturnValue({
      ...defaultConfig,
      embeddingProvider: "local",
      embeddingProfile: "strict-offline",
      embeddingModel: "test-model-abc",
      embeddingCacheDir: "/tmp/cache"
    });
    vi.mocked(loadOfflineManifestForModel).mockImplementation(() => {
      throw new Error("Missing or corrupt manifest file");
    });

    const defaultDeps = {
      inspectCodexInstall: () => codexStatus(),
      inspectClaudeCodeInstall: () => ({
        adapter: "claude-code",
        installed: true,
        versionStatus: { recordedVersion: "0.1.0", currentVersion: "0.1.0", state: "current", updateAvailable: false },
        hooksPresent: { userPromptSubmit: true, preToolUse: true, postToolUse: true, postToolUseFailure: true, sessionEnd: true },
        hostWiring: { wired: true }
      }) as never,
      inspectOpenClawInstall: () => ({
        adapter: "openclaw",
        installed: true,
        runtimeDefaults: { learningLoopState: "interaction_only", backgroundLearningEnabled: false, hybridPosttaskEnabled: false },
        versionStatus: { recordedVersion: "0.1.0", currentVersion: "0.1.0", state: "current", updateAvailable: false },
        hostWiring: { wired: true },
        hostState: { enabled: true }
      }) as never,
      inspectFirstValueReadiness: () => ({
        rawRecords: 0,
        taskRuns: 0,
        candidates: 0,
        nodes: 0,
        nextStep: "Warm up"
      }),
      inspectDecisionHealth: () => ({
        totalDecisions: 0,
        liveDecisions: 0,
        shadowDecisions: 0,
        holdoutDecisions: 0,
        deliveredDecisions: 0,
        suppressedDecisions: 0,
        automaticHelpedCount: 0,
        automaticHarmedCount: 0,
        manualHelpedCount: 0,
        manualHarmedCount: 0,
        netHelpfulDecisions: 0
      } as any),
      inspectLearningQualityHealth: () => learningQualityHealth(),
      inspectSharedSetupState: () => ({
        initialized: true,
        version: "0.1.0"
      })
    };

    await runDoctorCommand(undefined, defaultDeps);

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["- Mode: local"],
        ["- Profile: strict-offline"],
        ["- Offline readiness: Error"],
        ["- Offline manifest error: Missing or corrupt manifest file"],
        ["  Warning: Strict offline profile is set, but offline assets are not ready or are corrupt."]
      ])
    );
  });

  it("reports Antigravity user install separately from current project activation", async () => {
    await runDoctorCommand("antigravity", {
      inspectAntigravityInstall: () =>
        ({
          adapter: "antigravity",
          installScope: "user",
          installed: true,
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          packageRoot: "/tmp/ee",
          captureDir: "/tmp/captures",
          lifecycleMode: "host_native_hooks_validated",
          mcpRegistered: true,
          hooksRegistered: true,
          hookContractSpikePassed: true,
          cliAvailable: true,
          agyCliAvailable: true,
          agyCliPath: "C:\\Users\\123\\AppData\\Local\\agy\\bin\\agy.exe",
          ideCliAvailable: true,
          ideCliPath: "D:\\Antigravity\\bin\\antigravity",
          cliValidatedInvocation: "ee agy exec -C <project-path> \"<prompt>\"",
          cliProjectDiscoveryNote: "Wrapper auto-adds --add-dir.",
          agentDesktopGlobalActivation: "supported",
          globalWiring: {
            lifecycleMode: "host_native_hooks_validated",
            agentDesktopGlobalActivation: "supported",
            agentDesktopPluginDir: "C:\\Users\\123\\.gemini\\config\\plugins\\experienceengine",
            agentDesktopPluginRegistered: true,
            agyCliPluginDir: "C:\\Users\\123\\.gemini\\antigravity-cli\\plugins\\experienceengine",
            agyCliPluginRegistered: true,
            mcpConfigPath: "C:\\Users\\123\\.gemini\\antigravity\\mcp_config.json",
            mcpRegistered: true,
            hooksRegistered: true,
            hookContractSpikePassed: true,
            serverName: "experienceengine",
            serverCommand: "node dist/cli/index.js mcp-server"
          },
          projectWiring: {
            cwd: "D:\\repo",
            lifecycleMode: "host_native_hooks_validated",
            mcpRegistered: true,
            hooksRegistered: true,
            hookContractSpikePassed: true,
            serverName: "experienceengine",
            serverCommand: "node dist/cli/index.js mcp-server"
          },
          serverName: "experienceengine",
          serverCommand: "node dist/cli/index.js mcp-server",
          hostWiring: {
            wired: true,
            enabled: true,
            transport: "stdio",
            command: "node dist/cli/index.js mcp-server"
          }
        }) as never,
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.1.0",
        releaseUrl: null,
        publishedAt: "2026-03-12T12:00:00Z",
        state: "current",
        updateAvailable: false
      }),
      inspectFirstValueReadiness: () => ({
        rawRecords: 1,
        taskRuns: 1,
        candidates: 0,
        nodes: 0,
        nextStep: "Keep working in the same repo."
      })
    });

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        install_scope: "user",
        current_project_mcp_registered: true,
        current_project_hooks_registered: true,
        global_mcp_registered: true,
        global_hooks_registered: true,
        agent_desktop_plugin_registered: true,
        agy_cli_plugin_registered: true,
        agy_cli_available: true,
        ide_cli_available: true,
        agent_desktop_global_activation: "supported"
      })
    ]);
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["- User-level EE state: installed data and adapter state live under the configured ExperienceEngine home."],
        ["- Global activation: EE is installed as Antigravity user-level plugins for Agent Desktop and agy CLI when global hooks are registered."],
        ["- Agent Desktop plugin: registered (C:\\Users\\123\\.gemini\\config\\plugins\\experienceengine)"],
        ["- agy CLI plugin: registered (C:\\Users\\123\\.gemini\\antigravity-cli\\plugins\\experienceengine)"],
        ["- Current project: D:\\repo"],
        ["- CLI validated invocation: ee agy exec -C <project-path> \"<prompt>\""],
        ["- Project activation fallback: ee antigravity activate-project -C <project>"]
      ])
    );
  });
});
