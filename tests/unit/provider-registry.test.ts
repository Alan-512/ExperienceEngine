import { describe, expect, it } from "vitest";
import {
  getDistillerProviderAdapter,
  listDistillerProviderAdapters
} from "../../src/distillation/providers/registry.js";

describe("distiller provider registry", () => {
  it("returns the openai_compatible adapter by provider id", () => {
    const adapter = getDistillerProviderAdapter("openai_compatible");

    expect(adapter.provider).toBe("openai_compatible");
  });

  it("returns the openai adapter by provider id", () => {
    const adapter = getDistillerProviderAdapter("openai");

    expect(adapter.provider).toBe("openai");
  });

  it("returns the anthropic adapter by provider id", () => {
    const adapter = getDistillerProviderAdapter("anthropic");

    expect(adapter.provider).toBe("anthropic");
  });

  it("returns the gemini adapter by provider id", () => {
    const adapter = getDistillerProviderAdapter("gemini");

    expect(adapter.provider).toBe("gemini");
  });

  it("returns the azure_openai adapter by provider id", () => {
    const adapter = getDistillerProviderAdapter("azure_openai");

    expect(adapter.provider).toBe("azure_openai");
  });

  it("returns the bedrock adapter by provider id", () => {
    const adapter = getDistillerProviderAdapter("bedrock");

    expect(adapter.provider).toBe("bedrock");
  });

  it("lists registered adapters", () => {
    const adapters = listDistillerProviderAdapters();

    expect(adapters.map((adapter) => adapter.provider)).toEqual(
      expect.arrayContaining(["openai", "anthropic", "gemini", "azure_openai", "bedrock", "openai_compatible", "openrouter"])
    );
  });

  it("registers dedicated china provider profiles instead of collapsing them into generic mode", () => {
    const adapters = listDistillerProviderAdapters();

    expect(adapters.map((adapter) => adapter.provider)).toEqual(
      expect.arrayContaining([
        "deepseek",
        "moonshot",
        "dashscope",
        "zhipu",
        "siliconflow",
        "minimax",
        "volcengine_ark",
        "tencent_hunyuan",
        "baidu_qianfan"
      ])
    );
  });
});
