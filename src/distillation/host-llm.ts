import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";

type DistillerEndpoint = {
  kind: "openai" | "anthropic";
  model: string;
  baseUrl: string;
  headers: Record<string, string>;
  source: "explicit" | "claude-code" | "codex";
};

type ClaudeSettings = {
  model?: string;
  modelOverrides?: Record<string, string>;
  env?: Record<string, string>;
  apiKeyHelper?: string;
  [key: string]: unknown;
};

type CodexConfig = Record<string, unknown> & {
  model?: string;
  model_provider?: string;
  profiles?: Record<string, Record<string, unknown>>;
  model_providers?: Record<string, Record<string, unknown>>;
};

type ResolveOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export type CodexHostLlmBinding = {
  configPath: string;
  model?: string;
  providerId?: string;
  envBindings: Record<string, string>;
  requiredEnvKeys: string[];
  missingEnvKeys: string[];
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

let cachedHelperToken: CachedToken | null = null;

const readJsonFile = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
};

const normalizeEnvRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => typeof entry === "string")
    .map(([key, entry]) => [key, String(entry)]);
  return Object.fromEntries(entries);
};

const mergeRecords = (...records: Array<Record<string, string> | undefined>): Record<string, string> =>
  Object.assign({}, ...records.filter(Boolean));

const resolveHomeDir = (homeDir?: string): string => resolve(homeDir ?? homedir());

const resolveClaudeSettings = (options: ResolveOptions): { settings: ClaudeSettings; mergedEnv: Record<string, string> } | null => {
  const env = options.env ?? process.env;
  const paths = resolveExperienceEnginePaths({ adapter: "claude-code", env, homeDir: options.homeDir });
  const installState = readJsonFile<{ projectDir?: string; settingsPath?: string }>(paths.installStatePath);
  const projectDir = installState?.projectDir;
  const settingsPath = installState?.settingsPath;
  const home = resolveHomeDir(options.homeDir);

  const userSettingsPath = join(home, ".claude", "settings.json");
  const projectSettingsPath = projectDir ? join(projectDir, ".claude", "settings.json") : undefined;
  const localSettingsPath = projectDir ? join(projectDir, ".claude", "settings.local.json") : undefined;

  const settingsLayers = [
    readJsonFile<ClaudeSettings>(userSettingsPath),
    projectSettingsPath ? readJsonFile<ClaudeSettings>(projectSettingsPath) : null,
    localSettingsPath ? readJsonFile<ClaudeSettings>(localSettingsPath) : null,
    settingsPath ? readJsonFile<ClaudeSettings>(settingsPath) : null
  ].filter(Boolean) as ClaudeSettings[];

  if (!settingsLayers.length) {
    return null;
  }

  const mergedSettings: ClaudeSettings = settingsLayers.reduce<ClaudeSettings>(
    (acc, next) => ({
      ...acc,
      ...next,
      env: mergeRecords(normalizeEnvRecord(acc.env), normalizeEnvRecord(next.env)),
      modelOverrides: {
        ...(acc.modelOverrides ?? {}),
        ...(next.modelOverrides ?? {})
      }
    }),
    {}
  );

  const mergedEnv = mergeRecords(env as Record<string, string>, normalizeEnvRecord(mergedSettings.env));
  return { settings: mergedSettings, mergedEnv };
};

const parseInlineTable = (raw: string): Record<string, string> => {
  const trimmed = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (!trimmed) {
    return {};
  }
  const entries = trimmed.split(",").map((chunk) => chunk.trim()).filter(Boolean);
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const match = entry.match(/^"([^"]+)"\s*=\s*"([^"]*)"\s*$/) ?? entry.match(/^([^=]+)\s*=\s*"([^"]*)"\s*$/);
    if (match) {
      const [, key, value] = match;
      result[key.trim()] = value;
    }
  }
  return result;
};

const parseTomlValue = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return parseInlineTable(trimmed);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  return trimmed;
};

const parseToml = (raw: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  let section: string[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const stripped = line.replace(/#.*/, "").trim();
    if (!stripped) {
      continue;
    }
    const sectionMatch = stripped.match(/^\[(.+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1].split(".").map((chunk) => chunk.trim().replace(/^"|"$/g, ""));
      continue;
    }
    const kvMatch = stripped.match(/^([^=]+)=(.+)$/);
    if (!kvMatch) {
      continue;
    }
    const key = kvMatch[1].trim();
    const value = parseTomlValue(kvMatch[2].trim());
    let cursor: Record<string, unknown> = result;
    for (const part of section) {
      const next = cursor[part];
      if (!next || typeof next !== "object") {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[key] = value;
  }

  return result;
};

const resolveCodexConfigFile = (options: ResolveOptions): { configPath: string; config: CodexConfig } | null => {
  const env = options.env ?? process.env;
  const home = resolveHomeDir(options.homeDir);
  const configPath =
    env.CODEX_CONFIG_PATH ?? env.CODEX_CONFIG ?? resolve(join(home, ".codex", "config.toml"));

  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, "utf8");
  return {
    configPath,
    config: parseToml(raw) as CodexConfig
  };
};

const resolveCodexConfig = (options: ResolveOptions): CodexConfig | null =>
  resolveCodexConfigFile(options)?.config ?? null;

export const resolveCodexHostLlmBinding = (options: ResolveOptions = {}): CodexHostLlmBinding | null => {
  const env = options.env ?? process.env;
  const resolved = resolveCodexConfigFile(options);
  if (!resolved) {
    return null;
  }

  const { configPath, config } = resolved;
  const activeProfile = typeof config.profile === "string" ? config.profile : undefined;
  const profile =
    activeProfile && config.profiles && typeof config.profiles[activeProfile] === "object"
      ? (config.profiles[activeProfile] as Record<string, unknown>)
      : undefined;

  const model = (profile?.model as string) ?? config.model;
  const providerId = (profile?.model_provider as string) ?? config.model_provider;
  const provider =
    providerId && config.model_providers
      ? ((config.model_providers[providerId] as Record<string, unknown> | undefined) ?? {})
      : {};

  const requiredEnvKeys = new Set<string>();
  const envKey =
    (provider.env_key as string | undefined) ??
    (provider.api_key_env as string | undefined) ??
    (providerId === "openai" ? "OPENAI_API_KEY" : undefined);
  if (envKey) {
    requiredEnvKeys.add(envKey);
  }

  const envHeaders = provider.env_http_headers as Record<string, string> | undefined;
  if (envHeaders) {
    for (const envName of Object.values(envHeaders)) {
      if (typeof envName === "string" && envName.trim().length > 0) {
        requiredEnvKeys.add(envName);
      }
    }
  }

  const envBindings = Object.fromEntries(
    [...requiredEnvKeys]
      .filter((key) => typeof env[key] === "string" && env[key]!.length > 0)
      .map((key) => [key, String(env[key])])
  );

  const missingEnvKeys = [...requiredEnvKeys].filter((key) => !(key in envBindings));

  return {
    configPath,
    model,
    providerId,
    envBindings,
    requiredEnvKeys: [...requiredEnvKeys],
    missingEnvKeys
  };
};

const resolveExplicitEndpoint = (env: NodeJS.ProcessEnv): DistillerEndpoint | null => {
  if (!env.EXPERIENCE_ENGINE_DISTILLER_MODEL || !env.EXPERIENCE_ENGINE_DISTILLER_API_KEY) {
    return null;
  }
  return {
    kind: "openai",
    model: env.EXPERIENCE_ENGINE_DISTILLER_MODEL,
    baseUrl: env.EXPERIENCE_ENGINE_DISTILLER_BASE_URL ?? "https://api.openai.com/v1/chat/completions",
    headers: {
      Authorization: `Bearer ${env.EXPERIENCE_ENGINE_DISTILLER_API_KEY}`
    },
    source: "explicit"
  };
};

const buildClaudeToken = (settings: ClaudeSettings, mergedEnv: Record<string, string>): { token?: string; useBothHeaders: boolean } => {
  const authToken = mergedEnv.ANTHROPIC_AUTH_TOKEN ?? mergedEnv.ANTHROPIC_API_KEY;
  if (authToken) {
    return { token: authToken, useBothHeaders: Boolean(mergedEnv.ANTHROPIC_AUTH_TOKEN && mergedEnv.ANTHROPIC_API_KEY) };
  }

  const helper = typeof settings.apiKeyHelper === "string" ? settings.apiKeyHelper.trim() : "";
  if (!helper) {
    return { token: undefined, useBothHeaders: false };
  }

  const ttlMs = Number(mergedEnv.CLAUDE_CODE_API_KEY_HELPER_TTL_MS ?? "0");
  if (cachedHelperToken && (ttlMs <= 0 || cachedHelperToken.expiresAt > Date.now())) {
    return { token: cachedHelperToken.value, useBothHeaders: true };
  }

  try {
    const output = execSync(helper, { env: mergedEnv, encoding: "utf8" }).trim();
    if (output) {
      cachedHelperToken = {
        value: output,
        expiresAt: Date.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 0)
      };
      return { token: output, useBothHeaders: true };
    }
  } catch {
    return { token: undefined, useBothHeaders: false };
  }

  return { token: undefined, useBothHeaders: false };
};

const resolveClaudeEndpoint = (options: ResolveOptions): DistillerEndpoint | null => {
  const resolved = resolveClaudeSettings(options);
  if (!resolved) {
    return null;
  }

  const { settings, mergedEnv } = resolved;
  const rawModel = settings.model ?? mergedEnv.ANTHROPIC_MODEL;
  if (!rawModel) {
    return null;
  }

  const model = settings.modelOverrides?.[rawModel] ?? rawModel;
  const baseUrl = mergedEnv.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const { token, useBothHeaders } = buildClaudeToken(settings, mergedEnv);
  if (!token) {
    return null;
  }

  const isOpenRouter = /openrouter\.ai/i.test(baseUrl);
  const isAnthropicModel = /^anthropic\//i.test(model) || /claude/i.test(model);

  if (isOpenRouter && !isAnthropicModel) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };
    if (mergedEnv.OPENROUTER_HTTP_REFERER) {
      headers["HTTP-Referer"] = mergedEnv.OPENROUTER_HTTP_REFERER;
    }
    if (mergedEnv.OPENROUTER_APP_TITLE) {
      headers["X-Title"] = mergedEnv.OPENROUTER_APP_TITLE;
    } else if (mergedEnv.OPENROUTER_X_TITLE) {
      headers["X-Title"] = mergedEnv.OPENROUTER_X_TITLE;
    }

    return {
      kind: "openai",
      model,
      baseUrl,
      headers,
      source: "claude-code"
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": mergedEnv.ANTHROPIC_VERSION ?? "2023-06-01"
  };
  if (mergedEnv.ANTHROPIC_AUTH_TOKEN || useBothHeaders) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (mergedEnv.ANTHROPIC_API_KEY || useBothHeaders) {
    headers["x-api-key"] = token;
  }

  return {
    kind: "anthropic",
    model,
    baseUrl,
    headers,
    source: "claude-code"
  };
};

const resolveCodexEndpoint = (options: ResolveOptions): DistillerEndpoint | null => {
  const env = options.env ?? process.env;
  const resolved = resolveCodexConfigFile(options);
  if (!resolved) {
    return null;
  }
  const { config } = resolved;

  const activeProfile = typeof config.profile === "string" ? config.profile : undefined;
  const profile =
    activeProfile && config.profiles && typeof config.profiles[activeProfile] === "object"
      ? (config.profiles[activeProfile] as Record<string, unknown>)
      : undefined;

  const model = (profile?.model as string) ?? config.model;
  const providerId = (profile?.model_provider as string) ?? config.model_provider;
  if (!model || !providerId) {
    return null;
  }

  const provider =
    (config.model_providers?.[providerId] as Record<string, unknown> | undefined) ?? {};
  const baseUrl = (provider.base_url as string) ?? env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const staticHeaders = provider.http_headers as Record<string, string> | undefined;
  if (staticHeaders) {
    Object.assign(headers, staticHeaders);
  }

  const envHeaders = provider.env_http_headers as Record<string, string> | undefined;
  if (envHeaders) {
    for (const [header, envKey] of Object.entries(envHeaders)) {
      const value = env[envKey];
      if (value) {
        headers[header] = value;
      }
    }
  }

  const envKey =
    (provider.env_key as string | undefined) ??
    (provider.api_key_env as string | undefined) ??
    (providerId === "openai" ? "OPENAI_API_KEY" : undefined);
  const token =
    (provider.experimental_bearer_token as string | undefined) ??
    (envKey ? env[envKey] : undefined);

  if (envKey && !token && !headers.Authorization) {
    return null;
  }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  return {
    kind: "openai",
    model,
    baseUrl,
    headers,
    source: "codex"
  };
};

export const resolveDistillerEndpoint = (options: ResolveOptions = {}): DistillerEndpoint | null => {
  const env = options.env ?? process.env;
  const explicit = resolveExplicitEndpoint(env);
  if (explicit) {
    return explicit;
  }

  if (options.env && options.env.EXPERIENCE_ENGINE_USE_HOST_LLM !== "true") {
    return null;
  }

  const isOpenClawHost = Boolean(
    env.OPENCLAW_HOME || env.OPENCLAW_STATE_DIR || env.OPENCLAW_CONFIG_PATH
  );
  if (isOpenClawHost && env.EXPERIENCE_ENGINE_ADAPTER !== "claude-code" && env.EXPERIENCE_ENGINE_ADAPTER !== "codex") {
    return null;
  }

  const preferredAdapter = env.EXPERIENCE_ENGINE_ADAPTER;
  if (preferredAdapter === "claude-code") {
    return resolveClaudeEndpoint(options);
  }
  if (preferredAdapter === "codex") {
    return resolveCodexEndpoint(options);
  }

  const claudePaths = resolveExperienceEnginePaths({ adapter: "claude-code", env, homeDir: options.homeDir });
  const codexPaths = resolveExperienceEnginePaths({ adapter: "codex", env, homeDir: options.homeDir });
  const hasClaude = existsSync(claudePaths.installStatePath);
  const hasCodex = existsSync(codexPaths.installStatePath);

  if (hasClaude && !hasCodex) {
    return resolveClaudeEndpoint(options);
  }
  if (hasCodex && !hasClaude) {
    return resolveCodexEndpoint(options);
  }

  return resolveClaudeEndpoint(options) ?? resolveCodexEndpoint(options);
};

export type { DistillerEndpoint };
