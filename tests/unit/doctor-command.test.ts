import { afterEach, describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "../../src/cli/commands/doctor.js";

const consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const originalEvaluationMode = process.env.EXPERIENCE_ENGINE_EVALUATION_MODE;
const originalHoldoutRate = process.env.EXPERIENCE_ENGINE_HOLDOUT_RATE;

afterEach(() => {
  consoleTableSpy.mockClear();
  consoleLogSpy.mockClear();
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
    ...overrides
  }) as never;

describe("doctor command", () => {
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

  it("prints current scope pack activations when packs are enabled", async () => {
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
        nodes: 1,
        nextStep: "Keep working in the same repo."
      }),
      inspectScopePackStatus: () => ({
        scopeId: "scope_repo",
        enabledCount: 1,
        activations: [
          {
            packId: "auth-pack",
            status: "published",
            currentVersion: "v1",
            pinnedVersion: "v1",
            enabled: true
          }
        ],
        compiler: {
          publishedPacks: 1,
          compiledTargets: 2,
          stalePublishedPacks: 0,
          latestCompiledArtifact: {
            packId: "auth-pack",
            target: "codex",
            version: "v1",
            renderedNodeCount: 1
          }
        }
      }),
      inspectPackDeploymentStatus: () => ({
        target: "codex",
        deploymentStatus: "up_to_date"
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Current scope packs:"],
        ["- Scope: scope_repo"],
        ["- Enabled packs: 1"],
        ["- auth-pack@v1 [published enabled]"],
        ["Pack compiler:"],
        ["- Published packs: 1"],
        ["- Compiled targets: 2"],
        ["- Stale published packs: 0"],
        ["- Latest compile: auth-pack@v1 -> codex (1 nodes)"],
        ["- Current repo target status: codex up_to_date"]
      ])
    );
  });

  it("reports openclaw install drift and recommends repair", async () => {
    await runDoctorCommand("openclaw", {
      inspectOpenClawInstall: () =>
        ({
          adapter: "openclaw",
          installed: true,
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
        ["Recommended next step: ee repair openclaw"]
      ])
    );
  });
});
