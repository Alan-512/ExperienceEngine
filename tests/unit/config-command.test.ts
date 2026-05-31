import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runConfigCommand } from "../../src/cli/commands/config.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { RepoPolicyRepository } from "../../src/store/sqlite/repositories/repo-policy-repo.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

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

  it("restores repo policy through the config surface", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;
    const config = loadConfig({}, { env: { EXPERIENCE_ENGINE_HOME: productHome } as NodeJS.ProcessEnv });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const scope = resolveScope(process.cwd());
    new RepoPolicyRepository(db).upsert({
      scope_id: scope.scope_id,
      configured_mode: "safe",
      effective_mode: "strict",
      circuit_state: "tripped",
      circuit_reason: "repo_circuit",
      live_diagnostics_disabled: true,
      created_at: "2026-05-04T10:00:00.000Z",
      updated_at: "2026-05-04T10:01:00.000Z",
      last_tripped_at: "2026-05-04T10:01:00.000Z"
    });

    await runConfigCommand("restore", "repo-policy");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      `[ExperienceEngine] Repo policy restored for ${scope.scope_id}: safe.`
    );
    expect(new RepoPolicyRepository(db).get(scope.scope_id)).toMatchObject({
      effective_mode: "safe",
      circuit_state: "clear",
      live_diagnostics_disabled: false
    });
  });

  it("persists distillation auth mode selection", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");

    runConfigCommand("set", "distillation.auth_mode", "google_adc");

    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Distillation auth mode set to google_adc.");
    expect(JSON.parse(readFileSync(join(process.env.EXPERIENCE_ENGINE_HOME, "settings.json"), "utf8"))).toEqual({
      distillation: {
        auth_mode: "google_adc"
      }
    });
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

  it("manages distillation fallback chain and codes through config", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runConfigCommand("set", "distillation.fallback_chain", "gemini:gemini-2.5-flash,openai:gpt-4o-mini");
    await runConfigCommand("set", "distillation.fallback_codes", "429,503");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Distillation fallback chain set to gemini:gemini-2.5-flash,openai:gpt-4o-mini."
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Distillation fallback codes set to 429,503.");
    expect(JSON.parse(readFileSync(join(productHome, "settings.json"), "utf8"))).toEqual({
      distillation: {
        fallback_chain: "gemini:gemini-2.5-flash,openai:gpt-4o-mini",
        fallback_codes: [429, 503]
      }
    });

    const config = loadConfig({}, { env: { EXPERIENCE_ENGINE_HOME: productHome } as NodeJS.ProcessEnv });
    expect(config.distillationFallbackChain).toBe("gemini:gemini-2.5-flash,openai:gpt-4o-mini");
    expect(config.distillationFallbackCodes).toEqual([429, 503]);

    consoleLogSpy.mockClear();
    await runConfigCommand("get", "distillation.fallback_chain");
    await runConfigCommand("get", "distillation.fallback_codes");
    expect(consoleLogSpy).toHaveBeenCalledWith("gemini:gemini-2.5-flash,openai:gpt-4o-mini");
    expect(consoleLogSpy).toHaveBeenCalledWith("429,503");

    consoleLogSpy.mockClear();
    await runConfigCommand("unset", "distillation.fallback_chain");
    await runConfigCommand("unset", "distillation.fallback_codes");
    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Removed distillation fallback chain.");
    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Removed distillation fallback codes.");
    expect(JSON.parse(readFileSync(join(productHome, "settings.json"), "utf8"))).toEqual({
      distillation: {}
    });
  });

  it("rejects invalid distillation fallback codes", async () => {
    await runConfigCommand("set", "distillation.fallback_codes", "abc,999");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Usage: ee config set distillation.fallback_codes <http-code[,http-code...]>"
    );
  });

  it("normalizes shell-split fallback lists", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runConfigCommand("set", "distillation.fallback_chain", "gemini:gemini-2.5-flash openai:gpt-4o-mini");
    await runConfigCommand("set", "distillation.fallback_codes", "429 503");

    expect(JSON.parse(readFileSync(join(productHome, "settings.json"), "utf8"))).toMatchObject({
      distillation: {
        fallback_chain: "gemini:gemini-2.5-flash,openai:gpt-4o-mini",
        fallback_codes: [429, 503]
      }
    });
  });

  it("persists shared secrets outside settings.json", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runConfigCommand("set", "secret.GEMINI_API_KEY", "gemini-test-key");

    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Stored secret GEMINI_API_KEY.");
    expect(JSON.parse(readFileSync(join(productHome, "secrets.json"), "utf8"))).toEqual({
      GEMINI_API_KEY: "gemini-test-key"
    });
    expect(existsSync(join(productHome, "settings.json"))).toBe(false);
  });

  it("persists embedding provider selection", async () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");

    await runConfigCommand("set", "embedding.provider", "api");
    await runConfigCommand("set", "embedding.api_provider", "gemini");

    expect(JSON.parse(readFileSync(join(process.env.EXPERIENCE_ENGINE_HOME, "settings.json"), "utf8"))).toEqual({
      embedding: {
        provider: "api",
        api_provider: "gemini"
      }
    });
  });

  it("reads shared secret state without printing the secret value", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runConfigCommand("set", "secret.GEMINI_API_KEY", "gemini-test-key");
    consoleLogSpy.mockClear();

    await runConfigCommand("get", "secret.GEMINI_API_KEY");

    expect(consoleLogSpy).toHaveBeenCalledWith("<set>");
  });

  it("unsets shared secrets", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runConfigCommand("set", "secret.GEMINI_API_KEY", "gemini-test-key");
    consoleLogSpy.mockClear();

    await runConfigCommand("unset", "secret.GEMINI_API_KEY");

    expect(consoleLogSpy).toHaveBeenCalledWith("[ExperienceEngine] Removed secret GEMINI_API_KEY.");
    expect(JSON.parse(readFileSync(join(productHome, "secrets.json"), "utf8"))).toEqual({});
  });
});
