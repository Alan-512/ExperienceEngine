import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

export const bedrockDistillerProvider: DistillerProviderAdapter = {
  provider: "bedrock",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
    const region = env.AWS_REGION?.trim();
    const sessionToken = env.AWS_SESSION_TOKEN?.trim();
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (!accessKeyId) {
      missingEnv.push("AWS_ACCESS_KEY_ID");
    }
    if (!secretAccessKey) {
      missingEnv.push("AWS_SECRET_ACCESS_KEY");
    }
    if (!region) {
      missingEnv.push("AWS_REGION");
    }

    const baseUrl =
      model && region
        ? `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`
        : "https://bedrock-runtime.<region>.amazonaws.com/model/<model>/converse";

    return {
      provider: "bedrock",
      diagnostics: {
        configured: missingEnv.length === 0,
        provider: "bedrock",
        model: model || undefined,
        baseUrl,
        missingEnv
      },
      endpoint:
        model && accessKeyId && secretAccessKey && region
          ? {
              kind: "bedrock",
              model,
              baseUrl,
              headers: {},
              source: "explicit",
              provider: "bedrock",
              region,
              accessKeyId,
              secretAccessKey,
              sessionToken: sessionToken || undefined
            }
          : null
    };
  }
};
