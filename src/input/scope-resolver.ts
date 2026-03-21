import { basename, resolve } from "node:path";
import type { Scope } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";

const WINDOWS_DRIVE_PATH_RE = /^[A-Za-z]:[\\/]/;
const WSL_MOUNT_PATH_RE = /^\/mnt\/[A-Za-z]\//;

export const normalizeScopeIdentityPath = (rootPath: string): string => {
  if (WINDOWS_DRIVE_PATH_RE.test(rootPath) || WSL_MOUNT_PATH_RE.test(rootPath)) {
    return rootPath.toLowerCase();
  }
  return rootPath;
};

export const resolveScope = (cwd?: string): Scope => {
  const rootPath = resolve(cwd ?? process.cwd());
  const scopeName = basename(rootPath);
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
