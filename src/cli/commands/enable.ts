import { loadConfig } from "../../config/load-config.js";
import { nowIso } from "../../utils/clock.js";
import { resolveScope } from "../../input/scope-resolver.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { ScopeRepository } from "../../store/sqlite/repositories/scope-repo.js";

export const runEnableCommand = (target?: string): void => {
  if (target !== "scope") {
    console.log("Usage: ee enable scope");
    return;
  }

  const db = openDatabase(loadConfig());
  runMigrations(db);
  const scopeRepo = new ScopeRepository(db);
  const resolvedScope = resolveScope(process.cwd());
  const existing = scopeRepo.getById(resolvedScope.scope_id);

  if (!existing || !existing.is_disabled) {
    console.log(
      `[ExperienceEngine] Interventions are already enabled for scope ${resolvedScope.scope_id} (${resolvedScope.root_path ?? resolvedScope.scope_name}).`
    );
    return;
  }

  const next = scopeRepo.upsert({
    ...existing,
    is_disabled: false,
    updated_at: nowIso()
  });

  console.log(
    `[ExperienceEngine] Enabled interventions for scope ${next.scope_id} (${next.root_path ?? next.scope_name}).`
  );
};
