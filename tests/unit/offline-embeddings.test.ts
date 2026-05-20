import { join } from "node:path";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalEmbeddingProvider, setTransformersModuleLoaderForTests, clearLocalEmbeddingProviderCache, getLocalEmbeddingProvider } from "../../src/store/vector/local-provider.js";
import { importOfflineAssetPack, exportOfflineAssetPack, loadOfflineManifestForModel, isSafeRelativePath } from "../../src/store/vector/offline-manifest.js";
import { embedQueryText, embedPassageText, clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
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

  it("validates isSafeRelativePath correctly against path traversals and absolute paths", () => {
    // Safe paths
    expect(isSafeRelativePath("config.json")).toBe(true);
    expect(isSafeRelativePath("assets/model.onnx")).toBe(true);
    expect(isSafeRelativePath("a/b/c.txt")).toBe(true);

    // Unsafe paths
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("../config.json")).toBe(false);
    expect(isSafeRelativePath("assets/../../config.json")).toBe(false);
    expect(isSafeRelativePath("/absolute/path")).toBe(false);
    expect(isSafeRelativePath("C:\\Windows\\win.ini")).toBe(false);
    expect(isSafeRelativePath("a/../b")).toBe(false);
    expect(isSafeRelativePath("a/./b")).toBe(false);
  });

  it("fails loudly in embedQueryText and embedPassageText under strict-offline mode on error", async () => {
    const cacheDir = makeTempDir();

    // Do not set up manifest, causing it to fail on load
    const options = {
      config: {
        embeddingProfile: "strict-offline" as const,
        embeddingProvider: "local" as const,
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir
      }
    };

    await expect(embedQueryText("hello", options)).rejects.toThrow(/Manifest file not found/);
    await expect(embedPassageText("world", options)).rejects.toThrow(/Manifest file not found/);
  });

  it("partitions the local provider cache by config/profile/model/cacheDir", async () => {
    const packDir1 = makeTempDir();
    const packDir2 = makeTempDir();
    const cacheDir1 = makeTempDir();
    const cacheDir2 = makeTempDir();
    setupMockAssetPack(packDir1);
    setupMockAssetPack(packDir2);
    await importOfflineAssetPack(packDir1, cacheDir1);
    await importOfflineAssetPack(packDir2, cacheDir2);

    const provider1 = await getLocalEmbeddingProvider({
      config: {
        embeddingProfile: "strict-offline",
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir1
      }
    });

    const provider2 = await getLocalEmbeddingProvider({
      config: {
        embeddingProfile: "strict-offline",
        embeddingProvider: "local",
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir2
      }
    });

    // They should be different instances because they are partitioned by cacheDir
    expect(provider1).not.toBe(provider2);
  });

  it("propagates manifestId to provider and embedding results in space metadata", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();
    setupMockAssetPack(packDir);

    // Inject manifest ID into the mock asset pack manifest
    const manifestPath = join(packDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.id = "test-unique-manifest-id-123";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    await importOfflineAssetPack(packDir, cacheDir);

    const options = {
      config: {
        embeddingProfile: "strict-offline" as const,
        embeddingProvider: "local" as const,
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: cacheDir
      }
    };

    const provider = await getLocalEmbeddingProvider(options);
    expect(provider.manifestId).toBe("test-unique-manifest-id-123");

    const queryRes = await embedQueryText("hello query", options);
    expect(queryRes.space.manifestId).toBe("test-unique-manifest-id-123");

    const passageRes = await embedPassageText("hello passage", options);
    expect(passageRes.space.manifestId).toBe("test-unique-manifest-id-123");

    clearEmbeddingProviderForTests();
  });

  it("derives a deterministic manifest ID when id is omitted from the manifest", async () => {
    const packDir = makeTempDir();
    const cacheDir = makeTempDir();
    setupMockAssetPack(packDir);

    // Ensure there is no id in the manifest file in packDir
    const manifestPath = join(packDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.id;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    await importOfflineAssetPack(packDir, cacheDir);

    const loadedManifest = loadOfflineManifestForModel(cacheDir, "Xenova/multilingual-e5-small");
    expect(loadedManifest.id).toBeDefined();
    expect(loadedManifest.id).toMatch(/^derived-[0-9a-f]{16}$/);

    // Verify it is deterministic by checking that importing again with same assets produces the exact same derived ID
    const cacheDir2 = makeTempDir();
    await importOfflineAssetPack(packDir, cacheDir2);
    const loadedManifest2 = loadOfflineManifestForModel(cacheDir2, "Xenova/multilingual-e5-small");
    expect(loadedManifest.id).toBe(loadedManifest2.id);
  });

  it("partitions embedding caches by dimensions and manifestId", async () => {
    const embedQueryMock1 = vi.fn().mockResolvedValue(new Array(384).fill(0.1));
    const provider1: any = {
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 384,
      manifestId: "manifest-A",
      embedQuery: embedQueryMock1,
      embedPassage: vi.fn()
    };

    const embedQueryMock2 = vi.fn().mockResolvedValue(new Array(384).fill(0.2));
    const provider2: any = {
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 384,
      manifestId: "manifest-B",
      embedQuery: embedQueryMock2,
      embedPassage: vi.fn()
    };

    // First call with provider1
    setEmbeddingProviderForTests(provider1);
    const res1 = await embedQueryText("same text query", { config: { embeddingProvider: "local" } });
    expect(res1.embedding[0]).toBe(0.1);
    expect(embedQueryMock1).toHaveBeenCalledTimes(1);

    // Call again to verify cached
    const res1Cached = await embedQueryText("same text query", { config: { embeddingProvider: "local" } });
    expect(res1Cached.embedding[0]).toBe(0.1);
    expect(embedQueryMock1).toHaveBeenCalledTimes(1);

    // Switch to provider2 with different manifestId, same text query should NOT hit cache of provider1
    setEmbeddingProviderForTests(provider2);
    const res2 = await embedQueryText("same text query", { config: { embeddingProvider: "local" } });
    expect(res2.embedding[0]).toBe(0.2);
    expect(embedQueryMock2).toHaveBeenCalledTimes(1);

    clearEmbeddingProviderForTests();
  });

  it("evicts rejected provider promises from cache to allow recovery on subsequent attempts", async () => {
    let callCount = 0;
    const mockLoader = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Initialization failed on first call");
      }
      return mockTransformers;
    };

    setTransformersModuleLoaderForTests(mockLoader);

    const options = {
      config: {
        embeddingProfile: "standard" as const,
        embeddingProvider: "local" as const,
        embeddingModel: "Xenova/multilingual-e5-small",
        embeddingCacheDir: makeTempDir()
      }
    };

    // First attempt should fail and reject the promise
    await expect(getLocalEmbeddingProvider(options)).rejects.toThrow(/Initialization failed/);

    // Second attempt should succeed because the rejected promise was evicted from cache
    const provider = await getLocalEmbeddingProvider(options);
    expect(provider).toBeDefined();
    expect(provider.provider).toBe("local");
    expect(callCount).toBe(2);

    setTransformersModuleLoaderForTests(null);
  });
});
