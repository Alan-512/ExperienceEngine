import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveSQLiteSchemaPath } from "../../src/store/sqlite/db.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-sqlite-schema-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("resolveSQLiteSchemaPath", () => {
  it("prefers a module-local schema asset when present", () => {
    const moduleDir = makeTempDir();
    const schemaPath = join(moduleDir, "schema.sql");
    writeFileSync(schemaPath, "-- schema\n", "utf8");

    expect(resolveSQLiteSchemaPath(moduleDir)).toBe(schemaPath);
  });

  it("falls back to the package-local source schema when the built asset is missing", () => {
    const packageRoot = makeTempDir();
    const moduleDir = join(packageRoot, "dist", "store", "sqlite");
    const sourceDir = join(packageRoot, "src", "store", "sqlite");
    const sourceSchemaPath = join(sourceDir, "schema.sql");

    mkdirSync(moduleDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(sourceSchemaPath, "-- schema\n", "utf8");

    expect(resolveSQLiteSchemaPath(moduleDir)).toBe(sourceSchemaPath);
  });

  it("throws an explicit error when no known schema asset exists", () => {
    const packageRoot = makeTempDir();
    const moduleDir = join(packageRoot, "dist", "store", "sqlite");
    mkdirSync(moduleDir, { recursive: true });

    expect(() => resolveSQLiteSchemaPath(moduleDir)).toThrowError(
      /Unable to locate ExperienceEngine SQLite schema/
    );
  });
});
