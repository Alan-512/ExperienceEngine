import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  RuntimeClosureAsset,
  RuntimeClosureManifest
} from "../identity/types.js";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";

export type PublishedEntrypointImportStatus = "passed" | "failed";

export type PublishedEntrypointImportRecord = {
  role: string;
  path: string;
  status: PublishedEntrypointImportStatus;
  evidence_digest: string | null;
  failure_code: string | null;
};

export type PublishedEntrypointImportReport = {
  valid: boolean;
  records: PublishedEntrypointImportRecord[];
  issues: string[];
};

export type EntrypointImportInvocation = {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
};

export type EntrypointImportRunner = (
  invocation: EntrypointImportInvocation
) => Promise<void>;

const IMPORT_SCRIPT = [
  "import { pathToFileURL } from 'node:url';",
  "const target = process.env.EXPERIENCE_ENGINE_ENTRYPOINT_IMPORT_TARGET;",
  "if (!target) throw new Error('entrypoint target missing');",
  "await import(pathToFileURL(target).href);"
].join("\n");

const defaultRunner: EntrypointImportRunner = (invocation) =>
  new Promise((resolveRun, rejectRun) => {
    execFile(
      invocation.executable,
      invocation.args,
      {
        cwd: invocation.cwd,
        env: invocation.env,
        timeout: invocation.timeoutMs,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024
      },
      (error) => {
        if (error) {
          rejectRun(error);
          return;
        }
        resolveRun();
      }
    );
  });

const normalizedRelativeEntrypoint = (options: {
  packageRoot: string;
  entrypoint: RuntimeClosureAsset;
}): { relativePath: string; absolutePath: string } => {
  const packageRoot = resolve(options.packageRoot);
  const absolutePath = resolve(packageRoot, options.entrypoint.path);
  const relativePath = relative(packageRoot, absolutePath);
  if (
    !options.entrypoint.path ||
    isAbsolute(options.entrypoint.path) ||
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\") ||
    isAbsolute(relativePath)
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
      `Declared entrypoint ${options.entrypoint.role} does not resolve inside the installed package root.`
    );
  }
  return {
    relativePath: relativePath.replace(/\\/gu, "/"),
    absolutePath
  };
};

const stableImportFailureCode = (error: unknown): string => {
  const candidate = error as NodeJS.ErrnoException & {
    killed?: boolean;
    signal?: string | null;
  };
  if (candidate.killed || candidate.signal === "SIGTERM") {
    return "EE_PUBLISHED_ENTRYPOINT_IMPORT_TIMEOUT";
  }
  if (candidate.code === "ENOENT") {
    return "EE_PUBLISHED_ENTRYPOINT_MISSING";
  }
  return "EE_PUBLISHED_ENTRYPOINT_IMPORT_FAILED";
};

const reportableEntrypointPath = (value: string): string => {
  const normalized = value.replace(/\\/gu, "/");
  if (
    isAbsolute(value) ||
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return `invalid-entrypoint-path:${sha256Text(normalized)}`;
  }
  return normalized;
};

export const validatePublishedEntrypointImports = async (options: {
  packageRoot: string;
  manifest: RuntimeClosureManifest;
  executable?: string;
  env?: NodeJS.ProcessEnv;
  runner?: EntrypointImportRunner;
  timeoutMs?: number;
}): Promise<PublishedEntrypointImportReport> => {
  const packageRoot = resolve(options.packageRoot);
  const runner = options.runner ?? defaultRunner;
  const records: PublishedEntrypointImportRecord[] = [];
  const issues: string[] = [];
  for (const entrypoint of options.manifest.required_entrypoints) {
    let resolvedEntrypoint: {
      relativePath: string;
      absolutePath: string;
    };
    try {
      resolvedEntrypoint = normalizedRelativeEntrypoint({
        packageRoot,
        entrypoint
      });
      const entrypointStat = await stat(resolvedEntrypoint.absolutePath);
      if (!entrypointStat.isFile()) {
        throw Object.assign(new Error("entrypoint is not a file"), {
          code: "ENOENT"
        });
      }
      await runner({
        executable: options.executable ?? process.execPath,
        args: ["--input-type=module", "--eval", IMPORT_SCRIPT],
        cwd: packageRoot,
        env: {
          ...(options.env ?? process.env),
          NODE_PATH: "",
          NODE_OPTIONS: "",
          EXPERIENCE_ENGINE_ENTRYPOINT_IMPORT_TARGET:
            resolvedEntrypoint.absolutePath
        },
        timeoutMs: options.timeoutMs ?? 15_000
      });
      const evidence = {
        role: entrypoint.role,
        path: resolvedEntrypoint.relativePath,
        expected_sha256: entrypoint.sha256,
        import_mode: "isolated_dynamic_import"
      };
      records.push({
        role: entrypoint.role,
        path: resolvedEntrypoint.relativePath,
        status: "passed",
        evidence_digest: sha256Text(canonicalJson(evidence)),
        failure_code: null
      });
    } catch (error) {
      const failureCode = error instanceof PublishedRuntimeClosureError
        ? error.code
        : stableImportFailureCode(error);
      const relativePath = reportableEntrypointPath(entrypoint.path);
      records.push({
        role: entrypoint.role,
        path: relativePath,
        status: "failed",
        evidence_digest: sha256Text(canonicalJson({
          role: entrypoint.role,
          path: relativePath,
          failure_code: failureCode
        })),
        failure_code: failureCode
      });
      issues.push(`${entrypoint.role}:${failureCode}`);
      break;
    }
  }
  return {
    valid:
      records.length === options.manifest.required_entrypoints.length &&
      records.every((record) => record.status === "passed"),
    records,
    issues
  };
};

export const PUBLISHED_ENTRYPOINT_IMPORT_CONTRACT = Object.freeze({
  manifest_declared_entrypoints_only: true,
  package_root_containment_required: true,
  source_repo_fallback_allowed: false,
  node_path_disabled: true,
  node_options_disabled: true,
  bounded_import_timeout_ms: 15_000,
  absolute_paths_persisted: false
});
