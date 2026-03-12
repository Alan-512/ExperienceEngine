import { inspectOpenClawInstall } from "../../install/openclaw-installer.js";

export const runDoctorCommand = (): void => {
  const status = inspectOpenClawInstall();
  console.table([
    {
      adapter: status.adapter,
      installed: status.installed,
      path_mode: status.pathMode,
      active_home: status.activeHome,
      sqlite_path: status.sqlitePath,
      capture_dir: status.captureDir
    }
  ]);
};
