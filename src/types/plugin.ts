import type { ExperienceInput, InjectionMode, ToolEvent } from "./domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";

export type HostPromptContext = {
  sessionId?: string;
  cwd?: string;
  userMessage: string;
  taskSummary?: string;
  contextSummary?: string;
  injectedNodeIds?: string[];
};

export type HostToolResult = {
  sessionId?: string;
  toolCallId?: string;
  toolName: string;
  inputSummary?: string;
  outputSummary?: string;
  exitCode?: number;
  errorSignature?: string;
  status?: ToolEvent["status"];
  startedAt?: string;
  endedAt?: string;
};

export type PromptBuildResult = {
  mode: InjectionMode;
  text?: string;
  input: ExperienceInput;
};

export type ExperiencePlugin = {
  beforePromptBuild(context: HostPromptContext): Promise<PromptBuildResult>;
  persistToolResult(result: HostToolResult): Promise<ToolEvent>;
  finalizeTask(context: HostPromptContext): Promise<ExperienceInput>;
};

export type OpenClawLogger = {
  debug?: (message: string, meta?: unknown) => void;
  info?: (message: string, meta?: unknown) => void;
  warn?: (message: string, meta?: unknown) => void;
  error?: (message: string, meta?: unknown) => void;
};

export type OpenClawPluginApi = {
  config?: Record<string, unknown>;
  pluginConfig?: Partial<ExperienceEngineConfig>;
  log?: OpenClawLogger;
  logger?: OpenClawLogger;
  resolvePath?: (path: string) => string;
  on?: (
    event: string,
    handler: (payload: unknown, context?: unknown) => unknown | Promise<unknown>
  ) => void;
};
