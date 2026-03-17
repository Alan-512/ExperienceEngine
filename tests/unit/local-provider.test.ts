import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalEmbeddingProviderCache,
  createLocalEmbeddingProvider,
  resetManagedEmbeddingCache,
  setTransformersModuleLoaderForTests
} from "../../src/store/vector/local-provider.js";

describe("local embedding provider", () => {
  afterEach(() => {
    clearLocalEmbeddingProviderCache();
    setTransformersModuleLoaderForTests(null);
  });

  it("requests q8 quantization by default for the managed local model", async () => {
    const pipelineSpy = vi.fn(async () =>
      async () => ({
        data: [0.1, 0.2, 0.3]
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

    const cacheDir = mkdtempSync(join(tmpdir(), "ee-local-provider-"));
    const provider = await createLocalEmbeddingProvider({
      config: {
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir,
        embeddingDtype: "q8"
      }
    });

    expect(provider.dimensions).toBe(3);
    expect(pipelineSpy).toHaveBeenCalledWith("feature-extraction", "Xenova/multilingual-e5-small", {
      dtype: "q8"
    });
  });

  it("clears a corrupted cached model and retries once", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "ee-local-provider-"));
    const modelDir = join(cacheDir, "Xenova", "multilingual-e5-small", "onnx");
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, "model.onnx"), "broken");

    const pipelineSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("Load model from cache failed:Protobuf parsing failed."))
      .mockResolvedValue(async () => ({ data: [0.4, 0.5, 0.6] }));

    setTransformersModuleLoaderForTests(async () => ({
      env: {
        allowRemoteModels: false,
        allowLocalModels: false,
        cacheDir: undefined
      },
      pipeline: pipelineSpy
    }));

    const provider = await createLocalEmbeddingProvider({
      config: {
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir,
        embeddingDtype: "q8"
      }
    });

    expect(provider.dimensions).toBe(3);
    expect(pipelineSpy).toHaveBeenCalledTimes(2);
    expect(existsSync(join(modelDir, "model.onnx"))).toBe(false);
  });

  it("clears the configured model cache and rebuilds it", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "ee-local-provider-"));
    const modelDir = join(cacheDir, "Xenova", "multilingual-e5-small");
    mkdirSync(join(modelDir, "onnx"), { recursive: true });
    writeFileSync(join(modelDir, "onnx", "model.onnx"), "stale");

    const pipelineSpy = vi.fn(async () =>
      async () => ({
        data: [0.7, 0.8, 0.9]
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

    const report = await resetManagedEmbeddingCache({
      config: {
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir,
        embeddingDtype: "q8"
      }
    });

    expect(report).toMatchObject({
      cacheDir: modelDir,
      model: "Xenova/multilingual-e5-small",
      rebuilt: true,
      dimensions: 3
    });
    expect(existsSync(join(modelDir, "onnx", "model.onnx"))).toBe(false);
    expect(pipelineSpy).toHaveBeenCalledTimes(1);
  });
});
