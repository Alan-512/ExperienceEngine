import type { ExperienceEngineConfig } from "./config-schema.js";
import { readExperienceEngineSecrets } from "./secrets-store.js";

type RuntimeEnvOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  overrides?: Partial<ExperienceEngineConfig>;
};

export const resolveExperienceEngineRuntimeEnv = (
  options: RuntimeEnvOptions = {}
): NodeJS.ProcessEnv => {
  const env = options.env ?? process.env;
  const secrets = readExperienceEngineSecrets({
    env,
    homeDir: options.homeDir,
    overrides: options.overrides
  });

  return {
    ...secrets,
    ...env
  };
};
