import { join } from "node:path";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalEmbeddingProvider, setTransformersModuleLoaderForTests, clearLocalEmbeddingProviderCache } from "../../src/store/vector/local-provider.js";
import { importOfflineAssetPack, exportOfflineAssetPack, loadOfflineManifestForModel } from "../../src/store/vector/offline-manifest.js";
import { removeTempDirForTests } from "./temp-cleanup.js";
import { createHash } from "node:crypto";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-offline-test-"));
  tempDirs.push(dir);
  return dir;
};

describe("Offline Embedding Profile And Staging", () => {
  let mockTransformers: any;
  let mockPipeline: any;

  beforeEach(() => {
    mockPipeline = vi.fn().mockImplementation(async (task, model, options) => {
      return vi.fn().mockImplementation(async (text, opt) => {
        return {
          data: new Array(384).fill(0.15),
          tolist: () => new Array(384).fill(0.15)
        };
      });
    });

    mockTransformers = {
      env: {
        allowRemoteModels: true,
        allowLocalModels: true,
        cacheDir: ""
      },
      pipeline: mockPipeline
    };

    setTransformersModuleLoaderForTests(async () => mockTransformers);
  });

  afterEach(() => {
    clearLocalEmbeddingProviderCache();
    setTransformersModuleLoaderForTests(null);
    while (tempDirs.length) {
      const dir = tempDirs.pop();
      if (dir) {
        removeTempDirForTests(dir);
      }
    }
  });

  const setupMockAssetPack = (packDir: string) => {
    const configContent = "mock-config-json-content";
    const modelContent = "mock-model-onnx-content";
    const sha1 = createHash("sha256").update(configContent).digest("hex");
    const sha2 = createHash("sha256").update(modelContent).digest("hex");

    const manifest = {
      manifestVersion: "1.0",
      providerId: "local",
      modelId: "Xenova/multilingual-e5-small",
      dimensions: 384,
      preprocessingVersion: "local-e5-v1",
      assets: {
        "config.json": { path: "config.json", sha256: sha1 },
        "model.onnx": { path: "model.onnx", sha256: sha2 }
      }
    };

    writeFileSync(join(packDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    writeFileSync(join(packDir, "config.json"), configContent, "utf8");
    writeFileSync(join(packDir, "model.onnx"), modelContent, "utf8");

    return { sha1, sha2 };
  };

  it("successfully imports a valid offline asset pack", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();
    setupMockAssetPack(packDir);

    await importOfflineAssetPack(packDir, cacheDir);

    const targetModelDir = join(cacheDir, "Xenova", "multilingual-e5-small");
    expect(existsSync(join(targetModelDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(targetModelDir, "config.json"))).toBe(true);
    expect(existsSync(join(targetModelDir, "model.onnx"))).toBe(true);

    const manifest = loadOfflineManifestForModel(cacheDir, "Xenova/multilingual-e5-small");
    expect(manifest.dimensions).toBe(384);
    expect(manifest.preprocessingVersion).toBe("local-e5-v1");
  });

  it("fails to import asset pack if manifest.json is missing", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();

    writeFileSync(join(packDir, "config.json"), "some content", "utf8");

    await expect(importOfflineAssetPack(packDir, cacheDir)).rejects.toThrow(
      /Asset pack missing manifest.json/
    );
  });

  it("fails when loading manifest with checksum mismatch", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();
    setupMockAssetPack(packDir);

    // Corrupt config file content
    writeFileSync(join(packDir, "config.json"), "corrupted content", "utf8");

    await expect(importOfflineAssetPack(packDir, cacheDir)).rejects.toThrow(
      /Asset checksum mismatch for file config.json/
    );
  });

  it("exports an offline asset pack successfully", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();
    const exportDir = makeTempDir();
    setupMockAssetPack(packDir);

    await importOfflineAssetPack(packDir, cacheDir);
    await exportOfflineAssetPack(cacheDir, "Xenova/multilingual-e5-small", exportDir);

    expect(existsSync(join(exportDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(exportDir, "config.json"))).toBe(true);
    expect(existsSync(join(exportDir, "model.onnx"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(exportDir, "manifest.json"), "utf8"));
    expect(manifest.modelId).toBe("Xenova/multilingual-e5-small");
  });

  it("loads local provider in strict-offline mode with remote fetch blocked", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();
    setupMockAssetPack(packDir);

    await importOfflineAssetPack(packDir, cacheDir);

    const provider = await createLocalEmbeddingProvider({
      config: {
        embeddingProfile: "strict-offline",
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir
      }
    });

    expect(provider.provider).toBe("local");
    expect(provider.dimensions).toBe(384);
    expect(mockTransformers.env.allowRemoteModels).toBe(false);
    expect(mockTransformers.env.allowLocalModels).toBe(true);

    const queryRes = await provider.embedQuery("test query");
    expect(queryRes).toHaveLength(384);
  });

  it("fails loudly when creating local provider in strict-offline mode if manifest is missing", async () => {
    const cacheDir = makeTempDir();

    await expect(
      createLocalEmbeddingProvider({
        config: {
          embeddingProfile: "strict-offline",
          embeddingProvider: "local",
          embeddingModel: "Xenova/multilingual-e5-small",
          embeddingCacheDir: cacheDir
        }
      })
    ).rejects.toThrow(/Manifest file not found/);
  });

  it("fails loudly in strict-offline mode if assets are corrupted", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();
    setupMockAssetPack(packDir);

    await importOfflineAssetPack(packDir, cacheDir);

    // Corrupt cached file after import
    const cachedConfig = join(cacheDir, "Xenova", "multilingual-e5-small", "config.json");
    writeFileSync(cachedConfig, "corrupted after import content", "utf8");

    await expect(
      createLocalEmbeddingProvider({
        config: {
          embeddingProfile: "strict-offline",
          embeddingProvider: "local",
          embeddingModel: "Xenova/multilingual-e5-small",
          embeddingCacheDir: cacheDir
        }
      })
    ).rejects.toThrow(/Asset checksum mismatch/);
  });

  it("gracefully allows remote download in standard profile mode", async () => {
    const cacheDir = makeTempDir();

    const provider = await createLocalEmbeddingProvider({
      config: {
        embeddingProfile: "standard",
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir
      }
    });

    expect(provider.provider).toBe("local");
    expect(mockTransformers.env.allowRemoteModels).toBe(true);
  });
});
