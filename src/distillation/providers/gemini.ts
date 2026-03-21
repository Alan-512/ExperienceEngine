import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

export const geminiDistillerProvider: DistillerProviderAdapter = {
  provider: "gemini",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const apiKey = env.GEMINI_API_KEY?.trim();
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!apiKey) {
      missingEnv.push("GEMINI_API_KEY");
    }

    const baseUrl = model
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      : "https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent";

    return {
      provider: "gemini",
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: "gemini",
        model: model || undefined,
        baseUrl,
        missingEnv
      },
      endpoint:
        model && apiKey
          ? {
              kind: "gemini",
              model,
              baseUrl: `${baseUrl}?key=${encodeURIComponent(apiKey)}`,
              headers: {},
              source: "explicit",
              provider: "gemini"
            }
          : null
    };
  }
};
