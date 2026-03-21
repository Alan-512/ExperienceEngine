import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";

export const openAiDistillerProvider: DistillerProviderAdapter = {
  provider: "openai",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const apiKey = env.OPENAI_API_KEY?.trim();
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!apiKey) {
      missingEnv.push("OPENAI_API_KEY");
    }

    return {
      provider: "openai",
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: "openai",
        model: model || undefined,
        baseUrl: OPENAI_BASE_URL,
        missingEnv
      },
      endpoint:
        model && apiKey
          ? {
              kind: "openai",
              model,
              baseUrl: OPENAI_BASE_URL,
              headers: {
                Authorization: `Bearer ${apiKey}`
              },
              source: "explicit",
              provider: "openai"
            }
          : null
    };
  }
};
