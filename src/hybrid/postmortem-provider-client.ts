import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { resolveDistillerEndpoint } from "../distillation/host-llm.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";

type ResolveHybridPostmortemProviderOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export type HybridPostmortemProviderResolution =
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
      providerMode: ExperienceEngineConfig["hybridPostmortemProviderMode"];
    };

export const resolveHybridPostmortemProviderEndpoint = (
  config: ExperienceEngineConfig,
  options: ResolveHybridPostmortemProviderOptions = {}
): HybridPostmortemProviderResolution => {
  if (!config.hybridAsyncPostmortemLlmEnabled) {
    return {
      status: "disabled",
      reason: "Phase 3 provider-backed postmortem review is disabled."
    };
  }

  if (config.hybridPostmortemProviderMode !== "shared_distiller") {
    return {
      status: "unavailable",
      reason: `Unsupported hybrid postmortem provider mode: ${config.hybridPostmortemProviderMode}`
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
