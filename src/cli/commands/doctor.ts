import { loadConfig } from "../../config/load-config.js";
import {
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
  inspectScopePackStatus?: () => {
    scopeId: string;
    enabledCount: number;
    activations: Array<{
      packId: string;
      status: string;
      currentVersion: string;
      pinnedVersion?: string;
      enabled: boolean;
    }>;
  };
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

const inspectScopePackStatus = () => new ExperienceInteractionService(loadConfig()).inspectScopePackStatus();

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

const logScopePackStatus = (status: {
  scopeId: string;
  enabledCount: number;
  activations: Array<{
    packId: string;
    status: string;
    currentVersion: string;
    pinnedVersion?: string;
    enabled: boolean;
  }>;
}): void => {
  console.log("Current scope packs:");
  console.log(`- Scope: ${status.scopeId}`);
  console.log(`- Enabled packs: ${status.enabledCount}`);
  for (const activation of status.activations.filter((entry) => entry.enabled)) {
    console.log(
      `- ${activation.packId}@${activation.pinnedVersion ?? activation.currentVersion} [${activation.status} enabled]`
    );
  }
};

const logDistillationStatus = (status?: {
  distillationMode: "llm" | "rule" | "disabled";
  distillationSource: string;
  hostLlmMode: "endpoint" | "mediated" | "disabled";
  reason: string;
}): void => {
  if (!status) {
    return;
  }

  console.log("Distillation status:");
  console.log(`- Mode: ${status.distillationMode}`);
  console.log(`- Source: ${status.distillationSource}`);
  console.log(`- Host LLM mode: ${status.hostLlmMode}`);
  console.log(`- Reason: ${status.reason}`);
};

export const runDoctorCommand = async (target?: string, deps: DoctorDeps = {}): Promise<void> => {
  const resolveRemoteStatus = deps.fetchLatestGitHubReleaseStatus ?? fetchLatestGitHubReleaseStatus;
  const registryHealth = (deps.readRegistryHealth ?? readRegistryHealth)();
  const firstValueReadiness = (deps.inspectFirstValueReadiness ?? inspectFirstValueReadiness)();
  const scopePackStatus = (deps.inspectScopePackStatus ?? inspectScopePackStatus)();
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
        capture_dir: status.captureDir
      }
    ]);
    logDistillationStatus(status.distillationStatus);
    if (status.versionStatus.updateAvailable) {
      console.log("Recommended next step: ee upgrade claude-code");
    }
    logRemoteReleaseStatus("claude-code", remoteStatus);
    logRegistryHealth(registryHealth);
    logEvaluationMode();
    logFirstValueReadiness(firstValueReadiness);
    logScopePackStatus(scopePackStatus);
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
        capture_dir: status.captureDir
      }
    ]);
    if (status.versionStatus.updateAvailable) {
      console.log("Recommended next step: ee upgrade codex");
    }
    logRemoteReleaseStatus("codex", remoteStatus);
    logDistillationStatus(status.distillationStatus);
    logRegistryHealth(registryHealth);
    logEvaluationMode();
    logFirstValueReadiness(firstValueReadiness);
    logScopePackStatus(scopePackStatus);
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
  logScopePackStatus(scopePackStatus);
};
