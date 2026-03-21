import {
  readExperienceEngineSettings,
  setDistillationAuthMode,
  setDistillationModel,
  setDistillationProvider,
  setInlineNoticesEnabled
} from "../../config/settings-store.js";
import { resolveModelCatalog, type ProviderModelCatalog } from "../../distillation/model-catalog.js";
import type { DistillerProvider } from "../../distillation/providers/types.js";

type ConfigCommandDeps = {
  resolveModelCatalog?: (provider: DistillerProvider) => Promise<ProviderModelCatalog>;
};

export const runConfigCommand = async (
  action?: string,
  key?: string,
  value?: string,
  deps: ConfigCommandDeps = {}
): Promise<void> => {
  if (action === "get" && key === "notices.inline") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.notices?.inline ?? true));
    return;
  }

  if (action === "get" && key === "distillation.provider") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.distillation?.provider ?? ""));
    return;
  }

  if (action === "get" && key === "distillation.model") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.distillation?.model ?? ""));
    return;
  }

  if (action === "get" && key === "distillation.auth_mode") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.distillation?.auth_mode ?? "api_key"));
    return;
  }

  if (action === "set" && key === "notices.inline") {
    if (value !== "true" && value !== "false") {
      console.log("Usage: ee config set notices.inline true|false");
      return;
    }

    setInlineNoticesEnabled(value === "true");
    console.log(
      value === "true"
        ? "[ExperienceEngine] Inline notices enabled."
        : "[ExperienceEngine] Inline notices disabled."
    );
    return;
  }

  if (action === "set" && key === "distillation.provider") {
    if (!value) {
      console.log("Usage: ee config set distillation.provider <provider>");
      return;
    }

    setDistillationProvider(value);
    console.log(`[ExperienceEngine] Distillation provider set to ${value}.`);
    return;
  }

  if (action === "set" && key === "distillation.auth_mode") {
    if (value !== "api_key" && value !== "google_adc") {
      console.log("Usage: ee config set distillation.auth_mode api_key|google_adc");
      return;
    }

    setDistillationAuthMode(value);
    console.log(`[ExperienceEngine] Distillation auth mode set to ${value}.`);
    return;
  }

  if (action === "set" && key === "distillation.model") {
    if (!value) {
      console.log("Usage: ee config set distillation.model <modelId>");
      return;
    }

    const settings = readExperienceEngineSettings();
    const provider = settings.distillation?.provider as DistillerProvider | undefined;
    if (!provider) {
      console.log("[ExperienceEngine] Set distillation.provider before selecting a model.");
      return;
    }

    const catalog = await (deps.resolveModelCatalog ?? resolveModelCatalog)(provider);
    const found = catalog.models.find((model) => model.id === value);
    if (!found) {
      console.log(
        `[ExperienceEngine] ${value} is not in the ${provider} model catalog. Use \`ee models list ${provider}\` first.`
      );
      return;
    }

    setDistillationModel(provider, value);
    console.log(`[ExperienceEngine] Distillation model set to ${value} for provider ${provider}.`);
    return;
  }

  console.log(
    "Usage: ee config <get|set> notices.inline|distillation.provider|distillation.auth_mode|distillation.model [value]"
  );
};
