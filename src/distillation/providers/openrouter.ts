import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

export const openRouterDistillerProvider: DistillerProviderAdapter = {
  provider: "openrouter",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!apiKey) {
      missingEnv.push("OPENROUTER_API_KEY");
    }

    return {
      provider: "openrouter",
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: "openrouter",
        model: model || undefined,
        baseUrl: OPENROUTER_BASE_URL,
        missingEnv
      },
      endpoint:
        model && apiKey
          ? {
              kind: "openai",
              model,
              baseUrl: OPENROUTER_BASE_URL,
              headers: {
                Authorization: `Bearer ${apiKey}`
              },
              source: "explicit",
              provider: "openrouter"
            }
          : null
    };
  }
};
