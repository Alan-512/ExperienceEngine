import {
  getExperienceEngineSecret,
  isSupportedSecretKey,
  setExperienceEngineSecret,
  unsetExperienceEngineSecret
} from "../../config/secrets-store.js";
import {
  readExperienceEngineSettings,
  setEmbeddingApiProvider,
  setEmbeddingDtype,
  setEmbeddingModel,
  setEmbeddingProvider,
  setDistillationAuthMode,
  setDistillationModel,
  setDistillationProvider,
  setInlineNoticesEnabled
} from "../../config/settings-store.js";
import { resolveModelCatalog, type ProviderModelCatalog } from "../../distillation/model-catalog.js";
import type { DistillerProvider } from "../../distillation/providers/types.js";
import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";

type ConfigCommandDeps = {
  resolveModelCatalog?: (provider: DistillerProvider) => Promise<ProviderModelCatalog>;
};

export const runConfigCommand = async (
  action?: string,
  key?: string,
  value?: string,
  deps: ConfigCommandDeps = {}
): Promise<void> => {
  if (action === "restore" && key === "repo-policy") {
    const config = loadConfig();
    const policy = new ExperienceInteractionService(config).restoreRepoPolicy(process.cwd());
    console.log(
      `[ExperienceEngine] Repo policy restored for ${policy.scope_id}: ${policy.effective_mode}.`
    );
    return;
  }

  if (action === "get" && key?.startsWith("secret.")) {
    const secretKey = key.slice("secret.".length);
    if (!isSupportedSecretKey(secretKey)) {
      console.log(`Usage: ee config get secret.<ENV_KEY>`);
      return;
    }

    console.log(getExperienceEngineSecret(secretKey) ? "<set>" : "<unset>");
    return;
  }

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

  if (action === "get" && key === "embedding.provider") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.embedding?.provider ?? "api"));
    return;
  }

  if (action === "get" && key === "embedding.api_provider") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.embedding?.api_provider ?? "auto"));
    return;
  }

  if (action === "get" && key === "embedding.model") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.embedding?.model ?? "Xenova/multilingual-e5-small"));
    return;
  }

  if (action === "get" && key === "embedding.dtype") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.embedding?.dtype ?? "q8"));
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

  if (action === "set" && key === "embedding.provider") {
    if (value !== "api" && value !== "local" && value !== "legacy") {
      console.log("Usage: ee config set embedding.provider api|local|legacy");
      return;
    }

    setEmbeddingProvider(value);
    console.log(`[ExperienceEngine] Embedding provider set to ${value}.`);
    return;
  }

  if (action === "set" && key === "embedding.api_provider") {
    if (value !== "auto" && value !== "openai" && value !== "gemini" && value !== "jina") {
      console.log("Usage: ee config set embedding.api_provider auto|openai|gemini|jina");
      return;
    }

    setEmbeddingApiProvider(value);
    console.log(`[ExperienceEngine] Embedding API provider set to ${value}.`);
    return;
  }

  if (action === "set" && key === "embedding.model") {
    if (!value) {
      console.log("Usage: ee config set embedding.model <modelId>");
      return;
    }

    setEmbeddingModel(value);
    console.log(`[ExperienceEngine] Embedding model set to ${value}.`);
    return;
  }

  if (action === "set" && key === "embedding.dtype") {
    if (value !== "q8" && value !== "fp32") {
      console.log("Usage: ee config set embedding.dtype q8|fp32");
      return;
    }

    setEmbeddingDtype(value);
    console.log(`[ExperienceEngine] Embedding dtype set to ${value}.`);
    return;
  }

  if (action === "set" && key?.startsWith("secret.")) {
    const secretKey = key.slice("secret.".length);
    if (!value || !isSupportedSecretKey(secretKey)) {
      console.log("Usage: ee config set secret.<ENV_KEY> <value>");
      return;
    }

    setExperienceEngineSecret(secretKey, value);
    console.log(`[ExperienceEngine] Stored secret ${secretKey}.`);
    return;
  }

  if (action === "unset" && key?.startsWith("secret.")) {
    const secretKey = key.slice("secret.".length);
    if (!isSupportedSecretKey(secretKey)) {
      console.log("Usage: ee config unset secret.<ENV_KEY>");
      return;
    }

    unsetExperienceEngineSecret(secretKey);
    console.log(`[ExperienceEngine] Removed secret ${secretKey}.`);
    return;
  }

  console.log(
    "Usage: ee config <get|set|unset|restore> notices.inline|distillation.provider|distillation.auth_mode|distillation.model|embedding.provider|embedding.api_provider|embedding.model|embedding.dtype|secret.<ENV_KEY>|repo-policy [value]"
  );
};
