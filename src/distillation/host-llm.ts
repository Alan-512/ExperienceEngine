import type { DistillationMode, DistillationSource } from "../types/domain.js";
import { resolveExperienceEngineRuntimeEnv } from "../config/runtime-env.js";
import { getDistillerProviderAdapter } from "./providers/registry.js";
import type { DistillationDiagnostics, DistillerEndpoint, DistillerProvider } from "./providers/types.js";

type ResolveOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  configProvider?: DistillerProvider;
  configAuthMode?: string;
  configModel?: string;
};

type DistillationResolveOptions = ResolveOptions & {
  distillationMode?: DistillationMode;
  allowRuleFallback?: boolean;
};

export type DistillationResolution =
  | {
      distillationMode: "disabled";
      distillationSource: "disabled";
      provider: DistillerProvider;
      reason: string;
      diagnostics: DistillationDiagnostics;
    }
  | {
      distillationMode: "rule";
      distillationSource: "rule";
      provider: DistillerProvider;
      reason: string;
      diagnostics: DistillationDiagnostics;
    }
  | {
      distillationMode: "llm";
      distillationSource: Extract<DistillationSource, "explicit_provider">;
      provider: DistillerProvider;
      endpoint: DistillerEndpoint;
      reason: string;
      diagnostics: DistillationDiagnostics;
    };

const resolveRequestedProvider = (env: NodeJS.ProcessEnv): DistillerProvider =>
  (env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER as DistillerProvider | undefined) ?? "openai_compatible";

export const resolveDistillationResolution = (
  options: DistillationResolveOptions = {}
): DistillationResolution => {
  const baseEnv = resolveExperienceEngineRuntimeEnv({
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const env: NodeJS.ProcessEnv = {
    ...baseEnv
  };
  if (!env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER && options.configProvider) {
    env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER = options.configProvider;
  }
  if (!env.EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE && options.configAuthMode) {
    env.EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE = options.configAuthMode;
  }
  if (!env.EXPERIENCE_ENGINE_DISTILLER_MODEL && options.configModel) {
    env.EXPERIENCE_ENGINE_DISTILLER_MODEL = options.configModel;
  }
  const requestedMode = options.distillationMode ?? "auto";
  const allowRuleFallback = options.allowRuleFallback ?? true;
  const provider = resolveRequestedProvider(env);
  const adapter = getDistillerProviderAdapter(provider);
  const resolved = adapter.resolve(env);
  const diagnostics = resolved.diagnostics;

  if (requestedMode === "disabled") {
    return {
      distillationMode: "disabled",
      distillationSource: "disabled",
      provider,
      reason: "Distillation is explicitly disabled.",
      diagnostics
    };
  }

  if (requestedMode === "rule") {
    return {
      distillationMode: "rule",
      distillationSource: "rule",
      provider,
      reason: "Rule distillation is explicitly enabled.",
      diagnostics
    };
  }

  const endpoint = resolved.endpoint;
  if (endpoint) {
    return {
      distillationMode: "llm",
      distillationSource: "explicit_provider",
      provider,
      endpoint,
      reason: "Resolved from explicit ExperienceEngine distiller provider configuration.",
      diagnostics
    };
  }

  if (requestedMode === "llm") {
    return {
      distillationMode: "disabled",
      distillationSource: "disabled",
      provider,
      reason:
        "LLM distillation was forced, but no explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
      diagnostics
    };
  }

  if (allowRuleFallback) {
    return {
      distillationMode: "rule",
      distillationSource: "rule",
      provider,
      reason:
        "No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
      diagnostics
    };
  }

  return {
    distillationMode: "disabled",
    distillationSource: "disabled",
    provider,
    reason:
      "No explicit distiller provider is configured. Configure an official or compatible LLM API to enable llm distillation.",
    diagnostics
  };
};

export const resolveDistillerEndpoint = (options: ResolveOptions = {}): DistillerEndpoint | null => {
  const resolution = resolveDistillationResolution({
    ...options,
    distillationMode: "llm",
    allowRuleFallback: false
  });

  return resolution.distillationMode === "llm" ? resolution.endpoint : null;
};

export type { DistillerEndpoint };
