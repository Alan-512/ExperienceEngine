import { defaultConfig } from "./default-config.js";
import { configSchema, type ExperienceEngineConfig } from "./config-schema.js";
import { resolveExperienceEnginePaths } from "./path-resolver.js";

export const loadConfig = (overrides: Partial<ExperienceEngineConfig> = {}): ExperienceEngineConfig => {
  const paths = resolveExperienceEnginePaths({ overrides });
  const captureRawPayloads =
    process.env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS !== undefined
      ? process.env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS === "true"
      : overrides.captureRawPayloads ?? defaultConfig.captureRawPayloads;

  const parsed = configSchema.parse({
    dataDir: paths.dataDir,
    sqlitePath: paths.sqlitePath,
    logLevel: process.env.EXPERIENCE_ENGINE_LOG_LEVEL ?? overrides.logLevel ?? defaultConfig.logLevel,
    captureRawPayloads,
    captureDir: paths.captureDir,
    maxHints: process.env.EXPERIENCE_ENGINE_MAX_HINTS
      ? Number(process.env.EXPERIENCE_ENGINE_MAX_HINTS)
      : overrides.maxHints ?? defaultConfig.maxHints,
    triggerThreshold: process.env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD
      ? Number(process.env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD)
      : overrides.triggerThreshold ?? defaultConfig.triggerThreshold
  });

  return parsed;
};
