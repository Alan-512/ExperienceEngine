import type { ExperienceInput, InjectionMode, ToolEvent } from "./domain.js";

export type HostPromptContext = {
  sessionId?: string;
  cwd?: string;
  userMessage: string;
  taskSummary?: string;
  contextSummary?: string;
  injectedNodeIds?: string[];
};

export type HostToolResult = {
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

