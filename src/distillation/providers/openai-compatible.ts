import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

const DEFAULT_COMPATIBLE_BASE_URL = "https://api.openai.com/v1/chat/completions";

export const openAiCompatibleDistillerProvider: DistillerProviderAdapter = {
  provider: "openai_compatible",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const apiKey = env.EXPERIENCE_ENGINE_DISTILLER_API_KEY?.trim();
    const baseUrl = env.EXPERIENCE_ENGINE_DISTILLER_BASE_URL?.trim() || DEFAULT_COMPATIBLE_BASE_URL;
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!apiKey) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_API_KEY");
    }

    return {
      provider: "openai_compatible",
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: "openai_compatible",
        model: model || undefined,
        baseUrl,
        missingEnv
      },
      endpoint:
        model && apiKey
          ? {
              kind: "openai",
              model,
              baseUrl,
              headers: {
                Authorization: `Bearer ${apiKey}`
              },
              source: "explicit",
              provider: "openai_compatible"
            }
          : null
    };
  }
};
