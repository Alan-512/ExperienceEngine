import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { resolveScope } from "../input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import type {
  ExperienceInputRecord,
  ExperienceNode,
  ExperienceNodeType,
  ExperienceState,
  TaskType
} from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";
import { embedText } from "../store/vector/embeddings.js";

export type ExperienceNodeSummary = {
  id: string;
  type: ExperienceNode["node_type"];
  taskType: ExperienceNode["task_type"];
  state: ExperienceNode["state"];
  sourceKind: ExperienceNode["source_kind"];
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

export type RememberExperienceInput = {
  cwd?: string;
  triggerPattern: string;
  hint: string;
  taskType?: TaskType;
  nodeType?: ExperienceNode["node_type"];
  goal?: string;
  applicability?: string;
  successSignal?: string;
  recommendedSteps?: string[];
  avoidSteps?: string[];
};

export type RememberExperienceResult =
  | {
      status: "created";
      node: ExperienceNodeDetail;
    }
  | {
      status: "invalid";
      errors: string[];
    };

const toNodeSummary = (node: ExperienceNode): ExperienceNodeSummary => ({
  id: node.id,
  type: node.node_type,
  taskType: node.task_type,
  state: node.state,
  sourceKind: node.source_kind,
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

  return {
    ...node,
    helped_count: feedback === "helped" ? node.helped_count + 1 : node.helped_count,
    harmed_count: feedback === "harmed" ? node.harmed_count + 1 : node.harmed_count,
    last_helped_at: feedback === "helped" ? timestamp : node.last_helped_at,
    last_harmed_at: feedback === "harmed" ? timestamp : node.last_harmed_at,
    updated_at: timestamp
  };
};

const DEFAULT_STRATEGY_SUCCESS_SIGNAL = "The same verification loop completes cleanly for the targeted task.";
const DEFAULT_WARNING_SUCCESS_SIGNAL = "A narrower reproduction or a different evidence-backed path is identified.";

const normalizeList = (items: string[] | undefined): string[] | undefined => {
  const normalized = (items ?? []).map((item) => item.trim()).filter(Boolean);
  return normalized.length ? normalized : undefined;
};

const validateRememberInput = (input: RememberExperienceInput): string[] => {
  const errors: string[] = [];

  if (!input.triggerPattern.trim()) {
    errors.push("triggerPattern is required.");
  }

  if (input.triggerPattern.trim().length < 12) {
    errors.push("triggerPattern must be at least 12 characters.");
  }

  if (!input.hint.trim()) {
    errors.push("hint is required.");
  }

  if (input.hint.trim().length < 16) {
    errors.push("hint must be at least 16 characters.");
  }

  return errors;
};

export class ExperienceInteractionService {
  private readonly inputRepo;
  private readonly nodeRepo;
  private readonly scopeRepo;

  constructor(config: ExperienceEngineConfig) {
    const db = openDatabase(config);
    bootstrapDatabase(db);
    this.inputRepo = new InputRecordRepository(db);
    this.nodeRepo = new NodeRepository(db);
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

    for (const node of nodes) {
      this.nodeRepo.upsert(applyNodeFeedback(node, feedback));
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

  rememberExperience(input: RememberExperienceInput): RememberExperienceResult {
    const errors = validateRememberInput(input);
    if (errors.length) {
      return {
        status: "invalid",
        errors
      };
    }

    const scope = resolveScope(input.cwd);
    const timestamp = nowIso();
    const nodeType = input.nodeType ?? "strategy";
    const taskType = input.taskType ?? "general";
    const successSignal =
      input.successSignal?.trim() ||
      (nodeType === "warning" ? DEFAULT_WARNING_SUCCESS_SIGNAL : DEFAULT_STRATEGY_SUCCESS_SIGNAL);
    const originRecordId = stableId(
      "manual_origin",
      [scope.scope_id, taskType, nodeType, input.triggerPattern.trim(), input.hint.trim()].join(":")
    );
    const node: ExperienceNode = {
      id: stableId(
        "node",
        [scope.scope_id, taskType, nodeType, input.triggerPattern.trim(), input.hint.trim()].join(":")
      ),
      node_type: nodeType,
      scope_id: scope.scope_id,
      task_type: taskType,
      trigger_pattern: input.triggerPattern.trim(),
      applicability_notes: input.applicability?.trim() || undefined,
      env_signature: undefined,
      compact_hint: input.hint.trim(),
      goal: input.goal?.trim() || undefined,
      recommended_steps: nodeType === "strategy" ? normalizeList(input.recommendedSteps) : undefined,
      avoid_steps: nodeType === "warning" ? normalizeList(input.avoidSteps) : undefined,
      fallback_steps: undefined,
      success_signal: successSignal,
      stop_condition: undefined,
      escalation_condition: undefined,
      evidence_summary: "Manually authored experience.",
      retrieval_text: [
        input.triggerPattern.trim(),
        input.hint.trim(),
        input.goal?.trim(),
        input.applicability?.trim()
      ]
        .filter(Boolean)
        .join("\n"),
      embedding: embedText(
        [
          input.triggerPattern.trim(),
          input.hint.trim(),
          input.goal?.trim(),
          input.applicability?.trim()
        ]
          .filter(Boolean)
          .join("\n")
      ),
      source_kind: "user_authored_candidate_promoted",
      origin_record_ids: [originRecordId],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "active",
      usage_count: 0,
      helped_count: 0,
      harmed_count: 0,
      support_count: 1,
      last_used_at: undefined,
      last_helped_at: undefined,
      last_harmed_at: undefined,
      created_at: timestamp,
      updated_at: timestamp
    };

    this.scopeRepo.upsert({
      ...scope,
      is_disabled: this.scopeRepo.getById(scope.scope_id)?.is_disabled ?? false
    });
    this.nodeRepo.upsert(node);

    return {
      status: "created",
      node: toNodeDetail(node)
    };
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

    return {
      status: "updated",
      nodeId,
      state: updated.state
    };
  }
}
