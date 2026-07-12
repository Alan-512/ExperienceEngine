import type { DatabaseSync } from "node:sqlite";
import {
  RUNTIME_SQLITE_FAILURE_MAPPINGS,
  SQLITE_RUNTIME_POLICY
} from "./constants.js";
import { RuntimeSchemaError } from "./errors.js";
import type {
  RuntimeSqliteOperationCategory,
  RuntimeSqlitePolicyReport
} from "./types.js";

const readSinglePragmaValue = (
  db: DatabaseSync,
  sql: string,
  preferredKey: string
): string | number => {
  const row = db.prepare(sql).get() as Record<string, string | number> | undefined;
  if (!row) {
    throw new RuntimeSchemaError(
      "EE_SQLITE_POLICY_MISMATCH",
      `SQLite did not return a value for ${sql}.`
    );
  }
  if (preferredKey in row) {
    return row[preferredKey];
  }
  const values = Object.values(row);
  if (values.length !== 1) {
    throw new RuntimeSchemaError(
      "EE_SQLITE_POLICY_MISMATCH",
      `SQLite returned an ambiguous value for ${sql}.`
    );
  }
  return values[0];
};

export const configureRuntimeSqlitePolicy = (
  db: DatabaseSync,
  options: {
    accessMode: "read_write" | "read_only";
    role: RuntimeSqlitePolicyReport["role"];
  }
): RuntimeSqlitePolicyReport => {
  db.exec(`PRAGMA busy_timeout = ${SQLITE_RUNTIME_POLICY.busy_timeout_ms}`);
  db.exec("PRAGMA foreign_keys = ON");
  if (options.accessMode === "read_write") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  db.exec("PRAGMA synchronous = FULL");

  const journalMode = String(
    readSinglePragmaValue(db, "PRAGMA journal_mode", "journal_mode")
  ).toLowerCase();
  const synchronous = Number(
    readSinglePragmaValue(db, "PRAGMA synchronous", "synchronous")
  );
  const foreignKeys = Number(
    readSinglePragmaValue(db, "PRAGMA foreign_keys", "foreign_keys")
  );
  const busyTimeout = Number(
    readSinglePragmaValue(db, "PRAGMA busy_timeout", "timeout")
  );

  const verified =
    journalMode === SQLITE_RUNTIME_POLICY.journal_mode &&
    synchronous === 2 &&
    foreignKeys === 1 &&
    busyTimeout === SQLITE_RUNTIME_POLICY.busy_timeout_ms;

  if (!verified) {
    throw new RuntimeSchemaError(
      "EE_SQLITE_POLICY_MISMATCH",
      `SQLite runtime policy mismatch: journal=${journalMode}, synchronous=${synchronous}, foreign_keys=${foreignKeys}, busy_timeout=${busyTimeout}.`
    );
  }

  return {
    sqlite_runtime_policy_version: SQLITE_RUNTIME_POLICY.sqlite_runtime_policy_version,
    access_mode: options.accessMode,
    role: options.role,
    journal_mode: journalMode,
    synchronous,
    foreign_keys: foreignKeys,
    busy_timeout_ms: busyTimeout,
    verified: true
  };
};

export const isRuntimeSqliteBusyError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const sqliteError = error as Error & { code?: string; errstr?: string };
  const message = `${error.message} ${sqliteError.errstr ?? ""}`.toLowerCase();
  return (
    sqliteError.code === "ERR_SQLITE_ERROR" ||
    sqliteError.code === "SQLITE_BUSY" ||
    sqliteError.code === "SQLITE_LOCKED"
  ) && (
    message.includes("database is locked") ||
    message.includes("database table is locked") ||
    message.includes("busy") ||
    message.includes("locked")
  );
};

const rollbackQuietly = (db: DatabaseSync): void => {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
};

const mapBusyError = (
  category: RuntimeSqliteOperationCategory,
  phase: "begin" | "operation" | "commit"
): RuntimeSchemaError => {
  if (category === "protected_result_commit" && phase === "commit") {
    return new RuntimeSchemaError(
      RUNTIME_SQLITE_FAILURE_MAPPINGS.fenced_result_commit_interrupted.code,
      "A fenced result commit could not complete inside the bounded SQLite wait.",
      RUNTIME_SQLITE_FAILURE_MAPPINGS.fenced_result_commit_interrupted.failure_class
    );
  }
  return new RuntimeSchemaError(
    RUNTIME_SQLITE_FAILURE_MAPPINGS.contention_before_semantic_work.code,
    `SQLite ${category} contention exceeded the bounded wait during ${phase}.`,
    RUNTIME_SQLITE_FAILURE_MAPPINGS.contention_before_semantic_work.failure_class
  );
};

export const runRuntimeImmediateTransaction = <T>(
  db: DatabaseSync,
  options: {
    category: RuntimeSqliteOperationCategory;
    operation: () => T;
  }
): T => {
  try {
    db.exec("BEGIN IMMEDIATE");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("cannot start a transaction within a transaction")
    ) {
      throw new RuntimeSchemaError(
        "EE_SQLITE_TRANSACTION_NESTING_FORBIDDEN",
        "Runtime authority transactions cannot be nested."
      );
    }
    if (isRuntimeSqliteBusyError(error)) {
      throw mapBusyError(options.category, "begin");
    }
    throw error;
  }

  let result: T;
  try {
    result = options.operation();
    if (
      result &&
      typeof result === "object" &&
      "then" in result &&
      typeof (result as { then?: unknown }).then === "function"
    ) {
      throw new RuntimeSchemaError(
        "EE_SQLITE_TRANSACTION_ASYNC_FORBIDDEN",
        "Provider, network, model, child-process, or host-event waits are forbidden inside runtime write transactions."
      );
    }
  } catch (error) {
    rollbackQuietly(db);
    if (isRuntimeSqliteBusyError(error)) {
      throw mapBusyError(options.category, "operation");
    }
    throw error;
  }

  try {
    db.exec("COMMIT");
    return result;
  } catch (error) {
    rollbackQuietly(db);
    if (isRuntimeSqliteBusyError(error)) {
      throw mapBusyError(options.category, "commit");
    }
    throw error;
  }
};
