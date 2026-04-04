import type { ExperienceInput, ExperienceInputRecord, ExperienceNode } from "../types/domain.js";

export type TaskManagementSignals = {
  metaLike: boolean;
  validationLike: boolean;
  realDevLikely: boolean;
  bugFixLike: boolean;
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type NodeOriginProfile = {
  sampleCount: number;
  metaCount: number;
  validationCount: number;
  realDevCount: number;
  bugFixCount: number;
  strictPromotion: boolean;
  reasons: string[];
};

export type NodeManagementSignals = {
  metaLike: boolean;
  validationLike: boolean;
  realDevLikely: boolean;
  bugFixLike: boolean;
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

const META_PATTERNS = [
  /\baudit\b/i,
  /\breview\b/i,
  /\bplan\b/i,
  /\bbaseline\b/i,
  /\bscenario\b/i,
  /\binspect\b/i,
  /\bdoctor\b/i
];

const VALIDATION_PATTERNS = [
  /\bvalidate\b/i,
  /\bvalidation\b/i,
  /\bverify\b/i,
  /\bverification\b/i,
  /\breal host\b/i,
  /\bhost wiring\b/i,
  /\binstall qualification\b/i
];

const REAL_DEV_PATTERNS = [
  /\bimplement\b/i,
  /\brefactor\b/i,
  /\bdebug\b/i,
  /\bfix\b/i,
  /\bfailing\b/i,
  /\bruntime error\b/i,
  /\bpackaging\b/i,
  /\bprovider routing\b/i
];

const BUG_FIX_PATTERNS = [
  /\bdebug\b/i,
  /\bfix\b/i,
  /\bfailing\b/i,
  /\berror\b/i,
  /\bregression\b/i,
  /\bcallback\b/i
];

const joinInputText = (input: ExperienceInput): string =>
  [
    input.task_summary,
    input.context_summary,
    ...input.tool_events.flatMap((event) => [event.tool_name, event.output_summary, event.error_signature])
  ]
    .filter(Boolean)
    .join("\n");

const matchesAny = (patterns: RegExp[], text: string): boolean => patterns.some((pattern) => pattern.test(text));

const deriveSignalsFromSource = (
  taskType: ExperienceInput["task_type"],
  text: string
): TaskManagementSignals => {
  const reasons: string[] = [];

  const taskTypeRealDev =
    taskType === "bug_fix" ||
    taskType === "config_debug" ||
    taskType === "integration_fix" ||
    taskType === "feature_add" ||
    taskType === "refactor" ||
    taskType === "test_debug" ||
    taskType === "build_debug";

  const bugFixLike =
    taskType === "bug_fix" ||
    taskType === "config_debug" ||
    taskType === "integration_fix" ||
    taskType === "test_debug" ||
    taskType === "build_debug" ||
    matchesAny(BUG_FIX_PATTERNS, text);

  const metaLikeRaw = matchesAny(META_PATTERNS, text);
  const validationLike = matchesAny(VALIDATION_PATTERNS, text);
  const implementationLike = matchesAny(REAL_DEV_PATTERNS, text);
  const realDevLikely = taskTypeRealDev || implementationLike;
  const metaLike = metaLikeRaw && !(taskTypeRealDev && implementationLike);

  if (taskTypeRealDev) {
    reasons.push(`task_type:${taskType}`);
  }
  if (bugFixLike) {
    reasons.push("bug_fix_signal");
  }
  if (metaLike) {
    reasons.push("meta_wording");
  }
  if (validationLike) {
    reasons.push("validation_wording");
  }
  if (implementationLike) {
    reasons.push("implementation_wording");
  }

  const positiveSignals = Number(taskTypeRealDev) + Number(bugFixLike) + Number(realDevLikely) + Number(validationLike) + Number(metaLike);
  const confidence =
    positiveSignals >= 3 || (realDevLikely && bugFixLike)
      ? "high"
      : positiveSignals >= 2
        ? "medium"
        : "low";

  return {
    metaLike,
    validationLike,
    realDevLikely,
    bugFixLike,
    confidence,
    reasons
  };
};

export const deriveTaskManagementSignals = (input: ExperienceInput): TaskManagementSignals =>
  deriveSignalsFromSource(input.task_type, joinInputText(input));

export const deriveNodeManagementSignals = (node: ExperienceNode): NodeManagementSignals =>
  deriveSignalsFromSource(
    node.task_type,
    [
      node.trigger_pattern,
      node.compact_hint,
      node.goal,
      node.applicability_notes,
      node.evidence_summary,
      node.success_signal,
      ...(node.recommended_steps ?? []),
      ...(node.avoid_steps ?? []),
      ...(node.fallback_steps ?? []),
      node.deviation_pattern,
      node.corrected_constraint
    ]
      .filter(Boolean)
      .join("\n")
  );

const recordToInput = (record: Pick<ExperienceInputRecord, "scope_id" | "task_type" | "task_summary" | "context_summary" | "outcome_signal">): ExperienceInput => ({
  scope_id: record.scope_id,
  task_type: record.task_type,
  task_summary: record.task_summary,
  context_summary: record.context_summary,
  tool_events: [],
  outcome_signal: record.outcome_signal,
  injected_node_ids: []
});

export const deriveNodeOriginProfile = (
  records: Array<Pick<ExperienceInputRecord, "scope_id" | "task_type" | "task_summary" | "context_summary" | "outcome_signal">>
): NodeOriginProfile => {
  const signals = records.map((record) => deriveTaskManagementSignals(recordToInput(record)));
  const metaCount = signals.filter((signal) => signal.metaLike).length;
  const validationCount = signals.filter((signal) => signal.validationLike).length;
  const realDevCount = signals.filter((signal) => signal.realDevLikely).length;
  const bugFixCount = signals.filter((signal) => signal.bugFixLike).length;
  const sampleCount = signals.length;
  const strictPromotionSampleCount = signals.filter(
    (signal) => (signal.metaLike || signal.validationLike) && !signal.realDevLikely
  ).length;
  const strictPromotion = sampleCount > 0 && strictPromotionSampleCount > realDevCount;
  const reasons = [
    `origin_samples:${sampleCount}`,
    `origin_meta:${metaCount}`,
    `origin_validation:${validationCount}`,
    `origin_real_dev:${realDevCount}`,
    `origin_bug_fix:${bugFixCount}`,
    `origin_strict_samples:${strictPromotionSampleCount}`,
    `strict_promotion:${strictPromotion ? "yes" : "no"}`
  ];

  return {
    sampleCount,
    metaCount,
    validationCount,
    realDevCount,
    bugFixCount,
    strictPromotion,
    reasons
  };
};
