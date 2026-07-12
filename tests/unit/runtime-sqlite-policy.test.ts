import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  RUNTIME_SQLITE_FAILURE_MAPPINGS,
  SQLITE_RUNTIME_POLICY
} from "../../src/runtime/schema/constants.js";
import { RuntimeSchemaError } from "../../src/runtime/schema/errors.js";
import {
  configureRuntimeSqlitePolicy,
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-runtime-sqlite-policy-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const busyError = (): Error & { code: string; errstr: string } => {
  const error = new Error("database is locked") as Error & { code: string; errstr: string };
  error.code = "ERR_SQLITE_ERROR";
  error.errstr = "database is locked";
  return error;
};

describe("sqlite-runtime-v1 policy", () => {
  it("freezes the exact policy and verifies effective PRAGMA values", () => {
    expect(SQLITE_RUNTIME_POLICY).toEqual({
      sqlite_runtime_policy_version: "sqlite-runtime-v1",
      journal_mode: "wal",
      synchronous: "full",
      foreign_keys: true,
      busy_timeout_ms: 5000,
      application_retry_attempts: 1,
      application_backoff_ms: []
    });
    expect(RUNTIME_SQLITE_FAILURE_MAPPINGS).toEqual({
      contention_before_semantic_work: {
        code: "EE_SQLITE_BUSY",
        failure_class: "system_route"
      },
      fenced_result_commit_interrupted: {
        code: "EE_SQLITE_COMMIT_INTERRUPTED",
        failure_class: "interruption"
      }
    });

    const db = new DatabaseSync(join(makeTempDir(), "runtime.db"));
    try {
      expect(configureRuntimeSqlitePolicy(db, {
        accessMode: "read_write",
        role: "migration_owner"
      })).toEqual({
        sqlite_runtime_policy_version: "sqlite-runtime-v1",
        access_mode: "read_write",
        role: "migration_owner",
        journal_mode: "wal",
        synchronous: 2,
        foreign_keys: 1,
        busy_timeout_ms: 5000,
        verified: true
      });
    } finally {
      db.close();
    }
  });

  it("fails closed when the effective journal mode cannot become WAL", () => {
    const db = new DatabaseSync(":memory:");
    try {
      expect(() => configureRuntimeSqlitePolicy(db, {
        accessMode: "read_write",
        role: "supervisor"
      })).toThrowError(expect.objectContaining<Partial<RuntimeSchemaError>>({
        code: "EE_SQLITE_POLICY_MISMATCH"
      }));
    } finally {
      db.close();
    }
  });

  it("verifies the same frozen policy on a read-only participant connection", () => {
    const path = join(makeTempDir(), "shared.db");
    const writer = new DatabaseSync(path);
    configureRuntimeSqlitePolicy(writer, { accessMode: "read_write", role: "supervisor" });
    writer.exec("CREATE TABLE policy_probe (id TEXT PRIMARY KEY)");
    writer.close();

    const reader = new DatabaseSync(path, { readOnly: true });
    try {
      expect(configureRuntimeSqlitePolicy(reader, {
        accessMode: "read_only",
        role: "operator"
      })).toMatchObject({
        access_mode: "read_only",
        role: "operator",
        journal_mode: "wal",
        synchronous: 2,
        foreign_keys: 1,
        busy_timeout_ms: 5000,
        verified: true
      });
    } finally {
      reader.close();
    }
  });

  it("maps bounded pre-semantic contention without treating lock acquisition as authority", () => {
    const db = {
      exec(sql: string) {
        if (sql === "BEGIN IMMEDIATE") {
          throw busyError();
        }
      }
    } as unknown as DatabaseSync;

    expect(() => runRuntimeImmediateTransaction(db, {
      category: "migration",
      operation: () => "never"
    })).toThrowError(expect.objectContaining<Partial<RuntimeSchemaError>>({
      code: "EE_SQLITE_BUSY",
      failureClass: "system_route"
    }));
  });

  it("maps interrupted fenced result commits separately from content retry", () => {
    const calls: string[] = [];
    const db = {
      exec(sql: string) {
        calls.push(sql);
        if (sql === "COMMIT") {
          throw busyError();
        }
      }
    } as unknown as DatabaseSync;

    expect(() => runRuntimeImmediateTransaction(db, {
      category: "protected_result_commit",
      operation: () => "semantic-result"
    })).toThrowError(expect.objectContaining<Partial<RuntimeSchemaError>>({
      code: "EE_SQLITE_COMMIT_INTERRUPTED",
      failureClass: "interruption"
    }));
    expect(calls).toEqual(["BEGIN IMMEDIATE", "COMMIT", "ROLLBACK"]);
  });

  it("rejects async provider/model/child waits inside a write transaction", () => {
    const calls: string[] = [];
    const db = {
      exec(sql: string) {
        calls.push(sql);
      }
    } as unknown as DatabaseSync;

    expect(() => runRuntimeImmediateTransaction(db, {
      category: "migration",
      operation: () => Promise.resolve("forbidden")
    })).toThrowError(expect.objectContaining<Partial<RuntimeSchemaError>>({
      code: "EE_SQLITE_TRANSACTION_ASYNC_FORBIDDEN"
    }));
    expect(calls).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
  });

  it("rejects nested runtime authority transactions", () => {
    const db = new DatabaseSync(join(makeTempDir(), "nested.db"));
    try {
      configureRuntimeSqlitePolicy(db, { accessMode: "read_write", role: "supervisor" });
      expect(() => runRuntimeImmediateTransaction(db, {
        category: "migration",
        operation: () => runRuntimeImmediateTransaction(db, {
          category: "migration",
          operation: () => "forbidden"
        })
      })).toThrowError(expect.objectContaining<Partial<RuntimeSchemaError>>({
        code: "EE_SQLITE_TRANSACTION_NESTING_FORBIDDEN"
      }));
    } finally {
      db.close();
    }
  });
});
