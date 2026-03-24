import { isSupportedSecretKey, readExperienceEngineSecrets, setExperienceEngineSecret } from "../../config/secrets-store.js";
import { readExperienceEngineSettings, setDistillationAuthMode, setDistillationModel, setDistillationProvider } from "../../config/settings-store.js";
import { resolveModelCatalog, type ProviderModelCatalog } from "../../distillation/model-catalog.js";
import type { DistillerProvider } from "../../distillation/providers/types.js";

type InitCommandDeps = {
  resolveModelCatalog?: (provider: DistillerProvider) => Promise<ProviderModelCatalog>;
};

const DISTILLATION_USAGE =
  "Usage: ee init distillation --provider <provider> --model <modelId> [--auth-mode api_key|google_adc]";
const SECRET_USAGE = "Usage: ee init secret <ENV_KEY> <value>";
const SHOW_USAGE = "Usage: ee init show";

const parseFlag = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
};

export const runInitCommand = async (
  action?: string,
  args: string[] = [],
  deps: InitCommandDeps = {}
): Promise<void> => {
  if (action === "distillation") {
    const provider = parseFlag(args, "--provider");
    const model = parseFlag(args, "--model");
    const authMode = parseFlag(args, "--auth-mode") ?? "api_key";

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
    console.log(`[ExperienceEngine] Distillation initialized: provider=${provider} auth_mode=${authMode} model=${model}.`);
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
    if (secretKeys.length === 0) {
      console.log("- Shared secrets: none");
      return;
    }

    for (const key of secretKeys) {
      console.log(`- Shared secret ${key}: <set>`);
    }
    return;
  }

  console.log("Usage: ee init <distillation|secret|show> [...]");
};
