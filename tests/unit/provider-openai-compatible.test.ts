import { describe, expect, it } from "vitest";
import { getDistillerProviderAdapter } from "../../src/distillation/providers/registry.js";

describe("provider adapters", () => {
  it("openai adapter reads OPENAI_API_KEY and reports a fixed OpenAI endpoint", () => {
    const adapter = getDistillerProviderAdapter("openai");
    const resolved = adapter.resolve({
      OPENAI_API_KEY: "secret",
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4"
    });

    expect(resolved.provider).toBe("openai");
    expect(resolved.diagnostics.configured).toBe(true);
    expect(resolved.diagnostics.baseUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect(resolved.diagnostics.missingEnv).toEqual([]);
  });

  it("openai_compatible adapter reads ExperienceEngine legacy env", () => {
    const adapter = getDistillerProviderAdapter("openai_compatible");
    const resolved = adapter.resolve({
      EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret",
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
      EXPERIENCE_ENGINE_DISTILLER_BASE_URL: "https://example.test/v1/chat/completions"
    });

    expect(resolved.provider).toBe("openai_compatible");
    expect(resolved.diagnostics.configured).toBe(true);
    expect(resolved.diagnostics.baseUrl).toBe("https://example.test/v1/chat/completions");
    expect(resolved.diagnostics.missingEnv).toEqual([]);
  });

  it("openrouter adapter reads OPENROUTER_API_KEY and uses the OpenRouter endpoint", () => {
    const adapter = getDistillerProviderAdapter("openrouter");
    const resolved = adapter.resolve({
      OPENROUTER_API_KEY: "secret",
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "openai/gpt-4o-mini"
    });

    expect(resolved.provider).toBe("openrouter");
    expect(resolved.diagnostics.configured).toBe(true);
    expect(resolved.diagnostics.baseUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(resolved.diagnostics.missingEnv).toEqual([]);
  });

  it("reports missing env for openrouter separately from generic compatible mode", () => {
    const adapter = getDistillerProviderAdapter("openrouter");
    const resolved = adapter.resolve({
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "openai/gpt-4o-mini"
    });

    expect(resolved.provider).toBe("openrouter");
    expect(resolved.diagnostics.configured).toBe(false);
    expect(resolved.diagnostics.missingEnv).toEqual(["OPENROUTER_API_KEY"]);
  });

  it("minimax has a dedicated provider profile with its own default endpoint label", () => {
    const adapter = getDistillerProviderAdapter("minimax");
    const resolved = adapter.resolve({
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "MiniMax-M1-80k"
    });

    expect(resolved.provider).toBe("minimax");
    expect(resolved.diagnostics.baseUrl).toContain("minimax");
    expect(resolved.diagnostics.missingEnv.length).toBeGreaterThan(0);
  });

  it("volcengine_ark has a dedicated provider profile with its own default endpoint label", () => {
    const adapter = getDistillerProviderAdapter("volcengine_ark");
    const resolved = adapter.resolve({
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "doubao-seed-1-6-flash-250715"
    });

    expect(resolved.provider).toBe("volcengine_ark");
    expect(resolved.diagnostics.baseUrl).toContain("volces");
    expect(resolved.diagnostics.missingEnv.length).toBeGreaterThan(0);
  });

  it("tencent_hunyuan has a dedicated provider profile with its own default endpoint label", () => {
    const adapter = getDistillerProviderAdapter("tencent_hunyuan");
    const resolved = adapter.resolve({
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "hunyuan-turbo"
    });

    expect(resolved.provider).toBe("tencent_hunyuan");
    expect(resolved.diagnostics.baseUrl).toContain("hunyuan");
    expect(resolved.diagnostics.missingEnv.length).toBeGreaterThan(0);
  });

  it("baidu_qianfan has a dedicated provider profile with its own default endpoint label", () => {
    const adapter = getDistillerProviderAdapter("baidu_qianfan");
    const resolved = adapter.resolve({
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "ernie-4.5-turbo-vl"
    });

    expect(resolved.provider).toBe("baidu_qianfan");
    expect(resolved.diagnostics.baseUrl).toContain("qianfan");
    expect(resolved.diagnostics.missingEnv.length).toBeGreaterThan(0);
  });
});
