import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import type { OfflineAssetManifest } from "../../types/domain.js";

export const isSafeRelativePath = (p: string): boolean => {
  if (typeof p !== "string" || !p) return false;
  if (isAbsolute(p)) return false;
  if (/^[a-zA-Z]:/.test(p)) return false;
  const parts = p.split(/[/\\]/);
  for (const part of parts) {
    if (part === ".." || part === ".") {
      return false;
    }
  }
  return true;
};

export const calculateFileSha256 = (filePath: string): string => {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
};

export const validateOfflineManifest = (
  manifest: unknown,
  baseDir: string
): OfflineAssetManifest => {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid manifest format: not an object.");
  }
  
  const m = manifest as Record<string, unknown>;
  
  if (typeof m.manifestVersion !== "string" || !m.manifestVersion) {
    throw new Error("Missing or invalid manifestVersion.");
  }
  if (m.providerId !== "local") {
    throw new Error(`Unsupported providerId: ${m.providerId}. Only 'local' is supported.`);
  }
  if (typeof m.modelId !== "string" || !m.modelId) {
    throw new Error("Missing or invalid modelId.");
  }
  if (typeof m.dimensions !== "number" || m.dimensions <= 0) {
    throw new Error("Missing or invalid dimensions.");
  }
  if (typeof m.preprocessingVersion !== "string" || !m.preprocessingVersion) {
    throw new Error("Missing or invalid preprocessingVersion.");
  }
  if (!m.assets || typeof m.assets !== "object") {
    throw new Error("Missing or invalid assets object.");
  }

  const validatedAssets: Record<string, { path: string; sha256: string }> = {};
  const assetsObj = m.assets as Record<string, unknown>;
  
  for (const [key, value] of Object.entries(assetsObj)) {
    if (!value || typeof value !== "object") {
      throw new Error(`Invalid asset entry for key: ${key}.`);
    }
    const val = value as Record<string, unknown>;
    if (typeof val.path !== "string" || !val.path || !isSafeRelativePath(val.path)) {
      throw new Error(`Missing, invalid, or unsafe path for asset: ${key}. Path traversal detected or suspected.`);
    }
    if (typeof val.sha256 !== "string" || !val.sha256) {
      throw new Error(`Missing or invalid sha256 checksum for asset: ${key}.`);
    }
    
    // Validate file presence and sha256
    const absolutePath = join(baseDir, val.path);
    if (!existsSync(absolutePath)) {
      throw new Error(`Asset file missing: ${absolutePath}`);
    }
    
    const actualSha256 = calculateFileSha256(absolutePath);
    if (actualSha256 !== val.sha256) {
      throw new Error(`Asset checksum mismatch for file ${val.path}. Expected: ${val.sha256}, Actual: ${actualSha256}`);
    }
    
    validatedAssets[key] = {
      path: val.path,
      sha256: val.sha256
    };
  }
  
  let manifestId = typeof m.id === "string" ? m.id : undefined;
  if (!manifestId) {
    const assetKeysSorted = Object.keys(validatedAssets).sort();
    const assetsString = assetKeysSorted
      .map((key) => `${key}:${validatedAssets[key].sha256}`)
      .join(";");
    const idSource = `${m.modelId}|${m.dimensions}|${m.preprocessingVersion}|${assetsString}`;
    manifestId = `derived-${createHash("sha256").update(idSource).digest("hex").slice(0, 16)}`;
  }

  return {
    id: manifestId,
    manifestVersion: m.manifestVersion,
    providerId: m.providerId,
    modelId: m.modelId,
    dimensions: m.dimensions,
    preprocessingVersion: m.preprocessingVersion,
    assets: validatedAssets,
    license: typeof m.license === "string" ? m.license : undefined,
    sourceMetadata: typeof m.sourceMetadata === "object" && m.sourceMetadata !== null ? (m.sourceMetadata as Record<string, unknown>) : undefined
  };
};

export const loadOfflineManifestForModel = (
  cacheDir: string,
  model: string
): OfflineAssetManifest => {
  const modelCacheDir = join(cacheDir, ...model.split("/"));
  const manifestPath = join(modelCacheDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }
  
  try {
    const rawContent = readFileSync(manifestPath, "utf8");
    const manifestJson = JSON.parse(rawContent);
    return validateOfflineManifest(manifestJson, modelCacheDir);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load or validate manifest at ${manifestPath}: ${msg}`);
  }
};

export const importOfflineAssetPack = async (
  packDir: string,
  cacheDir: string
): Promise<void> => {
  const manifestPath = join(packDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Asset pack missing manifest.json at ${packDir}`);
  }
  
  // Read and validate the manifest in the staging/pack directory
  let manifest: OfflineAssetManifest;
  try {
    const rawContent = readFileSync(manifestPath, "utf8");
    const manifestJson = JSON.parse(rawContent);
    manifest = validateOfflineManifest(manifestJson, packDir);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Import failed during manifest validation: ${msg}`);
  }
  
  const targetModelDir = join(cacheDir, ...manifest.modelId.split("/"));
  mkdirSync(targetModelDir, { recursive: true });
  
  // Copy manifest.json
  copyFileSync(manifestPath, join(targetModelDir, "manifest.json"));
  
  // Copy all assets
  for (const asset of Object.values(manifest.assets)) {
    const sourcePath = join(packDir, asset.path);
    const targetPath = join(targetModelDir, asset.path);
    
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }

  try {
    const { clearLocalEmbeddingProviderCache } = await import("./local-provider.js");
    const { clearEmbeddingRuntimeCaches } = await import("./embeddings.js");
    clearLocalEmbeddingProviderCache();
    clearEmbeddingRuntimeCaches();
  } catch {
    // Gracefully handle dynamic import edge cases
  }
};

export const exportOfflineAssetPack = async (
  cacheDir: string,
  model: string,
  targetPackDir: string
): Promise<void> => {
  // Load and validate from cache
  const manifest = loadOfflineManifestForModel(cacheDir, model);
  const modelCacheDir = join(cacheDir, ...model.split("/"));
  
  mkdirSync(targetPackDir, { recursive: true });
  
  // Copy manifest.json
  copyFileSync(
    join(modelCacheDir, "manifest.json"),
    join(targetPackDir, "manifest.json")
  );
  
  // Copy all assets
  for (const asset of Object.values(manifest.assets)) {
    const sourcePath = join(modelCacheDir, asset.path);
    const targetPath = join(targetPackDir, asset.path);
    
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
};
