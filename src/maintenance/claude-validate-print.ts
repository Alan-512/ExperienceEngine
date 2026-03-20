import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";

type SpawnSyncLike = typeof nodeSpawnSync;

export type ClaudePrintValidationOptions = {
  prompt?: string;
  targetToolName?: string;
  cwd?: string;
  homeDir?: string;
  spawnSync?: SpawnSyncLike;
};

export type ClaudeTranscriptAnalysis = {
  transcriptPath: string | null;
  toolSeen: boolean;
  toolResultSeen: boolean;
  assistantText: string | null;
  usedTranscriptConclusion: boolean;
};

export type ClaudePrintValidationReport = ClaudeTranscriptAnalysis & {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  targetToolName: string;
};

const DEFAULT_PROMPT = "Call experienceengine_get_capabilities and summarize the direct tools in one sentence.";
const DEFAULT_TARGET_TOOL = "mcp__experienceengine__experienceengine_get_capabilities";

const toClaudeProjectSlug = (cwd: string): string => {
  const absolute = resolve(cwd);
  return absolute.replace(/[\\/]+/g, "-");
};

const listTranscriptPaths = (transcriptDir: string): string[] => {
  if (!existsSync(transcriptDir)) {
    return [];
  }

  return readdirSync(transcriptDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(transcriptDir, name));
};

const findLatestTranscript = (transcriptDir: string): string | null => {
  const paths = listTranscriptPaths(transcriptDir);
  if (paths.length === 0) {
    return null;
  }

  return paths
    .map((path) => ({
      path,
      mtimeMs: (() => {
        try {
          return statSync(path).mtimeMs;
        } catch {
          return 0;
        }
      })()
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.path ?? null;
};

const extractTextContent = (message: { content?: unknown } | null | undefined): string[] => {
  if (!message || !Array.isArray(message.content)) {
    return [];
  }

  return message.content
    .filter((item): item is { type?: string; text?: string } => typeof item === "object" && item !== null)
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => (item.text ?? "").trim())
    .filter((text) => text.length > 0);
};

export const analyzeClaudeTranscript = (
  transcriptPath: string | null,
  targetToolName: string
): ClaudeTranscriptAnalysis => {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return {
      transcriptPath,
      toolSeen: false,
      toolResultSeen: false,
      assistantText: null,
      usedTranscriptConclusion: false
    };
  }

  const lines = readFileSync(transcriptPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let toolSeen = false;
  let toolResultSeen = false;
  let assistantText: string | null = null;

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as {
        message?: {
          content?: Array<Record<string, unknown>>;
        };
      };
      const content = Array.isArray(record.message?.content) ? record.message?.content : [];

      for (const item of content) {
        if (item.type === "tool_use" && item.name === targetToolName) {
          toolSeen = true;
        }
        if (item.type === "tool_result") {
          toolResultSeen = true;
        }
      }

      const texts = extractTextContent(record.message);
      if (texts.length > 0) {
        assistantText = texts[texts.length - 1] ?? assistantText;
      }
    } catch {
      continue;
    }
  }

  return {
    transcriptPath,
    toolSeen,
    toolResultSeen,
    assistantText,
    usedTranscriptConclusion: Boolean(assistantText)
  };
};

export const runClaudePrintValidation = async (
  options: ClaudePrintValidationOptions = {}
): Promise<ClaudePrintValidationReport> => {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeDir = options.homeDir ?? homedir();
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const targetToolName = options.targetToolName ?? DEFAULT_TARGET_TOOL;
  const transcriptDir = join(homeDir, ".claude", "projects", toClaudeProjectSlug(cwd));
  const spawnSync = options.spawnSync ?? nodeSpawnSync;

  const command = ["claude", "-p", "--permission-mode", "bypassPermissions", prompt];
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf8"
  });

  const transcriptPath = findLatestTranscript(transcriptDir);
  const analysis = analyzeClaudeTranscript(transcriptPath, targetToolName);

  return {
    command,
    exitCode: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    targetToolName,
    ...analysis
  };
};
