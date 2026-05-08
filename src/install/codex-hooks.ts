import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CODEX_HOOK_EVENTS = ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"] as const;
export type CodexHookEvent = (typeof CODEX_HOOK_EVENTS)[number];

type CodexHookCommand = {
  type?: string;
  command?: string;
  timeout?: number;
  statusMessage?: string;
};

type CodexHookGroup = {
  matcher?: string;
  hooks?: CodexHookCommand[];
};

type CodexHooksFile = {
  hooks?: Partial<Record<CodexHookEvent | string, CodexHookGroup[]>>;
};

export type CodexHookInspection = {
  hooksPath: string;
  configPath: string;
  featureEnabled: boolean;
  parseError?: string;
  hookFilePresent: boolean;
  missingEvents: CodexHookEvent[];
  claudeHookCommands: string[];
  wslPathCommands: string[];
  codexHookCommands: string[];
  unrelatedHookCount: number;
  state: "healthy" | "absent" | "disabled" | "drifted" | "parse_error";
};

export type CodexHookRepairResult = CodexHookInspection & {
  featureConfigUpdated: boolean;
  hookFileChanged: boolean;
  installedEvents: CodexHookEvent[];
  removedClaudeHookCommands: string[];
  deletedHookFile: boolean;
};

const EXPERIENCEENGINE_CODEX_HOOK_MARKERS = ["experienceengine-codex-hook", " codex-hook", "'codex-hook'"];
const EXPERIENCEENGINE_CLAUDE_HOOK_MARKERS = ["experienceengine-claude-hook", " claude-hook"];

export const resolveProjectCodexDir = (cwd = process.cwd()): string => join(cwd, ".codex");
export const resolveProjectCodexHooksPath = (cwd = process.cwd()): string => join(resolveProjectCodexDir(cwd), "hooks.json");
export const resolveProjectCodexConfigPath = (cwd = process.cwd()): string => join(resolveProjectCodexDir(cwd), "config.toml");

const hasAnyMarker = (value: string | undefined, markers: string[]): boolean =>
  Boolean(value && markers.some((marker) => value.includes(marker)));

const isExperienceEngineCodexHookCommand = (value: string | undefined): boolean =>
  Boolean(
    value &&
      (value.includes("experienceengine-codex-hook") ||
        (value.includes("dist/cli/index.js") && value.includes("codex-hook")))
  );

const isWslPathCommand = (value: string | undefined): boolean =>
  Boolean(value && (/\/mnt\/[a-z]\//i.test(value) || value.includes("/home/")));

const readHooksFile = (path: string): { parsed?: CodexHooksFile; parseError?: string; present: boolean } => {
  if (!existsSync(path)) {
    return { present: false };
  }

  try {
    return {
      present: true,
      parsed: JSON.parse(readFileSync(path, "utf8")) as CodexHooksFile
    };
  } catch (error) {
    return {
      present: true,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
};

export const isCodexHooksFeatureEnabled = (configText: string): boolean => {
  const lines = configText.split(/\r?\n/);
  let inFeatures = false;

  for (const line of lines) {
    if (/^\s*\[.+\]\s*$/.test(line)) {
      inFeatures = line.trim() === "[features]";
      continue;
    }

    if (inFeatures && /^\s*codex_hooks\s*=\s*true\s*(?:#.*)?$/i.test(line)) {
      return true;
    }
  }

  return false;
};

export const ensureCodexHooksFeatureEnabled = (configPath: string): { updated: boolean; path: string } => {
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  if (isCodexHooksFeatureEnabled(existing)) {
    return { updated: false, path: configPath };
  }

  const lines = existing.split(/\r?\n/);
  const featuresIndex = lines.findIndex((line) => line.trim() === "[features]");
  let next: string;

  if (featuresIndex < 0) {
    const prefix = existing.trimEnd();
    next = prefix ? `${prefix}\n\n[features]\ncodex_hooks = true\n` : "[features]\ncodex_hooks = true\n";
  } else {
    let insertIndex = lines.length;
    for (let index = featuresIndex + 1; index < lines.length; index += 1) {
      if (/^\s*\[.+\]\s*$/.test(lines[index] ?? "")) {
        insertIndex = index;
        break;
      }
    }

    const existingFlagIndex = lines.findIndex(
      (line, index) => index > featuresIndex && index < insertIndex && /^\s*codex_hooks\s*=/.test(line)
    );
    if (existingFlagIndex >= 0) {
      lines[existingFlagIndex] = "codex_hooks = true";
    } else {
      lines.splice(insertIndex, 0, "codex_hooks = true");
    }
    next = `${lines.join("\n").replace(/\n*$/, "")}\n`;
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, next, "utf8");
  return { updated: true, path: configPath };
};

const expectedHookGroup = (eventName: CodexHookEvent, command: string): CodexHookGroup => ({
  ...(eventName === "PreToolUse" || eventName === "PostToolUse" ? { matcher: "*" } : {}),
  hooks: [
    {
      type: "command",
      command,
      timeout: eventName === "Stop" ? 120 : 30,
      statusMessage: `ExperienceEngine ${eventName}`
    }
  ]
});

const commandForTarget = (commandPath: string): string => commandPath;

const expectedCodexHookEvents = (includePreToolUse = false): CodexHookEvent[] =>
  CODEX_HOOK_EVENTS.filter((eventName) => includePreToolUse || eventName !== "PreToolUse");

const inspectParsedHooks = (
  parsed: CodexHooksFile | undefined,
  expectedCommand: string,
  runtimeTarget?: "posix" | "windows",
  includePreToolUse = false
) => {
  const missingEvents: CodexHookEvent[] = [];
  const claudeHookCommands: string[] = [];
  const wslPathCommands: string[] = [];
  const codexHookCommands: string[] = [];
  let unrelatedHookCount = 0;
  const expectedCommandValue = commandForTarget(expectedCommand);

  for (const eventName of expectedCodexHookEvents(includePreToolUse)) {
    const groups = parsed?.hooks?.[eventName] ?? [];
    const hasExpected = groups.some((group) =>
      (group.hooks ?? []).some(
        (hook) =>
          hook.type === "command" &&
          (hook.command === expectedCommandValue || isExperienceEngineCodexHookCommand(hook.command))
      )
    );
    if (!hasExpected) {
      missingEvents.push(eventName);
    }
  }

  for (const groups of Object.values(parsed?.hooks ?? {})) {
    for (const group of groups ?? []) {
      for (const hook of group.hooks ?? []) {
        if (hook.type !== "command" || !hook.command) {
          unrelatedHookCount += 1;
          continue;
        }
        if (hasAnyMarker(hook.command, EXPERIENCEENGINE_CLAUDE_HOOK_MARKERS)) {
          claudeHookCommands.push(hook.command);
        } else if (isExperienceEngineCodexHookCommand(hook.command)) {
          codexHookCommands.push(hook.command);
        } else {
          unrelatedHookCount += 1;
        }
        if (runtimeTarget === "windows" && !isExperienceEngineCodexHookCommand(hook.command) && isWslPathCommand(hook.command)) {
          wslPathCommands.push(hook.command);
        }
      }
    }
  }

  return {
    missingEvents,
    claudeHookCommands,
    wslPathCommands,
    codexHookCommands,
    unrelatedHookCount
  };
};

export const inspectCodexProjectHooks = (options: {
  cwd?: string;
  hookCommand: string;
  runtimeTarget?: "posix" | "windows";
  includePreToolUse?: boolean;
}): CodexHookInspection => {
  const hooksPath = resolveProjectCodexHooksPath(options.cwd);
  const configPath = resolveProjectCodexConfigPath(options.cwd);
  const featureEnabled = existsSync(configPath) ? isCodexHooksFeatureEnabled(readFileSync(configPath, "utf8")) : false;
  const hooksFile = readHooksFile(hooksPath);
  if (hooksFile.parseError) {
    return {
      hooksPath,
      configPath,
      featureEnabled,
      parseError: hooksFile.parseError,
      hookFilePresent: true,
      missingEvents: expectedCodexHookEvents(options.includePreToolUse),
      claudeHookCommands: [],
      wslPathCommands: [],
      codexHookCommands: [],
      unrelatedHookCount: 0,
      state: "parse_error"
    };
  }

  const inspected = inspectParsedHooks(
    hooksFile.parsed,
    options.hookCommand,
    options.runtimeTarget,
    options.includePreToolUse
  );
  const hasDrift =
    inspected.claudeHookCommands.length > 0 ||
    inspected.wslPathCommands.length > 0 ||
    inspected.missingEvents.length > 0;
  const state = !featureEnabled
    ? "disabled"
    : !hooksFile.present
      ? "absent"
      : hasDrift
        ? "drifted"
        : "healthy";

  return {
    hooksPath,
    configPath,
    featureEnabled,
    hookFilePresent: hooksFile.present,
    ...inspected,
    state
  };
};

export const repairCodexProjectHooks = (options: {
  cwd?: string;
  hookCommand: string;
  runtimeTarget?: "posix" | "windows";
  includePreToolUse?: boolean;
}): CodexHookRepairResult => {
  const hooksPath = resolveProjectCodexHooksPath(options.cwd);
  const configPath = resolveProjectCodexConfigPath(options.cwd);
  const feature = ensureCodexHooksFeatureEnabled(configPath);
  const hooksFile = readHooksFile(hooksPath);
  if (hooksFile.parseError) {
    return {
      ...inspectCodexProjectHooks(options),
      featureConfigUpdated: feature.updated,
      hookFileChanged: false,
      installedEvents: [],
      removedClaudeHookCommands: [],
      deletedHookFile: false
    };
  }

  const command = commandForTarget(options.hookCommand);
  const next: CodexHooksFile = {
    hooks: { ...(hooksFile.parsed?.hooks ?? {}) }
  };
  const removedClaudeHookCommands: string[] = [];
  let hookFileChanged = false;

  for (const eventName of Object.keys(next.hooks ?? {})) {
    const groups = next.hooks?.[eventName] ?? [];
    const keptGroups = groups
      .map((group) => {
        const keptHooks = (group.hooks ?? []).filter((hook) => {
          if (hook.type === "command" && hasAnyMarker(hook.command, EXPERIENCEENGINE_CLAUDE_HOOK_MARKERS)) {
            if (hook.command) {
              removedClaudeHookCommands.push(hook.command);
            }
            hookFileChanged = true;
            return false;
          }
          return true;
        });
        return { ...group, hooks: keptHooks };
      })
      .filter((group) => (group.hooks ?? []).length > 0);
    next.hooks![eventName] = keptGroups;
  }

  const installedEvents: CodexHookEvent[] = [];
  for (const eventName of CODEX_HOOK_EVENTS) {
    const groups = next.hooks?.[eventName] ?? [];
    const keptGroups = groups
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((hook) => !isExperienceEngineCodexHookCommand(hook.command))
      }))
      .filter((group) => (group.hooks ?? []).length > 0);
    if (keptGroups.length > 0) {
      next.hooks![eventName] = keptGroups;
    } else {
      delete next.hooks![eventName];
    }
  }

  for (const eventName of expectedCodexHookEvents(options.includePreToolUse)) {
    const groups = next.hooks?.[eventName] ?? [];
    next.hooks![eventName] = [...groups, expectedHookGroup(eventName, command)];
    installedEvents.push(eventName);
    hookFileChanged = true;
  }

  const hasAnyHooks = Object.values(next.hooks ?? {}).some((groups) => (groups ?? []).length > 0);
  let deletedHookFile = false;
  if (!hasAnyHooks && existsSync(hooksPath)) {
    rmSync(hooksPath, { force: true });
    deletedHookFile = true;
    hookFileChanged = true;
  } else {
    mkdirSync(dirname(hooksPath), { recursive: true });
    writeFileSync(hooksPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  return {
    ...inspectCodexProjectHooks(options),
    featureConfigUpdated: feature.updated,
    hookFileChanged,
    installedEvents,
    removedClaudeHookCommands,
    deletedHookFile
  };
};
