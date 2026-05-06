import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

export type CodexRuntimeTarget = "posix" | "windows";

type ResolveCodexRuntimeTargetOptions = {
  requested?: string | null;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

type CodexLauncherPaths = {
  mcpServer: string;
  windowsMcpServer: string;
  hook: string;
  windowsHook: string;
};

const WINDOWS_TARGET_ALIASES = new Set(["windows", "win32", "git-bash", "powershell", "windows-cmd"]);
const POSIX_TARGET_ALIASES = new Set(["posix", "linux", "macos", "darwin", "wsl"]);

const isWindowsMountedPath = (value: string): boolean => /^\/mnt\/[a-z]\//i.test(value);
const escapeSingleQuotedBash = (value: string): string => value.replace(/'/g, `'\"'\"'`);
const escapeDoubleQuotedWindows = (value: string): string => value.replace(/"/g, '\\"');
const quoteWindowsCmdArgument = (value: string): string => `"${escapeDoubleQuotedWindows(value)}"`;

const normalizeWindowsDrivePath = (value: string): string => {
  if (!isWindowsMountedPath(value)) {
    throw new Error(`Path ${value} is not accessible from a Windows Codex runtime.`);
  }

  const drive = value[5]?.toUpperCase();
  const rest = value.slice(7).replace(/\//g, "\\");
  return `${drive}:\\${rest}`;
};

const resolveRealPath = (value: string): string => (existsSync(value) ? realpathSync(value) : resolve(value));
export const resolveRealPathForCodex = resolveRealPath;

export const resolveCodexRuntimeTarget = (
  options: ResolveCodexRuntimeTargetOptions = {}
): CodexRuntimeTarget => {
  const requested = options.requested?.trim().toLowerCase();
  if (requested) {
    if (WINDOWS_TARGET_ALIASES.has(requested)) {
      return "windows";
    }
    if (POSIX_TARGET_ALIASES.has(requested)) {
      return "posix";
    }
    throw new Error(`Unsupported Codex runtime target: ${options.requested}`);
  }

  const env = options.env ?? process.env;
  const override = env.EXPERIENCE_ENGINE_CODEX_RUNTIME_TARGET?.trim().toLowerCase();
  if (override) {
    if (WINDOWS_TARGET_ALIASES.has(override)) {
      return "windows";
    }
    if (POSIX_TARGET_ALIASES.has(override)) {
      return "posix";
    }
    throw new Error(`Unsupported Codex runtime target: ${env.EXPERIENCE_ENGINE_CODEX_RUNTIME_TARGET}`);
  }

  const platform = options.platform ?? process.platform;
  return platform === "win32" ? "windows" : "posix";
};

export const toWindowsRuntimePath = (value: string): string => {
  const resolved = resolve(value);
  if (/^[A-Za-z]:\\/.test(resolved)) {
    return resolved;
  }

  if (process.platform === "linux") {
    try {
      const converted = execFileSync("wslpath", ["-w", resolved], {
        stdio: "pipe",
        encoding: "utf8"
      }).trim();
      if (converted) {
        return converted;
      }
    } catch {
      // Fall through.
    }
  }

  return normalizeWindowsDrivePath(resolved);
};

const ensurePosixLauncher = (path: string, packageRoot: string, command: "codex-mcp-server" | "codex-hook"): void => {
  const script = `#!/usr/bin/env bash
set -euo pipefail
exec node --no-warnings "${join(packageRoot, "dist/cli/index.js")}" ${command} "$@"
`;
  writeFileSync(path, script, "utf8");
  chmodSync(path, 0o755);
};

const ensureWindowsLauncher = (
  path: string,
  packageRoot: string,
  productHome: string,
  command: "codex-mcp-server" | "codex-hook"
): void => {
  const entry = join(packageRoot, "dist/cli/index.js");
  const realHome = resolveRealPath(productHome);
  const script =
    process.platform === "linux"
      ? `@echo off\r\nwsl.exe bash -lc "export EXPERIENCE_ENGINE_HOME='${escapeSingleQuotedBash(
          realHome
        )}'; node --no-warnings '${escapeSingleQuotedBash(entry)}' ${command}"\r\n`
      : `@echo off\r\nnode --no-warnings "${escapeDoubleQuotedWindows(
          toWindowsRuntimePath(entry)
        )}" ${command} %*\r\n`;
  writeFileSync(path, script, "utf8");
};

export const ensureCodexLaunchers = (options: {
  productHome: string;
  packageRoot: string;
}): CodexLauncherPaths => {
  const realHome = resolveRealPath(options.productHome);
  const paths = resolveCodexLauncherPaths({ productHome: realHome });
  mkdirSync(join(realHome, "bin"), { recursive: true });

  ensurePosixLauncher(paths.mcpServer, options.packageRoot, "codex-mcp-server");
  ensureWindowsLauncher(paths.windowsMcpServer, options.packageRoot, realHome, "codex-mcp-server");
  ensurePosixLauncher(paths.hook, options.packageRoot, "codex-hook");
  ensureWindowsLauncher(paths.windowsHook, options.packageRoot, realHome, "codex-hook");

  return paths;
};

export const resolveCodexLauncherPaths = (options: {
  productHome: string;
}): CodexLauncherPaths => {
  const realHome = resolveRealPath(options.productHome);
  const binDir = join(realHome, "bin");

  return {
    mcpServer: join(binDir, "experienceengine-codex-mcp-server"),
    windowsMcpServer: join(binDir, "experienceengine-codex-mcp-server.cmd"),
    hook: join(binDir, "experienceengine-codex-hook"),
    windowsHook: join(binDir, "experienceengine-codex-hook.cmd")
  };
};

export const buildCodexHookCommandForTarget = (
  runtimeTarget: CodexRuntimeTarget,
  launcherPaths: CodexLauncherPaths
): string =>
  runtimeTarget === "windows"
    ? `cmd.exe /c ${quoteWindowsCmdArgument(toWindowsRuntimePath(launcherPaths.windowsHook))}`
    : resolveRealPath(launcherPaths.hook);

export const buildCodexMcpServerCommandForTarget = (
  runtimeTarget: CodexRuntimeTarget,
  launcherPaths: CodexLauncherPaths
): string[] =>
  runtimeTarget === "windows"
    ? ["cmd.exe", "/c", quoteWindowsCmdArgument(toWindowsRuntimePath(launcherPaths.windowsMcpServer))]
    : [resolveRealPath(launcherPaths.mcpServer)];
