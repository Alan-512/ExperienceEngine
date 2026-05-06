import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../../config/load-config.js";
import { buildRetrievalPolicyInspectionSummary } from "../../interaction/retrieval-policy-inspection.js";
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
import type {
  DeliveryState,
  ExperienceNodeType,
  ExperienceState,
  InjectionScorecard,
  TaskType,
  ToolEventStatus
} from "../../types/domain.js";
import type { HygieneFindingType, HygieneSeverity } from "../../maintenance/experience-hygiene.js";
import type { ExportDraftRisk } from "../../maintenance/experience-export-drafts.js";
import { fetchLatestGitHubReleaseStatus } from "../../version/remote-release.js";
import { createCodexActionRegistry } from "./action-registry.js";
import {
  createCodexBrokerFacade,
  executeCodexActionSchema,
  listCodexActionsSchema,
  prepareCodexActionSchema
} from "./broker-tools.js";

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
  runtimeOptions?: ConstructorParameters<typeof ExperienceRuntimeService>[2];
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
  core_actions: [
    "experienceengine_lookup_hints",
    "experienceengine_explain_last_decision",
    "experienceengine_record_tool_result",
    "experienceengine_finalize_task",
    "experienceengine_feedback_last",
    "experienceengine_get_capabilities",
    "experienceengine_doctor"
  ],
  routine_read_surfaces: [
    "experienceengine://doctor/{adapter}",
    "experienceengine://capabilities",
    "experienceengine://last",
    "experienceengine://repo-summary",
    "experienceengine://review",
    "experienceengine://hygiene",
    "experienceengine://export-drafts"
  ],
  routine_read_surface_notes: {
    "experienceengine://review":
      "Read-only operator workflow summary. Coordinates repo policy, hygiene, and export drafts with drill-down references; it does not restore policy, mutate nodes, or write exports."
  },
  advanced_actions: [
    "brokered admin actions",
    "brokered maintenance actions",
    "brokered inspect actions"
  ],
  high_risk_actions: [
    "install / repair / upgrade",
    "backup / export / import / rollback"
  ],
  surface_model: "public core loop + public routine reads + brokered long-tail actions"
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
    ),
    undefined,
    options.runtimeOptions
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

const toNoticeAwareToolResult = <T extends { notice?: string }>(result: T) => ({
  content: [
    ...(result.notice
      ? [
          {
            type: "text" as const,
            text: result.notice
          }
        ]
      : []),
    {
      type: "text" as const,
      text: JSON.stringify(result ?? null, null, 2)
    }
  ],
  structuredContent: result
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
  confidence?: string;
  nodes?: Array<{ state?: string; helped?: number; harmed?: number }>;
}): string | undefined => {
  const primaryNode = scorecard.nodes?.[0];
  if (!scorecard.riskLevel || !primaryNode?.state) {
    return undefined;
  }

  const confidence = scorecard.confidence ? ` ${scorecard.confidence}-confidence` : "";
  return `${scorecard.riskLevel}-risk${confidence} ${primaryNode.state} guidance with ${primaryNode.helped ?? 0} helped and ${primaryNode.harmed ?? 0} harmed signal(s).`;
};

const summarizeRetrievalNotes = (scorecard: {
  queryRewriteApplied?: boolean;
  fastPathApplied?: boolean;
  topCandidates?: Array<{ rerankSource?: string; retrievalReasons?: string[]; policyReasons?: string[] }>;
  rejectedCandidates?: Array<{ id: string }>;
}): string[] => {
  const notes: string[] = [];
  if (scorecard.queryRewriteApplied) {
    notes.push("Query rewrite preserved retrieval intent for this task.");
  }

  const rerankSource = scorecard.topCandidates?.[0]?.rerankSource;
  if (rerankSource === "model") {
    notes.push("Model reranking participated in the final ordering.");
  }

  if (scorecard.fastPathApplied) {
    notes.push("A strong candidate fast path was used.");
  }

  const topCandidate = scorecard.topCandidates?.[0];
  if (topCandidate?.retrievalReasons?.length) {
    notes.push(`Top retrieval signals: ${topCandidate.retrievalReasons.slice(0, 2).join(", ")}.`);
  }
  if (topCandidate?.policyReasons?.length) {
    notes.push(`Top policy signals: ${topCandidate.policyReasons.slice(0, 2).join(", ")}.`);
  }
  if (scorecard.rejectedCandidates?.length) {
    notes.push(`Runner-up candidates withheld: ${scorecard.rejectedCandidates.map((candidate) => candidate.id).join(", ")}.`);
  }

  return notes;
};

const summarizeScorecard = (
  scorecard: {
    mode?: string;
    interventionStrength?: string;
    riskLevel?: string;
    recommendation?: string;
    reasons?: string[];
    decisionReason?: string;
    queryRewriteApplied?: boolean;
    fastPathApplied?: boolean;
    confidence?: string;
    budgetClass?: string;
    topCandidates?: InjectionScorecard["topCandidates"];
    selectedCandidateIds?: string[];
    rejectedCandidates?: Array<{ id: string; reasonCodes?: string[] }>;
    retrievalPolicyDiagnostics?: InjectionScorecard["retrievalPolicyDiagnostics"];
    nodes?: Array<{ id: string; state?: string; riskLevel?: string; helped?: number; harmed?: number }>;
  } | undefined
) =>
  scorecard
    ? {
        mode: scorecard.mode,
        interventionStrength: scorecard.interventionStrength,
        riskLevel: scorecard.riskLevel,
        recommendation: scorecard.recommendation,
        actionReason: summarizeActionReason(scorecard),
        trustSummary: summarizeTrust(scorecard),
        retrievalNotes: summarizeRetrievalNotes(scorecard),
        retrievalPolicySummary: buildRetrievalPolicyInspectionSummary(scorecard as InjectionScorecard),
        confidence: scorecard.confidence,
        budgetClass: scorecard.budgetClass,
        selectedCandidateIds: scorecard.selectedCandidateIds,
        rejectedCandidates:
          scorecard.rejectedCandidates?.slice(0, 3).map((candidate) => ({
            id: candidate.id,
            reasonCodes: candidate.reasonCodes
          })) ?? [],
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
    },

    async waitForBackgroundLearning() {
      await runtime.waitForBackgroundLearning();
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

    async inspectReview(args: CodexScopeArgs & { limit?: number } = {}) {
      return interaction.inspectReview(args.cwd, { limit: args.limit });
    },

    async inspectHygiene(args: { cwd?: string; type?: HygieneFindingType; severity?: HygieneSeverity; limit?: number } = {}) {
      const { cwd, ...filters } = args;
      return interaction.inspectHygiene(cwd ?? process.cwd(), filters);
    },

    async inspectExportDrafts(
      args: {
        cwd?: string;
        nodeId?: string;
        nodeType?: ExperienceNodeType;
        taskFamily?: TaskType;
        state?: ExperienceState;
        deliveryState?: DeliveryState;
        risk?: ExportDraftRisk;
        limit?: number;
      } = {}
    ) {
      const { cwd, ...filters } = args;
      return interaction.inspectExportDrafts(cwd ?? process.cwd(), filters);
    },

    async explainLastDecision(args: { cwd?: string; userMessage: string }) {
      return interaction.explainLastDecision(args.cwd, args.userMessage);
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
  const actionRegistry = createCodexActionRegistry({
    interactionSurface,
    operationalSurface,
    operationalActions,
    stateArtifacts
  });
  const brokerFacade = createCodexBrokerFacade(actionRegistry);
  const server = new McpServer({
    name: "experienceengine",
    version: "0.2.1"
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
    "experienceengine_capabilities",
    "experienceengine://capabilities",
    {
      title: "ExperienceEngine Capabilities",
      description: "Agent-first overview of ExperienceEngine MCP tools, routine reads, brokered actions, and fallback boundaries.",
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
    "experienceengine_review",
    "experienceengine://review",
    {
      title: "ExperienceEngine Operator Review",
      description:
        "Read-only operator review workflow across repo policy, hygiene, and export drafts. Includes advisory drill-down references only.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.inspectReview())
  );

  server.registerResource(
    "experienceengine_hygiene",
    "experienceengine://hygiene",
    {
      title: "ExperienceEngine Hygiene",
      description: "Read-only ExperienceEngine hygiene findings for the current scope.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.inspectHygiene())
  );

  server.registerResource(
    "experienceengine_export_drafts",
    "experienceengine://export-drafts",
    {
      title: "ExperienceEngine Export Drafts",
      description: "Read-only review packages for guidance export drafts in the current scope.",
      mimeType: "application/json"
    },
    async (uri) => toJsonResourceResult(uri.toString(), await interactionSurface.inspectExportDrafts())
  );

  server.registerTool(
    "experienceengine_list_actions",
    {
      title: "ExperienceEngine List Actions",
      description: "List brokered EE long-tail actions without exposing full schemas.",
      inputSchema: listCodexActionsSchema
    },
    async (args) => toStructuredToolResult(brokerFacade.listActions(args))
  );

  server.registerTool(
    "experienceengine_prepare_action",
    {
      title: "ExperienceEngine Prepare Action",
      description: "Read detailed metadata for one brokered EE action.",
      inputSchema: prepareCodexActionSchema
    },
    async (args) => toStructuredToolResult(brokerFacade.prepareAction(args))
  );

  server.registerTool(
    "experienceengine_execute_action",
    {
      title: "ExperienceEngine Execute Action",
      description: "Execute one brokered EE action through the internal action registry.",
      inputSchema: executeCodexActionSchema
    },
    async (args) => toStructuredToolResult(await brokerFacade.executeAction(args))
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
    "experienceengine_get_capabilities",
    {
      title: "ExperienceEngine Capabilities",
      description: "Read the current ExperienceEngine MCP capabilities, including direct tools, routine reads, brokered actions, and CLI-only fallbacks.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => toStructuredToolResult(buildExperienceCapabilities())
  );

  server.registerTool(
    "experienceengine_explain_last_decision",
    {
      title: "ExperienceEngine Explain Last Decision",
      description:
        "Explain why the latest ExperienceEngine intervention matched or stayed quiet for the current workspace.",
      inputSchema: z.object({
        cwd: z.string().optional(),
        userMessage: z.string().min(1)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ cwd, userMessage }) =>
      toTextToolResult(await interactionSurface.explainLastDecision({ cwd, userMessage }))
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
      toNoticeAwareToolResult(await behaviorLoop.lookupHints({ cwd, prompt, sessionId }))
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

  return server;
};

export const runCodexMcpServer = async (): Promise<void> => {
  const server = createCodexMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
