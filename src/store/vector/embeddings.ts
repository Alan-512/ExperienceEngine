import { normalizeWhitespace, tokenize } from "../../utils/text.js";

const EMBEDDING_DIMENSIONS = 192;
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
