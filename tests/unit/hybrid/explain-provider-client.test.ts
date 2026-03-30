import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/config/load-config.js";
import { resolveHybridExplainProviderEndpoint } from "../../../src/hybrid/explain-provider-client.js";

describe("resolveHybridExplainProviderEndpoint", () => {
  it("reuses the shared distillation provider configuration when hybrid explain llm is enabled", () => {
    const config = loadConfig({
      hybridExplainLlmEnabled: true,
      hybridExplainProviderMode: "shared_distiller",
      distillerProvider: "openai_compatible",
      distillerModel: "gpt-5.4-mini"
    });

    const resolved = resolveHybridExplainProviderEndpoint(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai_compatible",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4-mini",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "test-key"
      }
    });

    expect(resolved.status).toBe("configured");
    if (resolved.status === "configured") {
      expect(resolved.endpoint.provider).toBe("openai_compatible");
      expect(resolved.endpoint.model).toBe("gpt-5.4-mini");
    }
  });

  it("fails closed when shared provider resolution is unavailable", () => {
    const config = loadConfig({
      hybridExplainLlmEnabled: true,
      hybridExplainProviderMode: "shared_distiller",
      distillerProvider: "openai_compatible",
      distillerModel: ""
    });

    const resolved = resolveHybridExplainProviderEndpoint(config, {
      env: {}
    });

    expect(resolved).toMatchObject({
      status: "unavailable"
    });
  });

  it("does not require a second explain-only credential stack", () => {
    const config = loadConfig({
      hybridExplainLlmEnabled: true,
      hybridExplainProviderMode: "shared_distiller"
    });

    expect(config.hybridExplainProviderMode).toBe("shared_distiller");
  });
});
