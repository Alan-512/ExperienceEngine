import type { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { buildInjectionScorecard } from "../controller/injection-scorecard.js";
import { buildBenchmarkSummary, type BenchmarkSummary } from "../evaluation/benchmark-summary.js";
import { buildExplainDecisionCapsule } from "../hybrid/capsule-builder.js";
import { resolveHybridExplainProviderEndpoint } from "../hybrid/explain-provider-client.js";
import { resolveHybridRolloutState } from "../hybrid/rollout.js";
import { buildDefaultRepoPolicy, inspectRepoPolicyEvidence } from "../experience-management/repo-policy.js";
import {
  buildHygieneReviewReport,
  type HygieneReviewFilters,
  type HygieneReviewReport
} from "../maintenance/experience-hygiene.js";
import {
  buildExperienceExportDraftReport,
  type ExperienceExportDraftFilters,
  type ExperienceExportDraftReport
} from "../maintenance/experience-export-drafts.js";
import {
  buildOperatorReviewFlow,
  type OperatorReviewGovernanceSummary,
  type OperatorReviewReport
} from "../maintenance/operator-review-flow.js";
import { selectHybridRoute, type HybridRouteDecision } from "../hybrid/router.js";
import { HybridWorkerClient } from "../hybrid/worker-client.js";
import { resolveScope } from "../input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { HybridInvocationTraceRepository } from "../store/sqlite/repositories/hybrid-invocation-trace-repo.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import { AttributionRecordRepository } from "../store/sqlite/repositories/attribution-record-repo.js";
import { RepoPolicyRepository } from "../store/sqlite/repositories/repo-policy-repo.js";
import { EpisodeRepository } from "../store/sqlite/repositories/episode-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { OutcomeRecordRepository } from "../store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import type {
  CandidateLifecycleState,
  DistillationSource,
  DistillationJobState,
  EvaluationMode,
  ExperienceInputRecord,
  FeedbackAttributionReason,
  AttributionRecord,
  EpisodeProjection,
  InjectionEvent,
  InjectionScorecard,
  ExperienceNode,
  ExperienceNodeType,
  ExperienceState,
  ReviewEvent,
  TaskRun,
  DeliveryState
} from "../types/domain.js";
import type { NodeOriginProfile } from "../experience-management/task-management-signals.js";
import {
  applyGovernedNodeFeedback,
  deriveNodeOriginProfileForNode
} from "../experience-management/node-lifecycle-governance.js";
import {
  deriveGovernanceSignals,
  isPotentialMisfire
} from "../experience-management/governance-observability.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";
import {
  buildRepoSummary,
  type ExperienceRepoSummary
} from "./repo-summary.js";
import {
  buildRetrievalPolicyInspectionSummary,
  type RetrievalPolicyInspectionSummary
} from "./retrieval-policy-inspection.js";
import {
  deriveNodeConfidence,
  deriveNodeRisk,
  deriveQualityBandExplanation,
  summarizeQualityBandDistribution,
  type ExperienceQualityBandExplanation
} from "./quality-band.js";

export type ExperienceNodeSummary = {
  id: string;
  type: ExperienceNode["node_type"];
  taskType: ExperienceNode["task_type"];
  state: ExperienceNode["state"];
  sourceKind: ExperienceNode["source_kind"];
  distillationMode?: ExperienceNode["distillation_mode_used"];
  distillationSource?: ExperienceNode["distillation_source"];
  redistilledFrom?: ExperienceNode["redistilled_from"];
  promotionSignal?: ExperienceNode["promotion_signal"];
  promotionReason?: ExperienceNode["promotion_reason"];
  mergeDecision?: ExperienceNode["merge_decision"];
  mergeReason?: ExperienceNode["merge_reason"];
  priorityPromotionApplied?: boolean;
  triggerPattern: string;
  evidenceSummary: string;
  originRecordIds: string[];
  helped: number;
  harmed: number;
  lastUsedAt?: string;
  hint: string;
  qualityBand: "strong" | "building" | "risky";
  qualityDrivers: string[];
  quality: ExperienceQualityBandExplanation;
  applicabilityProfile: {
    bestFit: string;
    scopeValidity: string;
    confidence: "high" | "medium" | "low";
    risk: "low" | "medium" | "high";
    avoidWhen?: string;
  };
};

export type ExperienceNodeDetail = ExperienceNodeSummary & {
  scopeId: string;
  used: number;
  goal?: string;
  applicability?: string;
  successSignal: string;
  evidence: string;
  recommendedSteps: string[];
  originRecordIds: string[];
  helpedRecordIds: string[];
  harmedRecordIds: string[];
  deliveryState?: DeliveryState;
  migrationStatus?: "current" | "pending" | "migrating" | "failed";
  sourceFingerprintHash?: string;
  portableValidationEvidence?: ExperienceNode["portable_validation_evidence"];
  quarantineLeaseExpiresAt?: string;
  quarantineOriginalDeliveryState?: DeliveryState;
  quarantineReleaseAttemptCount?: number;
  quarantineLastReleaseAttemptAt?: string;
  quarantineReleaseReason?: string;
  quarantineNoHarmPassCount?: number;
};

export type ExperienceTimelineEntry = {
  kind: "decision" | "outcome" | "feedback";
  createdAt: string;
  summary: string;
};

export type ExperienceLastInspection = {
  sessionId?: string;
  episodeId?: string;
  scopeId: string;
  taskType: ExperienceInputRecord["task_type"];
  intervention: "inject" | "skip" | "shadow" | "holdout";
  deliveryMode?: EvaluationMode;
  delivered?: boolean;
  autoFeedback: "helped" | "harmed" | "none";
  autoFeedbackReason?: InjectionEvent["attribution_reason"];
  attributionRecords: AttributionRecord[];
  episodeProjection?: EpisodeProjection;
  outcome: ExperienceInputRecord["outcome_signal"];
  injectedNodes: ExperienceNodeSummary[];
  hints: string[];
  evidence: string[];
  scorecard?: InjectionScorecard;
  decisionExplanation?: string;
  trustSummary?: string;
  qualityContext?: ExperienceQualityBandExplanation;
  retrievalNotes: string[];
  retrievalPolicySummary?: RetrievalPolicyInspectionSummary;
  timeline: ExperienceTimelineEntry[];
  learningStatus?: TaskRun["learning_status"];
  learningReason?: string;
  traceCapsuleId?: string;
  traceCompleteness?: number;
  traceProvenance?: ExperienceInputRecord["trace_provenance"];
  summary: string;
  createdAt: string;
};

export type ExperienceRecentInspection = {
  sessionId?: string;
  taskType: ExperienceInputRecord["task_type"];
  intervention: "inject" | "skip";
  outcome: ExperienceInputRecord["outcome_signal"];
  createdAt: string;
  summary: string;
};

export type FeedbackValue = "helped" | "harmed";

export type FeedbackResult =
  | {
      status: "updated";
      feedback: FeedbackValue;
      nodeIds: string[];
    }
  | {
      status: "not_found";
      reason: "last_injected_missing" | "node_missing";
      nodeId?: string;
    };

export type ScopeToggleResult = {
  scopeId: string;
  scopeName: string;
  rootPath?: string;
  isDisabled: boolean;
  changed: boolean;
};

export type NodeLifecycleResult =
  | {
      status: "updated";
      nodeId: string;
      state: ExperienceNode["state"];
    }
  | {
      status: "not_found";
      nodeId: string;
    };

export type ExperienceLearningSummary = {
  candidates: Record<CandidateLifecycleState, number>;
  jobs: Record<DistillationJobState, number>;
  nodes: Record<ExperienceState, number>;
  nodeSources: Record<DistillationSource, number>;
  effectiveness: {
    decisions: number;
    live: number;
    shadow: number;
    holdout: number;
    delivered: number;
    suppressed: number;
    automaticHelped: number;
    automaticHarmed: number;
  };
  benchmark: BenchmarkSummary;
  attributionReasons: Record<FeedbackAttributionReason, number>;
  runtime: {
    records: number;
    taskRuns: number;
    outcomes: number;
    reviews: number;
  };
  latestRecordCreatedAt?: string;
};

export type ExperienceFirstValueReadiness = {
  rawRecords: number;
  taskRuns: number;
  candidates: number;
  nodes: number;
  nextStep: string;
};

export type ExperienceSilenceReason =
  | "warming_up"
  | "no_strong_match"
  | "withheld_low_confidence"
  | "non_applicable_turn"
  | "unknown";

export type ExperienceDecisionHealth = {
  scopeId: string;
  recentDecisions: number;
  recentInjects: number;
  recentConservativeInjects: number;
  recentSkips: number;
  recentPotentialMisfires: number;
  recentMetaDominantSelections: number;
  recentRealDevAlignedSelections: number;
  recentFastPathActivations: number;
  recentRerankParticipations: number;
  recentQueryRewriteUsages: number;
  recentSecondOpinionActivations: number;
  recentSecondOpinionSkips: number;
  recentSecondOpinionConservativeDowngrades: number;
  currentPriorityCandidates: number;
  recentConvergedUpdates: number;
  recentPriorityPromotions: number;
  lastDecisionMode?: "inject" | "inject_conservative" | "skip";
};

export type LearningRejectionBucket =
  | "expression_only"
  | "no_transferable_value"
  | "insufficient_evidence"
  | "generic_advice"
  | "gate_failure"
  | "ordinary_success"
  | "other";

export type ExperienceLearningQualityHealth = {
  scopeId: string;
  recentTaskRuns: number;
  learningApplicableRuns: number;
  capturedRuns: number;
  rejectedRuns: number;
  notApplicableRuns: number;
  candidateAdmissionRate: number;
  rejectionReasons: Record<LearningRejectionBucket, number>;
  topRejectionReasons: Array<{
    reason: string;
    count: number;
  }>;
  genericAdviceRejections: number;
  feedbackClosure: {
    recentResolvedInterventions: number;
    helped: number;
    harmed: number;
    unresolved: number;
  };
};

const normalizeHybridExplainPrompt = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const LEARNING_REJECTION_BUCKETS: LearningRejectionBucket[] = [
  "expression_only",
  "no_transferable_value",
  "insufficient_evidence",
  "generic_advice",
  "gate_failure",
  "ordinary_success",
  "other"
];

const classifyLearningRejectionReason = (reason: string | undefined): LearningRejectionBucket => {
  const normalized = (reason ?? "").toLowerCase();

  if (normalized.includes("expression-layer") || normalized.includes("expression only")) {
    return "expression_only";
  }

  if (normalized.includes("generic advice") || normalized.includes("generic") || normalized.includes("non-transferable")) {
    return "generic_advice";
  }

  if (normalized.includes("no_transferable_execution_value") || normalized.includes("transferable execution")) {
    return "no_transferable_value";
  }

  if (normalized.includes("insufficient_substantive_evidence") || normalized.includes("insufficient substantive evidence")) {
    return "insufficient_evidence";
  }

  if (normalized.includes("llm gate failed") || normalized.includes("rule fallback rejected") || normalized.includes("gate failed")) {
    return "gate_failure";
  }

  if (normalized.includes("ordinary successful") || normalized.includes("ordinary success")) {
    return "ordinary_success";
  }

  return "other";
};

const HEARTBEAT_NOOP_PATTERN = /\bHEARTBEAT\.md\b|\bHEARTBEAT_OK\b|Read HEARTBEAT\.md if it exists/i;
const AUDIT_WINDOW_OVERSAMPLE_FACTOR = 5;
const AUDIT_WINDOW_MIN_OVERSAMPLE = 100;

const isHeartbeatNoopSummary = (value: string | undefined): boolean =>
  Boolean(value && HEARTBEAT_NOOP_PATTERN.test(value));

const isAuditNoopTaskRun = (run: TaskRun): boolean =>
  isHeartbeatNoopSummary(run.task_summary) || isHeartbeatNoopSummary(run.context_summary);

const isAuditNoopInputRecord = (record: ExperienceInputRecord): boolean =>
  isHeartbeatNoopSummary(record.task_summary) || isHeartbeatNoopSummary(record.context_summary);

const auditWindowFetchLimit = (limit: number): number =>
  Math.max(limit, Math.min(Math.max(limit * AUDIT_WINDOW_OVERSAMPLE_FACTOR, AUDIT_WINDOW_MIN_OVERSAMPLE), 500));

export const isExplicitHybridExplanationRequest = (userMessage: string): boolean => {
  const message = normalizeHybridExplainPrompt(userMessage);
  const mentionsEe =
    message.includes("experienceengine")
    || message.includes("experience engine")
    || /\bee\b/.test(message);
  if (!mentionsEe) {
    return false;
  }

  const hasExplainIntent =
    /\bwhy\b/.test(message)
    || /\bexplain\b/.test(message)
    || (/\bwhat\b/.test(message) && /\binject\b/.test(message))
    || (/\bwhy\b/.test(message) && /\bmatch\b/.test(message))
    || (/\bwhy\b/.test(message) && /\bskip\b/.test(message))
    || (/\bwhy\b/.test(message) && /\bconservative\b/.test(message))
    || message.includes("stayed quiet")
    || message.includes("stay quiet");

  return hasExplainIntent;
};

export const decideHybridExplainRoute = (userMessage: string): HybridRouteDecision =>
  selectHybridRoute({
    taskStage: "prompt",
    explicitExplanationRequest: isExplicitHybridExplanationRequest(userMessage),
    existingConservativePathRequired: false,
    completedRun: false,
    terminalOutcomeRecorded: false,
    boundedPosttaskCapsuleAvailable: false,
    postmortemAlreadyRecorded: false,
    lightweightOrExcludedTask: false,
    directionalCorrectionPresent: false,
    injectedNodeInteractionPresent: false,
    retryOrInvalidationSignaturePresent: false,
    meaningfulFailureSignaturePresent: false,
    conservativeTransitionReviewWorthy: false,
    rolloutAllowsAsyncPostmortem: false
  });

export const deriveStructuredSilenceReason = (input: {
  inspection: ExperienceLastInspection;
  readiness: ExperienceFirstValueReadiness;
}): ExperienceSilenceReason => {
  const { inspection, readiness } = input;
  const learningReason = inspection.learningReason?.toLowerCase() ?? "";
  const hasEarlyRepoEvidence = readiness.rawRecords < 3 && readiness.taskRuns < 3 && readiness.candidates === 0 && readiness.nodes === 0;

  if (inspection.learningStatus === "not_applicable") {
    return "non_applicable_turn";
  }

  if (inspection.learningStatus === "rejected" && learningReason.includes("expression-layer refinement")) {
    return "non_applicable_turn";
  }

  if (
    inspection.scorecard?.decisionReason === "ambiguous_same_family_candidate"
    || inspection.scorecard?.decisionReason === "promising_candidate_quality"
    || inspection.intervention === "shadow"
    || inspection.intervention === "holdout"
  ) {
    return "withheld_low_confidence";
  }

  if (hasEarlyRepoEvidence) {
    return "warming_up";
  }

  if (
    inspection.learningStatus === "captured"
    || learningReason.includes("llm gate failed")
    || learningReason.includes("rule fallback rejected candidate")
  ) {
    return "unknown";
  }

  if (inspection.intervention === "skip" && (readiness.rawRecords > 0 || readiness.taskRuns > 0 || readiness.candidates > 0 || readiness.nodes > 0)) {
    return "no_strong_match";
  }

  return "unknown";
};

const toReviewEvent = (
  nodeId: string,
  eventType: ReviewEvent["event_type"],
  source: ReviewEvent["source"],
  taskRunId?: string,
  episodeId?: string
): ReviewEvent => ({
  id: createId("review"),
  episode_id: episodeId,
  node_id: nodeId,
  task_run_id: taskRunId,
  event_type: eventType,
  source,
  created_at: nowIso()
});

const toManualOverrideAttributionRecord = (input: {
  nodeId: string;
  feedback: FeedbackValue;
  injectionEvent?: InjectionEvent;
  episodeId?: string;
  evidenceRefs: string[];
}): AttributionRecord => {
  const timestamp = nowIso();
  return {
    id: stableId(
      "attr",
      `${input.injectionEvent?.injection_id ?? "manual"}:${input.nodeId}:manual_override:${input.feedback}:${timestamp}`
    ),
    injection_id: input.injectionEvent?.injection_id,
    node_id: input.nodeId,
    episode_id: input.episodeId ?? input.injectionEvent?.episode_id,
    intervention_strength: input.injectionEvent?.scorecard?.interventionStrength,
    injection_mode: input.injectionEvent?.mode,
    delivery_mode: input.injectionEvent?.delivery_mode,
    delivered: Boolean(input.injectionEvent?.delivered),
    outcome: input.injectionEvent?.was_successful === true
      ? "success"
      : input.injectionEvent?.was_successful === false
        ? "failure"
        : "unknown",
    attribution_verdict: input.feedback === "helped" ? "strong_helped" : "strong_harmed",
    confidence: "high",
    evidence_refs: input.evidenceRefs,
    user_override: input.feedback,
    source: "manual_override",
    attribution_reason: "manual_override",
    created_at: timestamp,
    resolved_at: timestamp
  };
};

const formatTaskFamily = (taskType: ExperienceNode["task_type"]): string =>
  taskType === "general" ? "general tasks" : `${taskType} tasks`;

const buildApplicabilityProfile = (node: ExperienceNode) => ({
  bestFit: `${formatTaskFamily(node.task_type)} in this repo scope`,
  scopeValidity: node.applicability_notes ?? "Use within the same repo scope unless fresh evidence says otherwise.",
  confidence: deriveNodeConfidence(node),
  risk: deriveNodeRisk(node),
  avoidWhen: node.stop_condition ?? node.escalation_condition ?? node.avoid_steps?.[0]
});

const toNodeSummary = (node: ExperienceNode): ExperienceNodeSummary => {
  const quality = deriveQualityBandExplanation(node);
  return {
    id: node.id,
    type: node.node_type,
    taskType: node.task_type,
    state: node.state,
    sourceKind: node.source_kind,
    distillationMode: node.distillation_mode_used,
    distillationSource: node.distillation_source,
    redistilledFrom: node.redistilled_from,
    promotionSignal: node.promotion_signal,
    promotionReason: node.promotion_reason,
    mergeDecision: node.merge_decision,
    mergeReason: node.merge_reason,
    priorityPromotionApplied: node.priority_promotion_applied,
    triggerPattern: node.trigger_pattern,
    evidenceSummary: node.evidence_summary,
    originRecordIds: node.origin_record_ids,
    helped: node.helped_count,
    harmed: node.harmed_count,
    lastUsedAt: node.last_used_at,
    hint: node.compact_hint,
    qualityBand: quality.band,
    qualityDrivers: quality.reasons,
    quality,
    applicabilityProfile: buildApplicabilityProfile(node)
  };
};

const toNodeDetail = (node: ExperienceNode): ExperienceNodeDetail => ({
  ...toNodeSummary(node),
  scopeId: node.scope_id,
  used: node.usage_count,
  goal: node.goal,
  applicability: node.applicability_notes,
  successSignal: node.success_signal,
  evidence: node.evidence_summary,
  recommendedSteps: node.recommended_steps ?? [],
  originRecordIds: node.origin_record_ids,
  helpedRecordIds: node.helped_record_ids,
  harmedRecordIds: node.harmed_record_ids,
  deliveryState: node.delivery_state,
  migrationStatus: node.migration_status,
  sourceFingerprintHash: node.source_fingerprint_hash,
  portableValidationEvidence: node.portable_validation_evidence,
  quarantineLeaseExpiresAt: node.quarantine_lease_expires_at,
  quarantineOriginalDeliveryState: node.quarantine_original_delivery_state,
  quarantineReleaseAttemptCount: node.quarantine_release_attempt_count,
  quarantineLastReleaseAttemptAt: node.quarantine_last_release_attempt_at,
  quarantineReleaseReason: node.quarantine_release_reason,
  quarantineNoHarmPassCount: node.quarantine_no_harm_pass_count
});

const summarizeAutomaticFeedback = (events: ReviewEvent[]): "helped" | "harmed" | "none" => {
  const automatic = events.filter((event) => event.source === "automatic");
  if (automatic.some((event) => event.event_type === "mark_harmed")) {
    return "harmed";
  }
  if (automatic.some((event) => event.event_type === "mark_helped")) {
    return "helped";
  }
  return "none";
};

const toDecisionSummary = (
  intervention: ExperienceLastInspection["intervention"],
  delivered: boolean | undefined,
  injectedCount: number
): string => {
  if (intervention === "inject") {
    return `inject: Delivered ${injectedCount} node${injectedCount === 1 ? "" : "s"} for the task.`;
  }

  if (intervention === "shadow") {
    return `shadow: Suppressed delivery for ${injectedCount} matched node${injectedCount === 1 ? "" : "s"}.`;
  }

  if (intervention === "holdout") {
    return `holdout: Withheld ${injectedCount} matched node${injectedCount === 1 ? "" : "s"} for evaluation.`;
  }

  if (delivered === false) {
    return "skip: No guidance was delivered for this task.";
  }

  return "skip: No matching experience guidance was available.";
};

const toFeedbackSummary = (feedback: "helped" | "harmed" | "none"): string | undefined => {
  if (feedback === "helped") {
    return "helped: Automatic attribution marked the injection as helpful.";
  }

  if (feedback === "harmed") {
    return "harmed: Automatic attribution marked the injection as harmful.";
  }

  return undefined;
};

const inferAutoFeedbackReason = (input: {
  explicitReason?: InjectionEvent["attribution_reason"];
  autoFeedback: "helped" | "harmed" | "none";
  intervention: ExperienceLastInspection["intervention"];
  outcome: ExperienceInputRecord["outcome_signal"];
}): InjectionEvent["attribution_reason"] | undefined => {
  if (input.explicitReason) {
    return input.explicitReason;
  }

  if (input.intervention === "shadow" || input.intervention === "holdout") {
    return "suppressed_delivery";
  }

  if (input.autoFeedback === "helped") {
    return "success_outcome";
  }

  if (input.autoFeedback === "harmed") {
    return "relevant_failure";
  }

  if (input.outcome === "unknown") {
    return "unknown_outcome";
  }

  return undefined;
};

const buildLatestTimeline = (input: {
  record: ExperienceInputRecord;
  taskRunCreatedAt?: string;
  outcomeCreatedAt?: string;
  outcomeSummary?: string;
  injectionCreatedAt?: string;
  intervention: ExperienceLastInspection["intervention"];
  delivered?: boolean;
  injectedCount: number;
  autoFeedback: "helped" | "harmed" | "none";
  autoFeedbackCreatedAt?: string;
}): ExperienceTimelineEntry[] => {
  const entries: ExperienceTimelineEntry[] = [
    {
      kind: "decision",
      createdAt: input.injectionCreatedAt ?? input.taskRunCreatedAt ?? input.record.created_at,
      summary: toDecisionSummary(input.intervention, input.delivered, input.injectedCount)
    },
    {
      kind: "outcome",
      createdAt: input.outcomeCreatedAt ?? input.taskRunCreatedAt ?? input.record.created_at,
      summary: `${input.record.outcome_signal}: ${input.outcomeSummary ?? input.record.task_summary}`
    }
  ];

  const feedbackSummary = toFeedbackSummary(input.autoFeedback);
  if (feedbackSummary) {
    entries.push({
      kind: "feedback",
      createdAt: input.autoFeedbackCreatedAt ?? input.outcomeCreatedAt ?? input.record.created_at,
      summary: feedbackSummary
    });
  }

  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
};

const compareIsoDesc = (left?: string, right?: string): number => {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }

  return right.localeCompare(left);
};

const buildDecisionExplanation = (input: {
  intervention: ExperienceLastInspection["intervention"];
  scorecard?: InjectionScorecard;
}): string | undefined => {
  const scorecard = input.scorecard;
  if (!scorecard) {
    return undefined;
  }

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

  if (scorecard.mode === "skip" && scorecard.skipReasonExplanation) {
    return scorecard.skipReasonExplanation;
  }

  if (input.intervention === "shadow") {
    return "ExperienceEngine found a usable match, but delivery was suppressed because this run was in shadow mode.";
  }

  if (input.intervention === "holdout") {
    return "ExperienceEngine found a usable match, but delivery was withheld for evaluation.";
  }

  return undefined;
};

const buildTrustSummary = (input: {
  scorecard?: InjectionScorecard;
  injectedNodes: ExperienceNodeSummary[];
}): string | undefined => {
  const scorecard = input.scorecard;
  const primaryNode = input.injectedNodes[0];
  if (!scorecard || !primaryNode) {
    return undefined;
  }

  const confidence = scorecard.confidence ? ` ${scorecard.confidence}-confidence` : "";
  return `${scorecard.riskLevel}-risk${confidence} ${primaryNode.state} guidance with ${primaryNode.helped} helped and ${primaryNode.harmed} harmed signal(s).`;
};

const buildQualityContext = (input: {
  scorecard?: InjectionScorecard;
  injectedNodes: ExperienceNodeSummary[];
  lookupNode: (nodeId: string) => ExperienceNode | undefined;
}): ExperienceQualityBandExplanation | undefined => {
  const primaryInjected = input.injectedNodes[0]?.quality;
  if (primaryInjected) {
    return primaryInjected;
  }

  const topCandidateId = input.scorecard?.topCandidates?.[0]?.id;
  if (!topCandidateId) {
    return undefined;
  }

  const candidateNode = input.lookupNode(topCandidateId);
  return candidateNode ? deriveQualityBandExplanation(candidateNode) : undefined;
};

const buildRetrievalNotes = (scorecard?: InjectionScorecard): string[] => {
  if (!scorecard) {
    return [];
  }

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
    notes.push(
      `Runner-up candidates withheld: ${scorecard.rejectedCandidates.map((candidate) => candidate.id).join(", ")}.`
    );
  }

  return notes;
};

export class ExperienceInteractionService {
  private readonly db: DatabaseSync;
  private readonly config;
  private readonly hybridWorkerClient;
  private readonly inputRepo;
  private readonly injectionRepo;
  private readonly attributionRecordRepo;
  private readonly repoPolicyRepo;
  private readonly episodeRepo;
  private readonly nodeRepo;
  private readonly candidateRepo;
  private readonly jobRepo;
  private readonly hybridTraceRepo;
  private readonly taskRunRepo;
  private readonly outcomeRepo;
  private readonly reviewEventRepo;
  private readonly scopeRepo;

  constructor(config: ExperienceEngineConfig) {
    this.config = config;
    const db = openDatabase(config);
    bootstrapDatabase(db);
    this.db = db;
    this.inputRepo = new InputRecordRepository(db);
    this.injectionRepo = new InjectionRepository(db);
    this.attributionRecordRepo = new AttributionRecordRepository(db);
    this.repoPolicyRepo = new RepoPolicyRepository(db);
    this.episodeRepo = new EpisodeRepository(db);
    this.nodeRepo = new NodeRepository(db);
    this.candidateRepo = new CandidateRepository(db);
    this.jobRepo = new DistillationJobRepository(db);
    this.hybridTraceRepo = new HybridInvocationTraceRepository(db);
    this.taskRunRepo = new TaskRunRepository(db);
    this.outcomeRepo = new OutcomeRecordRepository(db);
    this.reviewEventRepo = new ReviewEventRepository(db);
    this.scopeRepo = new ScopeRepository(db);
    this.hybridWorkerClient = new HybridWorkerClient({
      explainDecisionEnabled: config.hybridEnabled && config.hybridSyncExplainEnabled,
      explainDecisionLlmEnabled:
        config.hybridEnabled && config.hybridSyncExplainEnabled && config.hybridExplainLlmEnabled
    });
  }

  private inspectGovernanceForReview(scopeId: string): OperatorReviewGovernanceSummary {
    const latestRun = this.db
      .prepare(
        `SELECT status, failure_class
         FROM hygiene_governance_runs
         WHERE scope_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(scopeId) as { status: string; failure_class: string | null } | undefined;
    const failedRuns = this.db
      .prepare("SELECT COUNT(*) AS count FROM hygiene_governance_runs WHERE scope_id = ? AND status = 'failed'")
      .get(scopeId) as { count: number };
    const recentAutomaticActions = this.db
      .prepare("SELECT COUNT(*) AS count FROM hygiene_governance_actions WHERE scope_id = ? AND status = 'applied'")
      .get(scopeId) as { count: number };
    const pendingApprovals = this.db
      .prepare("SELECT COUNT(*) AS count FROM hygiene_governance_approvals WHERE scope_id = ? AND status = 'pending'")
      .get(scopeId) as { count: number };
    const status = failedRuns.count > 0 || pendingApprovals.count > 0 ? "attention" : "clear";

    return {
      status,
      recentAutomaticActions: recentAutomaticActions.count,
      failedRuns: failedRuns.count,
      pendingApprovals: pendingApprovals.count,
      lastRunStatus: latestRun?.status,
      lastFailureClass: latestRun?.failure_class ?? undefined,
      drillDown: {
        cli: "ee inspect governance",
        mcpResource: "experienceengine://governance",
        brokerAction: "inspect_governance"
      }
    };
  }

  inspectGovernance(cwd: string = process.cwd()): {
    scopeId: string;
    status: "clear" | "attention";
    recentAutomaticActions: number;
    failedRuns: number;
    pendingApprovals: number;
    lastRunStatus?: string;
    lastFailureClass?: string;
    recentRuns: Array<{ runId: string; trigger: string; status: string; failureClass?: string; updatedAt: string }>;
    recentActions: Array<{ actionId: string; planId?: string; actionType: string; status: string; rollbackRef?: string; updatedAt: string }>;
  } {
    const scopeId = resolveScope(cwd).scope_id;
    const summary = this.inspectGovernanceForReview(scopeId);
    const recentRuns = this.db
      .prepare(
        `SELECT run_id, trigger, status, failure_class, updated_at
         FROM hygiene_governance_runs
         WHERE scope_id = ?
         ORDER BY updated_at DESC
         LIMIT 5`
      )
      .all(scopeId) as Array<{ run_id: string; trigger: string; status: string; failure_class: string | null; updated_at: string }>;
    const recentActions = this.db
      .prepare(
        `SELECT action_id, plan_id, action_type, status, before_snapshot_id, rollback_of_action_id, updated_at
         FROM hygiene_governance_actions
         WHERE scope_id = ?
         ORDER BY updated_at DESC
         LIMIT 5`
      )
      .all(scopeId) as Array<{
      action_id: string;
      plan_id: string | null;
      action_type: string;
      status: string;
      before_snapshot_id: string | null;
      rollback_of_action_id: string | null;
      updated_at: string;
    }>;

    return {
      scopeId,
      status: summary.status,
      recentAutomaticActions: summary.recentAutomaticActions,
      failedRuns: summary.failedRuns,
      pendingApprovals: summary.pendingApprovals,
      lastRunStatus: summary.lastRunStatus,
      lastFailureClass: summary.lastFailureClass,
      recentRuns: recentRuns.map((run) => ({
        runId: run.run_id,
        trigger: run.trigger,
        status: run.status,
        failureClass: run.failure_class ?? undefined,
        updatedAt: run.updated_at
      })),
      recentActions: recentActions.map((action) => ({
        actionId: action.action_id,
        planId: action.plan_id ?? undefined,
        actionType: action.action_type,
        status: action.status,
        rollbackRef: action.rollback_of_action_id ?? action.before_snapshot_id ?? undefined,
        updatedAt: action.updated_at
      }))
    };
  }

  inspectGovernancePendingApprovals(cwd: string = process.cwd()): {
    scopeId: string;
    approvals: Array<{
      approvalId: string;
      actionId: string;
      planId?: string;
      status: string;
      diffSummary?: string;
      createdAt: string;
      updatedAt: string;
    }>;
  } {
    const scopeId = resolveScope(cwd).scope_id;
    const approvals = this.db
      .prepare(
        `SELECT approval_id, action_id, plan_id, status, diff_summary, created_at, updated_at
         FROM hygiene_governance_approvals
         WHERE scope_id = ? AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 20`
      )
      .all(scopeId) as Array<{
      approval_id: string;
      action_id: string;
      plan_id: string | null;
      status: string;
      diff_summary: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return {
      scopeId,
      approvals: approvals.map((approval) => ({
        approvalId: approval.approval_id,
        actionId: approval.action_id,
        planId: approval.plan_id ?? undefined,
        status: approval.status,
        diffSummary: approval.diff_summary ?? undefined,
        createdAt: approval.created_at,
        updatedAt: approval.updated_at
      }))
    };
  }

  private deriveOriginProfile(node: ExperienceNode): NodeOriginProfile | undefined {
    return deriveNodeOriginProfileForNode(this.inputRepo, node);
  }

  decideExplainRoute(userMessage: string): HybridRouteDecision {
    return decideHybridExplainRoute(userMessage);
  }

  async explainLastDecision(cwd: string = process.cwd(), userMessage?: string): Promise<string> {
    const inspection = this.inspectLast(cwd);
    if (!inspection) {
      return "There is no recent ExperienceEngine intervention in this workspace yet.";
    }

    const fallback =
      inspection.decisionExplanation
      ?? "ExperienceEngine used the current bounded decision path, but no deeper explanation is stored for the latest turn.";

    if (!userMessage) {
      return fallback;
    }

    const rollout = resolveHybridRolloutState(this.config, `${cwd}:${userMessage}`);
    if (!rollout.hybridActive) {
      return fallback;
    }

    const routeDecision = this.decideExplainRoute(userMessage);
    if (routeDecision.route !== "ESCALATE_SYNC_EXPLAIN") {
      return fallback;
    }

    const capsule = buildExplainDecisionCapsule({
      schemaVersion: this.config.hybridCapsuleSchemaVersion,
      routeDecision,
      inspection
    });
    const providerResolution = this.config.hybridExplainLlmEnabled
      ? resolveHybridExplainProviderEndpoint(this.config, { homeDir: dirname(this.config.dataDir) })
      : { status: "disabled" as const, reason: "Phase 2 provider-backed explain is disabled." };
    const phase2ExplainRequested = this.config.hybridExplainLlmEnabled;
    const useProvider = providerResolution.status === "configured";
    const result =
      phase2ExplainRequested && providerResolution.status === "unavailable"
        ? ({
            status: "fallback",
            reason: "provider_unavailable"
          } as const)
        : await this.hybridWorkerClient.runExplainDecision(
            capsule,
            useProvider
              ? {
                  mode: "provider",
                  endpoint: providerResolution.endpoint
                }
              : undefined
          );
    const timestamp = nowIso();
    this.hybridTraceRepo.upsert({
      id: createId("hybridtrace"),
      surface: "interaction",
      session_id: inspection.sessionId,
      scope_id: inspection.scopeId,
      worker_task: "explain_decision",
      route: routeDecision.route,
      route_policy_version: routeDecision.policyVersion,
      capsule_schema_version: this.config.hybridCapsuleSchemaVersion,
      worker_profile_version: phase2ExplainRequested
        ? this.config.hybridExplainModelProfileVersion
        : this.config.hybridExplainDecisionProfileVersion,
      rollout_mode: rollout.effectiveMode,
      rollout_reason: rollout.reason,
      worker_ran: result.status !== "fallback" || result.reason !== "provider_unavailable",
      validation_status: result.status === "accepted" ? "accepted" : "fallback",
      output_action: result.status === "accepted" && rollout.userVisible ? "surfaced" : "none",
      fallback_reason: result.status === "accepted" ? undefined : result.reason,
      created_at: timestamp
    });
    if (!rollout.userVisible) {
      return fallback;
    }
    if (result.status !== "accepted") {
      return fallback;
    }

      return `${result.value.decision} ${result.value.reason}`.trim();
  }

  private inspectRecord(record: ExperienceInputRecord | undefined): ExperienceLastInspection | undefined {
    if (!record) {
      return undefined;
    }

    const episodeProjection = record.episode_id ? this.episodeRepo.getByEpisodeId(record.episode_id) : undefined;
    const injectionEvent = episodeProjection?.injection_events[0] ?? (record.session_id
      ? this.injectionRepo.getLatestBySessionId(record.session_id)
      : record.injected_node_ids.length
        ? this.injectionRepo.getLatest()
        : undefined);
    const selectedNodeIds = injectionEvent?.injected_node_ids?.length
      ? injectionEvent.injected_node_ids
      : record.injected_node_ids;
    const injectedNodes = this.nodeRepo.listByIds(selectedNodeIds);
    const attributionRecords = episodeProjection?.attribution_records ?? (injectionEvent
      ? this.attributionRecordRepo.listByInjectionId(injectionEvent.injection_id)
      : selectedNodeIds.flatMap((nodeId) => this.attributionRecordRepo.listByNodeId(nodeId)));
    const scorecard =
      injectionEvent?.scorecard ??
      (selectedNodeIds.length
        ? buildInjectionScorecard(
            {
              scope_id: record.scope_id,
              task_type: record.task_type,
              task_summary: record.task_summary,
              tool_events: [],
              outcome_signal: record.outcome_signal,
              context_summary: record.context_summary,
              injected_node_ids: selectedNodeIds
            },
            "inject",
            injectedNodes,
            record.session_id
          )
        : undefined);
    const taskRun = episodeProjection?.task_run ?? (record.session_id ? this.taskRunRepo.getLatestBySessionId(record.session_id) : undefined);
    const reviewEvents = episodeProjection?.review_events ?? (taskRun?.id ? this.reviewEventRepo.listByTaskRunId(taskRun.id) : []);
    const autoFeedback = summarizeAutomaticFeedback(reviewEvents);
    const intervention =
      injectionEvent?.mode === "skip"
        ? "skip"
        : selectedNodeIds.length === 0
        ? "skip"
        : injectionEvent && !injectionEvent.delivered
          ? injectionEvent.delivery_mode === "holdout"
            ? "holdout"
            : "shadow"
          : "inject";
    const outcomeRecord = episodeProjection?.outcome_records[0] ?? (taskRun?.id ? this.outcomeRepo.listByTaskRunId(taskRun.id)[0] : undefined);
    const latestAutomaticFeedback = reviewEvents.find((event) => event.source === "automatic");
    const autoFeedbackReason = inferAutoFeedbackReason({
      explicitReason: injectionEvent?.attribution_reason,
      autoFeedback,
      intervention,
      outcome: record.outcome_signal
    });
    const decisionExplanation = buildDecisionExplanation({ intervention, scorecard });
    const injectedNodeSummaries = injectedNodes.map(toNodeSummary);
    const qualityContext = buildQualityContext({
      scorecard,
      injectedNodes: injectedNodeSummaries,
      lookupNode: (nodeId) => this.nodeRepo.getById(nodeId)
    });
    return {
      sessionId: record.session_id,
      episodeId: record.episode_id,
      scopeId: record.scope_id,
      taskType: record.task_type,
      intervention,
      deliveryMode: injectionEvent?.delivery_mode,
      delivered: injectionEvent?.delivered,
      autoFeedback,
      autoFeedbackReason,
      attributionRecords,
      episodeProjection,
      outcome: record.outcome_signal,
      injectedNodes: injectedNodeSummaries,
      hints: injectedNodes.map((node) => node.compact_hint),
      evidence: record.evidence,
      scorecard,
      decisionExplanation,
      trustSummary: buildTrustSummary({ scorecard, injectedNodes: injectedNodeSummaries }),
      qualityContext,
      retrievalNotes: buildRetrievalNotes(scorecard),
      retrievalPolicySummary: buildRetrievalPolicyInspectionSummary(scorecard),
      timeline: buildLatestTimeline({
        record,
        taskRunCreatedAt: taskRun?.created_at,
        outcomeCreatedAt: outcomeRecord?.created_at,
        outcomeSummary: outcomeRecord?.summary,
        injectionCreatedAt: injectionEvent?.created_at,
        intervention,
        delivered: injectionEvent?.delivered,
        injectedCount: injectedNodes.length,
        autoFeedback,
        autoFeedbackCreatedAt: latestAutomaticFeedback?.created_at
      }),
      learningStatus: taskRun?.learning_status,
      learningReason: taskRun?.learning_reason,
      traceCapsuleId: record.trace_capsule_id,
      traceCompleteness: record.trace_completeness,
      traceProvenance: record.trace_provenance,
      summary: record.task_summary,
      createdAt: record.created_at
    };
  }

  private inspectInjectionEvent(event: InjectionEvent | undefined): ExperienceLastInspection | undefined {
    if (!event) {
      return undefined;
    }

    const episodeProjection = event.episode_id ? this.episodeRepo.getByEpisodeId(event.episode_id) : undefined;
    const taskRun = episodeProjection?.task_run ?? (event.session_id ? this.taskRunRepo.getLatestBySessionId(event.session_id) : undefined);
    const latestRecord = event.session_id ? this.inputRepo.getLatestBySessionId(event.session_id) : undefined;
    if (latestRecord) {
      return this.inspectRecord(latestRecord);
    }

    const injectedNodes = this.nodeRepo.listByIds(event.injected_node_ids);
    const attributionRecords = episodeProjection?.attribution_records ?? this.attributionRecordRepo.listByInjectionId(event.injection_id);
    const reviewEvents = episodeProjection?.review_events ?? (taskRun?.id ? this.reviewEventRepo.listByTaskRunId(taskRun.id) : []);
    const autoFeedback = summarizeAutomaticFeedback(reviewEvents);
    const latestAutomaticFeedback = reviewEvents.find((reviewEvent) => reviewEvent.source === "automatic");
    const intervention: ExperienceLastInspection["intervention"] = event.mode === "skip"
      ? "skip"
      : !event.delivered
      ? event.delivery_mode === "holdout"
        ? "holdout"
        : "shadow"
      : "inject";
    const outcomeRecord = episodeProjection?.outcome_records[0] ?? (taskRun?.id ? this.outcomeRepo.listByTaskRunId(taskRun.id)[0] : undefined);
    const outcome =
      outcomeRecord?.outcome_signal ??
      (taskRun?.final_status === "success" ? "success" : taskRun?.final_status === "failure" ? "failure" : "unknown");
    const summary = event.task_summary ?? taskRun?.task_summary ?? "Latest injection event";
    const decisionExplanation = buildDecisionExplanation({ intervention, scorecard: event.scorecard });
    const injectedNodeSummaries = injectedNodes.map(toNodeSummary);
    const qualityContext = buildQualityContext({
      scorecard: event.scorecard,
      injectedNodes: injectedNodeSummaries,
      lookupNode: (nodeId) => this.nodeRepo.getById(nodeId)
    });

    return {
      sessionId: event.session_id,
      episodeId: event.episode_id,
      scopeId: event.scope_id,
      taskType: event.task_type,
      intervention,
      deliveryMode: event.delivery_mode,
      delivered: event.delivered,
      autoFeedback,
      autoFeedbackReason: inferAutoFeedbackReason({
        explicitReason: event.attribution_reason,
        autoFeedback,
        intervention,
        outcome
      }),
      attributionRecords,
      episodeProjection,
      outcome,
      injectedNodes: injectedNodeSummaries,
      hints: injectedNodes.map((node) => node.compact_hint),
      evidence: [],
      scorecard: event.scorecard,
      decisionExplanation,
      trustSummary: buildTrustSummary({ scorecard: event.scorecard, injectedNodes: injectedNodeSummaries }),
      qualityContext,
      retrievalNotes: buildRetrievalNotes(event.scorecard),
      retrievalPolicySummary: buildRetrievalPolicyInspectionSummary(event.scorecard),
      timeline: buildLatestTimeline({
        record: {
          record_id: `injection:${event.injection_id}`,
          scope_id: event.scope_id,
          session_id: event.session_id,
          task_type: event.task_type,
          task_summary: summary,
          outcome_signal: outcome,
          context_summary: taskRun?.context_summary,
          evidence: [],
          injected_node_ids: event.injected_node_ids,
          created_at: event.created_at
        },
        taskRunCreatedAt: taskRun?.created_at,
        outcomeCreatedAt: outcomeRecord?.created_at,
        outcomeSummary: outcomeRecord?.summary,
        injectionCreatedAt: event.created_at,
        intervention,
        delivered: event.delivered,
        injectedCount: injectedNodes.length,
        autoFeedback,
        autoFeedbackCreatedAt: latestAutomaticFeedback?.created_at
      }),
      learningStatus: taskRun?.learning_status,
      learningReason: taskRun?.learning_reason,
      traceCapsuleId: taskRun?.trace_capsule_id,
      traceCompleteness: taskRun?.trace_completeness,
      traceProvenance: taskRun?.trace_provenance,
      summary,
      createdAt: event.created_at
    };
  }

  inspectLast(cwd: string = process.cwd()): ExperienceLastInspection | undefined {
    const scope = resolveScope(cwd);
    const latestRecordInScope = this.inputRepo.getLatestByScope(scope.scope_id);
    const latestInjectionInScope = this.injectionRepo.getLatestByScope(scope.scope_id);
    const latestScopedInspection =
      compareIsoDesc(latestInjectionInScope?.created_at, latestRecordInScope?.created_at) < 0
        ? this.inspectInjectionEvent(latestInjectionInScope)
        : this.inspectRecord(latestRecordInScope);

    if (latestScopedInspection) {
      return latestScopedInspection;
    }

    const latestRecord = this.inputRepo.getLatest();
    const latestInjection = this.injectionRepo.getLatest();
    return compareIsoDesc(latestInjection?.created_at, latestRecord?.created_at) < 0
      ? this.inspectInjectionEvent(latestInjection)
      : this.inspectRecord(latestRecord);
  }

  inspectLatestInjected(cwd: string = process.cwd()): ExperienceLastInspection | undefined {
    const scope = resolveScope(cwd);
    const latestScopedInjected = this.inputRepo.getLatestInjectedByScope(scope.scope_id);
    if (latestScopedInjected) {
      return this.inspectRecord(latestScopedInjected);
    }

    const latestInjected = this.inputRepo.getLatestInjected();
    return latestInjected ? this.inspectRecord(latestInjected) : undefined;
  }

  inspectRecent(options: { injectedOnly?: boolean; limit?: number } = {}): ExperienceRecentInspection[] {
    return this.inputRepo.listRecent(options).map((record) => ({
      sessionId: record.session_id,
      taskType: record.task_type,
      intervention: record.injected_node_ids.length ? "inject" : "skip",
      outcome: record.outcome_signal,
      createdAt: record.created_at,
      summary: record.task_summary
    }));
  }

  listActiveNodes(): ExperienceNodeSummary[] {
    return this.nodeRepo.listActive().map(toNodeSummary);
  }

  listAllNodes(): ExperienceNodeSummary[] {
    return this.nodeRepo.listAll().map(toNodeSummary);
  }

  inspectNode(nodeId: string): ExperienceNodeDetail | undefined {
    const node = this.nodeRepo.getById(nodeId);
    return node ? toNodeDetail(node) : undefined;
  }

  listNodesByState(state: ExperienceState): ExperienceNodeSummary[] {
    return this.nodeRepo.listByState(state).map(toNodeSummary);
  }

  listNodesByType(nodeType: ExperienceNodeType): ExperienceNodeSummary[] {
    return this.nodeRepo.listByType(nodeType).map(toNodeSummary);
  }

  inspectLearningSummary(): ExperienceLearningSummary {
    return this.buildLearningSummary();
  }

  inspectHygiene(cwd: string = process.cwd(), filters: Omit<HygieneReviewFilters, "scopeId"> & { scopeId?: string } = {}): HygieneReviewReport {
    const scopeId = filters.scopeId ?? resolveScope(cwd).scope_id;
    const candidateStates: CandidateLifecycleState[] = ["pending", "distilled", "failed", "discarded"];
    return buildHygieneReviewReport({
      nodes: this.nodeRepo.listByScope(scopeId),
      candidates: candidateStates.flatMap((state) => this.candidateRepo.listByLifecycleState(state)).filter((candidate) => candidate.scope_id === scopeId),
      attributionRecords: this.attributionRecordRepo.listRecentByScope(scopeId, Math.max(50, filters.limit ?? 20)),
      filters: {
        ...filters,
        scopeId
      }
    });
  }

  inspectExportDrafts(
    cwd: string = process.cwd(),
    filters: Omit<ExperienceExportDraftFilters, "scopeId"> & { scopeId?: string } = {}
  ): ExperienceExportDraftReport {
    const scopeId = filters.scopeId ?? resolveScope(cwd).scope_id;
    const candidateStates: CandidateLifecycleState[] = ["pending", "distilled", "failed", "discarded"];
    const nodes = this.nodeRepo.listByScope(scopeId);
    const explicitLowReadiness = Boolean(filters.nodeId || filters.risk || filters.state || filters.deliveryState);
    const candidateNodes = nodes
      .filter((node) => !filters.nodeId || node.id === filters.nodeId)
      .filter((node) => !filters.nodeType || node.node_type === filters.nodeType)
      .filter((node) => !filters.taskFamily || node.task_type === filters.taskFamily)
      .filter((node) => !filters.state || node.state === filters.state)
      .filter((node) => !filters.deliveryState || node.delivery_state === filters.deliveryState)
      .filter((node) => explicitLowReadiness || (node.state === "active" && (!node.delivery_state || node.delivery_state === "eligible") && node.harmed_count <= node.helped_count));
    const candidates = candidateStates
      .flatMap((state) => this.candidateRepo.listByLifecycleState(state))
      .filter((candidate) => candidate.scope_id === scopeId);
    const attributionRecordsById = new Map<string, AttributionRecord>();
    for (const record of this.attributionRecordRepo.listRecentByScope(scopeId, Math.max(50, filters.limit ?? 20))) {
      attributionRecordsById.set(record.id, record);
    }
    for (const node of candidateNodes) {
      for (const record of this.attributionRecordRepo.listByNodeId(node.id)) {
        attributionRecordsById.set(record.id, record);
      }
    }
    const attributionRecords = [...attributionRecordsById.values()];
    const hygiene = buildHygieneReviewReport({
      nodes,
      candidates,
      attributionRecords,
      filters: {
        scopeId,
        limit: Math.max(50, filters.limit ?? 20)
      }
    });

    return buildExperienceExportDraftReport({
      nodes,
      candidates,
      attributionRecords,
      hygieneFindings: hygiene.findings,
      filters: {
        ...filters,
        scopeId
      }
    });
  }

  inspectReview(cwd: string = process.cwd(), filters: { scopeId?: string; limit?: number } = {}): OperatorReviewReport {
    const scopeId = filters.scopeId ?? resolveScope(cwd).scope_id;
    const limit = filters.limit ?? 5;
    const repo = this.inspectRepoSummary(cwd);
    const hygiene = this.inspectHygiene(cwd, { scopeId, limit });
    const exportDrafts = this.inspectExportDrafts(cwd, { scopeId, limit });

    return buildOperatorReviewFlow({
      repo,
      hygiene,
      exportDrafts,
      governance: this.inspectGovernanceForReview(scopeId),
      limit
    });
  }

  private buildLearningSummary(scopeId?: string): ExperienceLearningSummary {
    const candidateStates: CandidateLifecycleState[] = ["pending", "distilled", "failed", "discarded"];
    const jobStates: DistillationJobState[] = ["pending", "processing", "succeeded", "failed", "discarded"];
    const nodeStates: ExperienceState[] = ["candidate", "priority_candidate", "active", "cooling", "retired"];
    const nodeSources: DistillationSource[] = ["explicit_provider", "rule", "disabled"];
    const attributionReasons: FeedbackAttributionReason[] = [
      "success_outcome",
      "relevant_failure",
      "environmental_failure",
      "exploratory_failure",
      "no_relevant_failure",
      "suppressed_delivery",
      "unknown_outcome"
    ];
    const latestRecord = scopeId ? this.inputRepo.getLatestByScope(scopeId) : this.inputRepo.getLatest();
    const allNodes = scopeId ? this.nodeRepo.listByScope(scopeId) : this.nodeRepo.listAll();
    const candidates = scopeId
      ? this.candidateRepo.listByScope(scopeId)
      : candidateStates.flatMap((state) => this.candidateRepo.listByLifecycleState(state));
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const jobs = jobStates.flatMap((state) => this.jobRepo.listByStatus(state)).filter((job) => candidateIds.has(job.candidate_id));
    const effectiveness = {
      decisions: scopeId ? this.injectionRepo.countByScope(scopeId) : this.injectionRepo.count(),
      live: scopeId ? this.injectionRepo.countByScopeAndDeliveryMode(scopeId, "live") : this.injectionRepo.countByDeliveryMode("live"),
      shadow: scopeId ? this.injectionRepo.countByScopeAndDeliveryMode(scopeId, "shadow") : this.injectionRepo.countByDeliveryMode("shadow"),
      holdout: scopeId ? this.injectionRepo.countByScopeAndDeliveryMode(scopeId, "holdout") : this.injectionRepo.countByDeliveryMode("holdout"),
      delivered: scopeId ? this.injectionRepo.countByScopeAndDelivered(scopeId, true) : this.injectionRepo.countByDelivered(true),
      suppressed: scopeId ? this.injectionRepo.countByScopeAndDelivered(scopeId, false) : this.injectionRepo.countByDelivered(false),
      automaticHelped: scopeId
        ? this.injectionRepo.countAutomaticFeedbackByScope(scopeId, "mark_helped")
        : this.injectionRepo.countAutomaticFeedback("mark_helped"),
      automaticHarmed: scopeId
        ? this.injectionRepo.countAutomaticFeedbackByScope(scopeId, "mark_harmed")
        : this.injectionRepo.countAutomaticFeedback("mark_harmed")
    };

    return {
      candidates: Object.fromEntries(
        candidateStates.map((state) => [state, candidates.filter((candidate) => candidate.lifecycle_state === state).length])
      ) as Record<CandidateLifecycleState, number>,
      jobs: Object.fromEntries(
        jobStates.map((state) => [state, jobs.filter((job) => job.status === state).length])
      ) as Record<DistillationJobState, number>,
      nodes: Object.fromEntries(
        nodeStates.map((state) => [state, allNodes.filter((node) => node.state === state).length])
      ) as Record<ExperienceState, number>,
      nodeSources: Object.fromEntries(
        nodeSources.map((source) => [
          source,
          allNodes.filter((node) => (node.distillation_source ?? "disabled") === source).length
        ])
      ) as Record<DistillationSource, number>,
      effectiveness,
      benchmark: buildBenchmarkSummary(effectiveness),
      attributionReasons: Object.fromEntries(
        attributionReasons.map((reason) => [
          reason,
          scopeId ? this.injectionRepo.countByScopeAndAttributionReason(scopeId, reason) : this.injectionRepo.countByAttributionReason(reason)
        ])
      ) as Record<FeedbackAttributionReason, number>,
      runtime: {
        records: scopeId ? this.inputRepo.countByScope(scopeId) : this.inputRepo.count(),
        taskRuns: scopeId ? this.taskRunRepo.countByScope(scopeId) : this.taskRunRepo.count(),
        outcomes: scopeId ? this.outcomeRepo.countByScope(scopeId) : this.outcomeRepo.count(),
        reviews: scopeId ? this.reviewEventRepo.countByNodeScope(scopeId) : this.reviewEventRepo.count()
      },
      latestRecordCreatedAt: latestRecord?.created_at
    };
  }

  inspectRepoSummary(cwd: string = process.cwd()): ExperienceRepoSummary {
    const scope = resolveScope(cwd);
    const latestRecord = this.inputRepo.getLatestByScope(scope.scope_id);
    const latest = latestRecord ? this.inspectRecord(latestRecord) : undefined;
    const learning = this.buildLearningSummary(scope.scope_id);
    const policyInspection = this.inspectRepoPolicy(cwd);
    const quality = summarizeQualityBandDistribution(
      this.nodeRepo.listByScope(scope.scope_id).map((node) => deriveQualityBandExplanation(node))
    );

    return buildRepoSummary({
      scope: {
        scopeId: scope.scope_id,
        scopeName: scope.scope_name,
        rootPath: scope.root_path
      },
      latest: latest && latest.scopeId === scope.scope_id ? latest : undefined,
      learning,
      quality,
      policyInspection
    });
  }

  inspectRepoPolicy(cwd: string = process.cwd()) {
    const scope = resolveScope(cwd);
    const policy =
      this.repoPolicyRepo.get(scope.scope_id) ??
      buildDefaultRepoPolicy(scope.scope_id, this.config.repoExperienceMode);
    return inspectRepoPolicyEvidence(
      policy,
      this.attributionRecordRepo.listRecentEligibleByScope(scope.scope_id),
      this.injectionRepo.listRecentResolvedByScope(scope.scope_id)
    );
  }

  restoreRepoPolicy(cwd: string = process.cwd()) {
    const scope = resolveScope(cwd);
    return this.repoPolicyRepo.restore(scope.scope_id, this.config.repoExperienceMode);
  }

  inspectFirstValueReadiness(cwd: string = process.cwd()): ExperienceFirstValueReadiness {
    const scope = resolveScope(cwd);
    const summary = this.buildLearningSummary(scope.scope_id);
    const rawRecords = summary.runtime.records;
    const taskRuns = summary.runtime.taskRuns;
    const candidates = summary.candidates.pending;
    const nodes = summary.nodes.candidate + summary.nodes.active + summary.nodes.cooling + summary.nodes.retired;

    let nextStep = "Keep working in the same repo so ExperienceEngine can compare similar tasks and promote durable hints.";
    if (nodes > 0) {
      nextStep = "Formal experience nodes already exist. Keep an eye on inspect --last and quick feedback to tune what stays active.";
    } else if (candidates > 0) {
      nextStep =
        "Keep working in the same repo on a few similar tasks. ExperienceEngine will promote formal hints once it sees enough repeated evidence.";
    } else if (rawRecords === 0 && taskRuns === 0) {
      nextStep = "Run a few real coding tasks in this repo so ExperienceEngine can start capturing task signals.";
    }

    return {
      rawRecords,
      taskRuns,
      candidates,
      nodes,
      nextStep
    };
  }

  inspectDecisionHealth(cwd: string = process.cwd(), limit = 10): ExperienceDecisionHealth {
    const scope = resolveScope(cwd);
    const recentRecords = this.inputRepo
      .listRecentByScope(scope.scope_id, auditWindowFetchLimit(limit))
      .filter((record) => !isAuditNoopInputRecord(record))
      .slice(0, limit);
    let recentInjects = 0;
    let recentConservativeInjects = 0;
    let recentSkips = 0;
    let recentPotentialMisfires = 0;
    let recentMetaDominantSelections = 0;
    let recentRealDevAlignedSelections = 0;
    let recentFastPathActivations = 0;
    let recentRerankParticipations = 0;
    let recentQueryRewriteUsages = 0;
    let recentSecondOpinionActivations = 0;
    let recentSecondOpinionSkips = 0;
    let recentSecondOpinionConservativeDowngrades = 0;
    const scopedNodes = this.nodeRepo.listByScope(scope.scope_id);
    const recentNodes = scopedNodes.slice(0, limit);
    const currentPriorityCandidates = scopedNodes.filter((node) => node.state === "priority_candidate").length;
    const recentConvergedUpdates = recentNodes.filter((node) => node.merge_decision === "UPDATE").length;
    const recentPriorityPromotions = recentNodes.filter((node) => node.priority_promotion_applied).length;
    let lastDecisionMode: ExperienceDecisionHealth["lastDecisionMode"];

    for (const record of recentRecords) {
      const injectionEvent = record.session_id
        ? this.injectionRepo.getLatestBySessionId(record.session_id)
        : undefined;
      const decisionMode = injectionEvent?.mode ?? "skip";

      if (!lastDecisionMode) {
        lastDecisionMode = decisionMode;
      }

      if (decisionMode === "inject") {
        recentInjects += 1;
      } else if (decisionMode === "inject_conservative") {
        recentConservativeInjects += 1;
      } else {
        recentSkips += 1;
      }

      if (isPotentialMisfire(injectionEvent)) {
        recentPotentialMisfires += 1;
      }

      const governance = deriveGovernanceSignals(injectionEvent?.scorecard);
      if (governance.metaDominant) {
        recentMetaDominantSelections += 1;
      }
      if (governance.realDevAligned) {
        recentRealDevAlignedSelections += 1;
      }

      if (injectionEvent?.scorecard?.fastPathApplied) {
        recentFastPathActivations += 1;
      }
      if (injectionEvent?.scorecard?.topCandidates?.some((candidate) => typeof candidate.rerankScore === "number")) {
        recentRerankParticipations += 1;
      }
      if (injectionEvent?.scorecard?.queryRewriteApplied) {
        recentQueryRewriteUsages += 1;
      }
      if (injectionEvent?.scorecard?.secondOpinionApplied) {
        recentSecondOpinionActivations += 1;
      }
      if (injectionEvent?.scorecard?.secondOpinionDecision === "skip") {
        recentSecondOpinionSkips += 1;
      }
      if (injectionEvent?.scorecard?.secondOpinionDecision === "allow_conservative") {
        recentSecondOpinionConservativeDowngrades += 1;
      }
    }

    return {
      scopeId: scope.scope_id,
      recentDecisions: recentRecords.length,
      recentInjects,
      recentConservativeInjects,
      recentSkips,
      recentPotentialMisfires,
      recentMetaDominantSelections,
      recentRealDevAlignedSelections,
      recentFastPathActivations,
      recentRerankParticipations,
      recentQueryRewriteUsages,
      recentSecondOpinionActivations,
      recentSecondOpinionSkips,
      recentSecondOpinionConservativeDowngrades,
      currentPriorityCandidates,
      recentConvergedUpdates,
      recentPriorityPromotions,
      lastDecisionMode
    };
  }

  inspectLearningQualityHealth(cwd: string = process.cwd(), limit = 50): ExperienceLearningQualityHealth {
    const scope = resolveScope(cwd);
    const recentTaskRuns = this.taskRunRepo
      .listRecentByScope(scope.scope_id, auditWindowFetchLimit(limit))
      .filter((run) => !isAuditNoopTaskRun(run))
      .slice(0, limit);
    const capturedRuns = recentTaskRuns.filter((run) => run.learning_status === "captured").length;
    const rejectedRuns = recentTaskRuns.filter((run) => run.learning_status === "rejected").length;
    const notApplicableRuns = recentTaskRuns.filter((run) => run.learning_status === "not_applicable").length;
    const learningApplicableRuns = capturedRuns + rejectedRuns;
    const rejectionReasons = Object.fromEntries(
      LEARNING_REJECTION_BUCKETS.map((bucket) => [bucket, 0])
    ) as Record<LearningRejectionBucket, number>;
    const rawReasonCounts = new Map<string, number>();

    for (const run of recentTaskRuns) {
      if (run.learning_status !== "rejected") {
        continue;
      }

      const bucket = classifyLearningRejectionReason(run.learning_reason);
      rejectionReasons[bucket] += 1;
      const rawReason = run.learning_reason?.trim() || "unknown";
      rawReasonCounts.set(rawReason, (rawReasonCounts.get(rawReason) ?? 0) + 1);
    }

    const recentResolvedInterventions = this.injectionRepo.listRecentResolvedByScope(scope.scope_id, limit);
    const attributionRecords = this.attributionRecordRepo.listRecentEligibleByScope(scope.scope_id, Math.max(limit, 50));
    const helpedInjectionIds = new Set(
      attributionRecords
        .filter((record) => record.injection_id && record.attribution_verdict.includes("helped"))
        .map((record) => record.injection_id as string)
    );
    const harmedInjectionIds = new Set(
      attributionRecords
        .filter((record) => record.injection_id && record.attribution_verdict.includes("harmed"))
        .map((record) => record.injection_id as string)
    );
    const resolvedInjectionIds = new Set(recentResolvedInterventions.map((event) => event.injection_id));
    const closedInjectionIds = new Set([...helpedInjectionIds, ...harmedInjectionIds]);
    const unresolved = [...resolvedInjectionIds].filter((id) => !closedInjectionIds.has(id)).length;

    return {
      scopeId: scope.scope_id,
      recentTaskRuns: recentTaskRuns.length,
      learningApplicableRuns,
      capturedRuns,
      rejectedRuns,
      notApplicableRuns,
      candidateAdmissionRate: learningApplicableRuns > 0 ? capturedRuns / learningApplicableRuns : 0,
      rejectionReasons,
      topRejectionReasons: [...rawReasonCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count })),
      genericAdviceRejections: rejectionReasons.generic_advice + rejectionReasons.no_transferable_value,
      feedbackClosure: {
        recentResolvedInterventions: recentResolvedInterventions.length,
        helped: helpedInjectionIds.size,
        harmed: harmedInjectionIds.size,
        unresolved
      }
    };
  }

  feedbackLast(feedback: FeedbackValue, cwd?: string): FeedbackResult {
    const scope = cwd ? resolveScope(cwd) : undefined;
    const record = scope
      ? this.inputRepo.getLatestInjectedByScope(scope.scope_id) ?? this.inputRepo.getLatestInjected()
      : this.inputRepo.getLatestInjected();
    if (!record) {
      return {
        status: "not_found",
        reason: "last_injected_missing"
      };
    }

    const nodes = this.nodeRepo.listByIds(record.injected_node_ids);
    if (!nodes.length) {
      return {
        status: "not_found",
        reason: "last_injected_missing"
      };
    }

    const taskRunId = record.session_id
      ? this.taskRunRepo.getLatestBySessionId(record.session_id)?.id
      : undefined;
    const episodeId = record.episode_id;
    const injectionEvent = record.session_id
      ? this.injectionRepo.getLatestBySessionId(record.session_id)
      : undefined;
    const evidenceRefs = [
      record.record_id,
      taskRunId,
      injectionEvent?.injection_id
    ].filter((value): value is string => Boolean(value));

    for (const node of nodes) {
      this.nodeRepo.upsert(applyGovernedNodeFeedback(node, feedback, this.deriveOriginProfile(node)));
      this.reviewEventRepo.upsert(
        toReviewEvent(node.id, feedback === "helped" ? "mark_helped" : "mark_harmed", "user", taskRunId, episodeId)
      );
      this.attributionRecordRepo.insert(
        toManualOverrideAttributionRecord({
          nodeId: node.id,
          feedback,
          injectionEvent,
          episodeId,
          evidenceRefs
        })
      );
    }

    return {
      status: "updated",
      feedback,
      nodeIds: nodes.map((node) => node.id)
    };
  }

  feedbackNode(nodeId: string, feedback: FeedbackValue): FeedbackResult {
    const node = this.nodeRepo.getById(nodeId);
    if (!node) {
      return {
        status: "not_found",
        reason: "node_missing",
        nodeId
      };
    }

    this.nodeRepo.upsert(applyGovernedNodeFeedback(node, feedback, this.deriveOriginProfile(node)));
    this.reviewEventRepo.upsert(
      toReviewEvent(nodeId, feedback === "helped" ? "mark_helped" : "mark_harmed", "user")
    );
    this.attributionRecordRepo.insert(
      toManualOverrideAttributionRecord({
        nodeId,
        feedback,
        evidenceRefs: [`manual:${nodeId}`]
      })
    );
    return {
      status: "updated",
      feedback,
      nodeIds: [nodeId]
    };
  }

  disableScope(cwd?: string): ScopeToggleResult {
    return this.setScopeDisabled(cwd, true);
  }

  enableScope(cwd?: string): ScopeToggleResult {
    return this.setScopeDisabled(cwd, false);
  }

  coolNode(nodeId: string): NodeLifecycleResult {
    return this.setNodeState(nodeId, "cooling");
  }

  retireNode(nodeId: string): NodeLifecycleResult {
    return this.setNodeState(nodeId, "retired");
  }

  private setScopeDisabled(cwd: string | undefined, disabled: boolean): ScopeToggleResult {
    const resolvedScope = resolveScope(cwd);
    const existing = this.scopeRepo.getById(resolvedScope.scope_id);
    const changed = (existing?.is_disabled ?? false) !== disabled;
    const next = this.scopeRepo.upsert({
      ...resolvedScope,
      is_disabled: disabled,
      created_at: existing?.created_at ?? resolvedScope.created_at,
      updated_at: nowIso()
    });

    return {
      scopeId: next.scope_id,
      scopeName: next.scope_name,
      rootPath: next.root_path,
      isDisabled: next.is_disabled,
      changed
    };
  }

  private setNodeState(nodeId: string, state: ExperienceNode["state"]): NodeLifecycleResult {
    const updated = this.nodeRepo.updateState(nodeId, state);
    if (!updated) {
      return {
        status: "not_found",
        nodeId
      };
    }

    this.reviewEventRepo.upsert(
      toReviewEvent(nodeId, state === "cooling" ? "cool" : "retire", "user")
    );

    return {
      status: "updated",
      nodeId,
      state: updated.state
    };
  }
}
