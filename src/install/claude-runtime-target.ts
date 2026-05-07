import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

export type ClaudeRuntimeTarget = "posix" | "windows";

type ResolveClaudeRuntimeTargetOptions = {
  requested?: string | null;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

type ClaudeLauncherPaths = {
  hook: string;
  mcpServer: string;
  windowsHook: string;
  windowsMcpServer: string;
};

const WINDOWS_TARGET_ALIASES = new Set(["windows", "win32", "git-bash", "powershell", "windows-cmd"]);
const POSIX_TARGET_ALIASES = new Set(["posix", "linux", "macos", "darwin", "wsl"]);

const isWindowsMountedPath = (value: string): boolean => /^\/mnt\/[a-z]\//i.test(value);

const escapeDoubleQuotedWindows = (value: string): string => value.replace(/"/g, '\\"');
const escapeSingleQuotedBash = (value: string): string => value.replace(/'/g, `'\"'\"'`);

const normalizeWindowsDrivePath = (value: string): string => {
  if (!isWindowsMountedPath(value)) {
    throw new Error(`Path ${value} is not accessible from a Windows Claude runtime.`);
  }

  const drive = value[5]?.toUpperCase();
  const rest = value.slice(7).replace(/\//g, "\\");
  return `${drive}:\\${rest}`;
};

export const resolveClaudeRuntimeTarget = (
  options: ResolveClaudeRuntimeTargetOptions = {}
): ClaudeRuntimeTarget => {
  const requested = options.requested?.trim().toLowerCase();
  if (requested) {
    if (WINDOWS_TARGET_ALIASES.has(requested)) {
      return "windows";
    }
    if (POSIX_TARGET_ALIASES.has(requested)) {
      return "posix";
    }
    throw new Error(`Unsupported Claude runtime target: ${options.requested}`);
  }

  const env = options.env ?? process.env;
  const override = env.EXPERIENCE_ENGINE_CLAUDE_RUNTIME_TARGET?.trim().toLowerCase();
  if (override) {
    if (WINDOWS_TARGET_ALIASES.has(override)) {
      return "windows";
    }
    if (POSIX_TARGET_ALIASES.has(override)) {
      return "posix";
    }
    throw new Error(`Unsupported Claude runtime target: ${env.EXPERIENCE_ENGINE_CLAUDE_RUNTIME_TARGET}`);
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
      // Fall through to mounted-path normalization.
    }
  }

  return normalizeWindowsDrivePath(resolved);
};

export const toPosixRuntimePath = (value: string): string => {
  const resolved = resolve(value);
  if (isWindowsMountedPath(resolved)) {
    return resolved;
  }
  if (/^[A-Za-z]:\\/.test(resolved)) {
    const drive = resolved[0].toLowerCase();
    const rest = resolved.slice(3).replace(/\\/g, "/");
    return `/mnt/${drive}/${rest}`;
  }
  return resolved;
};

const resolveRealPath = (value: string): string => (existsSync(value) ? realpathSync(value) : resolve(value));

const ensurePosixLauncher = (path: string, packageRoot: string, command: "claude-hook" | "mcp-server"): void => {
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
  command: "claude-hook" | "mcp-server"
): void => {
  const entry = join(packageRoot, "dist/cli/index.js");
  const realHome = resolveRealPath(productHome);
  const script =
    process.platform === "linux"
      ? `@echo off\r\nwsl.exe bash -lc "export EXPERIENCE_ENGINE_HOME='${escapeSingleQuotedBash(
          realHome
        )}'; node --no-warnings '${escapeSingleQuotedBash(entry)}' ${command}"\r\n`
      : `@echo off\r\nset "EXPERIENCE_ENGINE_HOME=${escapeDoubleQuotedWindows(
          toWindowsRuntimePath(realHome)
        )}"\r\nnode --no-warnings "${escapeDoubleQuotedWindows(
          toWindowsRuntimePath(entry)
        )}" ${command} %*\r\n`;
  writeFileSync(path, script, "utf8");
};

export const ensureClaudeLaunchers = (options: {
  productHome: string;
  packageRoot: string;
}): ClaudeLauncherPaths => {
  const realHome = resolveRealPath(options.productHome);
  const binDir = join(realHome, "bin");
  mkdirSync(binDir, { recursive: true });

  const posixHook = join(binDir, "experienceengine-claude-hook");
  const posixMcp = join(binDir, "experienceengine-mcp-server");
  const windowsHook = join(binDir, "experienceengine-claude-hook.cmd");
  const windowsMcp = join(binDir, "experienceengine-mcp-server.cmd");

  ensurePosixLauncher(posixHook, options.packageRoot, "claude-hook");
  ensurePosixLauncher(posixMcp, options.packageRoot, "mcp-server");
  ensureWindowsLauncher(windowsHook, options.packageRoot, realHome, "claude-hook");
  ensureWindowsLauncher(windowsMcp, options.packageRoot, realHome, "mcp-server");

  return {
    hook: posixHook,
    mcpServer: posixMcp,
    windowsHook,
    windowsMcpServer: windowsMcp
  };
};

export const buildClaudeHookCommandForTarget = (
  runtimeTarget: ClaudeRuntimeTarget,
  launcherPaths: ClaudeLauncherPaths
): string =>
  runtimeTarget === "windows"
    ? toWindowsRuntimePath(launcherPaths.windowsHook).replace(/\\/g, "/")
    : launcherPaths.hook;

export const buildClaudeMcpServerCommandForTarget = (
  runtimeTarget: ClaudeRuntimeTarget,
  launcherPaths: ClaudeLauncherPaths
): string[] =>
  runtimeTarget === "windows"
    ? ["cmd.exe", "/c", toWindowsRuntimePath(launcherPaths.windowsMcpServer)]
    : [resolveRealPath(launcherPaths.mcpServer)];
