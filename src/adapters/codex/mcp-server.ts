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
  prompt?: string;
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

const NODE_STATES: ExperienceState[] = ["candidate", "priority_candidate", "active", "cooling", "retired"];
const NODE_TYPES: ExperienceNodeType[] = ["strategy", "warning"];
const EXPERIENCE_ADAPTERS = ["openclaw", "claude-code", "codex"] as const;
const HIGH_IMPACT_OPERATIONS = ["install", "repair", "upgrade"] as const satisfies readonly HighImpactOperation[];

const buildExperienceCapabilities = () => ({
  model: "agent-first",
  principles: [
    "Users should talk to the host agent instead of memorizing ee CLI commands.",
    "Low-risk read and preview operations should be direct MCP tools.",
    "High-risk write operations should use plan -> review -> confirm flows."
  ],
  prompts: [
    "experienceengine_review_repo_status"
  ],
  resources: [
    "experienceengine://capabilities",
    "experienceengine://repo-summary",
    "experienceengine://last",
    "experienceengine://learning/summary"
  ],
  cliFallbacks: [
    "install / repair / upgrade",
    "backup / export / import / rollback",
    "maintenance commands"
  ]
});

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

const summarizeActionReason = (scorecard: {
  mode?: string;
  decisionReason?: string;
}): string | undefined => {
  if (scorecard.mode === "inject_conservative") {
    if (scorecard.decisionReason === "ambiguous_same_family_candidate") {
      return "ExperienceEngine found a promising same-family match and chose conservative injection instead of skipping.";
    }

    if (scorecard.decisionReason === "promising_candidate_quality") {
      return "ExperienceEngine found a credible candidate, but kept the injection conservative until it has stronger runtime proof.";
    }

    return "ExperienceEngine chose conservative injection because the best match still needs more runtime evidence.";
  }

  if (scorecard.decisionReason === "mature_validated_candidate") {
    return "A mature validated candidate cleared the fast path, so ExperienceEngine injected it normally.";
  }

  if (scorecard.decisionReason === "candidate_quality_positive") {
    return "Candidate quality was strong enough to justify intervention for this task.";
  }

  if (scorecard.mode === "inject") {
    return "ExperienceEngine injected the best available reusable guidance for this task.";
  }

  return undefined;
};

const summarizeTrust = (scorecard: {
  riskLevel?: string;
  nodes?: Array<{ state?: string; helped?: number; harmed?: number }>;
}): string | undefined => {
  const primaryNode = scorecard.nodes?.[0];
  if (!scorecard.riskLevel || !primaryNode?.state) {
    return undefined;
  }

  return `${scorecard.riskLevel}-risk ${primaryNode.state} guidance with ${primaryNode.helped ?? 0} helped and ${primaryNode.harmed ?? 0} harmed signal(s).`;
};

const summarizeRetrievalNotes = (scorecard: {
  queryRewriteApplied?: boolean;
  fastPathApplied?: boolean;
  topCandidates?: Array<{ rerankSource?: string }>;
}): string[] => {
  const notes: string[] = [];
  if (scorecard.queryRewriteApplied) {
    notes.push("Query rewrite preserved retrieval intent for this task.");
  }

  const rerankSource = scorecard.topCandidates?.[0]?.rerankSource;
  if (rerankSource === "model" || rerankSource === "custom") {
    notes.push(`${rerankSource === "model" ? "Model" : "External"} reranking participated in the final ordering.`);
  }

  if (scorecard.fastPathApplied) {
    notes.push("A strong candidate fast path was used.");
  }

  return notes;
};

const summarizeScorecard = (
  scorecard: {
    mode?: string;
    riskLevel?: string;
    recommendation?: string;
    reasons?: string[];
    decisionReason?: string;
    queryRewriteApplied?: boolean;
    fastPathApplied?: boolean;
    topCandidates?: Array<{ rerankSource?: string }>;
    nodes?: Array<{ id: string; state?: string; riskLevel?: string; helped?: number; harmed?: number }>;
  } | undefined
) =>
  scorecard
    ? {
        mode: scorecard.mode,
        riskLevel: scorecard.riskLevel,
        recommendation: scorecard.recommendation,
        actionReason: summarizeActionReason(scorecard),
        trustSummary: summarizeTrust(scorecard),
        retrievalNotes: summarizeRetrievalNotes(scorecard),
        reasons: scorecard.reasons?.slice(0, 2),
        nodes:
          scorecard.nodes?.slice(0, 3).map((node) => ({
            id: node.id,
            state: node.state,
            riskLevel: node.riskLevel,
            helped: node.helped,
            harmed: node.harmed
          })) ?? []
      }
    : undefined;

export const createCodexBehaviorLoop = (options: CodexServerOptions = {}) => {
  const runtime = createCodexRuntime(options);

  return {
    async lookupHints(args: CodexLookupArgs) {
      const result = await runtime.beforePromptBuild({
        host: "codex",
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
        summary: summarizeScorecard(result.scorecard),
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
        status: "recorded",
        toolName: event.tool_name,
        eventStatus: event.status,
        hasErrorSignature: Boolean(event.error_signature),
        exitCode: event.exit_code
      };
    },

    async finalizeTask(args: CodexFinalizeArgs) {
      const input = await runtime.finalizeTask({
        host: "codex",
        sessionId: args.sessionId,
        cwd: args.cwd,
        userMessage: args.prompt ?? "",
        taskSummary: args.prompt,
        contextSummary: args.contextSummary
      });

      return {
        status: "finalized",
        taskType: input.task_type,
        outcomeSignal: input.outcome_signal,
        injectedNodeIds: input.injected_node_ids,
        recordedToolEvents: input.tool_events.length,
        feedbackHint:
          input.injected_node_ids.length > 0
            ? "If the injected guidance helped or harmed this task, call experienceengine_quick_feedback."
            : undefined
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

    async inspectLearningSummary() {
      return interaction.inspectLearningSummary();
    },

    async inspectRepoSummary(args: CodexScopeArgs = {}) {
      return interaction.inspectRepoSummary(args.cwd);
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
    version: "0.1.2"
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
    "experienceengine_capabilities",
    "experienceengine://capabilities",
    {
      title: "ExperienceEngine Capabilities",
      description: "Agent-first overview of ExperienceEngine MCP tools, guarded flows, prompts, and fallback boundaries.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), buildExperienceCapabilities())
  );

  server.registerResource(
    "experienceengine_repo_summary",
    "experienceengine://repo-summary",
    {
      title: "ExperienceEngine Repo Summary",
      description: "Repo-level ExperienceEngine summary for the current scope, including benchmark and next action.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.inspectRepoSummary())
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
    "experienceengine_review_repo_status",
    {
      title: "ExperienceEngine Review Repo Status",
      description: "Guide the host agent to review the current repo's ExperienceEngine state before deciding what to do next."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Read experienceengine://repo-summary first. Summarize the repo verdict, suggested mode, and safest next action."
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "experienceengine_review_capabilities",
    {
      title: "ExperienceEngine Review Capabilities",
      description: "Guide the host agent to review ExperienceEngine's agent-first MCP surface before using advanced ExperienceEngine operations."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Read experienceengine://capabilities first. Summarize which ExperienceEngine actions are direct tools, which need confirmation, and which stay CLI/operator-only."
          }
        }
      ]
    })
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
                `Call ${planTool}${suffix} first. Review the summary, effects, and artifact path with the user. Only after explicit confirmation should you call experienceengine_execute_planned_state_operation with the returned planId and confirmationToken.`
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
              `Call experienceengine_plan_${operation} with adapter=${adapter} first. Review the summary, effects, and commandHint with the user. Only after explicit confirmation should you call experienceengine_execute_planned_operation with the returned planId and confirmationToken.`
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
              "Review the latest ExperienceEngine interaction in this Codex session. Summarize whether guidance was injected, which nodes were involved, and the recorded outcome. Use CLI fallback only if the host surface is unavailable."
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
                `Review the ${resolvedLimit} most recent ExperienceEngine turns that injected guidance. Summarize recurring wins and harmful repeats.`
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
              "Review the current ExperienceEngine warning nodes. Identify stale warnings and any warning that appears noisy or over-firing."
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
              `Pause ExperienceEngine interventions for the current project${cwd ? ` at ${cwd}` : ""}. Confirm first, then call experienceengine_set_scope_intervention_state with action=disable and summarize the changed scope.`
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
              `Resume ExperienceEngine interventions for the current project${cwd ? ` at ${cwd}` : ""}. Confirm first, then call experienceengine_set_scope_intervention_state with action=enable and summarize the changed scope.`
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
              "Mark the last injected ExperienceEngine guidance as helpful in this Codex session. If needed, confirm first, call experienceengine_feedback_last with feedback=helped, and summarize updated nodes. Use CLI fallback only if the host path is unavailable."
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
              "Mark the last injected ExperienceEngine guidance as harmful in this Codex session. If needed, confirm first, call experienceengine_feedback_last with feedback=harmed, and summarize updated nodes. Use CLI fallback only if the host path is unavailable."
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
    "experienceengine_get_capabilities",
    {
      title: "ExperienceEngine Capabilities",
      description: "Read the current ExperienceEngine MCP capabilities, including direct tools, guarded flows, prompts, and CLI-only fallbacks.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => toStructuredToolResult(buildExperienceCapabilities())
  );

  server.registerTool(
    "experienceengine_lookup_hints",
    {
      title: "ExperienceEngine Lookup Hints",
      description:
        "Use once at task start for a real coding or debugging task to check whether ExperienceEngine has relevant prior guidance.",
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
        "Record only important tool outcomes that changed the task direction, especially notable shell, test, build, or edit results, before finalization.",
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
        "Call at task end after hint lookup and any important tool-result recording to persist the learning loop outcome. Omit prompt when the task is unchanged from the earlier lookup in the same session.",
      inputSchema: z.object({
        sessionId: z.string().min(1),
        cwd: z.string().optional(),
        prompt: z.string().min(1).optional(),
        contextSummary: z.string().optional()
      })
    },
    async (args) => toTextToolResult(await behaviorLoop.finalizeTask(args))
  );

  server.registerTool(
    "experienceengine_feedback_last",
    {
      title: "ExperienceEngine Feedback Last",
      description:
        "Record helped or harmed feedback after injected guidance for the last injected ExperienceEngine node set.",
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
    "experienceengine_set_scope_intervention_state",
    {
      title: "ExperienceEngine Set Scope Intervention State",
      description: "Enable or disable ExperienceEngine interventions for the provided working directory scope.",
      inputSchema: z.object({
        action: z.enum(["enable", "disable"]),
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
    async ({ action, cwd }) =>
      toStructuredToolResult(
        action === "disable"
          ? await interactionSurface.disableScope({ cwd })
          : await interactionSurface.enableScope({ cwd })
      )
  );

  server.registerTool(
    "experienceengine_set_node_lifecycle",
    {
      title: "ExperienceEngine Set Node Lifecycle",
      description: "Move a specific ExperienceEngine node into cooling or retired lifecycle state.",
      inputSchema: z.object({
        action: z.enum(["cool", "retire"]),
        nodeId: z.string().min(1)
      }),
      outputSchema: z.object({
        status: z.enum(["updated", "not_found"]),
        nodeId: z.string(),
        state: z.enum(["candidate", "priority_candidate", "active", "cooling", "retired"]).optional()
      })
    },
    async ({ action, nodeId }) =>
      toStructuredToolResult(
        action === "cool"
          ? await interactionSurface.coolNode({ nodeId })
          : await interactionSurface.retireNode({ nodeId })
      )
  );

  return server;
};

export const runCodexMcpServer = async (): Promise<void> => {
  const server = createCodexMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
