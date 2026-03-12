import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ExperienceEngineConfig } from "./config-schema.js";

export type PathMode = "explicit" | "product" | "openclaw-compat";

export type ResolvedPathInfo = {
  mode: PathMode;
  productHome: string;
  compatibilityHome: string;
  activeHome: string;
  dataDir: string;
  sqlitePath: string;
  captureDir: string;
  installStatePath: string;
  usedInstallState: boolean;
};

type ResolvePathOptions = {
  adapter?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  overrides?: Partial<ExperienceEngineConfig>;
};

const resolveHome = (options?: ResolvePathOptions): string =>
  options?.homeDir ? resolve(options.homeDir) : resolve(homedir());

const hasExplicitPaths = (
  overrides: Partial<ExperienceEngineConfig>,
  env: NodeJS.ProcessEnv
): boolean =>
  Boolean(
    env.EXPERIENCE_ENGINE_HOME ||
      env.EXPERIENCE_ENGINE_DATA_DIR ||
      env.EXPERIENCE_ENGINE_CAPTURE_DIR ||
      overrides.dataDir ||
      overrides.sqlitePath ||
      overrides.captureDir
  );

export const resolveExperienceEnginePaths = (options: ResolvePathOptions = {}): ResolvedPathInfo => {
  const adapter = options.adapter ?? "openclaw";
  const env = options.env ?? process.env;
  const overrides = options.overrides ?? {};
  const home = resolveHome(options);

  const productHome = resolve(env.EXPERIENCE_ENGINE_HOME ?? join(home, ".experienceengine"));
  const compatibilityHome = resolve(join(home, ".openclaw", "experienceengine"));
  const installStatePath = resolve(productHome, "adapters", adapter, "install.json");
  const hasInstallState = existsSync(installStatePath);
  const compatibilitySqlitePath = join(compatibilityHome, "sqlite", "experienceengine.db");
  const hasCompatibilityData = existsSync(compatibilitySqlitePath) || existsSync(compatibilityHome);

  if (hasExplicitPaths(overrides, env)) {
    const activeHome = resolve(overrides.dataDir ?? env.EXPERIENCE_ENGINE_DATA_DIR ?? productHome);
    return {
      mode: "explicit",
      productHome,
      compatibilityHome,
      activeHome,
      dataDir: activeHome,
      sqlitePath: resolve(
        overrides.sqlitePath ?? join(activeHome, "sqlite", "experienceengine.db")
      ),
      captureDir: resolve(
        overrides.captureDir ?? env.EXPERIENCE_ENGINE_CAPTURE_DIR ?? join(activeHome, "captures")
      ),
      installStatePath,
      usedInstallState: hasInstallState
    };
  }

  const mode: PathMode = hasInstallState
    ? "product"
    : adapter === "openclaw" && hasCompatibilityData
      ? "openclaw-compat"
      : "product";
  const activeHome = mode === "openclaw-compat" ? compatibilityHome : productHome;
  const captureDir =
    mode === "openclaw-compat"
      ? join(activeHome, "runtime-captures")
      : adapter === "openclaw"
        ? join(activeHome, "captures")
        : join(productHome, "adapters", adapter, "captures");

  return {
    mode,
    productHome,
    compatibilityHome,
    activeHome,
    dataDir: activeHome,
    sqlitePath: join(activeHome, "sqlite", "experienceengine.db"),
    captureDir,
    installStatePath,
    usedInstallState: hasInstallState
  };
};

export const resolveProductStateDir = (paths: ResolvedPathInfo): string => dirname(paths.installStatePath);
