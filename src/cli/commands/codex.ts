import { spawnSync as nodeSpawnSync, type SpawnSyncReturns } from "node:child_process";
import { resolve } from "node:path";
import { createCodexBehaviorLoop } from "../../adapters/codex/mcp-server.js";
import {
  CODEX_EXPERIENCEENGINE_SERVER,
  createTemporaryCodexConfigWithoutServer
} from "../../install/codex-cli.js";
import { createId } from "../../utils/ids.js";

const usageText = 'Usage: ee codex exec [codex exec options...] "<prompt>"';
const EXEC_FLAGS_WITH_VALUE = new Set([
  "-c",
  "--config",
  "--enable",
  "--disable",
  "-i",
  "--image",
  "-m",
  "--model",
  "--local-provider",
  "-s",
  "--sandbox",
  "-p",
  "--profile",
  "-C",
  "--cd",
  "--add-dir",
  "--output-schema",
  "--color",
  "-o",
  "--output-last-message"
]);

type CodexLookupResult = {
  mode: "skip" | "inject_conservative" | "inject";
  text?: string;
  notice?: string;
  injectedNodeIds: string[];
};

type CodexToolResultRecord = {
  status: string;
  toolName: string;
  eventStatus: string;
};

type CodexFinalizeResult = {
  status: string;
  outcomeSignal: string;
  injectedNodeIds: string[];
  recordedToolEvents: number;
};

type CodexBehaviorLoop = {
  lookupHints(args: { cwd?: string; prompt: string; sessionId?: string }): Promise<CodexLookupResult>;
  recordToolResult(args: {
    sessionId: string;
    toolName: string;
    inputSummary?: string;
    outputSummary?: string;
    errorSignature?: string;
    exitCode?: number;
    status?: "success" | "failure" | "unknown";
  }): Promise<CodexToolResultRecord>;
  finalizeTask(args: {
    sessionId: string;
    cwd?: string;
    prompt?: string;
    contextSummary?: string;
  }): Promise<CodexFinalizeResult>;
};

type IsolatedCodexConfig = {
  configPath: string;
  cleanup: () => void;
};

type SpawnSyncResult = Pick<SpawnSyncReturns<string | Buffer>, "status" | "signal" | "error">;

type CodexCommandDeps = {
  createBehaviorLoop?: () => CodexBehaviorLoop;
  createIsolatedConfig?: () => IsolatedCodexConfig;
  spawnSync?: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      stdio: ["ignore", "inherit", "inherit"];
    }
  ) => SpawnSyncResult;
  createSessionId?: () => string;
  cwd?: () => string;
  env?: () => NodeJS.ProcessEnv;
};

const printUsage = (): void => {
  console.log(usageText);
};

const extractPrompt = (args: string[]): string | undefined => {
  const prompt = args.at(-1);
  const previous = args.length > 1 ? args.at(-2) : undefined;
  if (!prompt || prompt === "-" || (previous && EXEC_FLAGS_WITH_VALUE.has(previous))) {
    return undefined;
  }

  return prompt;
};

const resolveWrappedCwd = (argsWithoutPrompt: string[], currentWorkingDirectory: string): string => {
  for (let index = 0; index < argsWithoutPrompt.length; index += 1) {
    const token = argsWithoutPrompt[index];
    if ((token === "-C" || token === "--cd") && argsWithoutPrompt[index + 1]) {
      return resolve(currentWorkingDirectory, argsWithoutPrompt[index + 1] as string);
    }

    if (token?.startsWith("--cd=")) {
      return resolve(currentWorkingDirectory, token.slice("--cd=".length));
    }
  }

  return currentWorkingDirectory;
};

const buildWrappedPrompt = (prompt: string, injectedText?: string): string =>
  [
    "ExperienceEngine lifecycle is managed externally for this run.",
    "The experienceengine_* MCP tools are intentionally unavailable in this nested Codex run. Do not try to call them.",
    ...(injectedText
      ? [
          "",
          "ExperienceEngine guidance:",
          injectedText
        ]
      : []),
    "",
    "Task:",
    prompt
  ].join("\n");

const summarizeExecCommand = (argsWithoutPrompt: string[]): string =>
  argsWithoutPrompt.length > 0 ? `codex exec ${argsWithoutPrompt.join(" ")}` : "codex exec";

const deriveChildOutcome = (result: SpawnSyncResult): {
  exitCode?: number;
  status: "success" | "failure";
  outputSummary: string;
  errorSignature?: string;
  contextSummary: string;
  processExitCode?: number;
} => {
  if (typeof result.status === "number") {
    if (result.status === 0) {
      return {
        exitCode: 0,
        status: "success",
        outputSummary: "codex exec exited with code 0.",
        contextSummary: "Wrapped codex exec completed with exit code 0."
      };
    }

    return {
      exitCode: result.status,
      status: "failure",
      outputSummary: `codex exec exited with code ${result.status}.`,
      errorSignature: `codex_exit_${result.status}`,
      contextSummary: `Wrapped codex exec completed with exit code ${result.status}.`,
      processExitCode: result.status
    };
  }

  if (result.signal) {
    return {
      status: "failure",
      outputSummary: `codex exec terminated by signal ${result.signal}.`,
      errorSignature: `codex_signal_${result.signal}`,
      contextSummary: `Wrapped codex exec terminated by signal ${result.signal}.`,
      processExitCode: 1
    };
  }

  const spawnCode = result.error && "code" in result.error ? String(result.error.code ?? "spawn_error") : "spawn_error";
  return {
    status: "failure",
    outputSummary: `codex exec failed to launch (${spawnCode}).`,
    errorSignature: spawnCode,
    contextSummary: `Wrapped codex exec failed to launch (${spawnCode}).`,
    processExitCode: 1
  };
};

export const runCodexCommand = async (
  target?: string,
  args: string[] = [],
  deps: CodexCommandDeps = {}
): Promise<void> => {
  if (target !== "exec") {
    printUsage();
    return;
  }

  const prompt = extractPrompt(args);
  if (!prompt) {
    printUsage();
    return;
  }

  const argsWithoutPrompt = args.slice(0, -1);
  const currentWorkingDirectory = (deps.cwd ?? (() => process.cwd()))();
  const wrappedCwd = resolveWrappedCwd(argsWithoutPrompt, currentWorkingDirectory);
  const sessionId = (deps.createSessionId ?? (() => createId("codex_exec")))();
  const behaviorLoop = (deps.createBehaviorLoop ?? (() => createCodexBehaviorLoop()))();
  const isolatedConfig = (deps.createIsolatedConfig ?? (() =>
    createTemporaryCodexConfigWithoutServer(CODEX_EXPERIENCEENGINE_SERVER)))();
  const env = {
    ...((deps.env ?? (() => process.env))()),
    CODEX_CONFIG_PATH: isolatedConfig.configPath
  };

  try {
    const lookup = await behaviorLoop.lookupHints({
      cwd: wrappedCwd,
      prompt,
      sessionId
    });
    const childPrompt = buildWrappedPrompt(prompt, lookup.text);
    const childResult = (deps.spawnSync ?? nodeSpawnSync)(
      "codex",
      ["exec", ...argsWithoutPrompt, childPrompt],
      {
        cwd: wrappedCwd,
        env,
        stdio: ["ignore", "inherit", "inherit"]
      }
    );
    const outcome = deriveChildOutcome(childResult);

    await behaviorLoop.recordToolResult({
      sessionId,
      toolName: "codex_exec",
      inputSummary: summarizeExecCommand(argsWithoutPrompt),
      outputSummary: outcome.outputSummary,
      errorSignature: outcome.errorSignature,
      exitCode: outcome.exitCode,
      status: outcome.status
    });

    await behaviorLoop.finalizeTask({
      sessionId,
      cwd: wrappedCwd,
      prompt,
      contextSummary: outcome.contextSummary
    });

    if (typeof outcome.processExitCode === "number") {
      process.exitCode = outcome.processExitCode;
    }
  } finally {
    isolatedConfig.cleanup();
  }
};
