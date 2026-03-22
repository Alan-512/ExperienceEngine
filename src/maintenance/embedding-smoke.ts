import { performance } from "node:perf_hooks";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { embedPassageText, embedQueryText, clearEmbeddingRuntimeCaches } from "../store/vector/embeddings.js";

export type EmbeddingSmokeReport = {
  provider: string;
  model: string;
  queryText: string;
  passageText: string;
  coldQueryMs: number;
  warmQueryMs: number;
  coldPassageMs: number;
  warmPassageMs: number;
};

const DEFAULT_QUERY_TEXT = "validate the first failing auth test before editing";
const DEFAULT_PASSAGE_TEXT = "reproduce the failing auth test before editing and rerun it after the smallest fix";

const measureMs = async <T>(operation: () => Promise<T>): Promise<{ value: T; elapsedMs: number }> => {
  const startedAt = performance.now();
  const value = await operation();
  return {
    value,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
};

export const runEmbeddingSmoke = async (
  config: Pick<ExperienceEngineConfig, "embeddingProvider" | "embeddingModel" | "embeddingDtype" | "embeddingCacheDir">,
  options: {
    env?: NodeJS.ProcessEnv;
    queryText?: string;
    passageText?: string;
    homeDir?: string;
  } = {}
): Promise<EmbeddingSmokeReport> => {
  const queryText = options.queryText ?? DEFAULT_QUERY_TEXT;
  const passageText = options.passageText ?? DEFAULT_PASSAGE_TEXT;

  clearEmbeddingRuntimeCaches();

  const coldQuery = await measureMs(() => embedQueryText(queryText, { config, env: options.env, homeDir: options.homeDir }));
  const warmQuery = await measureMs(() => embedQueryText(queryText, { config, env: options.env, homeDir: options.homeDir }));
  const coldPassage = await measureMs(() =>
    embedPassageText(passageText, { config, env: options.env, homeDir: options.homeDir })
  );
  const warmPassage = await measureMs(() =>
    embedPassageText(passageText, { config, env: options.env, homeDir: options.homeDir })
  );

  return {
    provider: coldQuery.value.space.provider,
    model: coldQuery.value.space.model,
    queryText,
    passageText,
    coldQueryMs: coldQuery.elapsedMs,
    warmQueryMs: warmQuery.elapsedMs,
    coldPassageMs: coldPassage.elapsedMs,
    warmPassageMs: warmPassage.elapsedMs
  };
};
