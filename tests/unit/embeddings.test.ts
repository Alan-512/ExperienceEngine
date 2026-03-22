import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmbeddingRuntimeCaches,
  clearEmbeddingProviderForTests,
  embedPassageText,
  embedQueryText,
  setEmbeddingProviderForTests
} from "../../src/store/vector/embeddings.js";
import {
  clearLocalEmbeddingProviderCache,
  setTransformersModuleLoaderForTests
} from "../../src/store/vector/local-provider.js";

describe("embedding fallback diagnostics", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    warnSpy.mockClear();
    clearEmbeddingProviderForTests();
    clearEmbeddingRuntimeCaches();
    clearLocalEmbeddingProviderCache();
    setTransformersModuleLoaderForTests(null);
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    clearEmbeddingProviderForTests();
    clearEmbeddingRuntimeCaches();
    clearLocalEmbeddingProviderCache();
    setTransformersModuleLoaderForTests(null);
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("logs one warning and falls back to legacy embeddings when the local provider fails", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        throw new Error("model bootstrap failed");
      },
      async embedPassage() {
        throw new Error("model bootstrap failed");
      }
    });

    const first = await embedQueryText("start the local mock service first");
    const second = await embedQueryText("start the local mock service first");

    expect(first.space.provider).toBe("legacy");
    expect(second.space.provider).toBe("legacy");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("Local embedding provider unavailable");
  });

  it("prefers the OpenAI API provider when api mode is enabled and OPENAI_API_KEY is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.11, 0.22, 0.33] }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await embedQueryText("validate the first failing step", {
      config: {
        embeddingProvider: "api",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(result.space).toMatchObject({
      provider: "openai",
      model: "text-embedding-3-small",
      version: "openai-te3s-v1",
      dimensions: 1536
    });
  });

  it("falls back to the local provider when the API provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "busy" }), { status: 503 }))
    );

    const pipelineSpy = vi.fn(async () =>
      async () => ({
        data: [0.91, 0.82, 0.73]
      })
    );

    setTransformersModuleLoaderForTests(async () => ({
      env: {
        allowRemoteModels: false,
        allowLocalModels: false,
        cacheDir: undefined
      },
      pipeline: pipelineSpy
    }));

    const result = await embedQueryText("validate the first failing step", {
      config: {
        embeddingProvider: "api",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(result.space.provider).toBe("local");
    expect(result.embedding).toEqual([0.91, 0.82, 0.73]);
    expect(pipelineSpy).toHaveBeenCalledTimes(1);
  });

  it("defaults to the Jina API provider when api mode is enabled and no OpenAI key is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.task).toBe("retrieval.query");
        return new Response(
          JSON.stringify({
            data: [{ embedding: [0.41, 0.52, 0.63] }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const result = await embedQueryText("narrow the root cause before editing code", {
      config: {
        embeddingProvider: "api",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: undefined,
        EXPERIENCE_ENGINE_EMBEDDING_API_KEY: undefined
      }
    });

    expect(result.space).toMatchObject({
      provider: "jina",
      model: "jina-embeddings-v3",
      version: "jina-v3",
      dimensions: 1024
    });
  });

  it("caches repeated query embeddings for the same API provider and input", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.11, 0.22, 0.33] }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const options = {
      config: {
        embeddingProvider: "api" as const,
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8" as const,
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    };

    const first = await embedQueryText("validate the first failing step", options);
    const second = await embedQueryText("validate the first failing step", options);

    expect(first.embedding).toEqual(second.embedding);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches repeated passage embeddings for the same API provider and input", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.44, 0.55, 0.66] }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const options = {
      config: {
        embeddingProvider: "api" as const,
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8" as const,
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    };

    const first = await embedPassageText("repair the provider config resolution before touching the UI", options);
    const second = await embedPassageText("repair the provider config resolution before touching the UI", options);

    expect(first.embedding).toEqual(second.embedding);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("expires cached query embeddings after the ttl window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-22T12:00:00.000Z"));

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.11, 0.22, 0.33] }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.21, 0.32, 0.43] }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchSpy);

    const options = {
      config: {
        embeddingProvider: "api" as const,
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8" as const,
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    };

    const first = await embedQueryText("validate the first failing step", options);
    vi.setSystemTime(new Date("2026-03-22T12:06:00.000Z"));
    const second = await embedQueryText("validate the first failing step", options);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(first.embedding).not.toEqual(second.embedding);
  });

  it("evicts the oldest cached query embedding when the cache exceeds capacity", async () => {
    const fetchSpy = vi.fn(async (_url, init) =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [String(init?.body).length, 0.22, 0.33] }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const options = {
      config: {
        embeddingProvider: "api" as const,
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8" as const,
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    };

    for (let index = 0; index < 257; index += 1) {
      await embedQueryText(`validate failing step ${index}`, options);
    }
    await embedQueryText("validate failing step 0", options);

    expect(fetchSpy).toHaveBeenCalledTimes(258);
  });

  it("falls back cleanly when the API provider is rate limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }))
    );

    const pipelineSpy = vi.fn(async () =>
      async () => ({
        data: [0.15, 0.26, 0.37]
      })
    );

    setTransformersModuleLoaderForTests(async () => ({
      env: {
        allowRemoteModels: false,
        allowLocalModels: false,
        cacheDir: undefined
      },
      pipeline: pipelineSpy
    }));

    const result = await embedQueryText("validate the first failing step", {
      config: {
        embeddingProvider: "api",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(result.space.provider).toBe("local");
    expect(pipelineSpy).toHaveBeenCalledTimes(1);
  });

  it("includes both API and local failures in the warning when all providers fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }))
    );

    setTransformersModuleLoaderForTests(async () => ({
      env: {
        allowRemoteModels: false,
        allowLocalModels: false,
        cacheDir: undefined
      },
      pipeline: vi.fn(async () => {
        throw new Error("local bootstrap failed");
      })
    }));

    const result = await embedQueryText("validate the first failing step", {
      config: {
        embeddingProvider: "api",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(result.space.provider).toBe("legacy");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("429");
    expect(warnSpy.mock.calls[0]?.[0]).toContain("local bootstrap failed");
  });

  it("retries a transient API rate limit once before succeeding", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.61, 0.72, 0.83] }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await embedQueryText("retry the transient embedding failure once", {
      config: {
        embeddingProvider: "api",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(result.space.provider).toBe("openai");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures and falls back immediately", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchSpy);

    const pipelineSpy = vi.fn(async () =>
      async () => ({
        data: [0.21, 0.32, 0.43]
      })
    );

    setTransformersModuleLoaderForTests(async () => ({
      env: {
        allowRemoteModels: false,
        allowLocalModels: false,
        cacheDir: undefined
      },
      pipeline: pipelineSpy
    }));

    const result = await embedQueryText("do not retry auth failures", {
      config: {
        embeddingProvider: "api",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingDtype: "q8",
        embeddingCacheDir: "./tmp/embeddings"
      },
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(result.space.provider).toBe("local");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pipelineSpy).toHaveBeenCalledTimes(1);
  });
});
