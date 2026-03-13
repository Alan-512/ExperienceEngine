import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../../config/load-config.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { ExperienceInteractionService, type FeedbackValue } from "../../interaction/service.js";
import { ExperienceRuntimeService } from "../../runtime/service.js";
import type { ExperienceNodeType, ExperienceState, ToolEventStatus } from "../../types/domain.js";

type CodexLookupArgs = {
  cwd?: string;
  prompt: string;
  sessionId?: string;
};

type CodexToolResultArgs = {
  sessionId: string;
  toolName: string;
  inputSummary?: string;
  outputSummary?: string;
  errorSignature?: string;
  exitCode?: number;
  status?: ToolEventStatus;
};

type CodexFinalizeArgs = {
  sessionId: string;
  cwd?: string;
  prompt: string;
  contextSummary?: string;
};

type CodexServerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

type CodexRecentMode = "all" | "injected";
type CodexScopeArgs = {
  cwd?: string;
};

const NODE_STATES: ExperienceState[] = ["candidate", "active", "cooling", "retired"];
const NODE_TYPES: ExperienceNodeType[] = ["strategy", "warning"];

const createCodexRuntime = (options: CodexServerOptions = {}): ExperienceRuntimeService => {
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });

  return new ExperienceRuntimeService(
    loadConfig(
      {
        dataDir: paths.dataDir,
        sqlitePath: paths.sqlitePath,
        captureDir: paths.captureDir
      },
      {
        env: options.env ?? process.env,
        homeDir: options.homeDir
      }
    )
  );
};

const createCodexInteractionService = (
  options: CodexServerOptions = {}
): ExperienceInteractionService => {
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });

  return new ExperienceInteractionService(
    loadConfig(
      {
        dataDir: paths.dataDir,
        sqlitePath: paths.sqlitePath,
        captureDir: paths.captureDir
      },
      {
        env: options.env ?? process.env,
        homeDir: options.homeDir
      }
    )
  );
};

const toTextToolResult = (result: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(result ?? null, null, 2)
    }
  ]
});

const toStructuredToolResult = <T>(result: T) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(result ?? null, null, 2)
    }
  ],
  structuredContent: result
});

const toJsonResourceResult = (uri: string, result: unknown) => ({
  contents: [
    {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(result ?? null, null, 2)
    }
  ]
});

const parseRecentMode = (value: string): CodexRecentMode => {
  if (value === "all" || value === "injected") {
    return value;
  }

  throw new Error(`Unsupported recent mode: ${value}`);
};

const parsePositiveLimit = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive limit: ${value}`);
  }

  return parsed;
};

const parseNodeState = (value: string): ExperienceState => {
  if (NODE_STATES.includes(value as ExperienceState)) {
    return value as ExperienceState;
  }

  throw new Error(`Unsupported node state: ${value}`);
};

const parseNodeType = (value: string): ExperienceNodeType => {
  if (NODE_TYPES.includes(value as ExperienceNodeType)) {
    return value as ExperienceNodeType;
  }

  throw new Error(`Unsupported node type: ${value}`);
};

export const createCodexBehaviorLoop = (options: CodexServerOptions = {}) => {
  const runtime = createCodexRuntime(options);

  return {
    async lookupHints(args: CodexLookupArgs) {
      const result = await runtime.beforePromptBuild({
        sessionId: args.sessionId,
        cwd: args.cwd,
        userMessage: args.prompt,
        taskSummary: args.prompt
      });

      return {
        mode: result.mode,
        text: result.text,
        notice: result.notice,
        injectedNodeIds: result.input.injected_node_ids
      };
    },

    async recordToolResult(args: CodexToolResultArgs) {
      const event = await runtime.persistToolResult({
        sessionId: args.sessionId,
        toolName: args.toolName,
        inputSummary: args.inputSummary,
        outputSummary: args.outputSummary,
        errorSignature: args.errorSignature,
        exitCode: args.exitCode,
        status: args.status
      });

      return {
        toolName: event.tool_name,
        status: event.status,
        inputSummary: event.input_summary,
        outputSummary: event.output_summary,
        errorSignature: event.error_signature,
        exitCode: event.exit_code
      };
    },

    async finalizeTask(args: CodexFinalizeArgs) {
      const input = await runtime.finalizeTask({
        sessionId: args.sessionId,
        cwd: args.cwd,
        userMessage: args.prompt,
        taskSummary: args.prompt,
        contextSummary: args.contextSummary
      });

      return {
        taskType: input.task_type,
        taskSummary: input.task_summary,
        outcomeSignal: input.outcome_signal,
        injectedNodeIds: input.injected_node_ids,
        evidence: input.tool_events.map((event) =>
          [event.tool_name, event.status, event.error_signature ?? event.output_summary]
            .filter(Boolean)
            .join(": ")
        )
      };
    }
  };
};

export const createCodexInteractionSurface = (options: CodexServerOptions = {}) => {
  const interaction = createCodexInteractionService(options);

  return {
    async inspectLast() {
      return interaction.inspectLast();
    },

    async inspectRecent(args: { mode?: CodexRecentMode; limit?: number } = {}) {
      return interaction.inspectRecent({
        injectedOnly: args.mode === "injected",
        limit: args.limit ?? 10
      });
    },

    async listActiveNodes() {
      return interaction.listActiveNodes();
    },

    async inspectNode(args: { nodeId: string }) {
      return interaction.inspectNode(args.nodeId);
    },

    async listNodesByState(args: { state: ExperienceState }) {
      return interaction.listNodesByState(args.state);
    },

    async listNodesByType(args: { nodeType: ExperienceNodeType }) {
      return interaction.listNodesByType(args.nodeType);
    },

    async feedbackLast(args: { feedback: FeedbackValue }) {
      return interaction.feedbackLast(args.feedback);
    },

    async feedbackNode(args: { nodeId: string; feedback: FeedbackValue }) {
      return interaction.feedbackNode(args.nodeId, args.feedback);
    },

    async disableScope(args: CodexScopeArgs = {}) {
      return interaction.disableScope(args.cwd);
    },

    async enableScope(args: CodexScopeArgs = {}) {
      return interaction.enableScope(args.cwd);
    }
  };
};

export const lookupCodexExperienceHints = async (
  args: CodexLookupArgs,
  options: CodexServerOptions = {}
) => {
  const behaviorLoop = createCodexBehaviorLoop(options);
  return behaviorLoop.lookupHints(args);
};

export const createCodexMcpServer = (options: CodexServerOptions = {}) => {
  const behaviorLoop = createCodexBehaviorLoop(options);
  const interactionSurface = createCodexInteractionSurface(options);
  const server = new McpServer({
    name: "experienceengine",
    version: "0.1.0"
  });

  server.registerResource(
    "experienceengine_last",
    "experienceengine://last",
    {
      title: "ExperienceEngine Last Interaction",
      description: "The most recent persisted ExperienceEngine input record and any injected nodes.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.inspectLast())
  );

  server.registerResource(
    "experienceengine_recent",
    new ResourceTemplate("experienceengine://recent/{mode}/{limit}", {
      list: undefined,
      complete: {
        mode: () => ["all", "injected"],
        limit: () => ["5", "10", "20"]
      }
    }),
    {
      title: "ExperienceEngine Recent History",
      description: "Recent ExperienceEngine input records, optionally filtered to injected turns only.",
      mimeType: "application/json"
    },
    async (uri, variables) =>
      toJsonResourceResult(
        uri.toString(),
        await interactionSurface.inspectRecent({
          mode: parseRecentMode(String(variables.mode ?? "all")),
          limit: parsePositiveLimit(String(variables.limit ?? "10"))
        })
      )
  );

  server.registerResource(
    "experienceengine_active_nodes",
    "experienceengine://nodes/active",
    {
      title: "ExperienceEngine Active Nodes",
      description: "All currently active ExperienceEngine nodes.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.listActiveNodes())
  );

  server.registerResource(
    "experienceengine_node",
    new ResourceTemplate("experienceengine://node/{id}", {
      list: undefined
    }),
    {
      title: "ExperienceEngine Node Detail",
      description: "A single ExperienceEngine node by id.",
      mimeType: "application/json"
    },
    async (uri, variables) =>
      toJsonResourceResult(uri.toString(), await interactionSurface.inspectNode({ nodeId: String(variables.id) }))
  );

  server.registerResource(
    "experienceengine_nodes_by_state",
    new ResourceTemplate("experienceengine://nodes/state/{state}", {
      list: undefined,
      complete: {
        state: () => [...NODE_STATES]
      }
    }),
    {
      title: "ExperienceEngine Nodes By State",
      description: "ExperienceEngine nodes filtered by lifecycle state.",
      mimeType: "application/json"
    },
    async (uri, variables) =>
      toJsonResourceResult(
        uri.toString(),
        await interactionSurface.listNodesByState({
          state: parseNodeState(String(variables.state))
        })
      )
  );

  server.registerResource(
    "experienceengine_nodes_by_type",
    new ResourceTemplate("experienceengine://nodes/type/{type}", {
      list: undefined,
      complete: {
        type: () => [...NODE_TYPES]
      }
    }),
    {
      title: "ExperienceEngine Nodes By Type",
      description: "ExperienceEngine nodes filtered by node type.",
      mimeType: "application/json"
    },
    async (uri, variables) =>
      toJsonResourceResult(
        uri.toString(),
        await interactionSurface.listNodesByType({
          nodeType: parseNodeType(String(variables.type))
        })
      )
  );

  server.registerTool(
    "experienceengine_lookup_hints",
    {
      title: "ExperienceEngine Lookup Hints",
      description:
        "Look up concise prior experience hints for the current coding task without assuming host lifecycle hooks.",
      inputSchema: z.object({
        cwd: z.string().optional(),
        prompt: z.string().min(1),
        sessionId: z.string().optional()
      })
    },
    async ({ cwd, prompt, sessionId }) =>
      toTextToolResult(await behaviorLoop.lookupHints({ cwd, prompt, sessionId }))
  );

  server.registerTool(
    "experienceengine_record_tool_result",
    {
      title: "ExperienceEngine Record Tool Result",
      description:
        "Record a Codex tool result into the active ExperienceEngine session before finalization.",
      inputSchema: z.object({
        sessionId: z.string().min(1),
        toolName: z.string().min(1),
        inputSummary: z.string().optional(),
        outputSummary: z.string().optional(),
        errorSignature: z.string().optional(),
        exitCode: z.number().int().optional(),
        status: z.enum(["success", "failure", "unknown"]).optional()
      })
    },
    async (args) => toTextToolResult(await behaviorLoop.recordToolResult(args))
  );

  server.registerTool(
    "experienceengine_finalize_task",
    {
      title: "ExperienceEngine Finalize Task",
      description:
        "Finalize a Codex task after hint lookup and optional tool-result recording to persist outcomes and feedback.",
      inputSchema: z.object({
        sessionId: z.string().min(1),
        cwd: z.string().optional(),
        prompt: z.string().min(1),
        contextSummary: z.string().optional()
      })
    },
    async (args) => toTextToolResult(await behaviorLoop.finalizeTask(args))
  );

  server.registerTool(
    "experienceengine_feedback_last",
    {
      title: "ExperienceEngine Feedback Last",
      description: "Record helped or harmed feedback for the last injected ExperienceEngine node set.",
      inputSchema: z.object({
        feedback: z.enum(["helped", "harmed"])
      }),
      outputSchema: z.object({
        status: z.enum(["updated", "not_found"]),
        feedback: z.enum(["helped", "harmed"]).optional(),
        nodeIds: z.array(z.string()).optional(),
        reason: z.enum(["last_injected_missing", "node_missing"]).optional(),
        nodeId: z.string().optional()
      })
    },
    async ({ feedback }) => toStructuredToolResult(await interactionSurface.feedbackLast({ feedback }))
  );

  server.registerTool(
    "experienceengine_feedback_node",
    {
      title: "ExperienceEngine Feedback Node",
      description: "Record helped or harmed feedback for a specific ExperienceEngine node.",
      inputSchema: z.object({
        nodeId: z.string().min(1),
        feedback: z.enum(["helped", "harmed"])
      }),
      outputSchema: z.object({
        status: z.enum(["updated", "not_found"]),
        feedback: z.enum(["helped", "harmed"]).optional(),
        nodeIds: z.array(z.string()).optional(),
        reason: z.enum(["last_injected_missing", "node_missing"]).optional(),
        nodeId: z.string().optional()
      })
    },
    async ({ nodeId, feedback }) =>
      toStructuredToolResult(await interactionSurface.feedbackNode({ nodeId, feedback }))
  );

  server.registerTool(
    "experienceengine_disable_scope",
    {
      title: "ExperienceEngine Disable Scope",
      description: "Disable ExperienceEngine interventions for the provided working directory scope.",
      inputSchema: z.object({
        cwd: z.string().optional()
      }),
      outputSchema: z.object({
        scopeId: z.string(),
        scopeName: z.string(),
        rootPath: z.string().optional(),
        isDisabled: z.boolean(),
        changed: z.boolean()
      })
    },
    async ({ cwd }) => toStructuredToolResult(await interactionSurface.disableScope({ cwd }))
  );

  server.registerTool(
    "experienceengine_enable_scope",
    {
      title: "ExperienceEngine Enable Scope",
      description: "Enable ExperienceEngine interventions for the provided working directory scope.",
      inputSchema: z.object({
        cwd: z.string().optional()
      }),
      outputSchema: z.object({
        scopeId: z.string(),
        scopeName: z.string(),
        rootPath: z.string().optional(),
        isDisabled: z.boolean(),
        changed: z.boolean()
      })
    },
    async ({ cwd }) => toStructuredToolResult(await interactionSurface.enableScope({ cwd }))
  );

  return server;
};

export const runCodexMcpServer = async (): Promise<void> => {
  const server = createCodexMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
