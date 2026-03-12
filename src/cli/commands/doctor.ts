import {
  getOpenClawRepairHint,
  inspectOpenClawInstall
} from "../../install/openclaw-installer.js";

export const runDoctorCommand = (): void => {
  const status = inspectOpenClawInstall();
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

  if (status.hostState.warnings.length) {
    console.log("Host warnings:");
    for (const warning of status.hostState.warnings) {
      console.log(`- ${warning}`);
    }
  }

  const repairHint = getOpenClawRepairHint(status);
  if (repairHint) {
    console.log(`Recommended next step: ${repairHint}`);
  }
};
