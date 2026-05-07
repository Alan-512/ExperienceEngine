import { basename, resolve } from "node:path";
import type { Scope } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";

const WINDOWS_DRIVE_PATH_RE = /^[A-Za-z]:[\\/]/;
const WSL_MOUNT_PATH_RE = /^\/mnt\/[A-Za-z]\//;

const isWindowsOrWslAbsolutePath = (path: string): boolean =>
  WINDOWS_DRIVE_PATH_RE.test(path) || WSL_MOUNT_PATH_RE.test(path);

const normalizeSlashes = (path: string): string => path.replace(/\\/g, "/");

export const normalizeScopeIdentityPath = (rootPath: string): string => {
  const slashPath = normalizeSlashes(rootPath);
  const wslMatch = /^\/mnt\/([A-Za-z])\/(.*)$/.exec(slashPath);
  if (wslMatch) {
    return `${wslMatch[1].toLowerCase()}:/${wslMatch[2]}`.toLowerCase();
  }
  if (WINDOWS_DRIVE_PATH_RE.test(rootPath)) {
    return slashPath.toLowerCase();
  }
  return rootPath;
};

const scopeNameFromPath = (rootPath: string): string => {
  const slashPath = normalizeSlashes(rootPath).replace(/\/+$/, "");
  return slashPath.split("/").filter(Boolean).at(-1) ?? basename(rootPath);
};

export const resolveScope = (cwd?: string): Scope => {
  const inputPath = cwd ?? process.cwd();
  const rootPath = isWindowsOrWslAbsolutePath(inputPath) ? inputPath : resolve(inputPath);
  const scopeName = scopeNameFromPath(rootPath);
  const timestamp = nowIso();
  const identityPath = normalizeScopeIdentityPath(rootPath);

  return {
    scope_id: stableId("scope", identityPath),
    scope_type: "workspace",
    scope_name: scopeName || "workspace",
    root_path: rootPath,
    is_disabled: false,
    created_at: timestamp,
    updated_at: timestamp
  };
};
