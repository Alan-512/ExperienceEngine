import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../../config/load-config.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import {
  ExperienceInteractionService,
  type FeedbackValue
} from "../../interaction/service.js";
import {
  ExperienceOperationalService,
  type ExperienceAdapter
} from "../../interaction/operational-service.js";
import {
  ExperienceOperationalActionsService,
  type HighImpactOperation,
  type OperationalActionsDeps,
} from "../../interaction/operational-actions-service.js";
import { ExperienceStateArtifactService } from "../../interaction/state-artifact-service.js";
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
  operationalActionsDeps?: OperationalActionsDeps;
  operationalActionsService?: ExperienceOperationalActionsService;
  stateArtifactService?: ExperienceStateArtifactService;
};

type CodexRecentMode = "all" | "injected";
type CodexScopeArgs = {
  cwd?: string;
};

const NODE_STATES: ExperienceState[] = ["candidate", "active", "cooling", "retired"];
const NODE_TYPES: ExperienceNodeType[] = ["strategy", "warning"];
const EXPERIENCE_ADAPTERS = ["openclaw", "claude-code", "codex"] as const;
const HIGH_IMPACT_OPERATIONS = ["install", "repair", "upgrade"] as const satisfies readonly HighImpactOperation[];

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
    ),
    {
      packsDir: paths.packsDir
    }
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

const createCodexOperationalActionsService = (
  options: CodexServerOptions = {}
): ExperienceOperationalActionsService =>
  options.operationalActionsService ?? new ExperienceOperationalActionsService(options.operationalActionsDeps);

const createCodexStateArtifactService = (
  options: CodexServerOptions = {}
): ExperienceStateArtifactService =>
  options.stateArtifactService ??
  new ExperienceStateArtifactService({
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });

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
        injectedNodeIds: result.input.injected_node_ids,
        scorecard: result.scorecard,
        deliveryMode: result.deliveryMode,
        delivered: result.delivered
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
        feedbackHint:
          input.injected_node_ids.length > 0
            ? "If the injected guidance helped or harmed this task, call experienceengine_quick_feedback."
            : undefined,
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

    async listPacks() {
      return interaction.listPacks();
    },

    async inspectPack(args: { packId: string }) {
      return interaction.inspectPack(args.packId);
    },

    async listNodesByState(args: { state: ExperienceState }) {
      return interaction.listNodesByState(args.state);
    },

    async listNodesByType(args: { nodeType: ExperienceNodeType }) {
      return interaction.listNodesByType(args.nodeType);
    },

    async inspectLearningSummary() {
      return interaction.inspectLearningSummary();
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
    },

    async coolNode(args: { nodeId: string }) {
      return interaction.coolNode(args.nodeId);
    },

    async retireNode(args: { nodeId: string }) {
      return interaction.retireNode(args.nodeId);
    },

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
  const operationalActions = createCodexOperationalActionsService(options);
  const stateArtifacts = createCodexStateArtifactService(options);
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
    "experienceengine_backups",
    "experienceengine://backups",
    {
      title: "ExperienceEngine Backup Inventory",
      description: "Managed ExperienceEngine backups available for rollback or export review.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), stateArtifacts.listBackups())
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
    "experienceengine_packs",
    "experienceengine://packs",
    {
      title: "ExperienceEngine Packs",
      description: "Published and draft local Experience Pack assets in the shared registry.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.listPacks())
  );

  server.registerResource(
    "experienceengine_pack",
    new ResourceTemplate("experienceengine://pack/{id}", {
      list: undefined
    }),
    {
      title: "ExperienceEngine Pack Detail",
      description: "A single Experience Pack and its current version detail.",
      mimeType: "application/json"
    },
    async (uri, variables) =>
      toJsonResourceResult(uri.toString(), await interactionSurface.inspectPack({ packId: String(variables.id) }))
  );

  server.registerResource(
    "experienceengine_learning_summary",
    "experienceengine://learning/summary",
    {
      title: "ExperienceEngine Learning Summary",
      description: "Candidate, distillation, and formal node counts across the learning pipeline.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.inspectLearningSummary())
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
    "experienceengine_prepare_state_operation",
    {
      title: "ExperienceEngine Prepare State Operation",
      description: "Review a backup, export, import, or rollback plan before execution.",
      argsSchema: {
        operation: z.enum(["backup", "export", "import", "rollback"]),
        backupId: z.string().optional(),
        importPath: z.string().optional()
      }
    },
    async ({ operation, backupId, importPath }) => {
      const planTool =
        operation === "backup"
          ? "experienceengine_plan_backup"
          : operation === "export"
            ? "experienceengine_plan_export"
            : operation === "import"
              ? "experienceengine_plan_import"
              : "experienceengine_plan_rollback";
      const suffix =
        operation === "rollback"
          ? ` with backupId=${backupId ?? "<backup-id>"}`
          : operation === "import"
            ? ` with importPath=${importPath ?? "<snapshot-path>"}`
            : "";

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `First call ${planTool}${suffix}. Review the returned summary, effects, and artifact path with the user. Only if the user explicitly confirms should you call experienceengine_execute_planned_state_operation with the returned planId and confirmationToken.`
            }
          }
        ]
      };
    }
  );

  server.registerPrompt(
    "experienceengine_prepare_operational_change",
    {
      title: "ExperienceEngine Prepare Operational Change",
      description: "Plan a high-impact ExperienceEngine install, repair, or upgrade before execution.",
      argsSchema: {
        adapter: z.enum(EXPERIENCE_ADAPTERS),
        operation: z.enum(HIGH_IMPACT_OPERATIONS)
      }
    },
    async ({ adapter, operation }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `First call experienceengine_plan_${operation} with adapter=${adapter}. Review the returned summary, effects, and commandHint with the user. Only if the user explicitly confirms should you call experienceengine_execute_planned_operation with the returned planId and confirmationToken.`
          }
        }
      ]
    })
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
    "experienceengine_plan_backup",
    {
      title: "ExperienceEngine Plan Backup",
      description: "Create a structured plan for backing up ExperienceEngine-managed state."
    },
    async () => toStructuredToolResult(stateArtifacts.planOperation({ operation: "backup" }))
  );

  server.registerTool(
    "experienceengine_plan_export",
    {
      title: "ExperienceEngine Plan Export",
      description: "Create a structured plan for exporting ExperienceEngine-managed state."
    },
    async () => toStructuredToolResult(stateArtifacts.planOperation({ operation: "export" }))
  );

  server.registerTool(
    "experienceengine_plan_import",
    {
      title: "ExperienceEngine Plan Import",
      description: "Create a structured plan for importing an ExperienceEngine snapshot.",
      inputSchema: z.object({
        importPath: z.string().min(1)
      })
    },
    async ({ importPath }) =>
      toStructuredToolResult(stateArtifacts.planOperation({ operation: "import", importPath }))
  );

  server.registerTool(
    "experienceengine_plan_rollback",
    {
      title: "ExperienceEngine Plan Rollback",
      description: "Create a structured plan for rolling back ExperienceEngine state to a managed backup.",
      inputSchema: z.object({
        backupId: z.string().min(1)
      })
    },
    async ({ backupId }) =>
      toStructuredToolResult(stateArtifacts.planOperation({ operation: "rollback", backupId }))
  );

  server.registerTool(
    "experienceengine_execute_planned_state_operation",
    {
      title: "ExperienceEngine Execute Planned State Operation",
      description:
        "Execute a previously planned ExperienceEngine backup, export, import, or rollback after explicit confirmation.",
      inputSchema: z.object({
        planId: z.string().min(1),
        confirmationToken: z.string().min(1)
      })
    },
    async ({ planId, confirmationToken }) =>
      toStructuredToolResult(
        stateArtifacts.executePlannedOperation({ planId, confirmationToken })
      )
  );

  server.registerTool(
    "experienceengine_plan_install",
    {
      title: "ExperienceEngine Plan Install",
      description: "Create a structured plan for installing ExperienceEngine on a supported adapter.",
      inputSchema: z.object({
        adapter: z.enum(EXPERIENCE_ADAPTERS)
      })
    },
    async ({ adapter }) =>
      toStructuredToolResult(
        operationalActions.planOperation({ adapter, operation: "install" })
      )
  );

  server.registerTool(
    "experienceengine_plan_repair",
    {
      title: "ExperienceEngine Plan Repair",
      description: "Create a structured plan for repairing ExperienceEngine wiring on a supported adapter.",
      inputSchema: z.object({
        adapter: z.enum(EXPERIENCE_ADAPTERS)
      })
    },
    async ({ adapter }) =>
      toStructuredToolResult(
        operationalActions.planOperation({ adapter, operation: "repair" })
      )
  );

  server.registerTool(
    "experienceengine_plan_upgrade",
    {
      title: "ExperienceEngine Plan Upgrade",
      description: "Create a structured plan for upgrading ExperienceEngine on a supported adapter.",
      inputSchema: z.object({
        adapter: z.enum(EXPERIENCE_ADAPTERS)
      })
    },
    async ({ adapter }) =>
      toStructuredToolResult(
        operationalActions.planOperation({ adapter, operation: "upgrade" })
      )
  );

  server.registerTool(
    "experienceengine_execute_planned_operation",
    {
      title: "ExperienceEngine Execute Planned Operation",
      description:
        "Execute a previously planned high-impact ExperienceEngine operation after explicit user confirmation.",
      inputSchema: z.object({
        planId: z.string().min(1),
        confirmationToken: z.string().min(1)
      })
    },
    async ({ planId, confirmationToken }) =>
      toStructuredToolResult(
        operationalActions.executePlannedOperation({ planId, confirmationToken })
      )
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
    "experienceengine_quick_feedback",
    {
      title: "ExperienceEngine Quick Feedback",
      description:
        "Record helped or harmed feedback for the last injected ExperienceEngine guidance using the shortest possible interaction path.",
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

  server.registerTool(
    "experienceengine_cool_node",
    {
      title: "ExperienceEngine Cool Node",
      description: "Move a specific ExperienceEngine node into cooling state.",
      inputSchema: z.object({
        nodeId: z.string().min(1)
      }),
      outputSchema: z.object({
        status: z.enum(["updated", "not_found"]),
        nodeId: z.string(),
        state: z.enum(["candidate", "active", "cooling", "retired"]).optional()
      })
    },
    async ({ nodeId }) => toStructuredToolResult(await interactionSurface.coolNode({ nodeId }))
  );

  server.registerTool(
    "experienceengine_retire_node",
    {
      title: "ExperienceEngine Retire Node",
      description: "Retire a specific ExperienceEngine node so it is no longer injected.",
      inputSchema: z.object({
        nodeId: z.string().min(1)
      }),
      outputSchema: z.object({
        status: z.enum(["updated", "not_found"]),
        nodeId: z.string(),
        state: z.enum(["candidate", "active", "cooling", "retired"]).optional()
      })
    },
    async ({ nodeId }) => toStructuredToolResult(await interactionSurface.retireNode({ nodeId }))
  );

  return server;
};

export const runCodexMcpServer = async (): Promise<void> => {
  const server = createCodexMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
