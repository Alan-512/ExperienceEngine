import { normalizeWhitespace, tokenize } from "../../utils/text.js";
import type { ExperienceEngineConfig } from "../../config/config-schema.js";
import { resolveApiEmbeddingProvider } from "./api-embedding-provider.js";
import { getLocalEmbeddingProvider } from "./local-provider.js";
import type { SemanticEmbeddingProvider } from "./provider-types.js";

export type EmbeddingSpace = {
  provider: string;
  model: string;
  version: string;
  dimensions: number;
};

export type EmbeddingResult = {
  embedding: number[];
  space: EmbeddingSpace;
};

type EmbeddingOptions = {
  config?: Partial<
    Pick<
    ExperienceEngineConfig,
    "embeddingProvider" | "embeddingModel" | "embeddingDtype" | "embeddingCacheDir"
    >
  >;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

const EMBEDDING_DIMENSIONS = 192;
const LEGACY_EMBEDDING_MODEL = "hashed-bow";
const LEGACY_EMBEDDING_VERSION = "legacy-v1";
const SYNONYM_MAP = new Map<string, string>([
  ["fix", "repair"],
  ["fixed", "repair"],
  ["bug", "failure"],
  ["broken", "failure"],
  ["failing", "failure"],
  ["failed", "failure"],
  ["regression", "failure"],
  ["tests", "test"],
  ["spec", "test"],
  ["specs", "test"],
  ["unit", "test"],
  ["compile", "build"],
  ["compiler", "build"],
  ["bundle", "build"],
  ["builds", "build"],
  ["auth", "authentication"],
  ["login", "authentication"],
  ["signin", "authentication"],
  ["refactor", "cleanup"],
  ["cleanup", "cleanup"],
  ["optimise", "optimize"],
  ["perf", "performance"]
]);

const hashToken = (token: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
};

const canonicalizeToken = (token: string): string => SYNONYM_MAP.get(token) ?? token;

const buildFeatures = (text: string): string[] => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  const tokens = tokenize(normalized).map(canonicalizeToken);
  const bigrams = tokens.slice(0, -1).map((token, index) => `${token}_${tokens[index + 1]}`);
  const trigrams = tokens.flatMap((token) =>
    token.length < 3 ? [token] : Array.from({ length: token.length - 2 }, (_, index) => token.slice(index, index + 3))
  );

  return [...tokens, ...bigrams, ...trigrams];
};

export const embedText = (value: string): number[] => {
  const features = buildFeatures(value);
  const embedding = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  for (const feature of features) {
    const hash = hashToken(feature);
    const bucket = hash % EMBEDDING_DIMENSIONS;
    const signedWeight = hash % 2 === 0 ? 1 : -1;
    const weight = feature.includes("_") ? 1.4 : feature.length === 3 ? 0.5 : 1;
    embedding[bucket] += signedWeight * weight;
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return embedding;
  }

  return embedding.map((value) => Number((value / magnitude).toFixed(6)));
};

const toLegacyResult = (value: string): EmbeddingResult => ({
  embedding: embedText(value),
  space: {
    provider: "legacy",
    model: LEGACY_EMBEDDING_MODEL,
    version: LEGACY_EMBEDDING_VERSION,
    dimensions: EMBEDDING_DIMENSIONS
  }
});

export const cosineSimilarity = (left: number[], right: number[]): number => {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const lhs = left[index] ?? 0;
    const rhs = right[index] ?? 0;
    dot += lhs * rhs;
    leftNorm += lhs * lhs;
    rightNorm += rhs * rhs;
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return dot / Math.sqrt(leftNorm * rightNorm);
};

export const getEmbeddingDimensions = (): number => EMBEDDING_DIMENSIONS;

export const isCompatibleEmbedding = (embedding: number[] | undefined): embedding is number[] =>
  Array.isArray(embedding) && embedding.length === EMBEDDING_DIMENSIONS;

let testProvider: SemanticEmbeddingProvider | null = null;
let localEmbeddingWarningShown = false;
const queryEmbeddingCache = new Map<string, EmbeddingResult>();

const warnLocalEmbeddingFallback = (message: string): void => {
  if (localEmbeddingWarningShown) {
    return;
  }
  localEmbeddingWarningShown = true;
  console.warn(`[ExperienceEngine] Local embedding provider unavailable, falling back to legacy retrieval: ${message}`);
};

const tryLocalFallback = async (value: string, mode: "query" | "passage", options: EmbeddingOptions): Promise<EmbeddingResult | null> => {
  try {
    const provider = await getLocalEmbeddingProvider({
      ...options,
      config: {
        ...options.config,
        embeddingProvider: "local"
      }
    });
    const embedding = mode === "query" ? await provider.embedQuery(value) : await provider.embedPassage(value);
    return {
      embedding,
      space: {
        provider: provider.provider,
        model: provider.model,
        version: provider.version,
        dimensions: provider.dimensions
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLocalEmbeddingFallback(message);
    return null;
  }
};

export const setEmbeddingProviderForTests = (provider: SemanticEmbeddingProvider | null): void => {
  testProvider = provider;
};

export const clearEmbeddingProviderForTests = (): void => {
  testProvider = null;
  localEmbeddingWarningShown = false;
};

export const clearEmbeddingRuntimeCaches = (): void => {
  queryEmbeddingCache.clear();
  localEmbeddingWarningShown = false;
};

const resolveProvider = async (options: EmbeddingOptions = {}): Promise<SemanticEmbeddingProvider | null> => {
  if (testProvider) {
    return testProvider;
  }
  if (options.config?.embeddingProvider === "legacy") {
    return null;
  }

  if (options.config?.embeddingProvider === "api" || options.config?.embeddingProvider === undefined) {
    const apiProvider = resolveApiEmbeddingProvider({ env: options.env });
    if (apiProvider) {
      return apiProvider;
    }
  }

  if (options.config?.embeddingProvider === "local" || options.config?.embeddingProvider === "api" || options.config?.embeddingProvider === undefined) {
    try {
      return await getLocalEmbeddingProvider(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnLocalEmbeddingFallback(message);
      return null;
    }
  }

  return null;
};

export const buildLegacyEmbedding = (value: string): EmbeddingResult => toLegacyResult(value);

export const embedQueryText = async (
  value: string,
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> => {
  const provider = await resolveProvider(options);
  if (!provider) {
    return toLegacyResult(value);
  }
  const cacheKey = `${provider.provider}:${provider.model}:${provider.version}:query:${value}`;
  const cached = queryEmbeddingCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  try {
    const result = {
      embedding: await provider.embedQuery(value),
      space: {
        provider: provider.provider,
        model: provider.model,
        version: provider.version,
        dimensions: provider.dimensions
      }
    };
    queryEmbeddingCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (provider.provider !== "local") {
      const localResult = await tryLocalFallback(value, "query", options);
      if (localResult) {
        return localResult;
      }
    } else {
      warnLocalEmbeddingFallback(message);
    }
    return toLegacyResult(value);
  }
};

export const embedPassageText = async (
  value: string,
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> => {
  const provider = await resolveProvider(options);
  if (!provider) {
    return toLegacyResult(value);
  }
  try {
    return {
      embedding: await provider.embedPassage(value),
      space: {
        provider: provider.provider,
        model: provider.model,
        version: provider.version,
        dimensions: provider.dimensions
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (provider.provider !== "local") {
      const localResult = await tryLocalFallback(value, "passage", options);
      if (localResult) {
        return localResult;
      }
    } else {
      warnLocalEmbeddingFallback(message);
    }
    return toLegacyResult(value);
  }
};

export const isMatchingEmbeddingSpace = (
  node: {
    embedding?: number[];
    embedding_provider?: string;
    embedding_model?: string;
    embedding_version?: string;
    embedding_dimensions?: number;
  },
  space: EmbeddingSpace
): boolean =>
  Array.isArray(node.embedding) &&
  node.embedding.length === space.dimensions &&
  node.embedding_provider === space.provider &&
  node.embedding_model === space.model &&
  node.embedding_version === space.version &&
  node.embedding_dimensions === space.dimensions;

export const withEmbeddingMetadata = (
  result: EmbeddingResult
): Pick<
  import("../../types/domain.js").ExperienceNode,
  "embedding" | "embedding_provider" | "embedding_model" | "embedding_version" | "embedding_dimensions"
> => ({
  embedding: result.embedding,
  embedding_provider: result.space.provider,
  embedding_model: result.space.model,
  embedding_version: result.space.version,
  embedding_dimensions: result.space.dimensions
});
