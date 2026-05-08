import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type SpawnSyncLike = typeof nodeSpawnSync;
type McpServerCheck = (targetToolName: string, cwd: string) => Promise<ClaudeMcpServerAnalysis>;

export type ClaudePrintValidationOptions = {
  prompt?: string;
  targetToolName?: string;
  cwd?: string;
  homeDir?: string;
  spawnSync?: SpawnSyncLike;
  mcpServerCheck?: McpServerCheck;
};

export type ClaudeTranscriptAnalysis = {
  transcriptPath: string | null;
  toolSeen: boolean;
  toolResultSeen: boolean;
  assistantText: string | null;
  usedTranscriptConclusion: boolean;
};

export type ClaudeMcpServerAnalysis = {
  mcpServerToolAvailable: boolean;
  mcpServerToolNames: string[];
  mcpServerError: string | null;
};

export type ClaudePrintValidationReport = ClaudeTranscriptAnalysis & {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  targetToolName: string;
} & ClaudeMcpServerAnalysis;

const DEFAULT_PROMPT = "Call experienceengine_get_capabilities and summarize the direct tools in one sentence.";
const DEFAULT_TARGET_TOOL = "mcp__experienceengine__experienceengine_get_capabilities";
const MCP_TOOL_PREFIX = "mcp__experienceengine__";

const toClaudeProjectSlug = (cwd: string): string => {
  const absolute = resolve(cwd);
  return absolute.replace(/[<>:"/\\|?*]+/g, "-");
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

const normalizeClaudeMcpToolName = (targetToolName: string): string =>
  targetToolName.startsWith(MCP_TOOL_PREFIX) ? targetToolName.slice(MCP_TOOL_PREFIX.length) : targetToolName;

const checkExperienceEngineMcpServerTools: McpServerCheck = async (targetToolName, cwd) => {
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    return {
      mcpServerToolAvailable: false,
      mcpServerToolNames: [],
      mcpServerError: "CLI entrypoint is unavailable."
    };
  }

  const target = normalizeClaudeMcpToolName(targetToolName);
  const client = new Client({ name: "experienceengine-claude-print-validation", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliEntry, "mcp-server"],
    cwd,
    env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).filter((name) => name.startsWith("experienceengine_"));
    return {
      mcpServerToolAvailable: names.includes(target),
      mcpServerToolNames: names,
      mcpServerError: null
    };
  } catch (error) {
    return {
      mcpServerToolAvailable: false,
      mcpServerToolNames: [],
      mcpServerError: error instanceof Error ? error.message : String(error)
    };
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore cleanup failures after collecting diagnostics.
    }
  }
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
  const mcpServerCheck = options.mcpServerCheck ?? checkExperienceEngineMcpServerTools;

  const command = ["claude", "-p", "--permission-mode", "bypassPermissions", prompt];
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf8"
  });

  const transcriptPath = findLatestTranscript(transcriptDir);
  const analysis = analyzeClaudeTranscript(transcriptPath, targetToolName);
  const mcpServerAnalysis = await mcpServerCheck(targetToolName, cwd);

  return {
    command,
    exitCode: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    targetToolName,
    ...analysis,
    ...mcpServerAnalysis
  };
};
