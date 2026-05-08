import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runEnableCommand } from "../../src/cli/commands/enable.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-enable-command-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
});

describe("enable command", () => {
  it("re-enables a disabled scope", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const scopeRepo = new ScopeRepository(db);
    const scope = resolveScope("/repo");

    scopeRepo.upsert({
      ...scope,
      is_disabled: true
    });

    runEnableCommand("scope");

    expect(scopeRepo.getById(scope.scope_id)?.is_disabled).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `[ExperienceEngine] Enabled interventions for scope ${scope.scope_id} (${scope.root_path}).`
    );

    cwdSpy.mockRestore();
  });

  it("acknowledges already-enabled scopes without failing", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo");

    runEnableCommand("scope");
    const scope = resolveScope("/repo");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      `[ExperienceEngine] Interventions are already enabled for scope ${scope.scope_id} (${scope.root_path}).`
    );

    cwdSpy.mockRestore();
  });
});
