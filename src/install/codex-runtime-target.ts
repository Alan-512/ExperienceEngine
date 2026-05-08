import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, posix, resolve } from "node:path";

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
const toWindowsForwardSlashPath = (value: string): string => value.replace(/\\/g, "/");
const quoteJsString = (value: string): string => JSON.stringify(value);

const normalizeWindowsDrivePath = (value: string): string => {
  if (!isWindowsMountedPath(value)) {
    throw new Error(`Path ${value} is not accessible from a Windows Codex runtime.`);
  }

  const drive = value[5]?.toUpperCase();
  const rest = value.slice(7).replace(/\//g, "\\");
  return `${drive}:\\${rest}`;
};

const isPosixAbsolutePath = (value: string): boolean => value.startsWith("/");
const joinRuntimePath = (base: string, ...segments: string[]): string =>
  isPosixAbsolutePath(base) ? posix.join(base, ...segments) : join(base, ...segments);
const resolveRealPath = (value: string): string =>
  isPosixAbsolutePath(value) ? value : existsSync(value) ? realpathSync(value) : resolve(value);
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
  if (isWindowsMountedPath(value)) {
    return normalizeWindowsDrivePath(value);
  }

  const resolved = resolve(value);
  if (/^[A-Za-z]:\\/.test(resolved)) {
    return resolved;
  }

  if (isWindowsMountedPath(resolved)) {
    return normalizeWindowsDrivePath(resolved);
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
exec node --no-warnings "${joinRuntimePath(packageRoot, "dist/cli/index.js")}" ${command} "$@"
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
  const entry = joinRuntimePath(packageRoot, "dist/cli/index.js");
  const realHome = resolveRealPath(productHome);
  const hookEnv =
    command === "codex-hook"
      ? {
          EXPERIENCE_ENGINE_EMBEDDING_PROVIDER: "legacy",
          EXPERIENCE_ENGINE_EMBEDDING_API_TIMEOUT_MS: "1500",
          EXPERIENCE_ENGINE_DISABLE_LOCAL_EMBEDDING_FALLBACK: "1"
        }
      : {};
  const script =
    process.platform === "linux"
      ? `@echo off\r\nwsl.exe bash -lc "export EXPERIENCE_ENGINE_HOME='${escapeSingleQuotedBash(
          realHome
        )}'${Object.entries(hookEnv)
          .map(([key, value]) => ` ${key}='${escapeSingleQuotedBash(value)}'`)
          .join("")}; node --no-warnings '${escapeSingleQuotedBash(entry)}' ${command}"\r\n`
      : `@echo off\r\nset "EXPERIENCE_ENGINE_HOME=${escapeDoubleQuotedWindows(
          toWindowsRuntimePath(realHome)
        )}"\r\n${Object.entries(hookEnv)
          .map(([key, value]) => `set ${key}=${value}\r\n`)
          .join("")}node --no-warnings "${escapeDoubleQuotedWindows(
          toWindowsRuntimePath(entry)
        )}" ${command} %*\r\n`;
  writeFileSync(path, script, "utf8");
};

export const ensureCodexProjectHookLauncher = (options: {
  cwd: string;
  packageRoot: string;
  productHome: string;
}): { path: string; command: string } => {
  const launcherPath = join(options.cwd, ".codex", "experienceengine-codex-hook.cmd");
  mkdirSync(join(options.cwd, ".codex"), { recursive: true });
  ensureWindowsLauncher(launcherPath, options.packageRoot, options.productHome, "codex-hook");

  return {
    path: launcherPath,
    command: buildCrossRuntimeCodexHookCommand({
      packageRoot: options.packageRoot,
      productHome: options.productHome
    })
  };
};

export const buildCodexProjectHookCommand = (cwd: string): string => {
  const launcherPath = join(cwd, ".codex", "experienceengine-codex-hook.cmd");
  return `cmd.exe /c ${quoteWindowsCmdArgument(toWindowsForwardSlashPath(toWindowsRuntimePath(launcherPath)))}`;
};

export const ensureCodexLaunchers = (options: {
  productHome: string;
  packageRoot: string;
}): CodexLauncherPaths => {
  const realHome = resolveRealPath(options.productHome);
  const paths = resolveCodexLauncherPaths({ productHome: realHome });
  mkdirSync(joinRuntimePath(realHome, "bin"), { recursive: true });

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
  const binDir = joinRuntimePath(realHome, "bin");

  return {
    mcpServer: joinRuntimePath(binDir, "experienceengine-codex-mcp-server"),
    windowsMcpServer: joinRuntimePath(binDir, "experienceengine-codex-mcp-server.cmd"),
    hook: joinRuntimePath(binDir, "experienceengine-codex-hook"),
    windowsHook: joinRuntimePath(binDir, "experienceengine-codex-hook.cmd")
  };
};

export const buildCodexHookCommandForTarget = (
  runtimeTarget: CodexRuntimeTarget,
  launcherPaths: CodexLauncherPaths
): string =>
  runtimeTarget === "windows"
    ? `cmd.exe /c ${quoteWindowsCmdArgument(toWindowsForwardSlashPath(toWindowsRuntimePath(launcherPaths.windowsHook)))}`
    : resolveRealPath(launcherPaths.hook);

export const buildCrossRuntimeCodexHookCommand = (options: {
  packageRoot: string;
  productHome: string;
}): string => {
  const windowsHome = toWindowsRuntimePath(options.productHome);
  const posixHome = options.productHome.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_, drive: string) => `/mnt/${drive.toLowerCase()}/`);
  const windowsRoot = toWindowsRuntimePath(options.packageRoot);
  const posixRoot = options.packageRoot.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_, drive: string) => `/mnt/${drive.toLowerCase()}/`);
  const script = [
    "const cp=require('node:child_process')",
    "const path=require('node:path')",
    "const win=process.platform==='win32'",
    `process.env.EXPERIENCE_ENGINE_HOME=win?${quoteJsString(windowsHome)}:${quoteJsString(posixHome)}`,
    "process.env.EXPERIENCE_ENGINE_EMBEDDING_PROVIDER='legacy'",
    "process.env.EXPERIENCE_ENGINE_EMBEDDING_API_TIMEOUT_MS='1500'",
    "process.env.EXPERIENCE_ENGINE_DISABLE_LOCAL_EMBEDDING_FALLBACK='1'",
    `const root=win?${quoteJsString(windowsRoot)}:${quoteJsString(posixRoot)}`,
    "const child=cp.spawn(process.execPath,['--no-warnings',path.join(root,'dist/cli/index.js'),'codex-hook'],{stdio:'inherit',env:process.env})",
    "child.on('exit',(code,signal)=>process.exit(code??(signal?1:0)))"
  ].join(";");
  return `node -e ${quoteWindowsCmdArgument(script)}`;
};

export const buildCodexMcpServerCommandForTarget = (
  runtimeTarget: CodexRuntimeTarget,
  launcherPaths: CodexLauncherPaths
): string[] =>
  runtimeTarget === "windows"
    ? ["cmd.exe", "/c", quoteWindowsCmdArgument(toWindowsRuntimePath(launcherPaths.windowsMcpServer))]
    : [resolveRealPath(launcherPaths.mcpServer)];
