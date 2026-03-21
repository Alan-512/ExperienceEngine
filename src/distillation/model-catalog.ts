import type { DistillerProvider } from "./providers/types.js";

const MODELS_DEV_API_URL = "https://models.dev/api.json";

type ModelsDevModel = {
  id: string;
  name?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  modalities?: {
    input?: string[];
    output?: string[];
  };
};

type ModelsDevProvider = {
  id: string;
  name?: string;
  models?: Record<string, ModelsDevModel>;
};

type ModelsDevCatalog = Record<string, ModelsDevProvider>;

export type ProviderModelCatalogEntry = {
  id: string;
  name: string;
  summary?: string;
  reasoning?: boolean;
  toolCall?: boolean;
  contextWindow?: number;
  outputWindow?: number;
};

export type ProviderModelCatalog = {
  provider: DistillerProvider;
  source: "models.dev" | "static";
  models: ProviderModelCatalogEntry[];
};

const EE_PROVIDER_TO_MODELS_DEV_PROVIDER: Partial<Record<DistillerProvider, string>> = {
  openrouter: "openrouter",
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  azure_openai: "azure",
  bedrock: "amazon-bedrock",
  dashscope: "alibaba-cn",
  deepseek: "deepseek",
  moonshot: "moonshotai-cn",
  zhipu: "zhipuai",
  siliconflow: "siliconflow-cn",
  minimax: "minimax-cn",
  openai_compatible: "openrouter"
};

const STATIC_PROVIDER_MODELS: Partial<Record<DistillerProvider, ProviderModelCatalogEntry[]>> = {
  volcengine_ark: [
    { id: "doubao-seed-1-6-flash-250715", name: "Doubao Seed 1.6 Flash", summary: "Lightweight Ark text model" }
  ],
  tencent_hunyuan: [
    { id: "hunyuan-turbos-latest", name: "Hunyuan Turbo", summary: "Lightweight Hunyuan text model" }
  ],
  baidu_qianfan: [
    { id: "ernie-4.5-turbo-128k", name: "ERNIE 4.5 Turbo 128K", summary: "Lightweight Qianfan text model" }
  ]
};

const summarizeModel = (model: ModelsDevModel): string | undefined => {
  if (model.reasoning) {
    return "Reasoning-capable text model";
  }
  if (model.tool_call) {
    return "Tool-capable text model";
  }
  return "Text model";
};

export const mapModelsDevCatalogToProvider = (
  provider: DistillerProvider,
  catalog: ModelsDevCatalog
): ProviderModelCatalog => {
  const mappedProviderId = EE_PROVIDER_TO_MODELS_DEV_PROVIDER[provider];
  if (!mappedProviderId || !catalog[mappedProviderId]) {
    return {
      provider,
      source: "static",
      models: STATIC_PROVIDER_MODELS[provider] ?? []
    };
  }

  const sourceProvider = catalog[mappedProviderId];
  const models = Object.values(sourceProvider.models ?? {}).map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
    summary: summarizeModel(model),
    reasoning: model.reasoning,
    toolCall: model.tool_call,
    contextWindow: model.limit?.context,
    outputWindow: model.limit?.output
  }));

  return {
    provider,
    source: "models.dev",
    models
  };
};

export const filterProviderModels = (
  models: ProviderModelCatalogEntry[],
  query?: string
): ProviderModelCatalogEntry[] => {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) {
    return models;
  }

  return models.filter((model) => {
    const haystack = `${model.id} ${model.name} ${model.summary ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
};

export const resolveModelCatalog = async (
  provider: DistillerProvider,
  fetchImpl: typeof fetch = fetch
): Promise<ProviderModelCatalog> => {
  const response = await fetchImpl(MODELS_DEV_API_URL);
  if (!response.ok) {
    throw new Error(`Model catalog request failed with ${response.status}`);
  }

  const catalog = (await response.json()) as ModelsDevCatalog;
  return mapModelsDevCatalogToProvider(provider, catalog);
};
