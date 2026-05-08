import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { writeExperienceEngineSettings } from "../../src/config/settings-store.js";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-state-artifacts-"));
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
});

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

  return { env, config, installStatePath };
};

describe("ExperienceStateArtifactService", () => {
  it("creates managed backups and lists them", () => {
    const homeDir = makeTempDir();
    const { env } = setupManagedState(homeDir);
    const service = new ExperienceStateArtifactService({
      env,
      homeDir,
      now: () => "2026-03-13T06:30:00.000Z",
      idFactory: (() => {
        let count = 0;
        return () => `token-${++count}`;
      })()
    });

    const plan = service.planOperation({ operation: "backup" });
    const result = service.executePlannedOperation({
      planId: plan.planId,
      confirmationToken: plan.confirmationToken
    });

    expect(result.status).toBe("executed");
    expect(result.artifact?.kind).toBe("backup");
    expect(result.artifact?.installStates).toEqual(["codex"]);
    expect(existsSync(join(result.artifact!.path, "metadata.json"))).toBe(true);
    expect(existsSync(join(result.artifact!.path, "sqlite", "experienceengine.db"))).toBe(true);
    expect(service.listBackups()).toHaveLength(1);
  });

  it("restores managed state from an export and creates a safeguard backup", () => {
    const homeDir = makeTempDir();
    const { env, installStatePath } = setupManagedState(homeDir);
    const service = new ExperienceStateArtifactService({
      env,
      homeDir,
      now: () => "2026-03-13T06:31:00.000Z",
      idFactory: (() => {
        let count = 0;
        return () => `token-${++count}`;
      })()
    });

    const exportPlan = service.planOperation({ operation: "export" });
    const exportResult = service.executePlannedOperation({
      planId: exportPlan.planId,
      confirmationToken: exportPlan.confirmationToken
    });

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

    const importPlan = service.planOperation({
      operation: "import",
      importPath: exportResult.artifact!.path
    });
    const importResult = service.executePlannedOperation({
      planId: importPlan.planId,
      confirmationToken: importPlan.confirmationToken
    });

    expect(importResult.safeguardBackup?.kind).toBe("backup");
    expect(importResult.restoredFrom).toBe(exportResult.artifact!.path);
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
  });

  it("rolls back to a managed backup and creates a safeguard backup first", () => {
    const homeDir = makeTempDir();
    const { env, installStatePath } = setupManagedState(homeDir);
    const service = new ExperienceStateArtifactService({
      env,
      homeDir,
      now: () => "2026-03-13T06:32:00.000Z",
      idFactory: (() => {
        let count = 0;
        return () => `token-${++count}`;
      })()
    });

    const backupPlan = service.planOperation({ operation: "backup" });
    const backupResult = service.executePlannedOperation({
      planId: backupPlan.planId,
      confirmationToken: backupPlan.confirmationToken
    });

    writeExperienceEngineSettings(
      {
        notices: {
          inline: false
        }
      },
      { env, homeDir }
    );
    rmSync(installStatePath, { force: true });

    const rollbackPlan = service.planOperation({
      operation: "rollback",
      backupId: backupResult.artifact!.id
    });
    const rollbackResult = service.executePlannedOperation({
      planId: rollbackPlan.planId,
      confirmationToken: rollbackPlan.confirmationToken
    });

    expect(rollbackResult.safeguardBackup?.kind).toBe("backup");
    expect(rollbackResult.restoredFrom).toBe(backupResult.artifact!.path);
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
  });
});
