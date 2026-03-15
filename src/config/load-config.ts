import { defaultConfig } from "./default-config.js";
import { configSchema, type ExperienceEngineConfig } from "./config-schema.js";
import { resolveExperienceEnginePaths } from "./path-resolver.js";
import { readExperienceEngineSettings } from "./settings-store.js";

type LoadConfigOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export const loadConfig = (
  overrides: Partial<ExperienceEngineConfig> = {},
  options: LoadConfigOptions = {}
): ExperienceEngineConfig => {
  const env = options.env ?? process.env;
  const paths = resolveExperienceEnginePaths({ overrides, env, homeDir: options.homeDir });
  const settings = readExperienceEngineSettings({ env, homeDir: options.homeDir });
  const captureRawPayloads =
    env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS !== undefined
      ? env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS === "true"
      : overrides.captureRawPayloads ?? defaultConfig.captureRawPayloads;
  const noticesInline =
    env.EXPERIENCE_ENGINE_INLINE_NOTICES !== undefined
      ? env.EXPERIENCE_ENGINE_INLINE_NOTICES === "true"
      : overrides.noticesInline ?? settings.notices?.inline ?? defaultConfig.noticesInline;

  const parsed = configSchema.parse({
    dataDir: paths.dataDir,
    sqlitePath: paths.sqlitePath,
    logLevel: env.EXPERIENCE_ENGINE_LOG_LEVEL ?? overrides.logLevel ?? defaultConfig.logLevel,
    noticesInline,
    captureRawPayloads,
    captureDir: paths.captureDir,
    maxHints: env.EXPERIENCE_ENGINE_MAX_HINTS
      ? Number(env.EXPERIENCE_ENGINE_MAX_HINTS)
      : overrides.maxHints ?? defaultConfig.maxHints,
    triggerThreshold: env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD
      ? Number(env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD)
      : overrides.triggerThreshold ?? defaultConfig.triggerThreshold,
    distillerProfile:
      (env.EXPERIENCE_ENGINE_DISTILLER_PROFILE as ExperienceEngineConfig["distillerProfile"] | undefined) ??
      overrides.distillerProfile ??
      defaultConfig.distillerProfile,
    distillationMaxRetries: env.EXPERIENCE_ENGINE_DISTILLATION_MAX_RETRIES
      ? Number(env.EXPERIENCE_ENGINE_DISTILLATION_MAX_RETRIES)
      : overrides.distillationMaxRetries ?? defaultConfig.distillationMaxRetries,
    distillationBatchSize: env.EXPERIENCE_ENGINE_DISTILLATION_BATCH_SIZE
      ? Number(env.EXPERIENCE_ENGINE_DISTILLATION_BATCH_SIZE)
      : overrides.distillationBatchSize ?? defaultConfig.distillationBatchSize,
    distillationAutoDrain:
      env.EXPERIENCE_ENGINE_DISTILLATION_AUTO_DRAIN !== undefined
        ? env.EXPERIENCE_ENGINE_DISTILLATION_AUTO_DRAIN === "true"
        : overrides.distillationAutoDrain ?? defaultConfig.distillationAutoDrain
  });

  return parsed;
};
