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

  it("persists shared embedding configuration in one command", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runInitCommand("embedding", ["--mode", "api", "--api-provider", "gemini"]);

    expect(JSON.parse(readFileSync(join(productHome, "settings.json"), "utf8"))).toEqual({
      embedding: {
        provider: "api",
        api_provider: "gemini",
        model: "Xenova/multilingual-e5-small",
        dtype: "q8"
      }
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Embedding initialized: mode=api api_provider=gemini model=Xenova/multilingual-e5-small dtype=q8."
    );
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
        ["- Embedding mode: api"],
        ["- Embedding API provider: auto"],
        ["- Embedding model: Xenova/multilingual-e5-small"],
        ["- Embedding dtype: q8"],
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

  it("falls back to the static guide when no interactive UI is available", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    await runInitCommand(undefined, []);

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["ExperienceEngine initialization guide:"],
        ["Step 1. Configure distillation provider and model."],
        ["- Current distillation provider: <unset>"],
        ["- Current distillation model: <unset>"],
        ["- Next command: ee init distillation --provider <provider> --model <modelId> [--auth-mode api_key|google_adc]"],
        ["Step 2. Configure embedding mode and provider."],
        ["- Current embedding mode: api"],
        ["- Current embedding API provider: auto"],
        ["- Current embedding model: Xenova/multilingual-e5-small"],
        ["- Next command: ee init embedding --mode <api|local|legacy> [--api-provider auto|openai|gemini|jina] [--model <modelId>] [--dtype q8|fp32]"],
        ["Step 3. Store any shared provider secrets once for all hosts."],
        ["- Shared secrets: none"],
        ["- Next command: ee init secret <ENV_KEY> <value>"],
        ["Step 4. Validate the installed hosts against the shared EE state."],
        ["- Validation commands: ee doctor openclaw | ee doctor claude-code | ee doctor codex"]
      ])
    );
  });

  it("runs a stepper wizard when interactive UI is available", async () => {
    const home = makeTempDir();
    const productHome = join(home, ".experienceengine");
    process.env.EXPERIENCE_ENGINE_HOME = productHome;

    const choose = vi
      .fn()
      .mockResolvedValueOnce("gemini")
      .mockResolvedValueOnce("api_key")
      .mockResolvedValueOnce("gemini-3.1-flash-lite-preview")
      .mockResolvedValueOnce("api:gemini");
    const input = vi.fn().mockResolvedValueOnce("gemini-test-key");

    await runInitCommand(undefined, [], {
      resolveModelCatalog: async () => ({
        provider: "gemini",
        source: "static",
        models: [
          {
            id: "gemini-3.1-flash-lite-preview",
            name: "Gemini 3.1 Flash Lite Preview"
          }
        ]
      }),
      ui: {
        isInteractive: () => true,
        choose,
        input,
        log: console.log
      }
    });

    expect(JSON.parse(readFileSync(join(productHome, "settings.json"), "utf8"))).toEqual({
      distillation: {
        provider: "gemini",
        auth_mode: "api_key",
        model: "gemini-3.1-flash-lite-preview"
      },
      embedding: {
        provider: "api",
        api_provider: "gemini",
        model: "Xenova/multilingual-e5-small",
        dtype: "q8"
      }
    });
    expect(JSON.parse(readFileSync(join(productHome, "secrets.json"), "utf8"))).toEqual({
      GEMINI_API_KEY: "gemini-test-key"
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["ExperienceEngine initialization"],
        ["Initialization complete."],
        ["- Distillation provider: gemini"],
        ["- Distillation model: gemini-3.1-flash-lite-preview"],
        ["- Embedding mode: api"],
        ["- Embedding API provider: gemini"],
        ["- Embedding model: Xenova/multilingual-e5-small"],
        ["- Shared secret GEMINI_API_KEY: <set>"]
      ])
    );
    expect(choose).toHaveBeenCalledTimes(4);
    expect(input).toHaveBeenCalledTimes(1);
    expect(choose.mock.calls[0]?.[0]).toMatchObject({ title: "Step 1: Distillation provider" });
    expect(choose.mock.calls[1]?.[0]).toMatchObject({ title: "Step 2: Distillation auth mode" });
    expect(choose.mock.calls[2]?.[0]).toMatchObject({ title: "Step 3: Distillation model" });
    expect(choose.mock.calls[3]?.[0]).toMatchObject({ title: "Step 4: Embedding mode" });
    expect(input.mock.calls[0]?.[0]).toMatchObject({ title: "- GEMINI_API_KEY" });
  });
});
