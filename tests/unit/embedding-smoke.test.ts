import { afterEach, describe, expect, it } from "vitest";
import { runEmbeddingSmoke } from "../../src/maintenance/embedding-smoke.js";
import { clearEmbeddingProviderForTests, clearEmbeddingRuntimeCaches, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";

describe("runEmbeddingSmoke", () => {
  afterEach(() => {
    clearEmbeddingProviderForTests();
    clearEmbeddingRuntimeCaches();
  });

  it("reports provider metadata and shows warm timings after cache priming", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [1, 0, 0];
      },
      async embedPassage() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [1, 0, 0];
      }
    });

    const report = await runEmbeddingSmoke({
      embeddingProvider: "api",
      embeddingModel: "Xenova/multilingual-e5-small",
      embeddingDtype: "q8",
      embeddingCacheDir: "./tmp/embeddings"
    });

    expect(report.provider).toBe("local");
    expect(report.model).toBe("Xenova/multilingual-e5-small");
    expect(report.coldQueryMs).toBeGreaterThanOrEqual(report.warmQueryMs);
    expect(report.coldPassageMs).toBeGreaterThanOrEqual(report.warmPassageMs);
  });
});
