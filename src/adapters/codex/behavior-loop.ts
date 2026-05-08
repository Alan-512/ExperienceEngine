import { loadConfig } from "../../config/load-config.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { buildRetrievalPolicyInspectionSummary } from "../../interaction/retrieval-policy-inspection.js";
import { ExperiencePromptRuntimeService } from "../../runtime/prompt-service.js";
import type { ExperienceRuntimeService } from "../../runtime/service.js";
import type { HostPromptContext } from "../../types/plugin.js";
import type {
  InjectionScorecard,
  ToolEventStatus
} from "../../types/domain.js";

export type CodexLookupArgs = {
  cwd?: string;
  prompt: string;
  sessionId?: string;
};

export type CodexToolResultArgs = {
  sessionId: string;
  toolName: string;
  inputSummary?: string;
  outputSummary?: string;
  errorSignature?: string;
  exitCode?: number;
  status?: ToolEventStatus;
};

export type CodexFinalizeArgs = {
  sessionId: string;
  cwd?: string;
  prompt?: string;
  contextSummary?: string;
  injectedNodeIds?: string[];
};

export type CodexServerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
  runtimeOptions?: ConstructorParameters<typeof ExperienceRuntimeService>[2];
};

const createCodexConfig = (options: CodexServerOptions = {}) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });

  return loadConfig(
    {
      dataDir: paths.dataDir,
      sqlitePath: paths.sqlitePath,
      captureDir: paths.captureDir
    },
    {
      env: options.env ?? process.env,
      homeDir: options.homeDir
    }
  );
};

const createCodexPromptRuntime = (options: CodexServerOptions = {}): ExperiencePromptRuntimeService =>
  new ExperiencePromptRuntimeService(createCodexConfig(options));

const createCodexRuntime = async (options: CodexServerOptions = {}): Promise<ExperienceRuntimeService> => {
  const { ExperienceRuntimeService } = await import("../../runtime/service.js");
  return new ExperienceRuntimeService(createCodexConfig(options), undefined, options.runtimeOptions);
};

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
  let promptRuntime: ExperiencePromptRuntimeService | undefined;
  let runtime: Promise<ExperienceRuntimeService> | undefined;
  const promptLookups = new Map<string, { context: HostPromptContext; injectedNodeIds: string[] }>();

  const getPromptRuntime = () => {
    promptRuntime ??= createCodexPromptRuntime(options);
    return promptRuntime;
  };

  const getRuntime = async () => {
    runtime ??= createCodexRuntime(options);
    return runtime;
  };

  return {
    async lookupHints(args: CodexLookupArgs) {
      const context: HostPromptContext = {
        host: "codex",
        sessionId: args.sessionId,
        cwd: args.cwd,
        userMessage: args.prompt,
        taskSummary: args.prompt
      };
      const result = await getPromptRuntime().beforePromptBuild(context);
      promptLookups.set(args.sessionId ?? "global", {
        context,
        injectedNodeIds: result.input.injected_node_ids
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
      const fullRuntime = await getRuntime();
      const event = await fullRuntime.persistToolResult({
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
      const fullRuntime = await getRuntime();
      const promptLookup = promptLookups.get(args.sessionId);
      const input = await fullRuntime.finalizeTask({
        host: "codex",
        sessionId: args.sessionId,
        cwd: args.cwd ?? promptLookup?.context.cwd,
        userMessage: args.prompt ?? "",
        taskSummary: args.prompt ?? promptLookup?.context.taskSummary,
        contextSummary: args.contextSummary,
        injectedNodeIds: args.injectedNodeIds ?? promptLookup?.injectedNodeIds
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
      const fullRuntime = await getRuntime();
      await fullRuntime.waitForBackgroundLearning();
    }
  };
};
