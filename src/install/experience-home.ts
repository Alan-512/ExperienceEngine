import { resolve } from "node:path";

export type ExperienceHomeResolution = {
  source: "explicit" | "host" | "default";
  hostHome?: string;
  resolvedHome?: string;
  defaultHome?: string;
  drift: boolean;
};

export const extractEnvValue = (
  env: string | readonly string[] | undefined,
  key: string
): string | undefined => {
  if (!env) {
    return undefined;
  }

  const entries = typeof env === "string" ? env.split(/\r?\n|,\s*/) : env;
  for (const entry of entries) {
    const trimmed = entry.trim();
    const prefix = `${key}=`;
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length).trim();
      if (!value.length || isRedactedEnvValue(value)) {
        return undefined;
      }
      return value;
    }
  }

  return undefined;
};

const isRedactedEnvValue = (value: string): boolean =>
  /^[*]+$/.test(value) || /^[\uF02A]+$/.test(value);

export const buildEnvWithRecordedExperienceHome = (
  env: NodeJS.ProcessEnv,
  recordedHome?: string
): NodeJS.ProcessEnv => {
  if (env.EXPERIENCE_ENGINE_HOME || !recordedHome) {
    return env;
  }

  return {
    ...env,
    EXPERIENCE_ENGINE_HOME: recordedHome
  };
};

export const describeExperienceHomeResolution = (
  env: NodeJS.ProcessEnv,
  resolvedHome: string,
  defaultHome: string,
  hostHome?: string
): ExperienceHomeResolution => {
  const explicitHome = env.EXPERIENCE_ENGINE_HOME;
  const source = explicitHome ? "explicit" : hostHome ? "host" : "default";
  const drift = Boolean(
    hostHome &&
      !explicitHome &&
      resolve(hostHome) !== resolve(defaultHome)
  );

  return {
    source,
    hostHome,
    resolvedHome,
    defaultHome,
    drift
  };
};
