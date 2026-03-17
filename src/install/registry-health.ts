import { execFileSync } from "node:child_process";

const OFFICIAL_REGISTRY = "https://registry.npmjs.org/";

export type RegistryHealthCheck = {
  tool: "npm" | "pnpm";
  registry: string | null;
  official: boolean;
};

export type RegistryHealth = {
  checks: RegistryHealthCheck[];
  hasNonOfficialRegistry: boolean;
  warnings: string[];
};

const normalizeRegistry = (value: string): string =>
  value.trim().replace(/\/?$/, "/");

const isOfficialRegistry = (value: string | null): boolean =>
  value !== null && normalizeRegistry(value) === OFFICIAL_REGISTRY;

const readRegistry = (tool: "npm" | "pnpm"): string | null => {
  try {
    const output = execFileSync(tool, ["config", "get", "registry"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return output.length ? output : null;
  } catch {
    return null;
  }
};

export const readRegistryHealth = (): RegistryHealth => {
  const checks: RegistryHealthCheck[] = (["npm", "pnpm"] as const).map((tool) => {
    const registry = readRegistry(tool);
    return {
      tool,
      registry,
      official: isOfficialRegistry(registry)
    };
  });

  const warnings = checks.flatMap((check) => {
    if (!check.registry || check.official) {
      return [];
    }

    return [
      `${check.tool} registry is set to ${check.registry}. Managed installs are most reliable with ${OFFICIAL_REGISTRY}.`
    ];
  });

  return {
    checks,
    hasNonOfficialRegistry: warnings.length > 0,
    warnings
  };
};

export const buildRegistryRecommendationCommands = (health: RegistryHealth): string[] =>
  health.checks.flatMap((check) =>
    check.registry && !check.official
      ? [`${check.tool} config set registry ${OFFICIAL_REGISTRY.slice(0, -1)} --global`]
      : []
  );
