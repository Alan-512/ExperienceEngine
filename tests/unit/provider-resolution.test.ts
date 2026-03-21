import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { configSchema } from "../../src/config/config-schema.js";
import { loadConfig } from "../../src/config/load-config.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("provider resolution config surface", () => {
  it("falls back to legacy openai_compatible when no explicit provider is configured", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-provider-default-"));
    tempDirs.push(homeDir);
    const config = loadConfig({}, { env: {}, homeDir });

    expect(config.distillerProvider).toBe("openai_compatible");
  });

  it("reads an explicit openai provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai"
        }
      }
    );

    expect(config.distillerProvider).toBe("openai");
  });

  it("reads an explicit anthropic provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "anthropic"
        }
      }
    );

    expect(config.distillerProvider).toBe("anthropic");
  });

  it("reads an explicit deepseek provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "deepseek"
        }
      }
    );

    expect(config.distillerProvider).toBe("deepseek");
  });

  it("reads an explicit gemini provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "gemini"
        }
      }
    );

    expect(config.distillerProvider).toBe("gemini");
  });

  it("reads gemini google_adc auth mode from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "gemini",
          EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE: "google_adc"
        }
      }
    );

    expect(config.distillerProvider).toBe("gemini");
    expect(config.distillationAuthMode).toBe("google_adc");
  });

  it("reads an explicit azure_openai provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "azure_openai"
        }
      }
    );

    expect(config.distillerProvider).toBe("azure_openai");
  });

  it("reads an explicit bedrock provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "bedrock"
        }
      }
    );

    expect(config.distillerProvider).toBe("bedrock");
  });

  it("reads an explicit minimax provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "minimax"
        }
      }
    );

    expect(config.distillerProvider).toBe("minimax");
  });

  it("reads an explicit moonshot provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "moonshot"
        }
      }
    );

    expect(config.distillerProvider).toBe("moonshot");
  });

  it("reads an explicit volcengine_ark provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "volcengine_ark"
        }
      }
    );

    expect(config.distillerProvider).toBe("volcengine_ark");
  });

  it("reads an explicit tencent_hunyuan provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "tencent_hunyuan"
        }
      }
    );

    expect(config.distillerProvider).toBe("tencent_hunyuan");
  });

  it("reads an explicit baidu_qianfan provider from env", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "baidu_qianfan"
        }
      }
    );

    expect(config.distillerProvider).toBe("baidu_qianfan");
  });

  it("prefers explicit overrides over persisted settings", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-provider-settings-"));
    tempDirs.push(homeDir);
    const productHome = join(homeDir, ".experienceengine");
    mkdirSync(productHome, { recursive: true });
    writeFileSync(
      join(productHome, "settings.json"),
      `${JSON.stringify(
        {
          distillation: {
            provider: "openrouter",
            model: "openai/gpt-4o-mini"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const config = loadConfig(
      {
        distillerProvider: "openai",
        distillerModel: "gpt-5.4-mini"
      },
      {
        env: {},
        homeDir
      }
    );

    expect(config.distillerProvider).toBe("openai");
    expect(config.distillerModel).toBe("gpt-5.4-mini");
  });

  it("rejects unsupported distiller providers", () => {
    const parsed = configSchema.safeParse({
      distillerProvider: "not_a_real_provider"
    });

    expect(parsed.success).toBe(false);
  });
});
