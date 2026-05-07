import type { SemanticEmbeddingProvider } from "./provider-types.js";
import { resolveExperienceEngineRuntimeEnv } from "../../config/runtime-env.js";

type ApiEmbeddingOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  explicitProvider?: "auto" | "openai" | "jina" | "gemini";
};

const firstNonEmpty = (...values: Array<string | undefined>): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TRANSIENT_RETRIES = 1;

const resolveTimeoutMs = (options: ApiEmbeddingOptions): number => {
  if (typeof options.timeoutMs === "number") {
    return options.timeoutMs;
  }

  const configured = (options.env ?? process.env).EXPERIENCE_ENGINE_EMBEDDING_API_TIMEOUT_MS;
  if (!configured) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
};

const describeApiFailure = (provider: "openai" | "jina" | "gemini", status: number): string => {
  if (status === 401 || status === 403) {
    return `${provider} embedding API authentication failed (${status})`;
  }
  if (status === 429) {
    return `${provider} embedding API rate limited (${status})`;
  }
  if (status >= 500) {
    return `${provider} embedding API upstream failed (${status})`;
  }
  return `${provider} embedding API error (${status})`;
};

const isTransientApiStatus = (status: number): boolean => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const isTransientApiError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return true;
  }

  return /rate limited|upstream failed|timed out|fetch failed|network/i.test(error.message);
};

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<Response> => {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetchImpl(input, { ...init, signal });
};

const withTransientRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let attempts = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempts >= MAX_TRANSIENT_RETRIES || !isTransientApiError(error)) {
        throw error;
      }
      attempts += 1;
    }
  }
};

const OPENAI_MODEL = "text-embedding-3-small";
const OPENAI_VERSION = "openai-te3s-v1";

const createOpenAIProvider = (options: ApiEmbeddingOptions = {}): SemanticEmbeddingProvider => {
  const env = resolveExperienceEngineRuntimeEnv({ env: options.env ?? process.env, homeDir: options.homeDir });
  const apiKey = firstNonEmpty(env.OPENAI_API_KEY, env.EXPERIENCE_ENGINE_EMBEDDING_API_KEY);
  if (!apiKey) {
    throw new Error("OpenAI embedding provider requires OPENAI_API_KEY");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = resolveTimeoutMs(options);

  const embed = async (text: string): Promise<number[]> => {
    return withTransientRetry(async () => {
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            input: text
          })
        },
        fetchImpl,
        timeoutMs
      );

      if (!response.ok) {
        const error = new Error(describeApiFailure("openai", response.status));
        if (isTransientApiStatus(response.status)) {
          throw error;
        }
        throw error;
      }

      const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
      const embedding = payload.data?.[0]?.embedding;
      if (!embedding?.length) {
        throw new Error("OpenAI embedding API returned empty vector");
      }
      return embedding;
    });
  };

  return {
    provider: "openai",
    model: OPENAI_MODEL,
    version: OPENAI_VERSION,
    dimensions: 1536,
    embedQuery: embed,
    embedPassage: embed
  };
};

const JINA_MODEL = "jina-embeddings-v3";
const JINA_VERSION = "jina-v3";
const JINA_TASK_MAP = {
  query: "retrieval.query",
  passage: "retrieval.passage"
} as const;

const createJinaProvider = (options: ApiEmbeddingOptions = {}): SemanticEmbeddingProvider => {
  const env = resolveExperienceEngineRuntimeEnv({ env: options.env ?? process.env, homeDir: options.homeDir });
  const apiKey = firstNonEmpty(env.JINA_API_KEY);
  if (!apiKey) {
    throw new Error("Jina embedding provider requires JINA_API_KEY");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = resolveTimeoutMs(options);

  const embed = async (text: string, task: keyof typeof JINA_TASK_MAP): Promise<number[]> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    return withTransientRetry(async () => {
      const response = await fetchWithTimeout(
        "https://api.jina.ai/v1/embeddings",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: JINA_MODEL,
            input: [text],
            task: JINA_TASK_MAP[task],
            normalized: true
          })
        },
        fetchImpl,
        timeoutMs
      );

      if (!response.ok) {
        const error = new Error(describeApiFailure("jina", response.status));
        if (isTransientApiStatus(response.status)) {
          throw error;
        }
        throw error;
      }

      const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
      const embedding = payload.data?.[0]?.embedding;
      if (!embedding?.length) {
        throw new Error("Jina embedding API returned empty vector");
      }
      return embedding;
    });
  };

  return {
    provider: "jina",
    model: JINA_MODEL,
    version: JINA_VERSION,
    dimensions: 1024,
    embedQuery: (text) => embed(text, "query"),
    embedPassage: (text) => embed(text, "passage")
  };
};

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const GEMINI_EMBEDDING_VERSION = "gemini-embedding-001";

const createGeminiProvider = (options: ApiEmbeddingOptions = {}): SemanticEmbeddingProvider => {
  const env = resolveExperienceEngineRuntimeEnv({ env: options.env ?? process.env, homeDir: options.homeDir });
  const apiKey = firstNonEmpty(env.GEMINI_API_KEY);
  if (!apiKey) {
    throw new Error("Gemini embedding provider requires GEMINI_API_KEY");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = resolveTimeoutMs(options);

  const embed = async (text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"): Promise<number[]> => {
    const response = await withTransientRetry(async () =>
      fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            model: `models/${GEMINI_EMBEDDING_MODEL}`,
            content: {
              parts: [{ text }]
            },
            taskType,
            outputDimensionality: 1536
          })
        },
        fetchImpl,
        timeoutMs
      )
    );

    if (!response.ok) {
      throw new Error(describeApiFailure("gemini", response.status));
    }

    const payload = (await response.json()) as { embedding?: { values?: number[] } };
    const embedding = payload.embedding?.values;
    if (!embedding?.length) {
      throw new Error("Gemini embedding API returned empty vector");
    }
    return embedding;
  };

  return {
    provider: "gemini",
    model: GEMINI_EMBEDDING_MODEL,
    version: GEMINI_EMBEDDING_VERSION,
    dimensions: 1536,
    embedQuery: (text) => embed(text, "RETRIEVAL_QUERY"),
    embedPassage: (text) => embed(text, "RETRIEVAL_DOCUMENT")
  };
};

export const resolveApiEmbeddingProvider = (
  options: ApiEmbeddingOptions = {}
): SemanticEmbeddingProvider | null => {
  const env = resolveExperienceEngineRuntimeEnv({ env: options.env ?? process.env, homeDir: options.homeDir });
  const explicit = options.explicitProvider ?? env.EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER ?? "auto";

  if (explicit === "openai") {
    try {
      return createOpenAIProvider(options);
    } catch {
      return null;
    }
  }

  if (explicit === "jina") {
    try {
      return createJinaProvider(options);
    } catch {
      return null;
    }
  }

  if (explicit === "gemini") {
    try {
      return createGeminiProvider(options);
      } catch {
      return null;
    }
  }

  if (explicit === "auto") {
    if (firstNonEmpty(env.OPENAI_API_KEY, env.EXPERIENCE_ENGINE_EMBEDDING_API_KEY)) {
      try {
        return createOpenAIProvider(options);
      } catch {
        return null;
      }
    }

    if (firstNonEmpty(env.GEMINI_API_KEY)) {
      try {
        return createGeminiProvider(options);
      } catch {
        return null;
      }
    }

    try {
      return createJinaProvider(options);
    } catch {
      return null;
    }
  }

  return null;
};
