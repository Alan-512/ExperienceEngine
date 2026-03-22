import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ExperienceEngineConfig } from "../../config/config-schema.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { normalizeWhitespace } from "../../utils/text.js";
import type { SemanticEmbeddingProvider } from "./provider-types.js";

type ProviderOptions = {
  config?: Partial<
    Pick<ExperienceEngineConfig, "embeddingProvider" | "embeddingModel" | "embeddingDtype" | "embeddingCacheDir">
  >;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

type TransformersModule = {
  env: {
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    cacheDir?: string;
  };
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>
  ) => Promise<(input: string, options?: Record<string, unknown>) => Promise<unknown>>;
};

const LOCAL_PROVIDER_VERSION = "local-e5-v1";
const DEFAULT_MODEL = "Xenova/multilingual-e5-small";
const DEFAULT_DTYPE = "q8";
let cachedProvider: Promise<SemanticEmbeddingProvider> | null = null;
let testLoader: (() => Promise<TransformersModule>) | null = null;

const toVector = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.flat(Infinity).map((entry) => Number(entry));
  }
  if (value && typeof value === "object") {
    if ("data" in value && Array.isArray((value as { data?: unknown[] }).data)) {
      return ((value as { data: unknown[] }).data).map((entry) => Number(entry));
    }
    if ("tolist" in value && typeof (value as { tolist?: () => unknown }).tolist === "function") {
      return toVector((value as { tolist: () => unknown }).tolist());
    }
  }

  throw new Error("Unsupported embedding output shape.");
};

const resolveCacheDir = (options: ProviderOptions): string =>
  options.config?.embeddingCacheDir ??
  join(
    resolveExperienceEnginePaths({ env: options.env, homeDir: options.homeDir }).productHome,
    "models",
    "embeddings"
  );

const resolveModel = (options: ProviderOptions): string =>
  options.config?.embeddingModel ?? DEFAULT_MODEL;

const resolveDtype = (options: ProviderOptions): "q8" | "fp32" =>
  options.config?.embeddingDtype ?? DEFAULT_DTYPE;

const resolveModelCacheDir = (cacheDir: string, model: string): string =>
  join(cacheDir, ...model.split("/"));

const formatInput = (prefix: "query" | "passage", text: string): string => {
  const normalized = normalizeWhitespace(text);
  return `${prefix}: ${normalized || text}`;
};

const loadTransformers = async (): Promise<TransformersModule> => {
  if (testLoader) {
    return testLoader();
  }
  return (await import("@huggingface/transformers")) as unknown as TransformersModule;
};

const isCorruptedModelCacheError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /protobuf parsing failed|load model .* failed/i.test(message);
};

export const clearLocalEmbeddingProviderCache = (): void => {
  cachedProvider = null;
};

export type ManagedEmbeddingCacheResetReport = {
  cacheDir: string;
  model: string;
  rebuilt: boolean;
  dimensions: number | null;
};

export const setTransformersModuleLoaderForTests = (
  loader: (() => Promise<TransformersModule>) | null
): void => {
  testLoader = loader;
};

export const createLocalEmbeddingProvider = async (
  options: ProviderOptions = {}
): Promise<SemanticEmbeddingProvider> => {
  const cacheDir = resolveCacheDir(options);
  const model = resolveModel(options);
  const dtype = resolveDtype(options);
  const modelCacheDir = resolveModelCacheDir(cacheDir, model);
  mkdirSync(cacheDir, { recursive: true });

  const { env, pipeline } = await loadTransformers();
  env.allowRemoteModels = true;
  env.allowLocalModels = true;
  env.cacheDir = cacheDir;

  let extractor: Awaited<ReturnType<TransformersModule["pipeline"]>>;
  try {
    extractor = await pipeline("feature-extraction", model, { dtype });
  } catch (error) {
    if (!isCorruptedModelCacheError(error)) {
      throw error;
    }
    rmSync(modelCacheDir, { recursive: true, force: true });
    extractor = await pipeline("feature-extraction", model, { dtype });
  }

  const embed = async (input: string): Promise<number[]> => {
    const output = await extractor(input, { pooling: "mean", normalize: true });
    const vector = toVector(output);
    if (!vector.length) {
      throw new Error("Embedding provider returned an empty vector.");
    }
    return vector;
  };

  const probe = await embed(formatInput("passage", "ExperienceEngine embedding probe"));

  return {
    provider: "local",
    model,
    version: LOCAL_PROVIDER_VERSION,
    dimensions: probe.length,
    embedQuery(text: string) {
      return embed(formatInput("query", text));
    },
    embedPassage(text: string) {
      return embed(formatInput("passage", text));
    }
  };
};

export const getLocalEmbeddingProvider = async (
  options: ProviderOptions = {}
): Promise<SemanticEmbeddingProvider> => {
  if (!cachedProvider) {
    cachedProvider = createLocalEmbeddingProvider(options);
  }
  return cachedProvider;
};

export const resetManagedEmbeddingCache = async (
  options: ProviderOptions = {}
): Promise<ManagedEmbeddingCacheResetReport> => {
  const cacheDir = resolveCacheDir(options);
  const model = resolveModel(options);
  const modelCacheDir = resolveModelCacheDir(cacheDir, model);

  rmSync(modelCacheDir, { recursive: true, force: true });
  clearLocalEmbeddingProviderCache();

  if (options.config?.embeddingProvider === "legacy") {
    return {
      cacheDir: modelCacheDir,
      model,
      rebuilt: false,
      dimensions: null
    };
  }

  const provider = await getLocalEmbeddingProvider(options);
  return {
    cacheDir: modelCacheDir,
    model,
    rebuilt: true,
    dimensions: provider.dimensions
  };
};
