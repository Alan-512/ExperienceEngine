import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../../config/load-config.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { ExperienceInteractionService, type FeedbackValue } from "../../interaction/service.js";
import {
  ExperienceOperationalService,
  type ExperienceAdapter
} from "../../interaction/operational-service.js";
import { ExperienceRuntimeService } from "../../runtime/service.js";
import type { ExperienceNodeType, ExperienceState, ToolEventStatus } from "../../types/domain.js";
import { fetchLatestGitHubReleaseStatus } from "../../version/remote-release.js";

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
  fetchImpl?: typeof fetch;
};

type CodexRecentMode = "all" | "injected";
type CodexScopeArgs = {
  cwd?: string;
};

const NODE_STATES: ExperienceState[] = ["candidate", "active", "cooling", "retired"];
const NODE_TYPES: ExperienceNodeType[] = ["strategy", "warning"];
const EXPERIENCE_ADAPTERS = ["openclaw", "claude-code", "codex"] as const;

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

const createCodexOperationalService = (
  options: CodexServerOptions = {}
): ExperienceOperationalService => {
  if (!options.fetchImpl) {
    return new ExperienceOperationalService();
  }

  return new ExperienceOperationalService({
    fetchLatestGitHubReleaseStatus: (args = {}) =>
      fetchLatestGitHubReleaseStatus({
        ...args,
        fetchImpl: options.fetchImpl
      })
  });
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

const parseAdapter = (value: string): ExperienceAdapter => {
  if (EXPERIENCE_ADAPTERS.includes(value as ExperienceAdapter)) {
    return value as ExperienceAdapter;
  }

  throw new Error(`Unsupported adapter: ${value}`);
};

const createJsonResourceLink = (uri: string, name: string, description: string) => ({
  type: "resource_link" as const,
  uri,
  name,
  mimeType: "application/json",
  description
});

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
  const operationalSurface = createCodexOperationalService(options);
  const server = new McpServer({
    name: "experienceengine",
    version: "0.1.0"
  });

  server.registerResource(
    "experienceengine_doctor",
    new ResourceTemplate("experienceengine://doctor/{adapter}", {
      list: undefined,
      complete: {
        adapter: () => [...EXPERIENCE_ADAPTERS]
      }
    }),
    {
      title: "ExperienceEngine Doctor",
      description: "Structured ExperienceEngine adapter health and installation state.",
      mimeType: "application/json"
    },
    async (uri, variables) =>
      toJsonResourceResult(
        uri.toString(),
        await operationalSurface.inspectDoctor(parseAdapter(String(variables.adapter)))
      )
  );

  server.registerResource(
    "experienceengine_updates_latest",
    new ResourceTemplate("experienceengine://updates/latest/{adapter}", {
      list: undefined,
      complete: {
        adapter: () => [...EXPERIENCE_ADAPTERS]
      }
    }),
    {
      title: "ExperienceEngine Latest Update State",
      description: "Latest release/update status for an ExperienceEngine adapter context.",
      mimeType: "application/json"
    },
    async (uri, variables) =>
      toJsonResourceResult(
        uri.toString(),
        await operationalSurface.checkUpdate(parseAdapter(String(variables.adapter)))
      )
  );

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

  server.registerPrompt(
    "experienceengine_show_last_intervention",
    {
      title: "ExperienceEngine Show Last Intervention",
      description: "Review the most recent ExperienceEngine interaction and summarize what happened."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Review the latest ExperienceEngine interaction. Summarize whether guidance was injected, which nodes were involved, and what outcome was recorded."
          }
        },
        {
          role: "user",
          content: createJsonResourceLink(
            "experienceengine://last",
            "ExperienceEngine Last Interaction",
            "The latest persisted ExperienceEngine record and any resolved injected nodes."
          )
        }
      ]
    })
  );

  server.registerPrompt(
    "experienceengine_review_recent_injected",
    {
      title: "ExperienceEngine Review Recent Injected",
      description: "Review recent ExperienceEngine turns that actually injected guidance.",
      argsSchema: {
        limit: z.string().optional()
      }
    },
    async ({ limit }) => {
      const resolvedLimit = limit ? parsePositiveLimit(limit) : 5;
      const uri = `experienceengine://recent/injected/${resolvedLimit}`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review the ${resolvedLimit} most recent ExperienceEngine turns that injected guidance. Summarize recurring successful patterns and any harmful repeats.`
            }
          },
          {
            role: "user",
            content: createJsonResourceLink(
              uri,
              "ExperienceEngine Recent Injected History",
              "Recent ExperienceEngine records filtered to injected turns."
            )
          }
        ]
      };
    }
  );

  server.registerPrompt(
    "experienceengine_review_warning_nodes",
    {
      title: "ExperienceEngine Review Warning Nodes",
      description: "Review current warning nodes to assess whether they are still useful or noisy."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Review the current ExperienceEngine warning nodes. Identify noisy or stale warnings, and call out any warning that appears to be over-firing or no longer useful."
          }
        },
        {
          role: "user",
          content: createJsonResourceLink(
            "experienceengine://nodes/type/warning",
            "ExperienceEngine Warning Nodes",
            "All ExperienceEngine nodes currently classified as warning nodes."
          )
        }
      ]
    })
  );

  server.registerPrompt(
    "experienceengine_pause_current_project",
    {
      title: "ExperienceEngine Pause Current Project",
      description: "Guide the agent to pause ExperienceEngine interventions for the current project.",
      argsSchema: {
        cwd: z.string().optional()
      }
    },
    async ({ cwd }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Pause ExperienceEngine interventions for the current project${cwd ? ` at ${cwd}` : ""}. Confirm this action before calling the experienceengine_disable_scope tool, then summarize which scope was changed.`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "experienceengine_resume_current_project",
    {
      title: "ExperienceEngine Resume Current Project",
      description: "Guide the agent to resume ExperienceEngine interventions for the current project.",
      argsSchema: {
        cwd: z.string().optional()
      }
    },
    async ({ cwd }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Resume ExperienceEngine interventions for the current project${cwd ? ` at ${cwd}` : ""}. Confirm this action before calling the experienceengine_enable_scope tool, then summarize which scope was changed.`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "experienceengine_mark_last_experience_helpful",
    {
      title: "ExperienceEngine Mark Last Experience Helpful",
      description: "Guide the agent to mark the last injected experience as helpful."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Mark the last injected ExperienceEngine guidance as helpful. Confirm with the user if needed, then call the experienceengine_feedback_last tool with feedback=helped and summarize which nodes were updated."
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "experienceengine_mark_last_experience_harmful",
    {
      title: "ExperienceEngine Mark Last Experience Harmful",
      description: "Guide the agent to mark the last injected experience as harmful."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Mark the last injected ExperienceEngine guidance as harmful. Confirm with the user if needed, then call the experienceengine_feedback_last tool with feedback=harmed and summarize which nodes were updated."
          }
        }
      ]
    })
  );

  server.registerTool(
    "experienceengine_doctor",
    {
      title: "ExperienceEngine Doctor",
      description: "Inspect structured ExperienceEngine adapter health and installation state.",
      inputSchema: z.object({
        adapter: z.enum(EXPERIENCE_ADAPTERS)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ adapter }) => toTextToolResult(await operationalSurface.inspectDoctor(adapter))
  );

  server.registerTool(
    "experienceengine_check_update",
    {
      title: "ExperienceEngine Check Update",
      description: "Check structured ExperienceEngine release/update state for an adapter context.",
      inputSchema: z.object({
        adapter: z.enum(EXPERIENCE_ADAPTERS)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async ({ adapter }) => toTextToolResult(await operationalSurface.checkUpdate(adapter))
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
