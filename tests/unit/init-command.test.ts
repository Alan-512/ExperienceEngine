import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInitCommand } from "../../src/cli/commands/init.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-init-command-"));
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

describe("init command", () => {
  it("persists shared distillation configuration in one command", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runInitCommand(
      "distillation",
      ["--provider", "gemini", "--model", "gemini-3.1-flash-lite-preview", "--auth-mode", "api_key"],
      {
        resolveModelCatalog: async () => ({
          provider: "gemini",
          source: "static",
          models: [
            {
              id: "gemini-3.1-flash-lite-preview",
              name: "Gemini 3.1 Flash Lite Preview"
            }
          ]
        })
      }
    );

    expect(JSON.parse(readFileSync(join(productHome, "settings.json"), "utf8"))).toEqual({
      distillation: {
        provider: "gemini",
        auth_mode: "api_key",
        model: "gemini-3.1-flash-lite-preview"
      }
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Distillation initialized: provider=gemini auth_mode=api_key model=gemini-3.1-flash-lite-preview."
    );
  });

  it("stores a shared secret without touching settings", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runInitCommand("secret", ["GEMINI_API_KEY", "gemini-test-key"]);

    expect(JSON.parse(readFileSync(join(productHome, "secrets.json"), "utf8"))).toEqual({
      GEMINI_API_KEY: "gemini-test-key"
    });
    expect(existsSync(join(productHome, "settings.json"))).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Stored shared secret GEMINI_API_KEY.");
  });

  it("shows current shared config and secret presence", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runInitCommand(
      "distillation",
      ["--provider", "gemini", "--model", "gemini-3.1-flash-lite-preview", "--auth-mode", "api_key"],
      {
        resolveModelCatalog: async () => ({
          provider: "gemini",
          source: "static",
          models: [
            {
              id: "gemini-3.1-flash-lite-preview",
              name: "Gemini 3.1 Flash Lite Preview"
            }
          ]
        })
      }
    );
    await runInitCommand("secret", ["GEMINI_API_KEY", "gemini-test-key"]);
    consoleLogSpy.mockClear();

    await runInitCommand("show", []);

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["ExperienceEngine init state:"],
        ["- Distillation provider: gemini"],
        ["- Distillation auth mode: api_key"],
        ["- Distillation model: gemini-3.1-flash-lite-preview"],
        ["- Shared secret GEMINI_API_KEY: <set>"]
      ])
    );
  });

  it("prints usage for incomplete distillation init arguments", async () => {
    await runInitCommand("distillation", ["--provider", "gemini"]);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Usage: ee init distillation --provider <provider> --model <modelId> [--auth-mode api_key|google_adc]"
    );
  });
});
