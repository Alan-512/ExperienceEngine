import type { DistillerProvider } from "../../distillation/providers/types.js";
import { filterProviderModels, resolveModelCatalog, type ProviderModelCatalog } from "../../distillation/model-catalog.js";

type ModelsCommandDeps = {
  resolveModelCatalog?: (provider: DistillerProvider) => Promise<ProviderModelCatalog>;
};

export const runModelsCommand = async (
  action?: string,
  providerArg?: string,
  query?: string,
  deps: ModelsCommandDeps = {}
): Promise<void> => {
  if (action !== "list" || !providerArg) {
    console.log("Usage: ee models list <provider> [query]");
    return;
  }

  const provider = providerArg as DistillerProvider;
  const catalog = await (deps.resolveModelCatalog ?? resolveModelCatalog)(provider);
  const models = filterProviderModels(catalog.models, query);

  console.log(`Model catalog: ${catalog.provider} (${catalog.source})`);
  console.log(
    "[ExperienceEngine] Distillation usually works best with lightweight text models that return structured JSON quickly."
  );
  for (const model of models.slice(0, 50)) {
    console.log(`- ${model.id} | ${model.name} | ${model.summary ?? "Text model"}`);
  }
};
