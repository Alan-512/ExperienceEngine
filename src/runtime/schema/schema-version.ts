import type { DatabaseSync } from "node:sqlite";
import {
  RUNTIME_SCHEMA_SQLITE_USER_VERSIONS,
  RUNTIME_SCHEMA_VERSION_ORDER
} from "./constants.js";
import { RuntimeSchemaError } from "./errors.js";
import type { RuntimeSchemaVersion } from "./types.js";

const userVersionBySchema = RUNTIME_SCHEMA_SQLITE_USER_VERSIONS as Readonly<Record<string, number>>;

export const readRuntimeSchemaUserVersion = (db: DatabaseSync): number => {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  const value = row?.user_version;
  if (!Number.isSafeInteger(value) || value! < 0) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      "SQLite returned an invalid schema user_version."
    );
  }
  return value!;
};

export const runtimeSchemaVersionFromUserVersion = (userVersion: number): RuntimeSchemaVersion => {
  const match = RUNTIME_SCHEMA_VERSION_ORDER.find(
    (version) => userVersionBySchema[version] === userVersion
  );
  if (!match) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_INCOMPATIBLE",
      `SQLite user_version ${userVersion} is not mapped by the runtime schema contract.`
    );
  }
  return match;
};

export const readRuntimePhysicalSchemaVersion = (db: DatabaseSync): RuntimeSchemaVersion =>
  runtimeSchemaVersionFromUserVersion(readRuntimeSchemaUserVersion(db));

export const setRuntimePhysicalSchemaVersion = (
  db: DatabaseSync,
  schemaVersion: RuntimeSchemaVersion
): void => {
  const userVersion = userVersionBySchema[schemaVersion];
  if (!Number.isSafeInteger(userVersion)) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_INCOMPATIBLE",
      `Schema version ${schemaVersion} has no SQLite user_version mapping.`
    );
  }
  db.exec(`PRAGMA user_version = ${userVersion}`);
  if (readRuntimeSchemaUserVersion(db) !== userVersion) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      `SQLite did not persist user_version ${userVersion} for ${schemaVersion}.`
    );
  }
};

export const assertRuntimePhysicalSchemaVersion = (
  db: DatabaseSync,
  expectedSchemaVersion: RuntimeSchemaVersion
): void => {
  const observed = readRuntimePhysicalSchemaVersion(db);
  if (observed !== expectedSchemaVersion) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      `Physical schema version ${observed} does not match metadata ${expectedSchemaVersion}.`
    );
  }
};
