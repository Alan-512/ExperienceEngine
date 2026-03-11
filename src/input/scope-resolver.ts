import { basename, resolve } from "node:path";
import type { Scope } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";

export const resolveScope = (cwd?: string): Scope => {
  const rootPath = resolve(cwd ?? process.cwd());
  const scopeName = basename(rootPath);
  const timestamp = nowIso();

  return {
    scope_id: stableId("scope", rootPath),
    scope_type: "workspace",
    scope_name: scopeName || "workspace",
    root_path: rootPath,
    is_disabled: false,
    created_at: timestamp,
    updated_at: timestamp
  };
};

