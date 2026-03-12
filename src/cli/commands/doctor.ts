import { inspectClaudeCodeInstall } from "../../install/claude-code-doctor.js";
import { inspectCodexInstall } from "../../install/codex-installer.js";
import {
  classifyOpenClawHostWarnings,
  getOpenClawRepairHint,
  inspectOpenClawInstall
} from "../../install/openclaw-installer.js";

export const runDoctorCommand = (target?: string): void => {
  if (target === "claude-code") {
    const status = inspectClaudeCodeInstall();
    console.table([
      {
        adapter: status.adapter,
        installed: status.installed,
        recorded_version: status.versionStatus.recordedVersion ?? "",
        current_version: status.versionStatus.currentVersion,
        version_state: status.versionStatus.state,
        upgrade_available: status.versionStatus.updateAvailable,
        project_dir: status.projectDir,
        settings_path: status.settingsPath,
        prompt_hook: status.hooksPresent.userPromptSubmit,
        pre_tool_hook: status.hooksPresent.preToolUse,
        post_tool_hook: status.hooksPresent.postToolUse,
        session_end_hook: status.hooksPresent.sessionEnd,
        capture_dir: status.captureDir
      }
    ]);
    if (status.versionStatus.updateAvailable) {
      console.log("Recommended next step: ee upgrade claude-code");
    }
    return;
  }

  if (target === "codex") {
    const status = inspectCodexInstall();
    console.table([
      {
        adapter: status.adapter,
        installed: status.installed,
        recorded_version: status.versionStatus.recordedVersion ?? "",
        current_version: status.versionStatus.currentVersion,
        version_state: status.versionStatus.state,
        upgrade_available: status.versionStatus.updateAvailable,
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
    return;
  }

  const status = inspectOpenClawInstall();
  const warnings = classifyOpenClawHostWarnings(status);
  console.table([
    {
      adapter: status.adapter,
      installed: status.installed,
      recorded_version: status.versionStatus.recordedVersion ?? "",
      current_version: status.versionStatus.currentVersion,
      version_state: status.versionStatus.state,
      upgrade_available: status.versionStatus.updateAvailable,
      host_wired: status.hostWiring.wired,
      host_status: status.hostState.status ?? "",
      host_enabled: status.hostState.enabled ?? false,
      config_matches: status.hostState.configMatches,
      restart_recommended: status.hostWiring.restartRecommended,
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
};
