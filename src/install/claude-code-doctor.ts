import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";

type ClaudeHookMatcher = {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
};

type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookMatcher[]>;
};

type InstallerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  projectDir?: string;
};

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const buildExpectedCommand = (packageRoot: string): string =>
  `node --no-warnings ${shellQuote(join(packageRoot, "dist/cli/index.js"))} claude-hook`;

const hasHookCommand = (
  settings: ClaudeSettings | null,
  eventName: string,
  matcher: string | undefined,
  expectedCommand: string
): boolean => {
  const entries = settings?.hooks?.[eventName] ?? [];
  return entries.some(
    (entry) =>
      (entry.matcher ?? undefined) === matcher &&
      (entry.hooks ?? []).some((hook) => hook.type === "command" && hook.command === expectedCommand)
  );
};

export const inspectClaudeCodeInstall = (options: InstallerOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const settingsPath = join(projectDir, ".claude", "settings.local.json");
  const expectedCommand = buildExpectedCommand(packageRoot);
  const settings =
    existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, "utf8")) as ClaudeSettings) : null;

  return {
    adapter: "claude-code" as const,
    installed: paths.usedInstallState,
    packageRoot,
    projectDir,
    settingsPath,
    captureDir: paths.captureDir,
    hooksPresent: {
      userPromptSubmit: hasHookCommand(settings, "UserPromptSubmit", undefined, expectedCommand),
      preToolUse: hasHookCommand(settings, "PreToolUse", "*", expectedCommand),
      postToolUse: hasHookCommand(settings, "PostToolUse", "*", expectedCommand),
      sessionEnd: hasHookCommand(settings, "SessionEnd", undefined, expectedCommand)
    }
  };
};
