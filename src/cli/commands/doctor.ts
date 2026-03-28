import { loadConfig } from "../../config/load-config.js";
import {
  ExperienceDecisionHealth,
  ExperienceInteractionService,
  type ExperienceFirstValueReadiness
} from "../../interaction/service.js";
import { inspectClaudeCodeInstall } from "../../install/claude-code-doctor.js";
import { inspectCodexInstall } from "../../install/codex-installer.js";
import {
  classifyOpenClawHostWarnings,
  getOpenClawRepairHint,
  inspectOpenClawInstall
} from "../../install/openclaw-installer.js";
import { buildHostInstallGuidance } from "../../install/public-install.js";
import {
  buildRegistryRecommendationCommands,
  readRegistryHealth,
  type RegistryHealth
} from "../../install/registry-health.js";
import { fetchLatestGitHubReleaseStatus, type RemoteReleaseStatus } from "../../version/remote-release.js";

type DoctorDeps = {
  fetchLatestGitHubReleaseStatus?: typeof fetchLatestGitHubReleaseStatus;
  inspectClaudeCodeInstall?: typeof inspectClaudeCodeInstall;
  inspectCodexInstall?: typeof inspectCodexInstall;
  inspectOpenClawInstall?: typeof inspectOpenClawInstall;
  readRegistryHealth?: typeof readRegistryHealth;
  inspectFirstValueReadiness?: () => ExperienceFirstValueReadiness;
  inspectDecisionHealth?: () => ExperienceDecisionHealth;
};

const logRemoteReleaseStatus = (target: string, remoteStatus: RemoteReleaseStatus): void => {
  if (remoteStatus.state === "update-available") {
    console.log(
      `Recommended next step: update local ExperienceEngine package to ${remoteStatus.latestVersion}, then run ee upgrade ${target}`
    );
    if (remoteStatus.releaseUrl) {
      console.log(`Latest release: ${remoteStatus.releaseUrl}`);
    }
    return;
  }

  if (remoteStatus.state === "unavailable" && remoteStatus.error) {
    console.log(`Remote release check unavailable: ${remoteStatus.error}`);
  }
};

const logRegistryHealth = (health: RegistryHealth): void => {
  if (!health.hasNonOfficialRegistry) {
    return;
  }

  for (const warning of health.warnings) {
    console.log(`[ExperienceEngine] Registry advisory: ${warning}`);
  }

  for (const command of buildRegistryRecommendationCommands(health)) {
    console.log(`[ExperienceEngine] Recommended next step: ${command}`);
  }
};

const inspectFirstValueReadiness = (): ExperienceFirstValueReadiness =>
  new ExperienceInteractionService(loadConfig()).inspectFirstValueReadiness();

const inspectDecisionHealth = (): ExperienceDecisionHealth =>
  new ExperienceInteractionService(loadConfig()).inspectDecisionHealth();

const logEvaluationMode = (): void => {
  const config = loadConfig();
  console.log("Evaluation mode:");
  console.log(`- Mode: ${config.evaluationMode}`);
  console.log(`- Holdout rate: ${config.holdoutRate}`);
};

const logFirstValueReadiness = (summary: ExperienceFirstValueReadiness): void => {
  console.log("First-value readiness:");
  console.log(`- Raw task records: ${summary.rawRecords}`);
  console.log(`- Task runs: ${summary.taskRuns}`);
  console.log(`- Candidates waiting for promotion: ${summary.candidates}`);
  console.log(`- Formal experience nodes: ${summary.nodes}`);
  console.log(`Recommended next step: ${summary.nextStep}`);
};

const logDistillationStatus = (status?: {
  distillationMode: "llm" | "rule" | "disabled";
  distillationSource: string;
  provider?: string;
  authMode?: string;
  authDiagnostics?: {
    status: string;
    message: string;
  };
  reason: string;
  diagnostics?: {
    configured: boolean;
    provider: string;
    model?: string;
    baseUrl: string;
    missingEnv: string[];
    authMode?: string;
    authDiagnostics?: {
      status: string;
      message: string;
    };
  };
}): void => {
  if (!status) {
    return;
  }

  console.log("Distillation status:");
  console.log(`- Mode: ${status.distillationMode}`);
  console.log(`- Source: ${status.distillationSource}`);
  if (status.provider) {
    console.log(`- Provider: ${status.provider}`);
  }
  if (status.authMode ?? status.diagnostics?.authMode) {
    console.log(`- Auth mode: ${status.authMode ?? status.diagnostics?.authMode}`);
  }
  console.log(`- Reason: ${status.reason}`);
  if (status.authDiagnostics ?? status.diagnostics?.authDiagnostics) {
    const auth = status.authDiagnostics ?? status.diagnostics?.authDiagnostics;
    if (auth) {
      console.log(`- Auth status: ${auth.status}`);
      console.log(`- Auth hint: ${auth.message}`);
    }
  }
  if (status.diagnostics) {
    console.log(`- Explicit provider configured: ${status.diagnostics.configured ? "yes" : "no"}`);
    if (status.diagnostics.model) {
      console.log(`- Model: ${status.diagnostics.model}`);
    }
    console.log(`- Base URL: ${status.diagnostics.baseUrl}`);
    if (status.diagnostics.missingEnv.length) {
      console.log(`- Missing env: ${status.diagnostics.missingEnv.join(", ")}`);
      const setupHint = getDistillerProviderSetupHint(status.diagnostics.provider);
      if (setupHint) {
        console.log(`- Setup hint: ${setupHint}`);
      }
    }
  }
};

const getDistillerProviderSetupHint = (provider: string): string | null => {
  switch (provider) {
    case "openai":
      return "Run `ee models list openai`, then `ee config set distillation.provider openai`, `ee config set distillation.model <modelId>`, and set OPENAI_API_KEY.";
    case "anthropic":
      return "Run `ee models list anthropic`, then `ee config set distillation.provider anthropic`, `ee config set distillation.model <modelId>`, and set ANTHROPIC_API_KEY.";
    case "gemini":
      return "Run `ee models list gemini`, then `ee config set distillation.provider gemini`, `ee config set distillation.auth_mode google_adc`, `ee config set distillation.model <modelId>`, and if needed run `gcloud auth application-default login`.";
    case "azure_openai":
      return "Run `ee config set distillation.provider azure_openai`, `ee config set distillation.model <deploymentName>`, and set AZURE_OPENAI_ENDPOINT plus AZURE_OPENAI_API_KEY.";
    case "bedrock":
      return "Run `ee models list bedrock`, then `ee config set distillation.provider bedrock`, `ee config set distillation.model <modelId>`, and configure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.";
    case "openrouter":
      return "Run `ee models list openrouter`, then `ee config set distillation.provider openrouter`, `ee config set distillation.model <modelId>`, and set OPENROUTER_API_KEY.";
    case "deepseek":
      return "Run `ee models list deepseek`, then `ee config set distillation.provider deepseek`, `ee config set distillation.model <modelId>`, and set DEEPSEEK_API_KEY.";
    case "moonshot":
      return "Run `ee models list moonshot`, then `ee config set distillation.provider moonshot`, `ee config set distillation.model <modelId>`, and set MOONSHOT_API_KEY.";
    case "dashscope":
      return "Run `ee models list dashscope`, then `ee config set distillation.provider dashscope`, `ee config set distillation.model <modelId>`, and set DASHSCOPE_API_KEY.";
    case "zhipu":
      return "Run `ee models list zhipu`, then `ee config set distillation.provider zhipu`, `ee config set distillation.model <modelId>`, and set ZHIPU_API_KEY.";
    case "siliconflow":
      return "Run `ee models list siliconflow`, then `ee config set distillation.provider siliconflow`, `ee config set distillation.model <modelId>`, and set SILICONFLOW_API_KEY.";
    case "minimax":
      return "Run `ee models list minimax`, then `ee config set distillation.provider minimax`, `ee config set distillation.model <modelId>`, and set MINIMAX_API_KEY.";
    case "volcengine_ark":
      return "Run `ee models list volcengine_ark`, then `ee config set distillation.provider volcengine_ark`, `ee config set distillation.model <modelId>`, and set VOLCENGINE_ARK_API_KEY.";
    case "tencent_hunyuan":
      return "Run `ee models list tencent_hunyuan`, then `ee config set distillation.provider tencent_hunyuan`, `ee config set distillation.model <modelId>`, and set TENCENT_HUNYUAN_API_KEY.";
    case "baidu_qianfan":
      return "Run `ee models list baidu_qianfan`, then `ee config set distillation.provider baidu_qianfan`, `ee config set distillation.model <modelId>`, and set BAIDU_QIANFAN_API_KEY.";
    case "openai_compatible":
      return "Prefer a named provider. If you must use a generic endpoint, set EXPERIENCE_ENGINE_DISTILLER_API_KEY, EXPERIENCE_ENGINE_DISTILLER_BASE_URL, and EXPERIENCE_ENGINE_DISTILLER_MODEL.";
    default:
      return null;
  }
};

const logClaudeRuntimeStatus = (status?: {
  runtimeTarget?: string;
  launcherPaths?: {
    hook?: string;
    mcpServer?: string;
  };
  marketplaceState?: {
    install_mode?: string;
    written_at?: string;
    last_hook_seen_at?: string;
    last_mcp_seen_at?: string;
  } | null;
}): void => {
  if (!status?.runtimeTarget && !status?.marketplaceState) {
    return;
  }

  if (status.runtimeTarget) {
    console.log("Claude runtime target:");
    console.log(`- Target: ${status.runtimeTarget}`);
    if (status.launcherPaths?.hook) {
      console.log(`- Hook launcher: ${status.launcherPaths.hook}`);
    }
    if (status.launcherPaths?.mcpServer) {
      console.log(`- MCP launcher: ${status.launcherPaths.mcpServer}`);
    }
  }

  if (status.marketplaceState) {
    console.log("Claude marketplace state:");
    console.log(`- Install mode: ${status.marketplaceState.install_mode ?? "unknown"}`);
    if (status.marketplaceState.written_at) {
      console.log(`- Marker written at: ${status.marketplaceState.written_at}`);
    }
    if (status.marketplaceState.last_hook_seen_at) {
      console.log(`- Last hook heartbeat: ${status.marketplaceState.last_hook_seen_at}`);
    }
    if (status.marketplaceState.last_mcp_seen_at) {
      console.log(`- Last MCP heartbeat: ${status.marketplaceState.last_mcp_seen_at}`);
    }
  }
};

const logCodexRuntimeStatus = (status?: {
  runtimeTarget?: string;
  launcherPaths?: {
    mcpServer?: string;
  };
}): void => {
  if (!status?.runtimeTarget) {
    return;
  }

  console.log("Codex runtime target:");
  console.log(`- Target: ${status.runtimeTarget}`);
  if (status.launcherPaths?.mcpServer) {
    console.log(`- MCP launcher: ${status.launcherPaths.mcpServer}`);
  }
};

const logCodexLearningLoopStatus = (status?: {
  instruction?: {
    path: string;
    state: "missing" | "present" | "drifted";
  };
  learningLoop?: {
    instructionState: "missing" | "present" | "drifted";
    recentTaskRuns: number;
    state: "tools_only" | "instruction_installed" | "learning_loop_active";
  };
}): void => {
  if (!status?.instruction && !status?.learningLoop) {
    return;
  }

  console.log("Codex learning loop:");
  if (status.instruction) {
    console.log(`- Instruction block: ${status.instruction.state}`);
    console.log(`- Instruction path: ${status.instruction.path}`);
  }
  if (status.learningLoop) {
    console.log(`- State: ${status.learningLoop.state}`);
    console.log(`- Codex task runs in current repo: ${status.learningLoop.recentTaskRuns}`);
    if (status.learningLoop.state === "tools_only") {
      console.log(
        "- Recommended next step: run `ee install codex` from this repo root to write the ExperienceEngine instruction block."
      );
    } else if (status.learningLoop.state === "instruction_installed") {
      console.log("- Recommended next step: use Codex on a real coding task so ExperienceEngine can persist codex task runs.");
    }
  }
};

const logDecisionHealth = (summary?: ExperienceDecisionHealth): void => {
  if (!summary) {
    return;
  }

  console.log("Recent retrieval activity:");
  console.log(`- Decisions in current repo: ${summary.recentDecisions}`);
  console.log(`- Injects: ${summary.recentInjects}`);
  console.log(`- Conservative injects: ${summary.recentConservativeInjects}`);
  console.log(`- Skips: ${summary.recentSkips}`);
  console.log(`- Fast-path activations: ${summary.recentFastPathActivations}`);
  console.log(`- Rerank participations: ${summary.recentRerankParticipations}`);
  console.log(`- Query rewrites: ${summary.recentQueryRewriteUsages}`);
  console.log(`- Current priority candidates: ${summary.currentPriorityCandidates}`);
  console.log(`- Recent converged updates: ${summary.recentConvergedUpdates}`);
  console.log(`- Recent priority promotions: ${summary.recentPriorityPromotions}`);
};

const getCodexSkipHeavyHint = (summary: ExperienceDecisionHealth): string | undefined => {
  if (
    summary.recentDecisions > 0 &&
    summary.recentInjects === 0 &&
    summary.recentConservativeInjects === 0 &&
    summary.recentSkips > 0
  ) {
    return "ExperienceEngine is seeing nearby tasks in this repo but still skipping most of them. Run `ee inspect --last` after the next close-match task to review the route and trust summary.";
  }

  return undefined;
};

const isClaudeInteractionReady = (status: {
  interactionReady?: boolean;
  hostWiring: { wired: boolean };
  hooksPresent: {
    userPromptSubmit: boolean;
    sessionEnd: boolean;
  };
}): boolean =>
  status.interactionReady ??
  (status.hostWiring.wired && status.hooksPresent.userPromptSubmit && status.hooksPresent.sessionEnd);

export const runDoctorCommand = async (target?: string, deps: DoctorDeps = {}): Promise<void> => {
  const resolveRemoteStatus = deps.fetchLatestGitHubReleaseStatus ?? fetchLatestGitHubReleaseStatus;
  const registryHealth = (deps.readRegistryHealth ?? readRegistryHealth)();
  const firstValueReadiness = (deps.inspectFirstValueReadiness ?? inspectFirstValueReadiness)();
  const decisionHealth = (deps.inspectDecisionHealth ?? inspectDecisionHealth)();
  if (!target) {
    const codexStatus = (deps.inspectCodexInstall ?? inspectCodexInstall)();
    const claudeStatus = (deps.inspectClaudeCodeInstall ?? inspectClaudeCodeInstall)();
    const openclawStatus = (deps.inspectOpenClawInstall ?? inspectOpenClawInstall)();
    const config = loadConfig();
    const installGuidance = buildHostInstallGuidance();

    console.table([
      {
        host: "codex",
        installed: codexStatus.installed,
        wired: codexStatus.hostWiring.wired,
        enabled: codexStatus.hostWiring.enabled
      },
      {
        host: "claude-code",
        installed: claudeStatus.installed,
        wired: claudeStatus.hostWiring.wired,
        enabled: isClaudeInteractionReady(claudeStatus)
      },
      {
        host: "openclaw",
        installed: openclawStatus.installed,
        wired: openclawStatus.hostWiring.wired,
        enabled: openclawStatus.hostState.enabled ?? false
      }
    ]);
    console.log("CLI summary:");
    console.log("- Install entrypoint: use the host setup path that matches each host.");
    if (installGuidance.openclaw.ready) {
      console.log("- OpenClaw install (host-native plugin): ready");
      if (installGuidance.openclaw.command) {
        console.log(`  1. ${installGuidance.openclaw.command}`);
      }
    } else {
      console.log(`- OpenClaw install: ${installGuidance.openclaw.reason}`);
      if (installGuidance.openclaw.command) {
        console.log(`  1. ${installGuidance.openclaw.command}`);
      }
    }
    if (installGuidance.codex.ready) {
      console.log("- Codex install (EE-managed setup): ready");
      if (installGuidance.codex.command) {
        console.log(`  1. ${installGuidance.codex.command}`);
      }
      if (installGuidance.codex.commands) {
        console.log(`  1. ${installGuidance.codex.commands[0]}`);
        console.log(`  2. ${installGuidance.codex.commands[1]}`);
      }
    } else {
      console.log(`- Codex install: ${installGuidance.codex.reason}`);
      if (installGuidance.codex.command) {
        console.log(`  1. ${installGuidance.codex.command}`);
      }
      if (installGuidance.codex.commands) {
        console.log(`  1. ${installGuidance.codex.commands[0]}`);
        console.log(`  2. ${installGuidance.codex.commands[1]}`);
      }
    }
    if (installGuidance["claude-code"].ready) {
      console.log("- Claude Code install (host-native marketplace): ready");
    } else {
      console.log(`- Claude Code install: ${installGuidance["claude-code"].reason}`);
    }
    if (installGuidance["claude-code"].commands) {
      console.log(`  1. ${installGuidance["claude-code"].commands[0]}`);
      console.log(`  2. ${installGuidance["claude-code"].commands[1]}`);
    }
    if (codexStatus.learningLoop) {
      console.log(`- Codex learning loop: ${codexStatus.learningLoop.state}`);
      console.log(`- Codex instruction block: ${codexStatus.learningLoop.instructionState}`);
    }
    console.log("- Host health details: ee doctor <codex|claude-code|openclaw>");
    console.log("Distillation summary:");
    console.log(`- Provider: ${config.distillerProvider}`);
    console.log(`- Model: ${config.distillerModel}`);
    console.log("Embedding summary:");
    console.log(`- Mode: ${config.embeddingProvider}`);
    console.log(`- API provider override: ${config.embeddingApiProvider}`);
    logRegistryHealth(registryHealth);
    logEvaluationMode();
    logFirstValueReadiness(firstValueReadiness);
    return;
  }
  if (target === "claude-code") {
    const status = (deps.inspectClaudeCodeInstall ?? inspectClaudeCodeInstall)();
    const remoteStatus = await resolveRemoteStatus({
      currentVersion: status.versionStatus.currentVersion
    });
    console.table([
      {
        adapter: status.adapter,
        installed: status.installed,
        recorded_version: status.versionStatus.recordedVersion ?? "",
        current_version: status.versionStatus.currentVersion,
        version_state: status.versionStatus.state,
        upgrade_available: status.versionStatus.updateAvailable,
        remote_latest_version: remoteStatus.latestVersion ?? "",
        remote_state: remoteStatus.state,
        remote_update_available: remoteStatus.updateAvailable,
        project_dir: status.projectDir,
        settings_path: status.settingsPath,
        prompt_hook: status.hooksPresent.userPromptSubmit,
        pre_tool_hook: status.hooksPresent.preToolUse,
        post_tool_hook: status.hooksPresent.postToolUse,
        session_end_hook: status.hooksPresent.sessionEnd,
        hook_source: status.hookSource,
        interaction_ready: status.interactionReady,
        capture_dir: status.captureDir
      }
    ]);
    logDistillationStatus(status.distillationStatus);
    logClaudeRuntimeStatus(status);
    if (status.versionStatus.updateAvailable) {
      console.log("Recommended next step: ee upgrade claude-code");
    }
    logRemoteReleaseStatus("claude-code", remoteStatus);
    logRegistryHealth(registryHealth);
    logEvaluationMode();
    logFirstValueReadiness(firstValueReadiness);
    return;
  }

  if (target === "codex") {
    const status = (deps.inspectCodexInstall ?? inspectCodexInstall)();
    const remoteStatus = await resolveRemoteStatus({
      currentVersion: status.versionStatus.currentVersion
    });
    console.table([
      {
        adapter: status.adapter,
        installed: status.installed,
        recorded_version: status.versionStatus.recordedVersion ?? "",
        current_version: status.versionStatus.currentVersion,
        version_state: status.versionStatus.state,
        upgrade_available: status.versionStatus.updateAvailable,
        remote_latest_version: remoteStatus.latestVersion ?? "",
        remote_state: remoteStatus.state,
        remote_update_available: remoteStatus.updateAvailable,
        server_name: status.serverName,
        host_wired: status.hostWiring.wired,
        host_enabled: status.hostWiring.enabled,
        transport: status.hostWiring.transport ?? "",
        command: status.hostWiring.command ?? "",
        capture_dir: status.captureDir,
        instruction_state: status.instruction?.state ?? "",
        learning_loop: status.learningLoop?.state ?? ""
      }
    ]);
    if (status.versionStatus.updateAvailable) {
      console.log("Recommended next step: ee upgrade codex");
    }
    logRemoteReleaseStatus("codex", remoteStatus);
    logDistillationStatus(status.distillationStatus);
    logCodexRuntimeStatus(status);
    logCodexLearningLoopStatus(status);
    logDecisionHealth(decisionHealth);
    const skipHeavyHint = getCodexSkipHeavyHint(decisionHealth);
    if (skipHeavyHint) {
      console.log(`- Recommended next step: ${skipHeavyHint}`);
    }
    logRegistryHealth(registryHealth);
    logEvaluationMode();
    logFirstValueReadiness(firstValueReadiness);
    return;
  }

  const status = (deps.inspectOpenClawInstall ?? inspectOpenClawInstall)();
  const remoteStatus = await resolveRemoteStatus({
    currentVersion: status.versionStatus.currentVersion
  });
  const warnings = classifyOpenClawHostWarnings(status);
  console.table([
    {
      adapter: status.adapter,
      installed: status.installed,
      recorded_version: status.versionStatus.recordedVersion ?? "",
      current_version: status.versionStatus.currentVersion,
      version_state: status.versionStatus.state,
      upgrade_available: status.versionStatus.updateAvailable,
      remote_latest_version: remoteStatus.latestVersion ?? "",
      remote_state: remoteStatus.state,
      remote_update_available: remoteStatus.updateAvailable,
      host_wired: status.hostWiring.wired,
      host_status: status.hostState.status ?? "",
      host_enabled: status.hostState.enabled ?? false,
      config_matches: status.hostState.configMatches,
      restart_recommended: status.hostWiring.restartRecommended,
      install_drift: status.hostState.driftDetected ?? false,
      path_mode: status.pathMode,
      package_root: status.packageRoot ?? "",
      host_source_path: status.hostState.sourcePath ?? "",
      active_home: status.activeHome,
      sqlite_path: status.sqlitePath,
      capture_dir: status.captureDir
    }
  ]);

  if (status.hostState.error) {
    console.log(`Host error: ${status.hostState.error}`);
  }

  if (status.hostState.driftDetected && status.hostState.driftReason) {
    console.log(`Host drift: ${status.hostState.driftReason}`);
  }

  if (warnings.owned.length) {
    console.log("ExperienceEngine host warnings:");
    for (const warning of warnings.owned) {
      console.log(`- ${warning}`);
    }
  }

  if (warnings.advisory.length) {
    console.log("Host advisories:");
    for (const warning of warnings.advisory) {
      console.log(`- ${warning}`);
    }
  }

  if (warnings.external.length) {
    console.log("External host warnings:");
    for (const warning of warnings.external) {
      console.log(`- ${warning}`);
    }
  }

  const repairHint = getOpenClawRepairHint(status);
  if (repairHint) {
    console.log(`Recommended next step: ${repairHint}`);
  }

  if (status.versionStatus.updateAvailable) {
    console.log("Recommended next step: ee upgrade openclaw");
  }

  logRemoteReleaseStatus("openclaw", remoteStatus);
  logRegistryHealth(registryHealth);
  logEvaluationMode();
  logFirstValueReadiness(firstValueReadiness);
};
