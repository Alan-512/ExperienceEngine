import type { ExperienceEngineConfig } from "./config-schema.js";

export const defaultConfig: ExperienceEngineConfig = {
  dataDir: "./data",
  sqlitePath: "./data/sqlite/experienceengine.db",
  logLevel: "info",
  noticesInline: true,
  captureRawPayloads: false,
  captureDir: "./data/runtime-captures",
  maxHints: 3,
  triggerThreshold: 0.6,
  embeddingProvider: "local",
  embeddingModel: "Xenova/multilingual-e5-small",
  embeddingDtype: "q8",
  embeddingCacheDir: "./data/models/embeddings",
  distillationMode: "auto",
  hostLlmMode: "auto",
  hostLlmMediatedTimeoutMs: 25_000,
  distillerProfile: "balanced",
  distillationAllowPassthrough: true,
  distillationMaxRetries: 2,
  distillationBatchSize: 5,
  distillationAutoDrain: true
};
