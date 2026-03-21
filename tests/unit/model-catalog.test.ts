import { describe, expect, it } from "vitest";
import { filterProviderModels, mapModelsDevCatalogToProvider } from "../../src/distillation/model-catalog.js";

describe("model catalog", () => {
  it("maps an ExperienceEngine provider to the matching models.dev provider and preserves model metadata", () => {
    const catalog = mapModelsDevCatalogToProvider("openrouter", {
      openrouter: {
        id: "openrouter",
        name: "OpenRouter",
        models: {
          "openai/gpt-5.4-mini": {
            id: "openai/gpt-5.4-mini",
            name: "GPT-5.4 Mini",
            reasoning: true,
            tool_call: true,
            modalities: {
              input: ["text"],
              output: ["text"]
            },
            limit: {
              context: 400000,
              output: 128000
            }
          }
        }
      }
    });

    expect(catalog.provider).toBe("openrouter");
    expect(catalog.models).toEqual([
      expect.objectContaining({
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        reasoning: true,
        toolCall: true
      })
    ]);
  });

  it("filters provider models by a search query", () => {
    const filtered = filterProviderModels(
      [
        { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini" },
        { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano" }
      ],
      "mini"
    );

    expect(filtered).toEqual([{ id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini" }]);
  });

  it("maps regional provider ids from models.dev for supported China and Bedrock providers", () => {
    const catalog = {
      "amazon-bedrock": {
        id: "amazon-bedrock",
        models: {
          "amazon.nova-lite-v1:0": { id: "amazon.nova-lite-v1:0", name: "Nova Lite" }
        }
      },
      "alibaba-cn": {
        id: "alibaba-cn",
        models: {
          "qwen-turbo": { id: "qwen-turbo", name: "Qwen Turbo" }
        }
      },
      "moonshotai-cn": {
        id: "moonshotai-cn",
        models: {
          "kimi-k2.5": { id: "kimi-k2.5", name: "Kimi K2.5" }
        }
      },
      zhipuai: {
        id: "zhipuai",
        models: {
          "glm-4.7-flash": { id: "glm-4.7-flash", name: "GLM 4.7 Flash" }
        }
      },
      "siliconflow-cn": {
        id: "siliconflow-cn",
        models: {
          "Pro/zai-org/GLM-4.7": { id: "Pro/zai-org/GLM-4.7", name: "GLM 4.7" }
        }
      },
      "minimax-cn": {
        id: "minimax-cn",
        models: {
          "MiniMax-M2.7-highspeed": { id: "MiniMax-M2.7-highspeed", name: "MiniMax M2.7 Highspeed" }
        }
      }
    };

    expect(mapModelsDevCatalogToProvider("bedrock", catalog as never)).toEqual(
      expect.objectContaining({
        source: "models.dev",
        models: [expect.objectContaining({ id: "amazon.nova-lite-v1:0", name: "Nova Lite" })]
      })
    );
    expect(mapModelsDevCatalogToProvider("dashscope", catalog as never)).toEqual(
      expect.objectContaining({
        source: "models.dev",
        models: [expect.objectContaining({ id: "qwen-turbo", name: "Qwen Turbo" })]
      })
    );
    expect(mapModelsDevCatalogToProvider("moonshot", catalog as never)).toEqual(
      expect.objectContaining({
        source: "models.dev",
        models: [expect.objectContaining({ id: "kimi-k2.5", name: "Kimi K2.5" })]
      })
    );
    expect(mapModelsDevCatalogToProvider("zhipu", catalog as never)).toEqual(
      expect.objectContaining({
        source: "models.dev",
        models: [expect.objectContaining({ id: "glm-4.7-flash", name: "GLM 4.7 Flash" })]
      })
    );
    expect(mapModelsDevCatalogToProvider("siliconflow", catalog as never)).toEqual(
      expect.objectContaining({
        source: "models.dev",
        models: [expect.objectContaining({ id: "Pro/zai-org/GLM-4.7", name: "GLM 4.7" })]
      })
    );
    expect(mapModelsDevCatalogToProvider("minimax", catalog as never)).toEqual(
      expect.objectContaining({
        source: "models.dev",
        models: [expect.objectContaining({ id: "MiniMax-M2.7-highspeed", name: "MiniMax M2.7 Highspeed" })]
      })
    );
  });

  it("falls back to static entries when a provider is not present in models.dev", () => {
    const catalog = mapModelsDevCatalogToProvider("baidu_qianfan", {});

    expect(catalog.source).toBe("static");
    expect(catalog.models.length).toBeGreaterThan(0);
  });
});
