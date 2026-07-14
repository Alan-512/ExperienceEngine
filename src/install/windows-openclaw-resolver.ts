import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type {
  WindowsOpenClawExecutableExtension,
  WindowsOpenClawResolutionSource
} from "../runtime/distribution/constants.js";
import type {
  WindowsOpenClawResolutionRecord
} from "../runtime/distribution/types.js";

const SUPPORTED_EXTENSIONS = [".exe", ".cmd", ".bat"] as const;

export class WindowsOpenClawResolutionError extends Error {
  constructor(
    readonly code: "EE_OPENCLAW_EXECUTABLE_UNRESOLVED" | "EE_OPENCLAW_VERSION_PROBE_FAILED",
    message: string
  ) {
    super(message);
    this.name = "WindowsOpenClawResolutionError";
  }
}

export type ResolvedWindowsOpenClawExecutable = {
  path: string;
  source: WindowsOpenClawResolutionSource;
  extension: WindowsOpenClawExecutableExtension;
};

export type WindowsOpenClawProcessInvocation = {
  file: string;
  args_prefix: string[];
  launch_mode: "native_executable" | "validated_node_entrypoint";
  resolved_executable: ResolvedWindowsOpenClawExecutable;
};

export type WindowsOpenClawExecutor = (options: {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}) => string;

const defaultExecutor: WindowsOpenClawExecutor = (options) => execFileSync(
  options.file,
  options.args,
  {
    env: options.env,
    timeout: options.timeoutMs,
    encoding: "utf8",
    windowsHide: true,
    stdio: "pipe"
  }
);

const isFile = (path: string): boolean => {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
};

const normalizeCandidate = (value: string): string =>
  resolve(value.trim().replace(/^"|"$/gu, ""));

const supportedExtension = (
  value: string
): WindowsOpenClawExecutableExtension | null => {
  const extension = extname(value).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(
    extension as WindowsOpenClawExecutableExtension
  )
    ? extension as WindowsOpenClawExecutableExtension
    : null;
};

const isOpenClawPackageEntrypoint = (entrypoint: string): boolean => {
  if (!isFile(entrypoint)) {
    return false;
  }
  const packageJsonPath = join(dirname(entrypoint), "package.json");
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: unknown;
    };
    return parsed.name === "openclaw";
  } catch {
    return false;
  }
};

export const resolveWindowsOpenClawProcessInvocation = (options: {
  executable: ResolvedWindowsOpenClawExecutable;
  nodeExecutable?: string;
}): WindowsOpenClawProcessInvocation => {
  if (options.executable.extension === ".exe") {
    return {
      file: options.executable.path,
      args_prefix: [],
      launch_mode: "native_executable",
      resolved_executable: options.executable
    };
  }
  const shimDirectory = dirname(options.executable.path);
  const candidates = [
    join(shimDirectory, "node_modules", "openclaw", "openclaw.mjs"),
    resolve(shimDirectory, "..", "openclaw", "openclaw.mjs"),
    join(shimDirectory, "openclaw.mjs")
  ];
  const entrypoint = candidates.find(isOpenClawPackageEntrypoint);
  if (!entrypoint) {
    throw new WindowsOpenClawResolutionError(
      "EE_OPENCLAW_EXECUTABLE_UNRESOLVED",
      "The OpenClaw batch shim did not resolve to a validated adjacent npm package entrypoint."
    );
  }
  return {
    file: options.nodeExecutable ?? process.execPath,
    args_prefix: [entrypoint],
    launch_mode: "validated_node_entrypoint",
    resolved_executable: options.executable
  };
};

const addCandidate = (
  candidates: Array<{ path: string; source: WindowsOpenClawResolutionSource }>,
  seen: Set<string>,
  path: string | undefined,
  source: WindowsOpenClawResolutionSource
): void => {
  if (!path?.trim()) {
    return;
  }
  const normalized = normalizeCandidate(path);
  const key = normalized.toLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    candidates.push({ path: normalized, source });
  }
};

const pathLookupCandidates = (env: NodeJS.ProcessEnv): string[] => {
  const pathEntries = (env.PATH ?? env.Path ?? "")
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/gu, ""))
    .filter(Boolean);
  const pathext = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => SUPPORTED_EXTENSIONS.includes(
      entry as WindowsOpenClawExecutableExtension
    ));
  const extensions = Array.from(new Set([
    ...SUPPORTED_EXTENSIONS,
    ...pathext
  ]));
  return pathEntries.flatMap((directory) =>
    extensions.map((extension) => join(directory, `openclaw${extension}`))
  );
};

export const resolveWindowsOpenClawExecutable = (options: {
  operatorConfiguredPath?: string;
  hostProvidedPath?: string;
  env?: NodeJS.ProcessEnv;
} = {}): ResolvedWindowsOpenClawExecutable => {
  const candidates: Array<{
    path: string;
    source: WindowsOpenClawResolutionSource;
  }> = [];
  const seen = new Set<string>();
  addCandidate(
    candidates,
    seen,
    options.operatorConfiguredPath,
    "operator_configured_path"
  );
  addCandidate(
    candidates,
    seen,
    options.hostProvidedPath,
    "host_provided_path"
  );
  for (const path of pathLookupCandidates(options.env ?? process.env)) {
    addCandidate(candidates, seen, path, "path_lookup");
  }
  for (const candidate of candidates) {
    const extension = supportedExtension(candidate.path);
    if (extension && isFile(candidate.path)) {
      return {
        path: candidate.path,
        source: candidate.source,
        extension
      };
    }
  }
  throw new WindowsOpenClawResolutionError(
    "EE_OPENCLAW_EXECUTABLE_UNRESOLVED",
    "No supported OpenClaw .exe, .cmd, or .bat executable was found through the bounded Windows resolution order."
  );
};

const quoteWindowsBatchArgument = (value: string): string => {
  if (/[\x00\r\n]/u.test(value)) {
    throw new WindowsOpenClawResolutionError(
      "EE_OPENCLAW_VERSION_PROBE_FAILED",
      "Windows command arguments cannot contain control characters."
    );
  }
  return `"${value.replaceAll("%", "%%").replaceAll("\"", "\"\"")}"`;
};

export const invokeResolvedWindowsOpenClaw = (options: {
  executable: ResolvedWindowsOpenClawExecutable;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  executor?: WindowsOpenClawExecutor;
}): string => {
  const env = options.env ?? process.env;
  const timeout = options.timeoutMs ?? 10_000;
  const executor = options.executor ?? defaultExecutor;
  try {
    if (options.executable.extension === ".exe") {
      return executor({
        file: options.executable.path,
        args: [...options.args],
        env,
        timeoutMs: timeout
      });
    }
    const commandLine = [
      quoteWindowsBatchArgument(options.executable.path),
      ...options.args.map(quoteWindowsBatchArgument)
    ].join(" ");
    return executor({
      file: env.ComSpec || env.COMSPEC || "cmd.exe",
      args: ["/d", "/s", "/c", `"${commandLine}"`],
      env,
      timeoutMs: timeout
    });
  } catch (error) {
    throw new WindowsOpenClawResolutionError(
      "EE_OPENCLAW_VERSION_PROBE_FAILED",
      `OpenClaw Windows command failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const pathFingerprint = (path: string): string => createHash("sha256")
  .update(resolve(path).replaceAll("\\", "/").toLowerCase(), "utf8")
  .digest("hex");

export const probeWindowsOpenClawVersion = (options: {
  operatorConfiguredPath?: string;
  hostProvidedPath?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  executor?: WindowsOpenClawExecutor;
} = {}): {
  executable: ResolvedWindowsOpenClawExecutable;
  version: string;
  record: WindowsOpenClawResolutionRecord;
} => {
  const executable = resolveWindowsOpenClawExecutable(options);
  try {
    const output = invokeResolvedWindowsOpenClaw({
      executable,
      args: ["--version"],
      env: options.env,
      timeoutMs: options.timeoutMs,
      executor: options.executor
    }).trim();
    if (!output) {
      throw new Error("OpenClaw returned an empty version response.");
    }
    return {
      executable,
      version: output,
      record: {
        resolution_source: executable.source,
        resolved_executable_path_fingerprint: pathFingerprint(executable.path),
        resolved_extension: executable.extension,
        version_probe_status: "passed",
        version_probe_output_digest: createHash("sha256")
          .update(output, "utf8")
          .digest("hex")
      }
    };
  } catch (error) {
    if (error instanceof WindowsOpenClawResolutionError) {
      throw error;
    }
    throw new WindowsOpenClawResolutionError(
      "EE_OPENCLAW_VERSION_PROBE_FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
};

export const WINDOWS_OPENCLAW_RESOLVER_CONTRACT = Object.freeze({
  resolution_order: [
    "operator_configured_path",
    "host_provided_path",
    "path_lookup"
  ],
  supported_extensions: SUPPORTED_EXTENSIONS,
  extensionless_lookup_is_sufficient: false,
  broad_shell_true_allowed: false,
  batch_invocation_uses_fixed_cmd_arguments: true,
  long_running_batch_shim_uses_validated_node_entrypoint: true,
  batch_shim_entrypoint_requires_openclaw_package_metadata: true,
  canonical_package_local_activation_depends_on_resolver: false
});
