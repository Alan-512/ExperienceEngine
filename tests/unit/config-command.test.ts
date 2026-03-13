import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runConfigCommand } from "../../src/cli/commands/config.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-config-command-"));
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

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
});

describe("config command", () => {
  it("persists inline notice suppression", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");

    runConfigCommand("set", "notices.inline", "false");

    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Inline notices disabled.");
    expect(existsSync(join(process.env.EXPERIENCE_ENGINE_HOME, "settings.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(process.env.EXPERIENCE_ENGINE_HOME, "settings.json"), "utf8"))).toEqual({
      notices: {
        inline: false
      }
    });
  });

  it("reads inline notice suppression state", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");

    runConfigCommand("set", "notices.inline", "false");
    consoleLogSpy.mockClear();

    runConfigCommand("get", "notices.inline");

    expect(consoleLogSpy).toHaveBeenCalledWith("false");
  });
});
