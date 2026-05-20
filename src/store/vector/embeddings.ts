import { normalizeWhitespace, tokenize } from "../../utils/text.js";
import type { ExperienceEngineConfig } from "../../config/config-schema.js";
import type { SemanticEmbeddingProvider } from "./provider-types.js";

const loadApiEmbeddingProviderModule = async (): Promise<typeof import("./api-embedding-provider.js")> =>
  import("./api-embedding-provider.js");

const loadLocalEmbeddingProviderModule = async (): Promise<typeof import("./local-provider.js")> =>
  import("./local-provider.js");

export type EmbeddingSpace = {
  provider: string;
  model: string;
  version: string;
  dimensions: number;
  manifestId?: string;
};

export type EmbeddingResult = {
  embedding: number[];
  space: EmbeddingSpace;
};

type EmbeddingOptions = {
  config?: Partial<
    Pick<
    ExperienceEngineConfig,
    "embeddingProfile" | "embeddingProvider" | "embeddingApiProvider" | "embeddingModel" | "embeddingDtype" | "embeddingCacheDir"
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
const EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000;
const EMBEDDING_CACHE_MAX_ENTRIES = 256;

type CachedEmbeddingResult = {
  result: EmbeddingResult;
  cachedAt: number;
};

const queryEmbeddingCache = new Map<string, CachedEmbeddingResult>();
const passageEmbeddingCache = new Map<string, CachedEmbeddingResult>();

const getCachedEmbedding = (
  cache: Map<string, CachedEmbeddingResult>,
  key: string
): EmbeddingResult | null => {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.cachedAt > EMBEDDING_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
};

const cacheEmbedding = (
  cache: Map<string, CachedEmbeddingResult>,
  key: string,
  result: EmbeddingResult
): void => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  while (cache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
  cache.set(key, {
    result,
    cachedAt: Date.now()
  });
};

const warnLocalEmbeddingFallback = (message: string): void => {
  if (localEmbeddingWarningShown) {
    return;
  }
  localEmbeddingWarningShown = true;
  console.warn(`[ExperienceEngine] Local embedding provider unavailable, falling back to legacy retrieval: ${message}`);
};

const isMissingLocalEmbeddingModule = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("local-provider.js");
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
  passageEmbeddingCache.clear();
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
    try {
      const { resolveApiEmbeddingProvider } = await loadApiEmbeddingProviderModule();
      const apiProvider = resolveApiEmbeddingProvider({
        env: options.env,
        explicitProvider: options.config?.embeddingApiProvider
      });
      if (apiProvider) {
        return apiProvider;
      }
    } catch {
      // Packaged OpenClaw installs may omit provider-backed embeddings and fall back to local/legacy retrieval.
    }
  }

  const env = options.env ?? process.env;
  const localFallbackDisabled = env.EXPERIENCE_ENGINE_DISABLE_LOCAL_EMBEDDING_FALLBACK === "1";
  if (!localFallbackDisabled && options.config?.embeddingProvider === "local") {
    try {
      const { getLocalEmbeddingProvider } = await loadLocalEmbeddingProviderModule();
      return await getLocalEmbeddingProvider(options);
    } catch (error) {
      if (isMissingLocalEmbeddingModule(error)) {
        return null;
      }
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
  const cached = getCachedEmbedding(queryEmbeddingCache, cacheKey);
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
    cacheEmbedding(queryEmbeddingCache, cacheKey, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLocalEmbeddingFallback(message);
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
  const cacheKey = `${provider.provider}:${provider.model}:${provider.version}:passage:${value}`;
  const cached = getCachedEmbedding(passageEmbeddingCache, cacheKey);
  if (cached) {
    return cached;
  }
  try {
    const result = {
      embedding: await provider.embedPassage(value),
      space: {
        provider: provider.provider,
        model: provider.model,
        version: provider.version,
        dimensions: provider.dimensions
      }
    };
    cacheEmbedding(passageEmbeddingCache, cacheKey, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLocalEmbeddingFallback(message);
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
    embedding_manifest_id?: string;
  },
  space: EmbeddingSpace
): boolean =>
  Array.isArray(node.embedding) &&
  node.embedding.length === space.dimensions &&
  node.embedding_provider === space.provider &&
  node.embedding_model === space.model &&
  node.embedding_version === space.version &&
  node.embedding_dimensions === space.dimensions &&
  (node.embedding_manifest_id ?? undefined) === (space.manifestId ?? undefined);

export const withEmbeddingMetadata = (
  result: EmbeddingResult
): Pick<
  import("../../types/domain.js").ExperienceNode,
  "embedding" | "embedding_provider" | "embedding_model" | "embedding_version" | "embedding_dimensions" | "embedding_manifest_id"
> => ({
  embedding: result.embedding,
  embedding_provider: result.space.provider,
  embedding_model: result.space.model,
  embedding_version: result.space.version,
  embedding_dimensions: result.space.dimensions,
  embedding_manifest_id: result.space.manifestId
});
