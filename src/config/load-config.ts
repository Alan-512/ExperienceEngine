import { join } from "node:path";
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
  const settings = readExperienceEngineSettings({ env, homeDir: options.homeDir, overrides });
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
    evaluationMode:
      (env.EXPERIENCE_ENGINE_EVALUATION_MODE as ExperienceEngineConfig["evaluationMode"] | undefined) ??
      overrides.evaluationMode ??
      defaultConfig.evaluationMode,
    holdoutRate: env.EXPERIENCE_ENGINE_HOLDOUT_RATE
      ? Number(env.EXPERIENCE_ENGINE_HOLDOUT_RATE)
      : overrides.holdoutRate ?? defaultConfig.holdoutRate,
    captureRawPayloads,
    captureDir: paths.captureDir,
    maxHints: env.EXPERIENCE_ENGINE_MAX_HINTS
      ? Number(env.EXPERIENCE_ENGINE_MAX_HINTS)
      : overrides.maxHints ?? defaultConfig.maxHints,
    triggerThreshold: env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD
      ? Number(env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD)
      : overrides.triggerThreshold ?? defaultConfig.triggerThreshold,
    embeddingProvider:
      (env.EXPERIENCE_ENGINE_EMBEDDING_PROVIDER as ExperienceEngineConfig["embeddingProvider"] | undefined) ??
      overrides.embeddingProvider ??
      defaultConfig.embeddingProvider,
    embeddingModel:
      env.EXPERIENCE_ENGINE_EMBEDDING_MODEL ??
      overrides.embeddingModel ??
      defaultConfig.embeddingModel,
    embeddingDtype:
      (env.EXPERIENCE_ENGINE_EMBEDDING_DTYPE as ExperienceEngineConfig["embeddingDtype"] | undefined) ??
      overrides.embeddingDtype ??
      defaultConfig.embeddingDtype,
    embeddingCacheDir:
      env.EXPERIENCE_ENGINE_EMBEDDING_CACHE_DIR ??
      overrides.embeddingCacheDir ??
      join(paths.productHome, "models", "embeddings"),
    distillerProvider:
      (env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER as ExperienceEngineConfig["distillerProvider"] | undefined) ??
      overrides.distillerProvider ??
      (settings.distillation?.provider as ExperienceEngineConfig["distillerProvider"] | undefined) ??
      defaultConfig.distillerProvider,
    distillationAuthMode:
      (env.EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE as ExperienceEngineConfig["distillationAuthMode"] | undefined) ??
      overrides.distillationAuthMode ??
      (settings.distillation?.auth_mode as ExperienceEngineConfig["distillationAuthMode"] | undefined) ??
      defaultConfig.distillationAuthMode,
    distillerModel:
      env.EXPERIENCE_ENGINE_DISTILLER_MODEL ??
      overrides.distillerModel ??
      settings.distillation?.model ??
      defaultConfig.distillerModel,
    distillationMode:
      (env.EXPERIENCE_ENGINE_DISTILLATION_MODE as ExperienceEngineConfig["distillationMode"] | undefined) ??
      overrides.distillationMode ??
      defaultConfig.distillationMode,
    distillerProfile:
      (env.EXPERIENCE_ENGINE_DISTILLER_PROFILE as ExperienceEngineConfig["distillerProfile"] | undefined) ??
      overrides.distillerProfile ??
      defaultConfig.distillerProfile,
    distillationAllowPassthrough:
      env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH !== undefined
        ? env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH === "true"
        : overrides.distillationAllowPassthrough ?? defaultConfig.distillationAllowPassthrough,
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
