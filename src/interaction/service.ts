import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { resolveScope } from "../input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import type { ExperienceInputRecord, ExperienceNode, ExperienceState, ExperienceNodeType } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";

export type ExperienceNodeSummary = {
  id: string;
  type: ExperienceNode["node_type"];
  taskType: ExperienceNode["task_type"];
  state: ExperienceNode["state"];
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

const toNodeSummary = (node: ExperienceNode): ExperienceNodeSummary => ({
  id: node.id,
  type: node.node_type,
  taskType: node.task_type,
  state: node.state,
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
  recommendedSteps: node.recommended_steps ?? []
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
}
