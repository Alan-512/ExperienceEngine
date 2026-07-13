import type {
  EvaluationMode,
  ExperienceInput,
  InjectionMode,
  InjectionScorecard,
  RetrievalContext,
  TaskRun,
  ToolEvent
} from "./domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";

export type HostPromptContext = {
  host?: TaskRun["host"];
  sessionId?: string;
  cwd?: string;
  userMessage: string;
  taskSummary?: string;
  contextSummary?: string;
  injectedNodeIds?: string[];
  outcomeSignal?: string;
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
  notice?: string;
  scorecard?: InjectionScorecard;
  deliveryMode?: EvaluationMode;
  delivered?: boolean;
  retrievalContext?: RetrievalContext;
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
  id?: string;
  name?: string;
  version?: string;
  source?: string;
  rootDir?: string;
  config?: Record<string, unknown>;
  pluginConfig?: Partial<ExperienceEngineConfig>;
  log?: OpenClawLogger;
  logger?: OpenClawLogger;
  resolvePath?: (path: string) => string;
  registerService?: (service: {
    id: string;
    start: (context?: {
      config?: Record<string, unknown>;
      workspaceDir?: string;
      stateDir?: string;
      logger?: OpenClawLogger;
    }) => void | Promise<void>;
    stop?: (context?: {
      config?: Record<string, unknown>;
      workspaceDir?: string;
      stateDir?: string;
      logger?: OpenClawLogger;
    }) => void | Promise<void>;
  }) => void;
  registerCommand?: (command: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (context: {
      isAuthorizedSender: boolean;
      args?: string;
      commandBody: string;
      config?: Record<string, unknown>;
    }) => { text: string } | Promise<{ text: string }>;
  }) => void;
  on?: (
    event: string,
    handler: (payload: unknown, context?: unknown) => unknown | Promise<unknown>
  ) => void;
};
