import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

const DEFAULT_API_VERSION = "2024-10-21";

export const azureOpenAiDistillerProvider: DistillerProviderAdapter = {
  provider: "azure_openai",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const deployment = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
    const apiKey = env.AZURE_OPENAI_API_KEY?.trim();
    const apiVersion = env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_API_VERSION;
    const missingEnv: string[] = [];

    if (!deployment) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!endpoint) {
      missingEnv.push("AZURE_OPENAI_ENDPOINT");
    }
    if (!apiKey) {
      missingEnv.push("AZURE_OPENAI_API_KEY");
    }

    const normalizedEndpoint = endpoint?.replace(/\/$/, "");
    const baseUrl =
      normalizedEndpoint && deployment
        ? `${normalizedEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
        : "https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21";

    return {
      provider: "azure_openai",
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: "azure_openai",
        model: deployment || undefined,
        baseUrl,
        missingEnv
      },
      endpoint:
        deployment && normalizedEndpoint && apiKey
          ? {
              kind: "openai",
              model: deployment,
              baseUrl,
              headers: {
                "api-key": apiKey
              },
              source: "explicit",
              provider: "azure_openai"
            }
          : null
    };
  }
};
