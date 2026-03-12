import {
  classifyOpenClawHostWarnings,
  getOpenClawRepairHint,
  inspectOpenClawInstall
} from "../../install/openclaw-installer.js";

export const runDoctorCommand = (): void => {
  const status = inspectOpenClawInstall();
  const warnings = classifyOpenClawHostWarnings(status);
  console.table([
    {
      adapter: status.adapter,
      installed: status.installed,
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
};
