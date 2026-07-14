import { existsSync, readFileSync } from "node:fs";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import type {
  RuntimeInstallOrigin,
  RuntimeInstallSecurityApproval
} from "../runtime/identity/types.js";

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export type PersistedOpenClawInstallState = {
  adapter: string;
  installedAt: string;
  installedVersion?: string;
  packageRoot?: string;
  installSource?: string;
  installMode?: string;
  installOrigin?: RuntimeInstallOrigin;
  artifactIntegrity?: string;
  registryRecordIdentity?: string | null;
  openClawVersion?: string | null;
  securityApproval?: RuntimeInstallSecurityApproval;
  hostWiring?: {
    wired?: boolean;
    restartRecommended?: boolean;
  };
  dataDir?: string;
  sqlitePath?: string;
  captureDir?: string;
  distillerProvider?: string;
  distillerModel?: string;
  hybridEnabled?: boolean;
  hybridSyncExplainEnabled?: boolean;
  hybridAsyncPostmortemEnabled?: boolean;
  hybridAsyncPostmortemLlmEnabled?: boolean;
  hybridExplainLlmEnabled?: boolean;
  hybridExplainProviderMode?: string;
  hybridExplainModelProfileVersion?: string;
  hybridPostmortemProviderMode?: string;
  hybridPostmortemModelProfileVersion?: string;
};

export const readPersistedOpenClawInstallState = (
  installStatePath: string
): PersistedOpenClawInstallState | null => {
  if (!existsSync(installStatePath)) {
    return null;
  }

  return JSON.parse(readFileSync(installStatePath, "utf8")) as PersistedOpenClawInstallState;
};

export const inspectRecordedOpenClawInstallState = (options: InstallerOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "openclaw",
    env: options.env,
    homeDir: options.homeDir
  });
  const state = readPersistedOpenClawInstallState(paths.installStatePath);

  return {
    installed: paths.usedInstallState,
    hostWiring: {
      wired: state?.hostWiring?.wired ?? false,
      restartRecommended: state?.hostWiring?.restartRecommended ?? false
    }
  };
};
