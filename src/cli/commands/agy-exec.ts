import { spawnSync as nodeSpawnSync, type SpawnSyncReturns } from "node:child_process";
import { resolve } from "node:path";
import { ensureAntigravityProjectWiring } from "../../install/antigravity.js";
import { inspectAntigravityGlobalWiring } from "../../install/antigravity-global-wiring.js";

const usageText = 'Usage: ee agy exec [-C <project>] [agy options...] "<prompt>"';

type SpawnSyncResult = Pick<SpawnSyncReturns<string | Buffer>, "status" | "signal" | "error">;

type AgyExecDeps = {
  ensureAntigravityProjectWiring?: typeof ensureAntigravityProjectWiring;
  inspectAntigravityGlobalWiring?: typeof inspectAntigravityGlobalWiring;
  spawnSync?: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      stdio: "inherit";
    }
  ) => SpawnSyncResult;
  cwd?: () => string;
  env?: () => NodeJS.ProcessEnv;
};

type ParsedAgyExecArgs = {
  cwd: string;
  prompt?: string;
  passthroughArgs: string[];
};

const FLAGS_WITH_VALUE = new Set(["-C", "--cd", "--add-dir", "--log-file", "--print-timeout", "--sandbox"]);

const printUsage = (): void => {
  console.log(usageText);
};

export const parseAgyExecArgs = (args: string[], currentWorkingDirectory = process.cwd()): ParsedAgyExecArgs => {
  let cwd = currentWorkingDirectory;
  const passthroughArgs: string[] = [];
  let prompt: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token) {
      continue;
    }

    if (token === "-C" || token === "--cd") {
      const next = args[index + 1];
      if (next) {
        cwd = resolve(currentWorkingDirectory, next);
        index += 1;
      }
      continue;
    }

    if (token.startsWith("--cd=")) {
      cwd = resolve(currentWorkingDirectory, token.slice("--cd=".length));
      continue;
    }

    if (token === "--") {
      passthroughArgs.push(...args.slice(index + 1, -1));
      prompt = args.at(-1);
      break;
    }

    if (index === args.length - 1 && !(args[index - 1] && FLAGS_WITH_VALUE.has(args[index - 1] as string))) {
      prompt = token;
      continue;
    }

    passthroughArgs.push(token);
  }

  return { cwd, prompt, passthroughArgs };
};

export const runAgyCommand = async (subcommand?: string, args: string[] = [], deps: AgyExecDeps = {}): Promise<void> => {
  if (subcommand !== "exec") {
    printUsage();
    return;
  }

  const currentWorkingDirectory = (deps.cwd ?? (() => process.cwd()))();
  const env = (deps.env ?? (() => process.env))();
  const parsed = parseAgyExecArgs(args, currentWorkingDirectory);
  if (!parsed.prompt?.trim()) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const globalWiring = (deps.inspectAntigravityGlobalWiring ?? inspectAntigravityGlobalWiring)({
    cwd: parsed.cwd,
    env
  });
  if (!globalWiring.hooksRegistered) {
    await (deps.ensureAntigravityProjectWiring ?? ensureAntigravityProjectWiring)({
      cwd: parsed.cwd,
      env
    });
  }

  const childArgs = [
    "--add-dir",
    parsed.cwd,
    "--print",
    "--dangerously-skip-permissions",
    "--print-timeout",
    "5m",
    ...parsed.passthroughArgs,
    parsed.prompt
  ];
  const result = (deps.spawnSync ?? nodeSpawnSync)("agy", childArgs, {
    cwd: parsed.cwd,
    env: {
      ...env,
      EXPERIENCE_ENGINE_PROJECT_CWD: parsed.cwd,
      EXPERIENCE_ENGINE_PROMPT: parsed.prompt
    },
    stdio: "inherit"
  });

  if (typeof result.status === "number") {
    process.exitCode = result.status;
    return;
  }

  process.exitCode = result.error || result.signal ? 1 : 0;
};
