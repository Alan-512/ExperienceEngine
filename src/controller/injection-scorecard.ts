import type {
  ExperienceInput,
  ExperienceNode,
  InjectionScorecardCandidate,
  InjectionMode,
  InjectionRiskLevel,
  InjectionScorecard,
  InjectionScorecardNode
} from "../types/domain.js";
import { nowIso } from "../utils/clock.js";

const riskOrder: Record<InjectionRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2
};

const maxRisk = (left: InjectionRiskLevel, right: InjectionRiskLevel): InjectionRiskLevel =>
  riskOrder[left] >= riskOrder[right] ? left : right;

const hasActiveExactFamilyCoverage = (nodes: ExperienceNode[], candidate: ExperienceNode): boolean =>
  nodes.some(
    (node) =>
      node.id !== candidate.id &&
      node.node_type === "strategy" &&
      node.state === "active" &&
      node.task_type === candidate.task_type
  );

const deriveNodeRiskLevel = (node: ExperienceNode, nodes: ExperienceNode[]): InjectionRiskLevel => {
  if (node.state === "candidate") {
    return hasActiveExactFamilyCoverage(nodes, node) ? "medium" : "high";
  }

  if (node.harmed_count > node.helped_count) {
    return "high";
  }

  if (node.state === "cooling" || node.harmed_count > 0 || node.node_type === "warning") {
    return "medium";
  }

  return "low";
};

export const deriveInjectionRiskLevel = (nodes: ExperienceNode[]): InjectionRiskLevel => {
  let level: InjectionRiskLevel = "low";
  for (const node of nodes) {
    level = maxRisk(level, deriveNodeRiskLevel(node, nodes));
  }
  return level;
};

const buildNodeReasons = (input: ExperienceInput, node: ExperienceNode): string[] => {
  const reasons: string[] = [];
  if (node.task_type === input.task_type) {
    reasons.push("Exact task-family match was found in historical experience.");
  } else if (node.task_type === "general") {
    reasons.push("General task-family fallback matched this task.");
  } else {
    reasons.push("Related task-family experience matched this task.");
  }

  if (node.state === "candidate") {
    reasons.push("This node is still in candidate state, so ExperienceEngine used conservative injection.");
  } else if (node.state === "cooling") {
    reasons.push("This node is in cooling state and should be applied more carefully.");
  } else {
    reasons.push("This node is active and has cleared the current evidence threshold.");
  }

  if (node.helped_count > 0) {
    reasons.push(`This node has helped ${node.helped_count} time(s) before.`);
  }
  if (node.harmed_count > 0) {
    reasons.push(`This node has harmed ${node.harmed_count} time(s) before.`);
  }
  if (node.distillation_source) {
    reasons.push(`This node was distilled via ${node.distillation_source}.`);
  }
  return reasons;
};

const buildNodeScorecard = (
  input: ExperienceInput,
  node: ExperienceNode,
  nodes: ExperienceNode[]
): InjectionScorecardNode => ({
  id: node.id,
  nodeType: node.node_type,
  state: node.state,
  sourceKind: node.source_kind,
  distillationSource: node.distillation_source,
  triggerPattern: node.trigger_pattern,
  hint: node.compact_hint,
  helped: node.helped_count,
  harmed: node.harmed_count,
  supportCount: node.support_count,
  riskLevel: deriveNodeRiskLevel(node, nodes),
  whyMatched: buildNodeReasons(input, node)
});

const recommendationForRisk = (riskLevel: InjectionRiskLevel): string => {
  switch (riskLevel) {
    case "high":
      return "Review these hints carefully and verify with the narrowest possible loop.";
    case "medium":
      return "Use these hints selectively and confirm with a focused verification step.";
    case "low":
    default:
      return "Apply these hints normally, then mark helped or harmed after the task.";
  }
};

const summarizeReasons = (nodes: InjectionScorecardNode[], mode: Exclude<InjectionMode, "skip">): string[] => {
  const reasons = new Set<string>();
  if (mode === "inject_conservative") {
    reasons.add("ExperienceEngine chose conservative injection because the top match still needs more runtime evidence.");
  }
  for (const node of nodes) {
    for (const reason of node.whyMatched.slice(0, 2)) {
      reasons.add(reason);
    }
  }
  return [...reasons];
};

export const buildInjectionScorecard = (
  input: ExperienceInput,
  mode: Exclude<InjectionMode, "skip">,
  nodes: ExperienceNode[],
  sessionId?: string,
  diagnostics?: {
    topCandidates?: InjectionScorecardCandidate[];
    topCandidateScore?: number;
    scoreMargin?: number;
    fastPathApplied?: boolean;
    gateReason?: string;
    decisionReason?: string;
  }
): InjectionScorecard => {
  const scoredNodes = nodes.map((node) => buildNodeScorecard(input, node, nodes));
  const riskLevel = scoredNodes.reduce<InjectionRiskLevel>(
    (current, node) => maxRisk(current, node.riskLevel),
    "low"
  );

  return {
    sessionId,
    scopeId: input.scope_id,
    taskType: input.task_type === "unknown" ? "general" : input.task_type,
    taskSummary: input.task_summary,
    mode,
    riskLevel,
    recommendation: recommendationForRisk(riskLevel),
    reasons: summarizeReasons(scoredNodes, mode),
    topCandidates: diagnostics?.topCandidates,
    topCandidateScore: diagnostics?.topCandidateScore,
    scoreMargin: diagnostics?.scoreMargin,
    fastPathApplied: diagnostics?.fastPathApplied,
    gateReason: diagnostics?.gateReason,
    decisionReason: diagnostics?.decisionReason,
    nodes: scoredNodes,
    createdAt: nowIso()
  };
};
