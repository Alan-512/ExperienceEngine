import type { DistillerProvider, DistillerProviderAdapter, ProviderResolution } from "./types.js";

type OpenAiCompatibleProfileOptions = {
  provider: DistillerProvider;
  apiKeyEnv: string;
  defaultBaseUrl: string;
};

export const createOpenAiCompatibleProfile = (
  options: OpenAiCompatibleProfileOptions
): DistillerProviderAdapter => ({
  provider: options.provider,
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const apiKey = env[options.apiKeyEnv]?.trim();
    const baseUrl = env.EXPERIENCE_ENGINE_DISTILLER_BASE_URL?.trim() || options.defaultBaseUrl;
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!apiKey) {
      missingEnv.push(options.apiKeyEnv);
    }

    return {
      provider: options.provider,
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: options.provider,
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
              provider: options.provider
            }
          : null
    };
  }
});
