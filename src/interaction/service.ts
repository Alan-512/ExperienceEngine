import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { buildInjectionScorecard } from "../controller/injection-scorecard.js";
import { buildBenchmarkSummary, type BenchmarkSummary } from "../evaluation/benchmark-summary.js";
import { resolveScope } from "../input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
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
  InjectionEvent,
  InjectionScorecard,
  ExperienceNode,
  ExperienceNodeType,
  ExperienceState,
  ReviewEvent
} from "../types/domain.js";
import { transitionState, transitionValidationState } from "../feedback/state-transition.js";
import { nowIso } from "../utils/clock.js";
import { createId } from "../utils/ids.js";
import {
  buildRepoSummary,
  type ExperienceRepoSummary
} from "./repo-summary.js";

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
};

export type ExperienceTimelineEntry = {
  kind: "decision" | "outcome" | "feedback";
  createdAt: string;
  summary: string;
};

export type ExperienceLastInspection = {
  sessionId?: string;
  scopeId: string;
  taskType: ExperienceInputRecord["task_type"];
  intervention: "inject" | "skip" | "shadow" | "holdout";
  deliveryMode?: EvaluationMode;
  delivered?: boolean;
  autoFeedback: "helped" | "harmed" | "none";
  autoFeedbackReason?: InjectionEvent["attribution_reason"];
  outcome: ExperienceInputRecord["outcome_signal"];
  injectedNodes: ExperienceNodeSummary[];
  hints: string[];
  evidence: string[];
  scorecard?: InjectionScorecard;
  timeline: ExperienceTimelineEntry[];
  learningStatus?: TaskRun["learning_status"];
  learningReason?: string;
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

export type ExperienceDecisionHealth = {
  scopeId: string;
  recentDecisions: number;
  recentInjects: number;
  recentConservativeInjects: number;
  recentSkips: number;
  recentFastPathActivations: number;
  recentRerankParticipations: number;
  recentQueryRewriteUsages: number;
  currentPriorityCandidates: number;
  recentConvergedUpdates: number;
  recentPriorityPromotions: number;
  lastDecisionMode?: "inject" | "inject_conservative" | "skip";
};

const toReviewEvent = (
  nodeId: string,
  eventType: ReviewEvent["event_type"],
  source: ReviewEvent["source"],
  taskRunId?: string
): ReviewEvent => ({
  id: createId("review"),
  node_id: nodeId,
  task_run_id: taskRunId,
  event_type: eventType,
  source,
  created_at: nowIso()
});

const toNodeSummary = (node: ExperienceNode): ExperienceNodeSummary => ({
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
  hint: node.compact_hint
});

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
  harmedRecordIds: node.harmed_record_ids
});

const applyNodeFeedback = (node: ExperienceNode, feedback: FeedbackValue): ExperienceNode => {
  const timestamp = nowIso();

  const next = {
    ...node,
    helped_count: feedback === "helped" ? node.helped_count + 1 : node.helped_count,
    harmed_count: feedback === "harmed" ? node.harmed_count + 1 : node.harmed_count,
    validation_state: transitionValidationState(node, feedback),
    last_helped_at: feedback === "helped" ? timestamp : node.last_helped_at,
    last_harmed_at: feedback === "harmed" ? timestamp : node.last_harmed_at,
    updated_at: timestamp
  };

  return {
    ...next,
    state: node.state === "retired" ? "retired" : transitionState(next)
  };
};

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

export class ExperienceInteractionService {
  private readonly inputRepo;
  private readonly injectionRepo;
  private readonly nodeRepo;
  private readonly candidateRepo;
  private readonly jobRepo;
  private readonly taskRunRepo;
  private readonly outcomeRepo;
  private readonly reviewEventRepo;
  private readonly scopeRepo;

  constructor(config: ExperienceEngineConfig) {
    const db = openDatabase(config);
    bootstrapDatabase(db);
    this.inputRepo = new InputRecordRepository(db);
    this.injectionRepo = new InjectionRepository(db);
    this.nodeRepo = new NodeRepository(db);
    this.candidateRepo = new CandidateRepository(db);
    this.jobRepo = new DistillationJobRepository(db);
    this.taskRunRepo = new TaskRunRepository(db);
    this.outcomeRepo = new OutcomeRecordRepository(db);
    this.reviewEventRepo = new ReviewEventRepository(db);
    this.scopeRepo = new ScopeRepository(db);
  }

  private inspectRecord(record: ExperienceInputRecord | undefined): ExperienceLastInspection | undefined {
    if (!record) {
      return undefined;
    }

    const injectionEvent = record.session_id
      ? this.injectionRepo.getLatestBySessionId(record.session_id)
      : record.injected_node_ids.length
        ? this.injectionRepo.getLatest()
        : undefined;
    const selectedNodeIds = injectionEvent?.injected_node_ids?.length
      ? injectionEvent.injected_node_ids
      : record.injected_node_ids;
    const injectedNodes = this.nodeRepo.listByIds(selectedNodeIds);
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
    const taskRun = record.session_id ? this.taskRunRepo.getLatestBySessionId(record.session_id) : undefined;
    const reviewEvents = taskRun?.id ? this.reviewEventRepo.listByTaskRunId(taskRun.id) : [];
    const autoFeedback = summarizeAutomaticFeedback(reviewEvents);
    const intervention =
      selectedNodeIds.length === 0
        ? "skip"
        : injectionEvent && !injectionEvent.delivered
          ? injectionEvent.delivery_mode === "holdout"
            ? "holdout"
            : "shadow"
          : "inject";
    const outcomeRecord = taskRun?.id ? this.outcomeRepo.listByTaskRunId(taskRun.id)[0] : undefined;
    const latestAutomaticFeedback = reviewEvents.find((event) => event.source === "automatic");
    const autoFeedbackReason = inferAutoFeedbackReason({
      explicitReason: injectionEvent?.attribution_reason,
      autoFeedback,
      intervention,
      outcome: record.outcome_signal
    });
    return {
      sessionId: record.session_id,
      scopeId: record.scope_id,
      taskType: record.task_type,
      intervention,
      deliveryMode: injectionEvent?.delivery_mode,
      delivered: injectionEvent?.delivered,
      autoFeedback,
      autoFeedbackReason,
      outcome: record.outcome_signal,
      injectedNodes: injectedNodes.map(toNodeSummary),
      hints: injectedNodes.map((node) => node.compact_hint),
      evidence: record.evidence,
      scorecard,
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
      summary: record.task_summary,
      createdAt: record.created_at
    };
  }

  private inspectInjectionEvent(event: InjectionEvent | undefined): ExperienceLastInspection | undefined {
    if (!event) {
      return undefined;
    }

    const taskRun = event.session_id ? this.taskRunRepo.getLatestBySessionId(event.session_id) : undefined;
    const latestRecord = event.session_id ? this.inputRepo.getLatestBySessionId(event.session_id) : undefined;
    if (latestRecord) {
      return this.inspectRecord(latestRecord);
    }

    const injectedNodes = this.nodeRepo.listByIds(event.injected_node_ids);
    const reviewEvents = taskRun?.id ? this.reviewEventRepo.listByTaskRunId(taskRun.id) : [];
    const autoFeedback = summarizeAutomaticFeedback(reviewEvents);
    const latestAutomaticFeedback = reviewEvents.find((reviewEvent) => reviewEvent.source === "automatic");
    const intervention: ExperienceLastInspection["intervention"] = !event.delivered
      ? event.delivery_mode === "holdout"
        ? "holdout"
        : "shadow"
      : "inject";
    const outcomeRecord = taskRun?.id ? this.outcomeRepo.listByTaskRunId(taskRun.id)[0] : undefined;
    const outcome =
      outcomeRecord?.outcome_signal ??
      (taskRun?.final_status === "success" ? "success" : taskRun?.final_status === "failure" ? "failure" : "unknown");
    const summary = event.task_summary ?? taskRun?.task_summary ?? "Latest injection event";

    return {
      sessionId: event.session_id,
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
      outcome,
      injectedNodes: injectedNodes.map(toNodeSummary),
      hints: injectedNodes.map((node) => node.compact_hint),
      evidence: [],
      scorecard: event.scorecard,
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

    return buildRepoSummary({
      scope: {
        scopeId: scope.scope_id,
        scopeName: scope.scope_name,
        rootPath: scope.root_path
      },
      latest: latest && latest.scopeId === scope.scope_id ? latest : undefined,
      learning
    });
  }

  inspectFirstValueReadiness(): ExperienceFirstValueReadiness {
    const summary = this.inspectLearningSummary();
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
    const recentRecords = this.inputRepo.listRecentByScope(scope.scope_id, limit);
    let recentInjects = 0;
    let recentConservativeInjects = 0;
    let recentSkips = 0;
    let recentFastPathActivations = 0;
    let recentRerankParticipations = 0;
    let recentQueryRewriteUsages = 0;
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

      if (injectionEvent?.scorecard?.fastPathApplied) {
        recentFastPathActivations += 1;
      }
      if (injectionEvent?.scorecard?.topCandidates?.some((candidate) => typeof candidate.rerankScore === "number")) {
        recentRerankParticipations += 1;
      }
      if (injectionEvent?.scorecard?.queryRewriteApplied) {
        recentQueryRewriteUsages += 1;
      }
    }

    return {
      scopeId: scope.scope_id,
      recentDecisions: recentRecords.length,
      recentInjects,
      recentConservativeInjects,
      recentSkips,
      recentFastPathActivations,
      recentRerankParticipations,
      recentQueryRewriteUsages,
      currentPriorityCandidates,
      recentConvergedUpdates,
      recentPriorityPromotions,
      lastDecisionMode
    };
  }

  feedbackLast(feedback: FeedbackValue): FeedbackResult {
    const record = this.inputRepo.getLatestInjected();
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

    for (const node of nodes) {
      this.nodeRepo.upsert(applyNodeFeedback(node, feedback));
      this.reviewEventRepo.upsert(
        toReviewEvent(node.id, feedback === "helped" ? "mark_helped" : "mark_harmed", "user", taskRunId)
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

    this.nodeRepo.upsert(applyNodeFeedback(node, feedback));
    this.reviewEventRepo.upsert(
      toReviewEvent(nodeId, feedback === "helped" ? "mark_helped" : "mark_harmed", "user")
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
