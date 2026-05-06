import type {
  ExperienceInput,
  ExperienceNode,
  PolicyEnrichmentComponent,
  RetrievalContext,
  TaskType
} from "../types/domain.js";
import {
  deriveNodeManagementSignals,
  deriveTaskManagementSignals
} from "../experience-management/task-management-signals.js";
import { tokenize } from "../utils/text.js";

const TASK_FAMILY_PROXIMITY: Record<TaskType, Partial<Record<TaskType, number>>> = {
  bug_fix: {
    bug_fix: 1,
    test_debug: 0.92,
    build_debug: 0.82,
    integration_fix: 0.86,
    general: 0.72
  },
  build_debug: {
    build_debug: 1,
    bug_fix: 0.82,
    config_debug: 0.72,
    integration_fix: 0.7,
    general: 0.65
  },
  config_debug: {
    config_debug: 1,
    integration_fix: 0.84,
    bug_fix: 0.8,
    build_debug: 0.72,
    general: 0.72
  },
  test_debug: {
    test_debug: 1,
    bug_fix: 0.92,
    integration_fix: 0.78,
    general: 0.7
  },
  integration_fix: {
    integration_fix: 1,
    config_debug: 0.84,
    bug_fix: 0.86,
    test_debug: 0.78,
    build_debug: 0.7,
    general: 0.68
  },
  feature_add: {
    feature_add: 1,
    refactor: 0.78,
    performance: 0.7,
    general: 0.75
  },
  refactor: {
    refactor: 1,
    feature_add: 0.78,
    performance: 0.65,
    general: 0.72
  },
  performance: {
    performance: 1,
    feature_add: 0.7,
    refactor: 0.65,
    general: 0.7
  },
  general: {
    general: 1,
    bug_fix: 0.72,
    build_debug: 0.65,
    config_debug: 0.72,
    test_debug: 0.7,
    integration_fix: 0.68,
    feature_add: 0.75,
    refactor: 0.72,
    performance: 0.7
  }
};

const LEGACY_GENERIC_HINT_PATTERNS = [
  /^reproduce first, then validate the fix with /i,
  /^do not keep iterating on the current debug path without narrowing the failing signature first\.?$/i
];

const isLegacyGenericNode = (node: ExperienceNode): boolean =>
  LEGACY_GENERIC_HINT_PATTERNS.some((pattern) => pattern.test(node.compact_hint.trim()));

export const textOverlapScore = (left: string | undefined, right: string): number => {
  if (!left?.trim()) {
    return 0;
  }

  const lhs = new Set(tokenize(left));
  const rhs = new Set(tokenize(right));
  if (!lhs.size || !rhs.size) {
    return 0;
  }

  const overlap = [...lhs].filter((token) => rhs.has(token)).length;
  return overlap / Math.max(lhs.size, rhs.size);
};

const getSpecificityBonus = (node: ExperienceNode): number => {
  const hintTokens = new Set(tokenize(node.compact_hint));
  const triggerTokens = new Set(tokenize(node.trigger_pattern));
  const lexicalBreadth = Math.min(12, hintTokens.size + Math.min(triggerTokens.size, 6));
  const breadthScore = lexicalBreadth / 12;
  const structuredBonus =
    (node.recommended_steps?.length ?? 0) > 0 || (node.goal?.trim().length ?? 0) > 0 ? 0.08 : 0;

  return breadthScore * 0.18 + structuredBonus;
};

const getFeedbackAdjustment = (node: ExperienceNode): number =>
  Math.max(-0.12, Math.min(0.12, (node.helped_count - node.harmed_count) * 0.02));

const getMaturityAdjustment = (node: ExperienceNode): number => {
  const supportBonus = Math.min(0.12, node.support_count * 0.015);
  const validationBonus = node.validation_state === "validated_by_reuse" ? 0.08 : 0;
  return supportBonus + validationBonus;
};

const getGenericPenalty = (node: ExperienceNode): number => (isLegacyGenericNode(node) ? 0.22 : 0);

const isExpectationCorrectionNode = (node: ExperienceNode): boolean => node.experience_kind === "expectation_correction";

const getExpectationCorrectionAdjustment = (input: ExperienceInput, node: ExperienceNode): number => {
  if (!isExpectationCorrectionNode(node)) {
    return 0;
  }

  const queryText = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  const categoryMatch = textOverlapScore(node.correction_category, queryText);
  const deviationMatch = textOverlapScore(node.deviation_pattern, queryText);
  const constraintMatch = textOverlapScore(node.corrected_constraint, queryText);
  const confidenceBonus =
    node.confidence_signal === "confirmed_by_user"
      ? 0.06
      : node.confidence_signal === "supported_by_objective_success"
        ? 0.03
        : 0;
  const validationBonus = node.validation_state === "validated_by_reuse" ? 0.05 : 0;

  return categoryMatch * 0.18 + deviationMatch * 0.1 + constraintMatch * 0.08 + confidenceBonus + validationBonus;
};

export type PolicyEnrichment = {
  familyScore: number;
  policyAdjustment: number;
  policyScore: number;
  reasons: string[];
  components: PolicyEnrichmentComponent[];
};

export const getFamilyScore = (inputTaskType: TaskType, nodeTaskType: TaskType): number =>
  TASK_FAMILY_PROXIMITY[inputTaskType][nodeTaskType] ?? 0;

export const enrichPolicyForCandidate = (
  input: ExperienceInput,
  node: ExperienceNode,
  retrievalContext?: RetrievalContext
): PolicyEnrichment => {
  const currentTaskSignals = deriveTaskManagementSignals(input);
  const nodeSignals = deriveNodeManagementSignals(node);
  const familyScore = getFamilyScore(input.task_type === "unknown" ? "general" : input.task_type, node.task_type);
  const specificityBonus = getSpecificityBonus(node);
  const feedbackAdjustment = getFeedbackAdjustment(node);
  const maturityAdjustment = getMaturityAdjustment(node);
  const genericPenalty = getGenericPenalty(node);
  const expectationCorrectionAdjustment = getExpectationCorrectionAdjustment(input, node);
  const realDevAlignmentBonus =
    currentTaskSignals.realDevLikely && nodeSignals.realDevLikely
      ? currentTaskSignals.bugFixLike && nodeSignals.bugFixLike
        ? 0.06
        : 0.03
      : 0;
  const metaTaskAlignmentBonus =
    (currentTaskSignals.metaLike || currentTaskSignals.validationLike) &&
    (nodeSignals.metaLike || nodeSignals.validationLike)
      ? 0.03
      : 0;
  const metaOriginPenalty =
    currentTaskSignals.realDevLikely &&
    !currentTaskSignals.metaLike &&
    (nodeSignals.metaLike || nodeSignals.validationLike) &&
    !nodeSignals.bugFixLike
      ? 0.08
      : 0;
  const failureSignatureOverlap = retrievalContext?.failureSignature
    ? textOverlapScore(
        [node.trigger_pattern, node.compact_hint, node.deviation_pattern, node.corrected_constraint]
          .filter(Boolean)
          .join("\n"),
        retrievalContext.failureSignature
      )
    : 0;
  const failureSignatureBonus = Math.min(0.05, failureSignatureOverlap * 0.08);
  const correctionIntentBonus =
    retrievalContext?.expectationCorrectionIntent && isExpectationCorrectionNode(node) ? 0.03 : 0;
  const components: PolicyEnrichmentComponent[] = [
    {
      name: "family",
      category: "family_fit",
      value: familyScore * 0.22,
      reason: "Task-family proximity contributes governance fit."
    },
    {
      name: "specificity",
      category: "specificity",
      value: specificityBonus,
      reason: "Specific triggers, goals, or structured steps increase reuse confidence."
    },
    {
      name: "feedback",
      category: "feedback",
      value: feedbackAdjustment,
      reason: "Helped and harmed counters adjust reuse confidence."
    },
    {
      name: "maturity",
      category: "maturity",
      value: maturityAdjustment,
      reason: "Support count and reuse validation increase maturity."
    },
    {
      name: "generic_penalty",
      category: "penalty",
      value: -genericPenalty,
      reason: "Legacy generic guidance is penalized to avoid noisy reuse."
    },
    {
      name: "expectation_correction",
      category: "expectation_correction",
      value: expectationCorrectionAdjustment,
      reason: "Expectation-correction evidence can improve applicability."
    },
    {
      name: "real_dev_alignment",
      category: "task_alignment",
      value: realDevAlignmentBonus,
      reason: "Real development task signals align with real development guidance."
    },
    {
      name: "meta_task_alignment",
      category: "task_alignment",
      value: metaTaskAlignmentBonus,
      reason: "Meta or validation task signals align with similar guidance."
    },
    {
      name: "meta_origin_penalty",
      category: "penalty",
      value: -metaOriginPenalty,
      reason: "Meta-origin guidance is penalized for real development tasks."
    },
    {
      name: "failure_signature",
      category: "retrieval_context",
      value: failureSignatureBonus,
      reason: "Failure signature overlap is soft retrieval-context evidence."
    },
    {
      name: "correction_intent",
      category: "retrieval_context",
      value: correctionIntentBonus,
      reason: "Correction intent is soft context evidence for expectation corrections."
    }
  ];
  const enrichedPolicyAdjustment = Number(
    components.reduce((sum, component) => sum + component.value, 0).toFixed(12)
  );
  const reasons = [
    `family:${familyScore.toFixed(4)}`,
    `specificity:${specificityBonus.toFixed(4)}`,
    `feedback:${feedbackAdjustment.toFixed(4)}`,
    `maturity:${maturityAdjustment.toFixed(4)}`,
    `generic_penalty:${genericPenalty.toFixed(4)}`,
    `expectation_correction:${expectationCorrectionAdjustment.toFixed(4)}`,
    `real_dev_alignment:${realDevAlignmentBonus.toFixed(4)}`,
    `meta_task_alignment:${metaTaskAlignmentBonus.toFixed(4)}`,
    `meta_origin_penalty:${metaOriginPenalty.toFixed(4)}`,
    `task_management_current:${currentTaskSignals.reasons.join("|") || "none"}`,
    `task_management_node:${nodeSignals.reasons.join("|") || "none"}`,
    `host:${retrievalContext?.host ?? "unknown"}`,
    `tool_names:${retrievalContext?.toolNames.length ?? 0}`,
    `failure_signature:${failureSignatureBonus.toFixed(4)}`,
    `read_only:${retrievalContext?.isReadOnly ? "yes" : "no"}`,
    `module_paths:${retrievalContext?.modulePaths?.length ?? 0}`,
    `correction_intent:${correctionIntentBonus.toFixed(4)}`
  ];

  return {
    familyScore,
    policyAdjustment: enrichedPolicyAdjustment,
    policyScore: enrichedPolicyAdjustment,
    reasons,
    components
  };
};
