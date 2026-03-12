import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = dirname(fileURLToPath(import.meta.url));

export type ReplayScenario = {
  name: string;
  expectInjection?: boolean;
  seedPrompt: Record<string, unknown>;
  seedPromptContext?: Record<string, unknown>;
  toolResult: Record<string, unknown>;
  toolResultContext?: Record<string, unknown>;
  finalize: Record<string, unknown>;
  finalizeContext?: Record<string, unknown>;
  replayPrompt: Record<string, unknown>;
  replayPromptContext?: Record<string, unknown>;
};

export const loadReplayScenario = (fileName: string): ReplayScenario =>
  JSON.parse(readFileSync(join(fixturesDir, fileName), "utf8")) as ReplayScenario;

export const replayScenarios: ReplayScenario[] = [
  loadReplayScenario("scenario-message-object.json"),
  loadReplayScenario("scenario-messages-array.json"),
  loadReplayScenario("scenario-real-runtime-followup.json"),
  loadReplayScenario("scenario-real-runtime-skip.json")
];
