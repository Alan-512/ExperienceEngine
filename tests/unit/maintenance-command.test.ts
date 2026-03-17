import { afterEach, describe, expect, it, vi } from "vitest";
import { runMaintenanceCommand } from "../../src/cli/commands/maintenance.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
});

describe("maintenance command", () => {
  it("clears and rebuilds the configured embedding cache", async () => {
    await runMaintenanceCommand("embeddings-reset", {
      loadConfig: () =>
        ({
          embeddingProvider: "local",
          embeddingModel: "Xenova/multilingual-e5-small",
          embeddingDtype: "q8",
          embeddingCacheDir: "/tmp/embeddings"
        }) as never,
      resetManagedEmbeddingCache: async () => ({
        cacheDir: "/tmp/embeddings",
        model: "Xenova/multilingual-e5-small",
        rebuilt: true,
        dimensions: 384
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Cleared embedding cache: /tmp/embeddings"],
        ["[ExperienceEngine] Rebuilt managed embedding cache with Xenova/multilingual-e5-small (384 dimensions)."]
      ])
    );
  });

  it("prints usage for unknown maintenance actions", async () => {
    await runMaintenanceCommand("unknown");

    expect(consoleLogSpy).toHaveBeenCalledWith("Usage: ee maintenance embeddings-reset");
  });
});
