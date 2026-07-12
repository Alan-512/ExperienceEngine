import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  FIXED_CONTROL_BOOTSTRAP_WRITERS,
  RUNTIME_CONTROL_SCHEMA_VERSION,
  type FixedControlBootstrapWriter
} from "./constants.js";
import {
  createTableSql,
  FIXED_CONTROL_PLANE_DDL,
  FIXED_CONTROL_PLANE_TABLE_CONTRACTS,
  FIXED_CONTROL_PLANE_TABLE_NAMES
} from "./control-plane-contract.js";
import { RuntimeIdentityError } from "./errors.js";
import {
  createRuntimeHomeIdentity,
  deriveNormalizedHomePathFingerprint,
  normalizeHomePathForFingerprint,
  resolveCanonicalRuntimeHome
} from "./home-identity.js";
import {
  createOrAdoptMachineIntegrityKey
} from "./integrity-key.js";
import type {
  CanonicalRuntimeHomeResolution,
  MachineIntegrityKey,
  RuntimeHomeIdentity,
  RuntimeHomeInitializationOptions
} from "./types.js";

type RuntimeControlMetaRow = {
  control_schema_version: string;
  home_id: string;
  home_layout_version: string;
  path_normalization_version: string;
  normalized_path_fingerprint: string;
  integrity_key_id: string;
  home_path_fingerprint_key_id: string;
  database_relative_path: string;
  created_at: string;
};

export type FixedControlPlaneBootstrapResult = {
  status: "created" | "adopted";
  homeIdentity: RuntimeHomeIdentity;
  controlSchemaVersion: string;
};

export type RuntimeHomeInitializationResult = FixedControlPlaneBootstrapResult & {
  resolution: CanonicalRuntimeHomeResolution;
  integrityKey: MachineIntegrityKey;
};

const normalizeSql = (value: string): string =>
  value.replace(/;\s*$/u, "").replace(/\s+/gu, " ").trim();

const existingControlTableNames = (db: DatabaseSync): string[] => {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>;
  const expected = new Set<string>(FIXED_CONTROL_PLANE_TABLE_NAMES);
  return rows.map((row) => row.name).filter((name) => expected.has(name));
};

export const inspectFixedControlPlaneSchema = (db: DatabaseSync): string[] => {
  const issues: string[] = [];
  for (const table of FIXED_CONTROL_PLANE_TABLE_CONTRACTS) {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(table.name) as { sql: string | null } | undefined;
    if (!row?.sql) {
      issues.push(`missing_table:${table.name}`);
      continue;
    }

    const expectedSql = normalizeSql(createTableSql(table));
    const observedSql = normalizeSql(row.sql);
    if (observedSql !== expectedSql) {
      issues.push(`table_contract_mismatch:${table.name}`);
    }
  }
  return issues;
};

const assertBootstrapWriter = (writer: FixedControlBootstrapWriter): void => {
  if (!FIXED_CONTROL_BOOTSTRAP_WRITERS.includes(writer)) {
    throw new RuntimeIdentityError(
      "EE_BOOTSTRAP_WRITER_FORBIDDEN",
      `Writer ${writer} is not allowed to invoke the fixed control-plane bootstrap.`
    );
  }
};

const runtimeControlMetaRows = (db: DatabaseSync): RuntimeControlMetaRow[] =>
  db.prepare("SELECT * FROM runtime_control_meta ORDER BY created_at, home_id").all() as RuntimeControlMetaRow[];

const assertExistingMetaMatches = (options: {
  meta: RuntimeControlMetaRow;
  resolution: CanonicalRuntimeHomeResolution;
  integrityKey: MachineIntegrityKey;
}): RuntimeHomeIdentity => {
  if (options.meta.control_schema_version !== RUNTIME_CONTROL_SCHEMA_VERSION) {
    throw new RuntimeIdentityError(
      "EE_CONTROL_SCHEMA_INCOMPATIBLE",
      `Unsupported control schema version ${options.meta.control_schema_version}.`
    );
  }

  if (
    options.meta.integrity_key_id !== options.integrityKey.integrity_key_id ||
    options.meta.home_path_fingerprint_key_id !== options.integrityKey.integrity_key_id
  ) {
    throw new RuntimeIdentityError(
      "EE_INTEGRITY_KEY_MISMATCH",
      `Committed integrity key id ${options.meta.integrity_key_id} does not match the adopted key ${options.integrityKey.integrity_key_id}.`
    );
  }

  const expectedFingerprint = deriveNormalizedHomePathFingerprint(
    options.resolution,
    options.integrityKey
  );
  const homeFields: Array<[string, string, string]> = [
    ["home_layout_version", options.meta.home_layout_version, options.resolution.homeLayoutVersion],
    [
      "path_normalization_version",
      options.meta.path_normalization_version,
      options.resolution.pathNormalizationVersion
    ],
    ["normalized_path_fingerprint", options.meta.normalized_path_fingerprint, expectedFingerprint],
    ["database_relative_path", options.meta.database_relative_path, options.resolution.databaseRelativePath]
  ];
  for (const [field, observed, expected] of homeFields) {
    if (observed !== expected) {
      throw new RuntimeIdentityError(
        "EE_HOME_IDENTITY_MISMATCH",
        `Committed ${field} ${observed} does not match resolved ${expected}.`
      );
    }
  }

  return {
    home_id: options.meta.home_id,
    home_layout_version: options.meta.home_layout_version,
    path_normalization_version: options.meta.path_normalization_version,
    normalized_path_fingerprint: options.meta.normalized_path_fingerprint,
    home_path_fingerprint_key_id: options.meta.home_path_fingerprint_key_id,
    database_relative_path: options.meta.database_relative_path,
    created_at: options.meta.created_at
  };
};

const assertOpenedDatabasePath = (
  openedDatabasePath: string,
  resolution: CanonicalRuntimeHomeResolution
): void => {
  if (
    normalizeHomePathForFingerprint(resolve(openedDatabasePath)) !==
    normalizeHomePathForFingerprint(resolve(resolution.databasePath))
  ) {
    throw new RuntimeIdentityError(
      "EE_HOME_IDENTITY_MISMATCH",
      `Opened database path does not match the canonical runtime database location.`
    );
  }
};

const assertDatabaseConnectionPath = (
  db: DatabaseSync,
  resolution: CanonicalRuntimeHomeResolution
): void => {
  const rows = db.prepare("PRAGMA database_list").all() as Array<{
    seq: number;
    name: string;
    file: string;
  }>;
  const mainRows = rows.filter((row) => row.name === "main");
  const observedPath = mainRows[0]?.file;
  if (
    mainRows.length !== 1 ||
    !observedPath ||
    normalizeHomePathForFingerprint(observedPath) !==
      normalizeHomePathForFingerprint(resolution.databasePath)
  ) {
    throw new RuntimeIdentityError(
      "EE_HOME_IDENTITY_MISMATCH",
      "SQLite main database does not match the canonical runtime database location."
    );
  }
};

export const bootstrapFixedControlPlane = (options: {
  db: DatabaseSync;
  openedDatabasePath: string;
  writer: FixedControlBootstrapWriter;
  resolution: CanonicalRuntimeHomeResolution;
  integrityKey: MachineIntegrityKey;
  now?: () => Date;
  homeIdFactory?: () => string;
}): FixedControlPlaneBootstrapResult => {
  assertBootstrapWriter(options.writer);
  assertOpenedDatabasePath(options.openedDatabasePath, options.resolution);
  assertDatabaseConnectionPath(options.db, options.resolution);
  const now = options.now ?? (() => new Date());
  const homeIdFactory = options.homeIdFactory ?? randomUUID;

  options.db.exec("PRAGMA busy_timeout = 5000");
  options.db.exec("PRAGMA foreign_keys = ON");
  options.db.exec("BEGIN EXCLUSIVE");
  try {
    const presentTables = existingControlTableNames(options.db);
    if (
      presentTables.length > 0 &&
      presentTables.length !== FIXED_CONTROL_PLANE_TABLE_NAMES.length
    ) {
      throw new RuntimeIdentityError(
        "EE_CONTROL_SCHEMA_INCOMPATIBLE",
        `Partial fixed control-plane schema detected: ${presentTables.join(", ")}.`
      );
    }

    if (presentTables.length === FIXED_CONTROL_PLANE_TABLE_NAMES.length) {
      const issues = inspectFixedControlPlaneSchema(options.db);
      if (issues.length > 0) {
        throw new RuntimeIdentityError(
          "EE_CONTROL_SCHEMA_INCOMPATIBLE",
          `Fixed control-plane schema does not match v1: ${issues.join(", ")}.`
        );
      }
      const rows = runtimeControlMetaRows(options.db);
      if (rows.length !== 1) {
        throw new RuntimeIdentityError(
          "EE_CONTROL_SCHEMA_INCOMPATIBLE",
          `Expected exactly one runtime_control_meta row, observed ${rows.length}.`
        );
      }
      const homeIdentity = assertExistingMetaMatches({
        meta: rows[0],
        resolution: options.resolution,
        integrityKey: options.integrityKey
      });
      options.db.exec("COMMIT");
      return {
        status: "adopted",
        homeIdentity,
        controlSchemaVersion: RUNTIME_CONTROL_SCHEMA_VERSION
      };
    }

    options.db.exec(FIXED_CONTROL_PLANE_DDL);
    const createdAt = now().toISOString();
    const homeIdentity = createRuntimeHomeIdentity({
      homeId: homeIdFactory(),
      resolution: options.resolution,
      integrityKey: options.integrityKey,
      createdAt
    });
    options.db.prepare(
      `INSERT INTO runtime_control_meta (
        control_schema_version,
        home_id,
        home_layout_version,
        path_normalization_version,
        normalized_path_fingerprint,
        integrity_key_id,
        home_path_fingerprint_key_id,
        database_relative_path,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      RUNTIME_CONTROL_SCHEMA_VERSION,
      homeIdentity.home_id,
      homeIdentity.home_layout_version,
      homeIdentity.path_normalization_version,
      homeIdentity.normalized_path_fingerprint,
      options.integrityKey.integrity_key_id,
      homeIdentity.home_path_fingerprint_key_id,
      homeIdentity.database_relative_path,
      homeIdentity.created_at
    );
    options.db.prepare(
      "INSERT INTO package_activation_state (home_id, updated_at) VALUES (?, ?)"
    ).run(homeIdentity.home_id, createdAt);

    const issues = inspectFixedControlPlaneSchema(options.db);
    if (issues.length > 0) {
      throw new RuntimeIdentityError(
        "EE_CONTROL_SCHEMA_INCOMPATIBLE",
        `Generated fixed control-plane schema is incomplete: ${issues.join(", ")}.`
      );
    }
    options.db.exec("COMMIT");
    return {
      status: "created",
      homeIdentity,
      controlSchemaVersion: RUNTIME_CONTROL_SCHEMA_VERSION
    };
  } catch (error) {
    try {
      options.db.exec("ROLLBACK");
    } catch {
      // Preserve the original failure. A failed BEGIN leaves no transaction to roll back.
    }
    throw error;
  }
};

export const initializeRuntimeHomeIdentity = async (
  options: RuntimeHomeInitializationOptions
): Promise<RuntimeHomeInitializationResult> => {
  const resolution = resolveCanonicalRuntimeHome({
    explicitOpenClawHome: options.explicitOpenClawHome,
    env: options.env,
    defaultHome: options.defaultHome,
    platform: options.platform,
    cwd: options.cwd
  });
  options.onStage?.("home_resolved");

  const integrityKey = await createOrAdoptMachineIntegrityKey(resolution.resolvedHome, {
    now: options.now
  });
  options.onStage?.("integrity_key_adopted");

  await mkdir(dirname(resolution.databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolution.databasePath);
  options.onStage?.("database_opened");
  try {
    const bootstrap = bootstrapFixedControlPlane({
      db,
      openedDatabasePath: resolution.databasePath,
      writer: options.writer,
      resolution,
      integrityKey,
      now: options.now
    });
    options.onStage?.("control_plane_ready");
    return {
      ...bootstrap,
      resolution,
      integrityKey
    };
  } finally {
    db.close();
  }
};
