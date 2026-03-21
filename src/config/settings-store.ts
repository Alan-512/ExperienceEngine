import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
};

type SettingsOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export const resolveSettingsPath = (options: SettingsOptions = {}): string =>
  join(resolveExperienceEnginePaths({ env: options.env, homeDir: options.homeDir }).productHome, "settings.json");

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
