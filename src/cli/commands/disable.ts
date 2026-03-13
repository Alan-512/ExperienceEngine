import { loadConfig } from "../../config/load-config.js";
import { resolveScope } from "../../input/scope-resolver.js";
import { nowIso } from "../../utils/clock.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../../store/sqlite/repositories/scope-repo.js";

export const runDisableCommand = (target?: string, reference?: string): void => {
  const db = openDatabase(loadConfig());
  runMigrations(db);

  if (target === "node" && reference) {
    const nodeRepo = new NodeRepository(db);
    const updated = nodeRepo.updateState(reference, "retired");

    if (!updated) {
      console.log(`[ExperienceEngine] Node ${reference} was not found.`);
      return;
    }

    console.log(`[ExperienceEngine] Disabled node ${reference}. It will no longer be injected.`);
    return;
  }

  if (target === "scope") {
    const scopeRepo = new ScopeRepository(db);
    const resolvedScope = resolveScope(process.cwd());
    const existing = scopeRepo.getById(resolvedScope.scope_id);
    const next = scopeRepo.upsert({
      ...resolvedScope,
      is_disabled: true,
      created_at: existing?.created_at ?? resolvedScope.created_at,
      updated_at: nowIso()
    });

    console.log(
      `[ExperienceEngine] Disabled interventions for scope ${next.scope_id} (${next.root_path ?? next.scope_name}).`
    );
    return;
  }

  console.log("Usage: ee disable node <id> | ee disable scope");
};
