import { createInterface } from "node:readline/promises";
import { defaultConfig } from "../../config/default-config.js";
import { isSupportedSecretKey, readExperienceEngineSecrets, setExperienceEngineSecret } from "../../config/secrets-store.js";
import {
  readExperienceEngineSettings,
  setDistillationAuthMode,
  setDistillationModel,
  setDistillationProvider,
  setEmbeddingApiProvider,
  setEmbeddingDtype,
  setEmbeddingModel,
  setEmbeddingProvider,
  setDistillationFallbackChain,
  setHybridSettings
} from "../../config/settings-store.js";
import { resolveModelCatalog, type ProviderModelCatalog } from "../../distillation/model-catalog.js";
import { DISTILLER_PROVIDERS, type DistillerProvider } from "../../distillation/providers/types.js";

type InitCommandDeps = {
  resolveModelCatalog?: (provider: DistillerProvider) => Promise<ProviderModelCatalog>;
  ui?: InitWizardUI;
};

type InitWizardChoice = {
  label: string;
  value: string;
  detail?: string;
};

type InitWizardUI = {
  isInteractive(): boolean;
  choose(step: { title: string; message?: string; options: InitWizardChoice[] }): Promise<string | undefined>;
  input(step: { title: string; message?: string; secret?: boolean }): Promise<string | undefined>;
  log(line: string): void;
  close?(): Promise<void> | void;
};

const DISTILLATION_USAGE =
  "Usage: ee init distillation --provider <provider> --model <modelId> [--auth-mode api_key|google_adc] [--fallback-chain <chain>]";
const EMBEDDING_USAGE =
  "Usage: ee init embedding --mode <api|local|legacy> [--api-provider auto|openai|gemini|jina] [--model <modelId>] [--dtype q8|fp32]";
const SECRET_USAGE = "Usage: ee init secret <ENV_KEY> <value>";
const SHOW_USAGE = "Usage: ee init show";
const EXPAND_ALL_PROVIDERS_VALUE = "__all_providers__";
const RECOMMENDED_PROVIDER_VALUES: DistillerProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "openai_compatible"
];

const parseFlag = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
};

const parseCommaListFlag = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const values: string[] = [];
  for (let cursor = index + 1; cursor < args.length; cursor += 1) {
    const value = args[cursor];
    if (!value || value.startsWith("--")) {
      break;
    }
    values.push(value);
  }

  return values.length > 0
    ? values
        .join(",")
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(",")
    : undefined;
};

export const runInitCommand = async (
  action?: string,
  args: string[] = [],
  deps: InitCommandDeps = {}
): Promise<void> => {
  if (!action) {
    const ui = deps.ui ?? createDefaultInitWizardUI();
    if (!ui.isInteractive()) {
      logInitGuide();
      return;
    }

    try {
      await runInitWizard(ui, deps);
    } finally {
      await ui.close?.();
    }
    return;
  }

  if (action === "distillation") {
    const provider = parseFlag(args, "--provider");
    const model = parseFlag(args, "--model");
    const authMode = parseFlag(args, "--auth-mode") ?? "api_key";
    const fallbackChain = parseCommaListFlag(args, "--fallback-chain");

    if (!provider || !model || (authMode !== "api_key" && authMode !== "google_adc")) {
      console.log(DISTILLATION_USAGE);
      return;
    }

    const catalog = await (deps.resolveModelCatalog ?? resolveModelCatalog)(provider as DistillerProvider);
    const found = catalog.models.find((entry) => entry.id === model);
    if (!found) {
      console.log(
        `[ExperienceEngine] ${model} is not in the ${provider} model catalog. Use \`ee models list ${provider}\` first.`
      );
      return;
    }

    setDistillationProvider(provider);
    setDistillationAuthMode(authMode);
    setDistillationModel(provider, model);
    if (fallbackChain) {
      setDistillationFallbackChain(fallbackChain);
    }
    applyDefaultHybridSettingsForNewInit();
    console.log(`[ExperienceEngine] Distillation initialized: provider=${provider} auth_mode=${authMode} model=${model}${fallbackChain ? ` fallback_chain=${fallbackChain}` : ""}.`);
    return;
  }

  if (action === "secret") {
    const secretKey = args[0];
    const secretValue = args[1];
    if (!secretKey || !secretValue || !isSupportedSecretKey(secretKey)) {
      console.log(SECRET_USAGE);
      return;
    }

    setExperienceEngineSecret(secretKey, secretValue);
    console.log(`[ExperienceEngine] Stored shared secret ${secretKey}.`);
    return;
  }

  if (action === "embedding") {
    const mode = parseFlag(args, "--mode");
    const apiProvider = parseFlag(args, "--api-provider") ?? "auto";
    const model = parseFlag(args, "--model") ?? defaultConfig.embeddingModel;
    const dtype = parseFlag(args, "--dtype") ?? defaultConfig.embeddingDtype;

    if (
      !mode ||
      (mode !== "api" && mode !== "local" && mode !== "legacy") ||
      (apiProvider !== "auto" && apiProvider !== "openai" && apiProvider !== "gemini" && apiProvider !== "jina") ||
      (dtype !== "q8" && dtype !== "fp32")
    ) {
      console.log(EMBEDDING_USAGE);
      return;
    }

    setEmbeddingProvider(mode);
    setEmbeddingApiProvider(mode === "api" ? apiProvider : "auto");
    setEmbeddingModel(model);
    setEmbeddingDtype(dtype);
    console.log(
      `[ExperienceEngine] Embedding initialized: mode=${mode} api_provider=${mode === "api" ? apiProvider : "auto"} model=${model} dtype=${dtype}.`
    );
    return;
  }

  if (action === "show") {
    if (args.length > 0) {
      console.log(SHOW_USAGE);
      return;
    }

    const settings = readExperienceEngineSettings();
    const secretKeys = Object.keys(readExperienceEngineSecrets()).sort();

    console.log("ExperienceEngine init state:");
    console.log(`- Distillation provider: ${settings.distillation?.provider ?? "<unset>"}`);
    console.log(`- Distillation auth mode: ${settings.distillation?.auth_mode ?? "api_key"}`);
    console.log(`- Distillation model: ${settings.distillation?.model ?? "<unset>"}`);
    console.log(`- Distillation fallback chain: ${settings.distillation?.fallback_chain ?? "<unset>"}`);
    console.log(`- Embedding mode: ${settings.embedding?.provider ?? defaultConfig.embeddingProvider}`);
    console.log(`- Embedding API provider: ${settings.embedding?.api_provider ?? defaultConfig.embeddingApiProvider}`);
    console.log(`- Embedding model: ${settings.embedding?.model ?? defaultConfig.embeddingModel}`);
    console.log(`- Embedding dtype: ${settings.embedding?.dtype ?? defaultConfig.embeddingDtype}`);
    if (secretKeys.length === 0) {
      console.log("- Shared secrets: none");
      return;
    }

    for (const key of secretKeys) {
      console.log(`- Shared secret ${key}: <set>`);
    }
    return;
  }

  console.log("Usage: ee init <distillation|embedding|secret|show> [...]");
};

const logInitGuide = (): void => {
  const settings = readExperienceEngineSettings();
  const secretKeys = Object.keys(readExperienceEngineSecrets()).sort();
  const distillationReady = Boolean(settings.distillation?.provider && settings.distillation?.model);

  console.log("ExperienceEngine initialization guide:");
  console.log("Step 1. Choose the shared reasoning model ExperienceEngine should use.");
  console.log(`- Current distillation provider: ${settings.distillation?.provider ?? "<unset>"}`);
  console.log(`- Current distillation model: ${settings.distillation?.model ?? "<unset>"}`);
  if (!distillationReady) {
    console.log(`- Next command: ${DISTILLATION_USAGE.replace("Usage: ", "")}`);
  } else {
    console.log("- Shared reasoning model is configured.");
  }

  console.log("Step 2. Choose how ExperienceEngine should build and search shared memory.");
  console.log(`- Current embedding mode: ${settings.embedding?.provider ?? defaultConfig.embeddingProvider}`);
  console.log(`- Current embedding API provider: ${settings.embedding?.api_provider ?? defaultConfig.embeddingApiProvider}`);
  console.log(`- Current embedding model: ${settings.embedding?.model ?? defaultConfig.embeddingModel}`);
  console.log(`- Next command: ${EMBEDDING_USAGE.replace("Usage: ", "")}`);

  console.log("Step 3. Store provider credentials once so every host can reuse them.");
  if (secretKeys.length === 0) {
    console.log("- Shared secrets: none");
    console.log(`- Next command: ${SECRET_USAGE.replace("Usage: ", "")}`);
  } else {
    console.log(`- Shared secrets already configured: ${secretKeys.join(", ")}`);
  }

  console.log("Step 4. Finish initialization, then verify each host can move from Installed to Ready.");
  console.log("- Validation commands: ee doctor openclaw | ee doctor claude-code | ee doctor codex");
  console.log("- Product language: Installed -> Initialized -> Ready");
  console.log("- After initialization, use `ee status` for day-to-day progress and `ee doctor <host>` for explicit host checks.");
  if (distillationReady && secretKeys.length > 0) {
    console.log("- Next step: install another host if needed, then run `ee doctor <host>` to confirm it reuses this shared state.");
  }
};

const applyDefaultHybridSettingsForNewInit = (): void => {
  const settings = readExperienceEngineSettings();

  setHybridSettings({
    ...(settings.hybrid ?? {}),
    enabled: true,
    sync_explain_enabled: true,
    async_postmortem_enabled: true,
    explain_llm_enabled: true,
    async_postmortem_llm_enabled: true
  });
};

const runInitWizard = async (ui: InitWizardUI, deps: InitCommandDeps): Promise<void> => {
  const currentSettings = readExperienceEngineSettings();
  const currentSecrets = readExperienceEngineSecrets();

  ui.log("ExperienceEngine initialization");

  const provider = await chooseDistillationProvider(ui, currentSettings.distillation?.provider);
  if (!provider) {
    ui.log("Initialization cancelled.");
    return;
  }

  let authMode: "api_key" | "google_adc" = "api_key";
  const requiresAuthModeStep = provider === "gemini";
  const modelStepTitle = requiresAuthModeStep ? "Step 3: Distillation model" : "Step 2: Distillation model";
  const fallbackStepTitle = requiresAuthModeStep ? "Step 4: Distillation fallback chain" : "Step 3: Distillation fallback chain";
  const embeddingStepTitle = requiresAuthModeStep ? "Step 5: Embedding mode" : "Step 4: Embedding mode";
  const secretsStepTitle = requiresAuthModeStep ? "Step 6: Shared provider secrets" : "Step 5: Shared provider secrets";
  const summaryStepTitle = requiresAuthModeStep ? "Step 7: Summary" : "Step 6: Summary";
  if (provider === "gemini") {
    const selectedAuthMode = await ui.choose({
      title: "Step 2: Distillation auth mode",
      message: `Current: ${currentSettings.distillation?.auth_mode ?? "api_key"}`,
      options: [
        { label: "API key", value: "api_key" },
        { label: "Google ADC", value: "google_adc" }
      ]
    });
    if (!selectedAuthMode || (selectedAuthMode !== "api_key" && selectedAuthMode !== "google_adc")) {
      ui.log("Initialization cancelled.");
      return;
    }
    authMode = selectedAuthMode;
  }

  const catalog = await (deps.resolveModelCatalog ?? resolveModelCatalog)(provider as DistillerProvider);
  const suggestedModels = pickSuggestedModels(catalog, currentSettings.distillation?.model);
  const model = await ui.choose({
    title: modelStepTitle,
    message: `Provider: ${provider}`,
    options: suggestedModels.map((entry) => ({
      label: entry.name,
      value: entry.id,
      detail: entry.summary
    }))
  });
  if (!model) {
    ui.log("Initialization cancelled.");
    return;
  }

  setDistillationProvider(provider);
  setDistillationAuthMode(authMode);
  setDistillationModel(provider, model);

  const fallbackChain = await ui.input({
    title: fallbackStepTitle,
    message:
      "Optional EE-level provider fallback chain, for example gemini:gemini-2.5-flash,openai:gpt-4o-mini. Press ENTER to skip."
  });
  if (fallbackChain?.trim()) {
    setDistillationFallbackChain(fallbackChain.trim());
  }
  applyDefaultHybridSettingsForNewInit();

  const embeddingSelection = await ui.choose({
    title: embeddingStepTitle,
    message: `Current: ${currentSettings.embedding?.provider ?? defaultConfig.embeddingProvider} (${currentSettings.embedding?.api_provider ?? defaultConfig.embeddingApiProvider})`,
    options: [
      { label: "API auto (recommended)", value: "api:auto", detail: "Use the best available API provider, then fall back local." },
      { label: "API via Gemini", value: "api:gemini", detail: "gemini-embedding-001" },
      { label: "API via OpenAI", value: "api:openai", detail: "text-embedding-3-small" },
      { label: "API via Jina", value: "api:jina", detail: "jina-embeddings-v3" },
      { label: "Local only", value: "local:auto", detail: defaultConfig.embeddingModel },
      { label: "Legacy only", value: "legacy:auto", detail: "hashed fallback only" }
    ]
  });
  if (!embeddingSelection) {
    ui.log("Initialization cancelled.");
    return;
  }

  const [embeddingMode, embeddingApiProvider = "auto"] = embeddingSelection.split(":") as [
    "api" | "local" | "legacy",
    "auto" | "openai" | "gemini" | "jina"
  ];
  setEmbeddingProvider(embeddingMode);
  setEmbeddingApiProvider(embeddingMode === "api" ? embeddingApiProvider : "auto");
  setEmbeddingModel(defaultConfig.embeddingModel);
  setEmbeddingDtype(defaultConfig.embeddingDtype);

  const requiredSecretKeys = Array.from(
    new Set(
      [
        resolvePrimarySecretKey(provider as DistillerProvider, authMode),
        resolveEmbeddingSecretKey(embeddingMode, embeddingApiProvider)
      ].filter((value): value is string => Boolean(value))
    )
  );

  if (requiredSecretKeys.length === 0) {
    ui.log(secretsStepTitle);
    ui.log("- No shared API keys are required for the current configuration.");
  } else {
    ui.log(secretsStepTitle);
    for (const secretKey of requiredSecretKeys) {
      const existing = currentSecrets[secretKey];
      const secretValue = await ui.input({
        title: `- ${secretKey}`,
        message: existing
          ? `${secretKey} is already configured. Enter a new value to replace it, or press ENTER to keep the current secret.`
          : `Enter ${secretKey}. This value will be shared by all installed hosts.`,
        secret: true
      });

      if (secretValue && secretValue.trim()) {
        setExperienceEngineSecret(secretKey, secretValue.trim());
      }
    }
  }

  const finalSecrets = readExperienceEngineSecrets();
  ui.log(summaryStepTitle);
  ui.log("Initialization complete.");
  ui.log(`- Distillation provider: ${provider}`);
  ui.log(`- Distillation model: ${model}`);
  ui.log(`- Distillation fallback chain: ${fallbackChain?.trim() ? fallbackChain.trim() : "<unset>"}`);
  ui.log(`- Embedding mode: ${embeddingMode}`);
  ui.log(`- Embedding API provider: ${embeddingMode === "api" ? embeddingApiProvider : "auto"}`);
  ui.log(`- Embedding model: ${defaultConfig.embeddingModel}`);
  for (const secretKey of requiredSecretKeys) {
    ui.log(`- Shared secret ${secretKey}: ${finalSecrets[secretKey] ? "<set>" : "<unset>"}`);
  }
  ui.log("- Next step: run `ee doctor <host>` to verify your installed host reuses this shared state.");
};

const buildProviderChoice = (
  provider: DistillerProvider,
  currentProvider?: string
): InitWizardChoice => ({
  label: provider,
  value: provider,
  detail: provider === currentProvider ? "current" : undefined
});

const chooseDistillationProvider = async (
  ui: InitWizardUI,
  currentProvider?: string
): Promise<DistillerProvider | undefined> => {
  const recommendedOptions = RECOMMENDED_PROVIDER_VALUES.map((provider) =>
    buildProviderChoice(provider, currentProvider)
  );
  const shortlist = [...recommendedOptions];

  if (currentProvider && !RECOMMENDED_PROVIDER_VALUES.includes(currentProvider as DistillerProvider)) {
    shortlist.unshift(buildProviderChoice(currentProvider as DistillerProvider, currentProvider));
  }

  const firstSelection = await ui.choose({
    title: "Step 1: Distillation provider",
    message: `Current: ${currentProvider ?? "<unset>"}`,
    options: [
      ...shortlist,
      {
        label: "More providers",
        value: EXPAND_ALL_PROVIDERS_VALUE,
        detail: "Show the full provider catalog"
      }
    ]
  });

  if (!firstSelection) {
    return undefined;
  }

  if (firstSelection !== EXPAND_ALL_PROVIDERS_VALUE) {
    return firstSelection as DistillerProvider;
  }

  const fullSelection = await ui.choose({
    title: "Step 1: Distillation provider",
    message: "All providers",
    options: DISTILLER_PROVIDERS.map((provider) => buildProviderChoice(provider, currentProvider))
  });

  return fullSelection as DistillerProvider | undefined;
};

const pickSuggestedModels = (
  catalog: ProviderModelCatalog,
  currentModel?: string
): ProviderModelCatalog["models"] => {
  const prioritized = [...catalog.models].sort((left, right) => {
    const leftScore = rankModelId(left.id, currentModel);
    const rightScore = rankModelId(right.id, currentModel);
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });

  return prioritized.slice(0, 8);
};

const rankModelId = (modelId: string, currentModel?: string): number => {
  if (currentModel && modelId === currentModel) {
    return 100;
  }

  const normalized = modelId.toLowerCase();
  let score = 0;
  if (normalized.includes("flash")) score += 20;
  if (normalized.includes("lite")) score += 15;
  if (normalized.includes("mini")) score += 12;
  if (normalized.includes("small")) score += 10;
  if (normalized.includes("nano")) score += 8;
  if (normalized.includes("turbo")) score += 6;
  if (normalized.includes("free")) score += 4;
  return score;
};

const resolvePrimarySecretKey = (
  provider: DistillerProvider,
  authMode: "api_key" | "google_adc"
): string | null => {
  if (provider === "gemini") {
    return authMode === "api_key" ? "GEMINI_API_KEY" : null;
  }

  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "azure_openai":
      return "AZURE_OPENAI_API_KEY";
    case "deepseek":
      return "DEEPSEEK_API_KEY";
    case "moonshot":
      return "MOONSHOT_API_KEY";
    case "dashscope":
      return "DASHSCOPE_API_KEY";
    case "zhipu":
      return "ZHIPU_API_KEY";
    case "siliconflow":
      return "SILICONFLOW_API_KEY";
    case "minimax":
      return "MINIMAX_API_KEY";
    case "volcengine_ark":
      return "VOLCENGINE_ARK_API_KEY";
    case "tencent_hunyuan":
      return "TENCENT_HUNYUAN_API_KEY";
    case "baidu_qianfan":
      return "BAIDU_QIANFAN_API_KEY";
    case "openai_compatible":
    case "bedrock":
      return null;
  }
};

const resolveEmbeddingSecretKey = (
  mode: "api" | "local" | "legacy",
  apiProvider: "auto" | "openai" | "gemini" | "jina"
): string | null => {
  if (mode !== "api") {
    return null;
  }

  switch (apiProvider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
    case "jina":
      return "JINA_API_KEY";
    case "auto":
      return null;
  }
};

const createDefaultInitWizardUI = (): InitWizardUI => {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const readline = interactive
    ? createInterface({
        input: process.stdin,
        output: process.stdout
      })
    : null;

  return {
    isInteractive: () => interactive,
    log: (line) => console.log(line),
    choose: async ({ title, message, options }) => {
      if (!readline) {
        return undefined;
      }

      console.log(title);
      if (message) {
        console.log(message);
      }
      options.forEach((option, index) => {
        console.log(`  ${index + 1}. ${option.label}${option.detail ? ` (${option.detail})` : ""}`);
      });
      const answer = (await readline.question("> ")).trim();
      const selectedIndex = Number.parseInt(answer, 10);
      if (!Number.isFinite(selectedIndex) || selectedIndex < 1 || selectedIndex > options.length) {
        return undefined;
      }
      return options[selectedIndex - 1]?.value;
    },
    input: async ({ title, message }) => {
      if (!readline) {
        return undefined;
      }

      console.log(title);
      if (message) {
        console.log(message);
      }
      return (await readline.question("> ")).trim();
    },
    close: async () => {
      readline?.close();
    }
  };
};
