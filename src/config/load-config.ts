import { resolve } from "node:path";
import { defaultConfig } from "./default-config.js";
import { configSchema, type ExperienceEngineConfig } from "./config-schema.js";

export const loadConfig = (overrides: Partial<ExperienceEngineConfig> = {}): ExperienceEngineConfig => {
  const captureRawPayloads =
    process.env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS !== undefined
      ? process.env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS === "true"
      : overrides.captureRawPayloads ?? defaultConfig.captureRawPayloads;

  const parsed = configSchema.parse({
    dataDir: process.env.EXPERIENCE_ENGINE_DATA_DIR ?? overrides.dataDir ?? defaultConfig.dataDir,
    sqlitePath: overrides.sqlitePath ?? defaultConfig.sqlitePath,
    logLevel: process.env.EXPERIENCE_ENGINE_LOG_LEVEL ?? overrides.logLevel ?? defaultConfig.logLevel,
    captureRawPayloads,
    captureDir: process.env.EXPERIENCE_ENGINE_CAPTURE_DIR ?? overrides.captureDir ?? defaultConfig.captureDir,
    maxHints: process.env.EXPERIENCE_ENGINE_MAX_HINTS
      ? Number(process.env.EXPERIENCE_ENGINE_MAX_HINTS)
      : overrides.maxHints ?? defaultConfig.maxHints,
    triggerThreshold: process.env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD
      ? Number(process.env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD)
      : overrides.triggerThreshold ?? defaultConfig.triggerThreshold
  });

  return {
    ...parsed,
    dataDir: resolve(parsed.dataDir),
    sqlitePath: resolve(parsed.sqlitePath),
    captureDir: resolve(parsed.captureDir)
  };
};
