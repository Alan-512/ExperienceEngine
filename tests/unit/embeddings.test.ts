import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmbeddingProviderForTests,
  embedQueryText,
  setEmbeddingProviderForTests
} from "../../src/store/vector/embeddings.js";

describe("embedding fallback diagnostics", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    clearEmbeddingProviderForTests();
  });

  afterEach(() => {
    clearEmbeddingProviderForTests();
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
});
