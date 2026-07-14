import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  MaterializedPublishedArtifact,
  PublishedArtifactInstaller
} from "./artifact-materializer.js";
import type {
  PublishedDistributionChannel
} from "./constants.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";

export type NpmCliInvocation = {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
};

export type NpmCliRunner = (
  invocation: NpmCliInvocation
) => Promise<{ stdout: string; stderr: string }>;

const packagePathSegments = (packageName: string): string[] =>
  packageName.split("/").filter(Boolean);

const defaultNpmCliCandidates = (options: {
  execPath: string;
  env: NodeJS.ProcessEnv;
}): string[] => {
  const explicit = options.env.EXPERIENCE_ENGINE_NPM_CLI_PATH?.trim();
  const inherited = options.env.npm_execpath?.trim();
  return [
    explicit,
    join(dirname(options.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    inherited && /(?:^|[\\/])npm(?:[\\/]|-cli\.js$)/iu.test(inherited)
      ? inherited
      : undefined,
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/lib/node_modules/npm/bin/npm-cli.js"
  ].filter((candidate): candidate is string => Boolean(candidate));
};

export const resolveNpmCliEntrypoint = (options: {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
} = {}): string => {
  const exists = options.exists ?? existsSync;
  const candidates = defaultNpmCliCandidates({
    execPath: options.execPath ?? process.execPath,
    env: options.env ?? process.env
  });
  const resolved = candidates
    .map((candidate) => resolve(candidate))
    .find((candidate) => exists(candidate));
  if (!resolved) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
      "Unable to resolve a package-local npm CLI entrypoint for isolated artifact installation."
    );
  }
  return resolved;
};

const defaultNpmCliRunner: NpmCliRunner = (invocation) =>
  new Promise((resolveRun, rejectRun) => {
    execFile(
      invocation.executable,
      invocation.args,
      {
        cwd: invocation.cwd,
        env: invocation.env,
        timeout: invocation.timeoutMs,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          rejectRun(new PublishedRuntimeClosureError(
            "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
            `Isolated npm artifact installation failed: ${stderr.trim() || error.message}`
          ));
          return;
        }
        resolveRun({ stdout, stderr });
      }
    );
  });

const readInstalledIdentity = async (packageRoot: string): Promise<{
  name?: unknown;
  version?: unknown;
}> => JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8")
) as { name?: unknown; version?: unknown };

export const createNpmPublishedArtifactInstaller = (options: {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
  npmCliPath?: string;
  runner?: NpmCliRunner;
  timeoutMs?: number;
  acceptedChannels?: readonly PublishedDistributionChannel[];
} = {}): PublishedArtifactInstaller => async ({ artifact, installRoot }) => {
  const acceptedChannels = options.acceptedChannels ?? ["npm"];
  if (!acceptedChannels.includes(artifact.published_channel)) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CHANNEL_MISMATCH",
      "The npm-pack artifact installer does not accept this distribution channel."
    );
  }
  const isolatedRoot = resolve(installRoot);
  const cacheRoot = join(isolatedRoot, ".npm-cache");
  const userConfigPath = join(isolatedRoot, ".npmrc");
  await mkdir(cacheRoot, { recursive: true });
  await writeFile(
    userConfigPath,
    [
      "audit=false",
      "fund=false",
      "ignore-scripts=true",
      "package-lock=false",
      "update-notifier=false",
      ""
    ].join("\n"),
    { encoding: "utf8", flag: "wx", mode: 0o600 }
  );
  const execPath = options.execPath ?? process.execPath;
  const npmCliPath = options.npmCliPath ?? resolveNpmCliEntrypoint({
    execPath,
    env: options.env
  });
  const runner = options.runner ?? defaultNpmCliRunner;
  await runner({
    executable: execPath,
    args: [
      npmCliPath,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--update-notifier=false",
      "--cache",
      cacheRoot,
      "--userconfig",
      userConfigPath,
      "--prefix",
      isolatedRoot,
      resolve(artifact.artifact_path)
    ],
    cwd: isolatedRoot,
    env: {
      ...(options.env ?? process.env),
      NODE_PATH: "",
      npm_config_global: "false"
    },
    timeoutMs: options.timeoutMs ?? 180_000
  });
  const packageRoot = join(
    isolatedRoot,
    "node_modules",
    ...packagePathSegments(artifact.package_name)
  );
  let identity: { name?: unknown; version?: unknown };
  try {
    identity = await readInstalledIdentity(packageRoot);
  } catch (error) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
      `Installed npm artifact package metadata is unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (
    identity.name !== artifact.package_name ||
    identity.version !== artifact.package_version
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_VERSION_INVALID",
      "Installed npm artifact identity does not match the exact downloaded package version."
    );
  }
  return { packageRoot };
};

export const NPM_PUBLISHED_ARTIFACT_INSTALLER_CONTRACT = Object.freeze({
  exact_downloaded_archive_only: true,
  lifecycle_scripts_disabled: true,
  isolated_cache_and_user_config: true,
  global_node_path_disabled: true,
  exact_installed_identity_required: true
});
