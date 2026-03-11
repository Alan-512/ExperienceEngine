import type { ExperienceEngineConfig } from "./config-schema.js";

export const defaultConfig: ExperienceEngineConfig = {
  dataDir: "./data",
  sqlitePath: "./data/sqlite/experienceengine.db",
  logLevel: "info",
  maxHints: 3,
  triggerThreshold: 0.6
};

