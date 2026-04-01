import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/config/load-config.js";
import { resolveHybridPostmortemProviderEndpoint } from "../../../src/hybrid/postmortem-provider-client.js";

describe("resolveHybridPostmortemProviderEndpoint", () => {
  it("reuses the shared distillation provider when phase 3 postmortem LLM is enabled", () => {
    const config = loadConfig({
      hybridAsyncPostmortemLlmEnabled: true,
      hybridPostmortemProviderMode: "shared_distiller",
      distillerProvider: "openai",
      distillerModel: "gpt-5.4-mini"
    });

    const resolved = resolveHybridPostmortemProviderEndpoint(config, {
      env: {
        OPENAI_API_KEY: "test-key"
      }
    });

    expect(resolved).toMatchObject({
      status: "configured",
      providerMode: "shared_distiller"
    });
  });

  it("fails closed when shared provider resolution is unavailable", () => {
    const config = loadConfig({
      hybridAsyncPostmortemLlmEnabled: true,
      hybridPostmortemProviderMode: "shared_distiller",
      distillerProvider: "openai_compatible",
      distillerModel: "gpt-5.4-mini"
    });

    const resolved = resolveHybridPostmortemProviderEndpoint(config, {
      env: {}
    });

    expect(resolved).toEqual({
      status: "unavailable",
      reason: "Shared ExperienceEngine distillation provider resolution is unavailable."
    });
  });
});
