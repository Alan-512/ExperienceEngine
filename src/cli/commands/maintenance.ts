import { loadConfig } from "../../config/load-config.js";
import { resetManagedEmbeddingCache } from "../../store/vector/local-provider.js";

type MaintenanceDeps = {
  loadConfig?: typeof loadConfig;
  resetManagedEmbeddingCache?: typeof resetManagedEmbeddingCache;
};

export const runMaintenanceCommand = async (
  action?: string,
  deps: MaintenanceDeps = {}
): Promise<void> => {
  if (action !== "embeddings-reset") {
    console.log("Usage: ee maintenance embeddings-reset");
    return;
  }

  const config = (deps.loadConfig ?? loadConfig)();
  const report = await (deps.resetManagedEmbeddingCache ?? resetManagedEmbeddingCache)({ config });

  console.log(`[ExperienceEngine] Cleared embedding cache: ${report.cacheDir}`);
  if (!report.rebuilt) {
    console.log("[ExperienceEngine] Managed local embeddings are disabled; cache rebuild was skipped.");
    return;
  }

  console.log(
    `[ExperienceEngine] Rebuilt managed embedding cache with ${report.model} (${report.dimensions} dimensions).`
  );
};
