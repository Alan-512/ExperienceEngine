import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runConfigCommand } from "../../src/cli/commands/config.js";
import { loadConfig } from "../../src/config/load-config.js";

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

  it("persists distillation provider selection", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");

    runConfigCommand("set", "distillation.provider", "openrouter");

    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Distillation provider set to openrouter.");
    expect(JSON.parse(readFileSync(join(process.env.EXPERIENCE_ENGINE_HOME, "settings.json"), "utf8"))).toEqual({
      distillation: {
        provider: "openrouter"
      }
    });
  });

  it("persists validated distillation model selection", async () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    await runConfigCommand("set", "distillation.provider", "openrouter");
    consoleLogSpy.mockClear();

    await runConfigCommand("set", "distillation.model", "openai/gpt-5.4-mini", {
      resolveModelCatalog: async () => ({
        provider: "openrouter",
        source: "static",
        models: [
          {
            id: "openai/gpt-5.4-mini",
            name: "GPT-5.4 Mini"
          }
        ]
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Distillation model set to openai/gpt-5.4-mini for provider openrouter."
    );
    expect(JSON.parse(readFileSync(join(process.env.EXPERIENCE_ENGINE_HOME, "settings.json"), "utf8"))).toEqual({
      distillation: {
        model: "openai/gpt-5.4-mini",
        provider: "openrouter"
      }
    });
  });

  it("rejects distillation model ids that are not in the provider catalog", async () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    await runConfigCommand("set", "distillation.provider", "openrouter");
    consoleLogSpy.mockClear();

    await runConfigCommand("set", "distillation.model", "openrouter/unknown", {
      resolveModelCatalog: async () => ({
        provider: "openrouter",
        source: "static",
        models: [
          {
            id: "openai/gpt-5.4-mini",
            name: "GPT-5.4 Mini"
          }
        ]
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] openrouter/unknown is not in the openrouter model catalog. Use `ee models list openrouter` first."
    );
  });

  it("loadConfig reads provider and model from settings when env is not set", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    runConfigCommand("set", "distillation.provider", "openrouter");
    await runConfigCommand("set", "distillation.model", "openai/gpt-5.4-mini", {
      resolveModelCatalog: async () => ({
        provider: "openrouter",
        source: "static",
        models: [
          {
            id: "openai/gpt-5.4-mini",
            name: "GPT-5.4 Mini"
          }
        ]
      })
    });

    const config = loadConfig({}, { env: { EXPERIENCE_ENGINE_HOME: productHome } as NodeJS.ProcessEnv });

    expect(config.distillerProvider).toBe("openrouter");
  });
});
