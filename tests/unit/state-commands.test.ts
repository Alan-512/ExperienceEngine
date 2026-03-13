import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBackupCommand } from "../../src/cli/commands/backup.js";
import { runExportCommand } from "../../src/cli/commands/export.js";
import { runImportCommand } from "../../src/cli/commands/import.js";
import { runRollbackCommand } from "../../src/cli/commands/rollback.js";
import { loadConfig } from "../../src/config/load-config.js";
import { writeExperienceEngineSettings } from "../../src/config/settings-store.js";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-state-commands-"));
  tempDirs.push(dir);
  return dir;
};

const setupManagedState = (homeDir: string) => {
  const env = {
    EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine")
  };
  const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME }, { env, homeDir });
  const db = openDatabase(config);
  bootstrapDatabase(db);
  writeExperienceEngineSettings(
    {
      notices: {
        inline: true
      }
    },
    { env, homeDir }
  );

  const installStatePath = join(env.EXPERIENCE_ENGINE_HOME, "adapters", "codex", "install.json");
  mkdirSync(dirname(installStatePath), { recursive: true });
  writeFileSync(
    installStatePath,
    `${JSON.stringify(
      {
        adapter: "codex",
        installedVersion: "0.1.0",
        serverName: "experienceengine"
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return { env, homeDir, installStatePath };
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
});

describe("state CLI commands", () => {
  it("creates managed backup and export snapshots", () => {
    const homeDir = makeTempDir();
    const { env } = setupManagedState(homeDir);
    process.env.EXPERIENCE_ENGINE_HOME = env.EXPERIENCE_ENGINE_HOME;

    runBackupCommand();
    runExportCommand();

    const service = new ExperienceStateArtifactService({ env, homeDir });
    const backups = service.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]?.kind).toBe("backup");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringMatching(/^\[ExperienceEngine\] Created backup backup-/)],
        [expect.stringMatching(/^Path: /)],
        [expect.stringMatching(/^\[ExperienceEngine\] Created export export-/)]
      ])
    );
  });

  it("imports state from an export snapshot", () => {
    const homeDir = makeTempDir();
    const { env, installStatePath } = setupManagedState(homeDir);
    process.env.EXPERIENCE_ENGINE_HOME = env.EXPERIENCE_ENGINE_HOME;

    runExportCommand();
    const exportsRoot = join(env.EXPERIENCE_ENGINE_HOME, "exports");
    const [exportId] = readdirSync(exportsRoot);
    expect(exportId).toBeTruthy();
    const exportPath = join(exportsRoot, exportId!);

    writeExperienceEngineSettings(
      {
        notices: {
          inline: false
        }
      },
      { env, homeDir }
    );
    writeFileSync(
      installStatePath,
      `${JSON.stringify(
        {
          adapter: "codex",
          installedVersion: "9.9.9"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    runImportCommand(exportPath);

    expect(
      JSON.parse(readFileSync(join(env.EXPERIENCE_ENGINE_HOME, "settings.json"), "utf8")) as {
        notices?: { inline?: boolean };
      }
    ).toMatchObject({
      notices: {
        inline: true
      }
    });
    expect(
      JSON.parse(readFileSync(installStatePath, "utf8")) as {
        installedVersion?: string;
      }
    ).toMatchObject({
      installedVersion: "0.1.0"
    });
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [`[ExperienceEngine] Imported state from ${exportPath}.`],
        [expect.stringMatching(/^Safeguard backup: safeguard-/)],
        [expect.stringMatching(/^Safeguard path: /)]
      ])
    );
  });

  it("rolls back to a backup snapshot", () => {
    const homeDir = makeTempDir();
    const { env, installStatePath } = setupManagedState(homeDir);
    process.env.EXPERIENCE_ENGINE_HOME = env.EXPERIENCE_ENGINE_HOME;

    runBackupCommand();
    const service = new ExperienceStateArtifactService({ env, homeDir });
    const backupId = service.listBackups()[0]?.id;
    expect(backupId).toBeTruthy();

    writeExperienceEngineSettings(
      {
        notices: {
          inline: false
        }
      },
      { env, homeDir }
    );
    rmSync(installStatePath, { force: true });

    runRollbackCommand(backupId);

    expect(existsSync(installStatePath)).toBe(true);
    expect(
      JSON.parse(readFileSync(join(env.EXPERIENCE_ENGINE_HOME, "settings.json"), "utf8")) as {
        notices?: { inline?: boolean };
      }
    ).toMatchObject({
      notices: {
        inline: true
      }
    });
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [`[ExperienceEngine] Rolled back state from backup ${backupId}.`],
        [expect.stringMatching(/^Safeguard backup: safeguard-/)],
        [expect.stringMatching(/^Safeguard path: /)]
      ])
    );
  });

  it("shows usage for missing import and rollback arguments", () => {
    runImportCommand();
    runRollbackCommand();

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Usage: ee import <snapshot-path>"],
        ["Usage: ee rollback <backup-id>"]
      ])
    );
  });
});
