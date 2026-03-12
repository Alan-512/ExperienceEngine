import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveExperienceEnginePaths, resolveProductStateDir } from "../../config/path-resolver.js";
import type { ClaudeNormalizedEvent } from "./hook-normalizer.js";

type PersistOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export const persistClaudeNormalizedEvent = (
  event: ClaudeNormalizedEvent,
  options: PersistOptions = {}
): string => {
  const paths = resolveExperienceEnginePaths({
    adapter: "claude-code",
    env: options.env ?? {},
    homeDir: options.homeDir
  });
  const stateDir = resolveProductStateDir(paths);
  const filePath = join(stateDir, "events.jsonl");

  mkdirSync(stateDir, { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");

  return filePath;
};
