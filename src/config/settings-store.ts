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
  };
  embedding?: {
    provider?: string;
    api_provider?: string;
    model?: string;
    dtype?: string;
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
