import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExperienceEngineConfig } from "./config-schema.js";
import { resolveExperienceEnginePaths } from "./path-resolver.js";

export type ExperienceEngineSecrets = Record<string, string>;

type SecretsOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  overrides?: Partial<ExperienceEngineConfig>;
};

const SECRET_FILE_MODE = 0o600;
const SECRET_KEY_PATTERN = /^[A-Z0-9_]+$/;

export const resolveSecretsPath = (options: SecretsOptions = {}): string => {
  const paths = resolveExperienceEnginePaths({
    env: options.env,
    homeDir: options.homeDir,
    overrides: options.overrides
  });
  const baseDir = paths.mode === "explicit" ? paths.activeHome : paths.productHome;
  return join(baseDir, "secrets.json");
};

export const isSupportedSecretKey = (key: string): boolean => SECRET_KEY_PATTERN.test(key);

export const readExperienceEngineSecrets = (options: SecretsOptions = {}): ExperienceEngineSecrets => {
  const secretsPath = resolveSecretsPath(options);
  if (!existsSync(secretsPath)) {
    return {};
  }

  return JSON.parse(readFileSync(secretsPath, "utf8")) as ExperienceEngineSecrets;
};

const writeSecretFile = (secrets: ExperienceEngineSecrets, secretsPath: string): ExperienceEngineSecrets => {
  mkdirSync(dirname(secretsPath), { recursive: true });
  writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, {
    encoding: "utf8",
    mode: SECRET_FILE_MODE
  });
  chmodSync(secretsPath, SECRET_FILE_MODE);
  return secrets;
};

export const writeExperienceEngineSecrets = (
  secrets: ExperienceEngineSecrets,
  options: SecretsOptions = {}
): ExperienceEngineSecrets => writeSecretFile(secrets, resolveSecretsPath(options));

export const setExperienceEngineSecret = (
  key: string,
  value: string,
  options: SecretsOptions = {}
): ExperienceEngineSecrets => {
  if (!isSupportedSecretKey(key)) {
    throw new Error(`Unsupported secret key: ${key}`);
  }

  const current = readExperienceEngineSecrets(options);
  return writeExperienceEngineSecrets(
    {
      ...current,
      [key]: value
    },
    options
  );
};

export const getExperienceEngineSecret = (
  key: string,
  options: SecretsOptions = {}
): string | undefined => readExperienceEngineSecrets(options)[key];

export const unsetExperienceEngineSecret = (
  key: string,
  options: SecretsOptions = {}
): ExperienceEngineSecrets => {
  if (!isSupportedSecretKey(key)) {
    throw new Error(`Unsupported secret key: ${key}`);
  }

  const current = readExperienceEngineSecrets(options);
  if (!(key in current)) {
    return current;
  }

  const next = { ...current };
  delete next[key];
  return writeExperienceEngineSecrets(next, options);
};
