import type { ExperienceLastInspection } from "../interaction/service.js";
import type { OutcomeSignal, TaskRun, ToolEvent } from "../types/domain.js";
import { normalizeWhitespace, stripShellLikeTaskCommands, truncate } from "../utils/text.js";
import type {
  ExplainDecisionCapsule,
  HybridCapsuleEvidence,
  HybridCapsuleEvidenceSource,
  HybridRouteDecision,
  PostmortemReviewCapsule
} from "./types.js";

const MAX_EVIDENCE_TEXT = 240;

const strictTruncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 3).trimEnd()}...`;

const sanitizeEvidenceText = (value: string): { text: string; truncated: boolean } => {
  const normalized = normalizeWhitespace(stripShellLikeTaskCommands(value));
  const truncatedText = strictTruncate(truncate(normalized, MAX_EVIDENCE_TEXT), MAX_EVIDENCE_TEXT);
  return {
    text: truncatedText,
    truncated: truncatedText.length < normalized.length
  };
};

const toEvidence = (
  source: HybridCapsuleEvidenceSource,
  value: string | undefined
): HybridCapsuleEvidence | undefined => {
  if (!value) {
    return undefined;
  }

  const { text, truncated } = sanitizeEvidenceText(value);
  if (!text) {
    return undefined;
  }

  return {
    source,
    text,
    trust: "untrusted_evidence",
    truncated
  };
};

export const buildExplainDecisionCapsule = (input: {
  schemaVersion: string;
  routeDecision: HybridRouteDecision;
  inspection: ExperienceLastInspection;
}): ExplainDecisionCapsule => {
  const evidence = [
    toEvidence("task_summary", input.inspection.summary),
    toEvidence("decision_explanation", input.inspection.decisionExplanation),
    toEvidence("context_summary", input.inspection.trustSummary),
    ...input.inspection.retrievalNotes.map((note) => toEvidence("retrieval_note", note)),
    ...input.inspection.timeline.map((entry) => toEvidence("timeline", entry.summary)),
    ...input.inspection.evidence.map((entry) => toEvidence("tool_event", entry))
  ].filter((entry): entry is HybridCapsuleEvidence => Boolean(entry));

  return {
    task: "explain_decision",
    schemaVersion: input.schemaVersion,
    trusted: {
      route: input.routeDecision,
      inspection: {
        scopeId: input.inspection.scopeId,
        taskType: input.inspection.taskType,
        intervention: input.inspection.intervention,
        deliveryMode: input.inspection.deliveryMode,
        autoFeedback: input.inspection.autoFeedback,
        outcome: input.inspection.outcome,
        learningStatus: input.inspection.learningStatus
      },
      scorecard: input.inspection.scorecard
        ? {
            mode: input.inspection.scorecard.mode,
            decisionReason: input.inspection.scorecard.decisionReason,
            riskLevel: input.inspection.scorecard.riskLevel,
            confidence: input.inspection.scorecard.confidence,
            budgetClass: input.inspection.scorecard.budgetClass,
            fastPathApplied: input.inspection.scorecard.fastPathApplied,
            queryRewriteApplied: input.inspection.scorecard.queryRewriteApplied
          }
        : undefined
    },
    evidence
  };
};

export const buildPostmortemReviewCapsule = (input: {
  schemaVersion: string;
  routeDecision: HybridRouteDecision;
  taskRun: TaskRun;
  outcomeSignal: OutcomeSignal;
  triggers: {
    directionalCorrectionPresent: boolean;
    injectedNodeInteractionPresent: boolean;
    retryOrInvalidationSignaturePresent: boolean;
    meaningfulFailureSignaturePresent: boolean;
    conservativeTransitionReviewWorthy: boolean;
  };
  toolEvents?: ToolEvent[];
}): PostmortemReviewCapsule => {
  const evidence = [
    toEvidence("task_summary", input.taskRun.task_summary),
    toEvidence("context_summary", input.taskRun.context_summary),
    ...(input.toolEvents ?? []).map((event) =>
      toEvidence("tool_event", [event.tool_name, event.status, event.output_summary ?? event.error_signature].filter(Boolean).join(": "))
    )
  ].filter((entry): entry is HybridCapsuleEvidence => Boolean(entry));

  return {
    task: "postmortem_review",
    schemaVersion: input.schemaVersion,
    trusted: {
      route: input.routeDecision,
      run: {
        taskRunId: input.taskRun.id,
        scopeId: input.taskRun.scope_id,
        taskType: input.taskRun.task_type,
        finalStatus: input.taskRun.final_status,
        learningStatus: input.taskRun.learning_status,
        outcomeSignal: input.outcomeSignal
      },
      reviewTriggers: input.triggers
    },
    evidence
  };
};
