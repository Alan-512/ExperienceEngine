import type { DatabaseSync } from "node:sqlite";
import { bootstrapDatabase, openDatabase, withTransaction } from "../store/sqlite/db.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { ScopeTaskStats } from "../types/domain.js";

export type ScopeMergeReport = {
  sourceScopeId: string;
  targetScopeId: string;
  moved: {
    inputRecords: number;
    taskRuns: number;
    injections: number;
    nodes: number;
    candidates: number;
  };
  merged: {
    taskStats: number;
  };
};

const countByScope = (db: DatabaseSync, table: string, scopeId: string): number =>
  (
    db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE scope_id = ?`).get(scopeId) as {
      count: number;
    }
  ).count;

const updateScopeId = (db: DatabaseSync, table: string, sourceScopeId: string, targetScopeId: string): number =>
  (
    db.prepare(`UPDATE ${table} SET scope_id = ? WHERE scope_id = ?`).run(targetScopeId, sourceScopeId) as {
      changes: number;
    }
  ).changes;

const mergeTaskStats = (db: DatabaseSync, sourceScopeId: string, targetScopeId: string): number => {
  const repo = new StatsRepository(db);
  const sourceStats = repo.listAll().filter((row) => row.scope_id === sourceScopeId);
  const targetByTask = new Map(
    repo
      .listAll()
      .filter((row) => row.scope_id === targetScopeId)
      .map((row) => [row.task_type, row] as const)
  );

  for (const row of sourceStats) {
    const existing = targetByTask.get(row.task_type);
    const merged: ScopeTaskStats = existing
      ? {
          scope_id: targetScopeId,
          task_type: row.task_type,
          total_tasks: existing.total_tasks + row.total_tasks,
          success_tasks: existing.success_tasks + row.success_tasks,
          failed_tasks: existing.failed_tasks + row.failed_tasks,
          unknown_tasks: existing.unknown_tasks + row.unknown_tasks,
          injected_tasks: existing.injected_tasks + row.injected_tasks,
          injected_success_tasks: existing.injected_success_tasks + row.injected_success_tasks,
          updated_at: existing.updated_at > row.updated_at ? existing.updated_at : row.updated_at
        }
      : {
          ...row,
          scope_id: targetScopeId
        };
    repo.upsert(merged);
  }

  db.prepare("DELETE FROM scope_task_stats WHERE scope_id = ?").run(sourceScopeId);
  return sourceStats.length;
};

export const mergeScopes = (args: {
  db: DatabaseSync;
  sourceScopeId: string;
  targetScopeId: string;
  now?: () => string;
}): ScopeMergeReport => {
  const { db, sourceScopeId, targetScopeId } = args;
  if (sourceScopeId === targetScopeId) {
    throw new Error("Source and target scope ids must be different.");
  }

  bootstrapDatabase(db);
  const scopeRepo = new ScopeRepository(db);
  const source = scopeRepo.getById(sourceScopeId);
  const target = scopeRepo.getById(targetScopeId);

  if (!source) {
    throw new Error(`Unknown source scope: ${sourceScopeId}`);
  }
  if (!target) {
    throw new Error(`Unknown target scope: ${targetScopeId}`);
  }

  return withTransaction(db, () => {
    const moved = {
      inputRecords: updateScopeId(db, "experience_input_records", sourceScopeId, targetScopeId),
      taskRuns: updateScopeId(db, "task_runs", sourceScopeId, targetScopeId),
      injections: updateScopeId(db, "injection_events", sourceScopeId, targetScopeId),
      nodes: updateScopeId(db, "experience_nodes", sourceScopeId, targetScopeId),
      candidates: updateScopeId(db, "experience_candidates", sourceScopeId, targetScopeId)
    };

    const merged = {
      taskStats: mergeTaskStats(db, sourceScopeId, targetScopeId)
    };

    scopeRepo.upsert({
      ...target,
      is_disabled: target.is_disabled && source.is_disabled,
      created_at: target.created_at < source.created_at ? target.created_at : source.created_at,
      updated_at: args.now?.() ?? new Date().toISOString()
    });
    db.prepare("DELETE FROM scopes WHERE scope_id = ?").run(sourceScopeId);

    return {
      sourceScopeId,
      targetScopeId,
      moved,
      merged
    };
  });
};

export const mergeScopesWithConfig = (
  config: ExperienceEngineConfig,
  sourceScopeId: string,
  targetScopeId: string
): ScopeMergeReport => {
  const db = openDatabase(config);
  try {
    return mergeScopes({ db, sourceScopeId, targetScopeId });
  } finally {
    db.close();
  }
};
