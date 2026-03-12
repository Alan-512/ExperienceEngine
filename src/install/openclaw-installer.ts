import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveExperienceEnginePaths, resolveProductStateDir, type ResolvedPathInfo } from "../config/path-resolver.js";

export type OpenClawInstallReport = {
  adapter: "openclaw";
  installed: true;
  paths: ResolvedPathInfo;
  pluginConfig: {
    dataDir: string;
    sqlitePath: string;
    captureDir: string;
  };
};

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export const installOpenClawAdapter = (options: InstallerOptions = {}): OpenClawInstallReport => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env ?? {},
    homeDir: options.homeDir
  });

  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(resolveProductStateDir(paths), { recursive: true });
  mkdirSync(paths.captureDir, { recursive: true });
  mkdirSync(dirname(paths.sqlitePath), { recursive: true });

  const payload = {
    adapter: "openclaw",
    installedAt: new Date().toISOString(),
    dataDir: paths.dataDir,
    sqlitePath: paths.sqlitePath,
    captureDir: paths.captureDir
  };

  writeFileSync(paths.installStatePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    adapter: "openclaw",
    installed: true,
    paths,
    pluginConfig: {
      dataDir: paths.dataDir,
      sqlitePath: paths.sqlitePath,
      captureDir: paths.captureDir
    }
  };
};

export const inspectOpenClawInstall = (options: InstallerOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env,
    homeDir: options.homeDir
  });

  return {
    adapter: "openclaw" as const,
    installed: paths.usedInstallState,
    pathMode: paths.mode,
    activeHome: paths.activeHome,
    sqlitePath: paths.sqlitePath,
    captureDir: paths.captureDir,
    installStatePath: paths.installStatePath
  };
};
