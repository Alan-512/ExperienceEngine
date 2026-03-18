import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { resolveScope } from "../input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { OutcomeRecordRepository } from "../store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import type {
  CandidateLifecycleState,
  DistillationJobState,
  ExperienceInputRecord,
  ExperienceNode,
  ExperienceNodeType,
  ExperienceState,
  ReviewEvent
} from "../types/domain.js";
import { transitionState } from "../feedback/state-transition.js";
import { nowIso } from "../utils/clock.js";
import { createId } from "../utils/ids.js";

export type ExperienceNodeSummary = {
  id: string;
  type: ExperienceNode["node_type"];
  taskType: ExperienceNode["task_type"];
  state: ExperienceNode["state"];
  sourceKind: ExperienceNode["source_kind"];
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

export type ExperienceLastInspection = {
  sessionId?: string;
  scopeId: string;
  taskType: ExperienceInputRecord["task_type"];
  intervention: "inject" | "skip";
  outcome: ExperienceInputRecord["outcome_signal"];
  injectedNodes: ExperienceNodeSummary[];
  hints: string[];
  evidence: string[];
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
    last_helped_at: feedback === "helped" ? timestamp : node.last_helped_at,
    last_harmed_at: feedback === "harmed" ? timestamp : node.last_harmed_at,
    updated_at: timestamp
  };

  return {
    ...next,
    state: node.state === "retired" ? "retired" : transitionState(next)
  };
};

export class ExperienceInteractionService {
  private readonly inputRepo;
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
    this.nodeRepo = new NodeRepository(db);
    this.candidateRepo = new CandidateRepository(db);
    this.jobRepo = new DistillationJobRepository(db);
    this.taskRunRepo = new TaskRunRepository(db);
    this.outcomeRepo = new OutcomeRecordRepository(db);
    this.reviewEventRepo = new ReviewEventRepository(db);
    this.scopeRepo = new ScopeRepository(db);
  }

  inspectLast(): ExperienceLastInspection | undefined {
    const record = this.inputRepo.getLatest();
    if (!record) {
      return undefined;
    }

    const injectedNodes = this.nodeRepo.listByIds(record.injected_node_ids);
    return {
      sessionId: record.session_id,
      scopeId: record.scope_id,
      taskType: record.task_type,
      intervention: record.injected_node_ids.length ? "inject" : "skip",
      outcome: record.outcome_signal,
      injectedNodes: injectedNodes.map(toNodeSummary),
      hints: injectedNodes.map((node) => node.compact_hint),
      evidence: record.evidence,
      summary: record.task_summary,
      createdAt: record.created_at
    };
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
    const candidateStates: CandidateLifecycleState[] = ["pending", "distilled", "failed", "discarded"];
    const jobStates: DistillationJobState[] = ["pending", "processing", "succeeded", "failed", "discarded"];
    const nodeStates: ExperienceState[] = ["candidate", "active", "cooling", "retired"];
    const latestRecord = this.inputRepo.getLatest();

    return {
      candidates: Object.fromEntries(
        candidateStates.map((state) => [state, this.candidateRepo.listByLifecycleState(state).length])
      ) as Record<CandidateLifecycleState, number>,
      jobs: Object.fromEntries(
        jobStates.map((state) => [state, this.jobRepo.listByStatus(state).length])
      ) as Record<DistillationJobState, number>,
      nodes: Object.fromEntries(
        nodeStates.map((state) => [state, this.nodeRepo.listByState(state).length])
      ) as Record<ExperienceState, number>,
      runtime: {
        records: this.inputRepo.count(),
        taskRuns: this.taskRunRepo.count(),
        outcomes: this.outcomeRepo.count(),
        reviews: this.reviewEventRepo.count()
      },
      latestRecordCreatedAt: latestRecord?.created_at
    };
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
