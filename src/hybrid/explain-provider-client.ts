import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { resolveDistillerEndpoint } from "../distillation/host-llm.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";

type ResolveHybridExplainProviderOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export type HybridExplainProviderResolution =
  | {
      status: "disabled";
      reason: string;
    }
  | {
      status: "unavailable";
      reason: string;
    }
  | {
      status: "configured";
      endpoint: DistillerEndpoint;
      providerMode: ExperienceEngineConfig["hybridExplainProviderMode"];
    };

export const resolveHybridExplainProviderEndpoint = (
  config: ExperienceEngineConfig,
  options: ResolveHybridExplainProviderOptions = {}
): HybridExplainProviderResolution => {
  if (!config.hybridExplainLlmEnabled) {
    return {
      status: "disabled",
      reason: "Phase 2 provider-backed explain is disabled."
    };
  }

  if (config.hybridExplainProviderMode !== "shared_distiller") {
    return {
      status: "unavailable",
      reason: `Unsupported hybrid explain provider mode: ${config.hybridExplainProviderMode}`
    };
  }

  const endpoint = resolveDistillerEndpoint({
    env: options.env,
    homeDir: options.homeDir,
    configProvider: config.distillerProvider,
    configAuthMode: config.distillationAuthMode,
    configModel: config.distillerModel
  });

  if (!endpoint) {
    return {
      status: "unavailable",
      reason: "Shared ExperienceEngine distillation provider resolution is unavailable."
    };
  }

  return {
    status: "configured",
    endpoint,
    providerMode: "shared_distiller"
  };
};
