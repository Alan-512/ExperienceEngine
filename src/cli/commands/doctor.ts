import { inspectOpenClawInstall } from "../../install/openclaw-installer.js";

export const runDoctorCommand = (): void => {
  const status = inspectOpenClawInstall();
  console.table([
    {
      adapter: status.adapter,
      installed: status.installed,
      host_wired: status.hostWiring.wired,
      restart_recommended: status.hostWiring.restartRecommended,
      path_mode: status.pathMode,
      package_root: status.packageRoot ?? "",
      active_home: status.activeHome,
      sqlite_path: status.sqlitePath,
      capture_dir: status.captureDir
    }
  ]);
};
