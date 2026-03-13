import type { ExperienceEngineConfig } from "./config-schema.js";

export const defaultConfig: ExperienceEngineConfig = {
  dataDir: "./data",
  sqlitePath: "./data/sqlite/experienceengine.db",
  logLevel: "info",
  noticesInline: true,
  captureRawPayloads: false,
  captureDir: "./data/runtime-captures",
  maxHints: 3,
  triggerThreshold: 0.6
};
