import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExperienceEngineConfig } from "./config-schema.js";
import { resolveExperienceEnginePaths } from "./path-resolver.js";

export type ExperienceEngineSettings = {
  notices?: {
    inline?: boolean;
  };
  distillation?: {
    provider?: string;
    auth_mode?: string;
    model?: string;
    fallback_chain?: string;
    fallback_codes?: number[];
  };
  embedding?: {
    provider?: string;
    api_provider?: string;
    model?: string;
    dtype?: string;
  };
  hybrid?: {
    enabled?: boolean;
    sync_explain_enabled?: boolean;
    async_postmortem_enabled?: boolean;
    rollout_mode?: string;
    canary_rate?: number;
    kill_switch?: boolean;
    route_policy_version?: string;
    capsule_schema_version?: string;
    explain_profile_version?: string;
    postmortem_profile_version?: string;
    explain_llm_enabled?: boolean;
    explain_provider_mode?: string;
    explain_model_profile_version?: string;
    async_postmortem_llm_enabled?: boolean;
    postmortem_provider_mode?: string;
    postmortem_model_profile_version?: string;
  };
};

type SettingsOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  overrides?: Partial<ExperienceEngineConfig>;
};

export const resolveSettingsPath = (options: SettingsOptions = {}): string =>
  (() => {
    const paths = resolveExperienceEnginePaths({
      env: options.env,
      homeDir: options.homeDir,
      overrides: options.overrides
    });
    const baseDir = paths.mode === "explicit" ? paths.activeHome : paths.productHome;
    return join(baseDir, "settings.json");
  })();

export const readExperienceEngineSettings = (options: SettingsOptions = {}): ExperienceEngineSettings => {
  const settingsPath = resolveSettingsPath(options);
  if (!existsSync(settingsPath)) {
    return {};
  }

  return JSON.parse(readFileSync(settingsPath, "utf8")) as ExperienceEngineSettings;
};

export const writeExperienceEngineSettings = (
  settings: ExperienceEngineSettings,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const settingsPath = resolveSettingsPath(options);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
};

export const setInlineNoticesEnabled = (
  enabled: boolean,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    notices: {
      ...(current.notices ?? {}),
      inline: enabled
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setDistillationProvider = (
  provider: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    distillation: {
      ...(current.distillation ?? {}),
      provider
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setDistillationAuthMode = (
  authMode: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    distillation: {
      ...(current.distillation ?? {}),
      auth_mode: authMode
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setDistillationModel = (
  provider: string,
  model: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    distillation: {
      ...(current.distillation ?? {}),
      provider,
      model
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setDistillationFallbackChain = (
  chain: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    distillation: {
      ...(current.distillation ?? {}),
      fallback_chain: chain
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const unsetDistillationFallbackChain = (
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const distillation = { ...(current.distillation ?? {}) };
  delete distillation.fallback_chain;
  const next: ExperienceEngineSettings = {
    ...current,
    distillation
  };

  return writeExperienceEngineSettings(next, options);
};

export const setDistillationFallbackCodes = (
  codes: number[],
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    distillation: {
      ...(current.distillation ?? {}),
      fallback_codes: codes
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const unsetDistillationFallbackCodes = (
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const distillation = { ...(current.distillation ?? {}) };
  delete distillation.fallback_codes;
  const next: ExperienceEngineSettings = {
    ...current,
    distillation
  };

  return writeExperienceEngineSettings(next, options);
};

export const setEmbeddingProvider = (
  provider: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    embedding: {
      ...(current.embedding ?? {}),
      provider
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setEmbeddingApiProvider = (
  apiProvider: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    embedding: {
      ...(current.embedding ?? {}),
      api_provider: apiProvider
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setEmbeddingModel = (
  model: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    embedding: {
      ...(current.embedding ?? {}),
      model
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setEmbeddingDtype = (
  dtype: string,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    embedding: {
      ...(current.embedding ?? {}),
      dtype
    }
  };

  return writeExperienceEngineSettings(next, options);
};

export const setHybridSettings = (
  hybrid: NonNullable<ExperienceEngineSettings["hybrid"]>,
  options: SettingsOptions = {}
): ExperienceEngineSettings => {
  const current = readExperienceEngineSettings(options);
  const next: ExperienceEngineSettings = {
    ...current,
    hybrid: {
      ...(current.hybrid ?? {}),
      ...hybrid
    }
  };

  return writeExperienceEngineSettings(next, options);
};
