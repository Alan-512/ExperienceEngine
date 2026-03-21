import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const anthropicDistillerProvider: DistillerProviderAdapter = {
  provider: "anthropic",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!apiKey) {
      missingEnv.push("ANTHROPIC_API_KEY");
    }

    return {
      provider: "anthropic",
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: "anthropic",
        model: model || undefined,
        baseUrl: ANTHROPIC_MESSAGES_URL,
        missingEnv
      },
      endpoint:
        model && apiKey
          ? {
              kind: "anthropic",
              model,
              baseUrl: ANTHROPIC_MESSAGES_URL,
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION
              },
              source: "explicit",
              provider: "anthropic"
            }
          : null
    };
  }
};
