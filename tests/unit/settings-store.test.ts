import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { readExperienceEngineSettings, setHybridSettings } from "../../src/config/settings-store.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-settings-store-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("settings store", () => {
  it("treats empty or malformed settings files as absent", () => {
    const homeDir = makeTempDir();
    const settingsPath = join(homeDir, ".experienceengine", "settings.json");
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, "", "utf8");

    expect(readExperienceEngineSettings({ homeDir, env: {} })).toEqual({});

    writeFileSync(settingsPath, "{", "utf8");

    expect(readExperienceEngineSettings({ homeDir, env: {} })).toEqual({});
  });

  it("can write settings after reading a malformed settings file", () => {
    const homeDir = makeTempDir();
    const settingsPath = join(homeDir, ".experienceengine", "settings.json");
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, "", "utf8");

    const updated = setHybridSettings({ enabled: true }, { homeDir, env: {} });

    expect(updated.hybrid?.enabled).toBe(true);
    expect(readExperienceEngineSettings({ homeDir, env: {} }).hybrid?.enabled).toBe(true);
  });
});
