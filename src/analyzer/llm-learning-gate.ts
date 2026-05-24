import { createHash, createHmac } from "node:crypto";
import type {
  CandidateSourceSignal,
  ConfidenceSignal,
  CorrectionCategory,
  CorrectionScope,
  ExperienceCandidateDraft,
  ExperienceInput,
  PromotionSignal,
  TaskType,
  ValidationState
} from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { analyzeExperience } from "./experience-analyzer.js";
import { buildCandidateSignals } from "./candidate-signals.js";
import { dedupeCandidates } from "./node-deduper.js";
import { normalizeCandidate } from "./node-normalizer.js";
import { isEditTool, isSubstantiveToolEvent } from "../input/tool-event-significance.js";
import { deriveTaskManagementSignals } from "../experience-management/task-management-signals.js";
import {
  resolveDistillationResolution,
  type DistillationResolution,
  type DistillerEndpoint
} from "../distillation/host-llm.js";
import { resolveGoogleAdcAccessToken } from "../distillation/providers/google-adc.js";

type LearningGateRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
};

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

type AnthropicMessage = {
  role: "user";
  content: string;
};

type GeminiPart = {
  text: string;
};

type LearningGateResult = {
  worthCapturing: boolean;
  reason: string;
  drafts: ExperienceCandidateDraft[];
  source: "llm" | "rule" | "disabled";
  directionalCorrectionSignal?: NonNullable<CandidateSourceSignal["directional_correction"]>;
  evidenceDrivenReversalSignal?: NonNullable<CandidateSourceSignal["evidence_driven_reversal"]>;
};

export type LearningEligibilityReasonCode =
  | "scope_disabled_or_policy_blocked"
  | "expression_layer_only"
  | "insufficient_substantive_evidence"
  | "failure_repair_success"
  | "retry_pattern"
  | "directional_correction"
  | "objective_verification_change"
  | "repeated_task_family"
  | "reusable_error_signature"
  | "verified_project_constraint"
  | "no_transferable_execution_value";

export type LearningEligibilityDecision = {
  eligible: boolean;
  reasonCode: LearningEligibilityReasonCode;
  reason: string;
};

type ExpectationCorrectionRepair = {
  experience_kind?: "expectation_correction";
  confidence_signal?: ConfidenceSignal;
  validation_state?: ValidationState;
  correction_scope?: CorrectionScope;
  correction_category?: CorrectionCategory;
  deviation_pattern?: string;
  corrected_constraint?: string;
};

type ExpectationCorrectionRescue = {
  draft: ExperienceCandidateDraft;
  directionalCorrectionSignal: NonNullable<CandidateSourceSignal["directional_correction"]>;
};

type EvidenceDrivenReversalRepair = {
  reversal_detected?: boolean;
  reversal_source?: "task_evidence";
  superseded_hypothesis?: string;
  replacement_constraint?: string;
  verification_evidence?: string;
  pivot_summary?: string;
  correction_scope?: CorrectionScope;
  correction_category?: CorrectionCategory;
  deviation_pattern?: string;
  corrected_constraint?: string;
};

type EvidenceDrivenReversalRescue = {
  draft: ExperienceCandidateDraft;
  evidenceDrivenReversalSignal: NonNullable<CandidateSourceSignal["evidence_driven_reversal"]>;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const FREE_MODEL_REQUEST_TIMEOUT_MS = 75_000;
const TRANSIENT_RETRY_DELAY_MS = 1_500;
const BEDROCK_SERVICE = "bedrock";
const TASK_TYPES: TaskType[] = [
  "bug_fix",
  "build_debug",
  "config_debug",
  "test_debug",
  "integration_fix",
  "feature_add",
  "refactor",
  "performance",
  "general"
];

const SYSTEM_PROMPT = `You are ExperienceEngine's coding-experience learner.

You decide whether a finished coding task is worth capturing as reusable experience.

Capture when the run contains any of:
- a concrete failure and repair path
- repeated retries or narrowing steps
- provider, model, routing, credential, endpoint, privacy, rate-limit, or config troubleshooting
- a non-obvious but reusable verification or execution loop
- a warning pattern that should stop the agent from repeating the same failing path

Do not capture:
- routine success with no reusable signal
- repo-specific noise that would not help a later similar task
- generic advice with no concrete trigger or verification signal
- expression-layer edits that only refine wording, copy, labels, formatting, presentation, or inline notice phrasing

Use experience_kind = expectation_correction when:
- the first attempt technically worked or partially worked
- but the user corrected the direction, layer, behavior, quality bar, or verification order
- and the later direction produced a better or objectively supported result
- do not use expectation_correction for copy-only, wording-only, style-only, or presentation-only refinements

For expectation_correction candidates:
- you must include confidence_signal, correction_scope, correction_category, deviation_pattern, and corrected_constraint
- use confidence_signal = confirmed_by_user only when the user explicitly accepted the corrected result
- use confidence_signal = supported_by_objective_success when the corrected direction is backed by a concrete probe, test, or verification success but the user did not explicitly reconfirm
- use confidence_signal = unconfirmed when the direction changed but there is no explicit acceptance and no strong objective success
- use validation_state = pending_reuse_validation for new expectation_correction candidates

Return strict JSON with:
- worth_capturing: boolean
- experience_kind: one of execution_pattern | config_troubleshooting | verification_loop | warning | expectation_correction | none
- reason: one short sentence
- candidate: required only when worth_capturing is true

candidate must include:
- node_type: strategy | warning
- task_type: one of bug_fix | build_debug | config_debug | test_debug | integration_fix | feature_add | refactor | performance | general
- trigger_pattern
- compact_hint
- success_signal
- evidence_summary

candidate may also include:
- experience_kind
- confidence_signal
- validation_state
- correction_scope
- correction_category
- deviation_pattern
- corrected_constraint
- promotion_signal
- promotion_reason
- goal
- applicability_notes
- recommended_steps
- avoid_steps
- fallback_steps
- stop_condition
- escalation_condition

Keep the hint concrete, reusable, and tied to the task evidence.`;

const EXPECTATION_CORRECTION_NOTE = `If multiple user corrections happened in one task, only learn from the correction that directly led to the final successful direction. Ignore exploratory corrections that were later superseded.

When user feedback says the current implementation is solving the wrong layer, wrong behavior, wrong quality bar, or wrong verification order, prefer expectation_correction over a generic execution_pattern.

If the corrected direction later succeeds through a targeted probe, test, or verification, treat that as supported_by_objective_success even when the user does not explicitly confirm the final result.`;

const EXPECTATION_CORRECTION_REPAIR_PROMPT = `You are repairing a coding-experience draft.

Decide whether the task should actually be stored as expectation_correction.

Use the provided correction_window as the semantic detection context. Only promote when the correction window shows a real directional correction and the evidence_gate shows objective support or user confirmation.

Return strict JSON:
- expectation_correction: boolean
- confidence_signal: confirmed_by_user | supported_by_objective_success | unconfirmed (required when true)
- validation_state: pending_reuse_validation (required when true)
- correction_scope: task_local | repo_local | workflow_local | host_local | cross_repo_candidate (required when true)
- correction_category: goal_interpretation | quality_bar | interaction_behavior | verification_order | implementation_boundary | style_constraint (required when true)
- deviation_pattern: short sentence (required when true)
- corrected_constraint: short sentence (required when true)

Only return expectation_correction=true when the run shows that a technically working or partially working direction was corrected into a better direction by user feedback or stronger task evidence.`;
const EXPECTATION_CORRECTION_REPAIR_EXAMPLES = `Example 1:
task_summary: "The implementation technically works, but the user corrected the fix: the problem is in provider routing, not the UI layer."
context_summary: "The final targeted probe succeeded after moving the fix from UI to provider routing."
draft.compact_hint: "Move the fix from the UI layer into provider routing."
output:
{"expectation_correction":true,"confidence_signal":"supported_by_objective_success","validation_state":"pending_reuse_validation","correction_scope":"host_local","correction_category":"implementation_boundary","deviation_pattern":"implementation solves the wrong layer of the problem","corrected_constraint":"Move the fix into provider routing instead of persisting in the UI layer."}

Example 2:
task_summary: "The build failed until pnpm typecheck was run after each change."
context_summary: "No user correction happened; this is a verification loop."
draft.compact_hint: "Run pnpm typecheck after each change."
output:
{"expectation_correction":false}`;

const EXPECTATION_CORRECTION_RESCUE_PROMPT = `You are rescuing a missed directional correction from a coding task.

The main learner rejected this task as not broadly reusable. You should only rescue it when the correction window and evidence gate show a real reusable expectation correction.

Return strict JSON:
- expectation_correction: boolean
- candidate: required only when expectation_correction=true

candidate must include:
- node_type: strategy | warning
- task_type
- trigger_pattern
- compact_hint
- success_signal
- evidence_summary
- experience_kind: expectation_correction
- confidence_signal: confirmed_by_user | supported_by_objective_success | unconfirmed
- validation_state: pending_reuse_validation
- correction_scope: task_local | repo_local | workflow_local | host_local | cross_repo_candidate
- correction_category: goal_interpretation | quality_bar | interaction_behavior | verification_order | implementation_boundary | style_constraint
- deviation_pattern
- corrected_constraint

Do not rescue:
- wording-only
- copy-only
- style-only
- presentation-only
- ordinary verification loops without a corrected direction`;

const EVIDENCE_DRIVEN_REVERSAL_REPAIR_PROMPT = `You are repairing a coding-experience draft for evidence-driven reversal.

Use the provided reversal_window as the semantic detection context. Only promote when:
- an earlier active hypothesis or direction existed
- later task evidence invalidated it
- the task pivoted to a replacement path
- later verification supported the replacement path

Return strict JSON:
- reversal_detected: boolean
- reversal_source: task_evidence (required when true)
- superseded_hypothesis: short sentence (required when true)
- replacement_constraint: short sentence (required when true)
- verification_evidence: short sentence (required when true)
- pivot_summary: short sentence (optional)
- correction_scope: task_local | repo_local | workflow_local | host_local | cross_repo_candidate (required when true)
- correction_category: goal_interpretation | quality_bar | interaction_behavior | verification_order | implementation_boundary | style_constraint (required when true)
- deviation_pattern: short sentence (required when true)
- corrected_constraint: short sentence (required when true)

Do not promote ordinary verification loops, confirmation of the same direction, or loose narrowing that did not overturn the original path.`;

const EVIDENCE_DRIVEN_REVERSAL_RESCUE_PROMPT = `You are rescuing a missed evidence-driven reversal from a coding task.

The main learner did not capture a reusable candidate. Rescue only when the reversal window shows:
- a prior active hypothesis
- stronger invalidating task evidence
- a pivot into a replacement path
- later validating evidence on the replacement path

Return strict JSON:
- reversal_detected: boolean
- reversal_source: task_evidence (required when true)
- superseded_hypothesis: short sentence (required when true)
- replacement_constraint: short sentence (required when true)
- verification_evidence: short sentence (required when true)
- pivot_summary: short sentence (optional)
- candidate: required only when reversal_detected=true

candidate must include:
- node_type: strategy | warning
- task_type
- trigger_pattern
- compact_hint
- success_signal
- evidence_summary
- experience_kind: expectation_correction
- confidence_signal: confirmed_by_user | supported_by_objective_success | unconfirmed
- validation_state: pending_reuse_validation
- correction_scope: task_local | repo_local | workflow_local | host_local | cross_repo_candidate
- correction_category: goal_interpretation | quality_bar | interaction_behavior | verification_order | implementation_boundary | style_constraint
- deviation_pattern
- corrected_constraint`;

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: string | Buffer, value: string): Buffer => createHmac("sha256", key).update(value, "utf8").digest();
const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, "");
const toDateStamp = (date: Date): string => toAmzDate(date).slice(0, 8);

const buildInputPayload = (input: ExperienceInput): string =>
  JSON.stringify(
    {
      task_summary: input.task_summary,
      task_type: input.task_type,
      context_summary: input.context_summary,
      outcome_signal: input.outcome_signal,
      tool_events: input.tool_events.map((event) => ({
        tool_name: event.tool_name,
        status: event.status,
        exit_code: event.exit_code,
        error_signature: event.error_signature,
        output_summary: event.output_summary
      })),
      injected_node_ids: input.injected_node_ids
    },
    null,
    2
  );

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const parseArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : undefined;

const isTaskType = (value: unknown): value is TaskType =>
  typeof value === "string" && TASK_TYPES.includes(value as TaskType);

const isNodeType = (value: unknown): value is ExperienceCandidateDraft["node_type"] =>
  value === "strategy" || value === "warning";

const CONFIDENCE_SIGNALS: ConfidenceSignal[] = [
  "confirmed_by_user",
  "supported_by_objective_success",
  "unconfirmed"
];
const PROMOTION_SIGNALS: PromotionSignal[] = ["normal", "high_value"];
const VALIDATION_STATES: ValidationState[] = [
  "pending_reuse_validation",
  "validated_by_reuse",
  "invalidated"
];
const CORRECTION_SCOPES: CorrectionScope[] = [
  "task_local",
  "repo_local",
  "workflow_local",
  "host_local",
  "cross_repo_candidate"
];
const CORRECTION_CATEGORIES: CorrectionCategory[] = [
  "goal_interpretation",
  "quality_bar",
  "interaction_behavior",
  "verification_order",
  "implementation_boundary",
  "style_constraint"
];

const isConfidenceSignal = (value: unknown): value is ConfidenceSignal =>
  typeof value === "string" && CONFIDENCE_SIGNALS.includes(value as ConfidenceSignal);
const isValidationState = (value: unknown): value is ValidationState =>
  typeof value === "string" && VALIDATION_STATES.includes(value as ValidationState);
const isCorrectionScope = (value: unknown): value is CorrectionScope =>
  typeof value === "string" && CORRECTION_SCOPES.includes(value as CorrectionScope);
const isCorrectionCategory = (value: unknown): value is CorrectionCategory =>
  typeof value === "string" && CORRECTION_CATEGORIES.includes(value as CorrectionCategory);
const isPromotionSignal = (value: unknown): value is PromotionSignal =>
  typeof value === "string" && PROMOTION_SIGNALS.includes(value as PromotionSignal);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const EXPRESSION_LAYER_PATTERN =
  /\b(wording|phrasing|copy|label|labels|notice|message|messages|tooltip|readme|documentation|docs|format|formatting|presentation|tone|style|styling|inline notice)\b/i;
const OBJECTIVE_VERIFICATION_PATTERN =
  /\b(test|probe|verify|verification|build|compile|lint|typecheck|doctor|assert|request|response|endpoint|routing|fixture|mock|integration|exec|process)\b/i;
const NON_OBVIOUS_VERIFICATION_PATTERN =
  /\b(targeted|flaky|isolat(?:e|ed|es|ing)|probe-driven|non-obvious|regression|root-cause|narrow(?:ed|ing)?|reproduc(?:e|ed|es|ing))\b/i;
const PROJECT_CONSTRAINT_PATTERN =
  /\b(codex|claude|openclaw|host|hook|lifecycle|mcp|marketplace|clawhub|npm|sqlite|migration|schema|compatibility|installer|repair)\b/i;

const looksLikeExpressionLayerOnlyTask = (input: ExperienceInput): boolean => {
  const text = [input.task_summary, input.context_summary, ...input.tool_events.map((event) => event.output_summary ?? "")]
    .filter(Boolean)
    .join("\n");
  if (!EXPRESSION_LAYER_PATTERN.test(text)) {
    return false;
  }

  return !OBJECTIVE_VERIFICATION_PATTERN.test(text);
};

const hasSubstantiveLearningEvidence = (input: ExperienceInput): boolean =>
  input.tool_events.some((event) => isSubstantiveToolEvent(event));

const eligibilityDecision = (
  eligible: boolean,
  reasonCode: LearningEligibilityReasonCode,
  reason: string
): LearningEligibilityDecision => ({
  eligible,
  reasonCode,
  reason: `${reasonCode}: ${reason}`
});

const hasObjectiveVerificationSuccess = (input: ExperienceInput): boolean =>
  input.tool_events.some(
    (event) =>
      event.status === "success" &&
      OBJECTIVE_VERIFICATION_PATTERN.test([event.tool_name, event.output_summary, event.error_signature].filter(Boolean).join(" "))
  );

const hasFailureRepairSuccess = (input: ExperienceInput): boolean => {
  if (input.outcome_signal !== "success") {
    return false;
  }
  const firstFailureIndex = input.tool_events.findIndex((event) => event.status === "failure");
  return firstFailureIndex >= 0 && input.tool_events.slice(firstFailureIndex + 1).some((event) => event.status === "success");
};

const hasRepeatedTaskFamilySignal = (input: ExperienceInput): boolean => {
  const substantiveEvents = input.tool_events.filter(isSubstantiveToolEvent);
  const counts = new Map<string, number>();
  for (const event of substantiveEvents) {
    counts.set(event.tool_name, (counts.get(event.tool_name) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count > 1);
};

const hasVerifiedProjectConstraint = (input: ExperienceInput): boolean => {
  if (input.outcome_signal !== "success" || !hasObjectiveVerificationSuccess(input)) {
    return false;
  }
  const text = [input.task_summary, input.context_summary, ...input.tool_events.map((event) => event.output_summary ?? "")]
    .filter(Boolean)
    .join("\n");
  return PROJECT_CONSTRAINT_PATTERN.test(text);
};

export const evaluateLearningEligibility = (input: ExperienceInput): LearningEligibilityDecision => {
  if (looksLikeExpressionLayerOnlyTask(input)) {
    return eligibilityDecision(
      false,
      "expression_layer_only",
      "expression-layer refinement for wording, copy, labels, formatting, or presentation-only changes is recorded but not learned"
    );
  }

  if (!hasSubstantiveLearningEvidence(input)) {
    return eligibilityDecision(
      false,
      "insufficient_substantive_evidence",
      "only edit or exploratory events were observed"
    );
  }

  const signals = buildCandidateSignals(input);
  if (hasFailureRepairSuccess(input)) {
    return eligibilityDecision(true, "failure_repair_success", "a concrete failure was followed by successful repair evidence");
  }

  if (signals.retry_count >= 2) {
    return eligibilityDecision(true, "retry_pattern", "repeated failed attempts expose a reusable retry or narrowing pattern");
  }

  const directionalCorrection = signals.directional_correction;
  if (
    directionalCorrection?.detected &&
    (directionalCorrection.objective_support ||
      directionalCorrection.user_confirmation ||
      directionalCorrection.correction_strength === "high" ||
      directionalCorrection.correction_strength === "medium")
  ) {
    return eligibilityDecision(true, "directional_correction", "a corrected task direction has support from user feedback or objective evidence");
  }

  const text = [input.task_summary, input.context_summary, ...input.tool_events.map((event) => event.output_summary ?? "")]
    .filter(Boolean)
    .join("\n");
  const hasEditOrCorrection = input.tool_events.some((event) => isEditTool(event) || signals.correction_signals.includes(event.tool_name));
  const hasNonObviousVerificationLoop = NON_OBVIOUS_VERIFICATION_PATTERN.test(text);
  if (input.outcome_signal === "success" && (hasEditOrCorrection || hasNonObviousVerificationLoop) && hasObjectiveVerificationSuccess(input)) {
    return eligibilityDecision(true, "objective_verification_change", "a concrete change was followed by objective verification");
  }

  if (hasRepeatedTaskFamilySignal(input)) {
    return eligibilityDecision(true, "repeated_task_family", "the same substantive task-family tool recurred during the run");
  }

  if (signals.failure_signature) {
    return eligibilityDecision(true, "reusable_error_signature", "the run contains a concrete failure signature");
  }

  if (hasVerifiedProjectConstraint(input)) {
    return eligibilityDecision(true, "verified_project_constraint", "a project or host constraint was verified successfully");
  }

  return eligibilityDecision(false, "no_transferable_execution_value", "ordinary success lacks a reusable failure, correction, retry, or constraint signal");
};

const isTransientProviderFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /timed out/i.test(message) ||
    /failed with 429\b/i.test(message) ||
    /failed with 5\d{2}\b/i.test(message) ||
    /did not include a message payload/i.test(message)
  );
};

const resolveRequestTimeoutMs = (endpoint: DistillerEndpoint): number => {
  const model = endpoint.model.toLowerCase();
  if (endpoint.provider === "openrouter" && (model === "openrouter/free" || model.includes(":free"))) {
    return FREE_MODEL_REQUEST_TIMEOUT_MS;
  }

  if (model.includes(":free")) {
    return FREE_MODEL_REQUEST_TIMEOUT_MS;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
};

const normalizeDraft = (candidate: Record<string, unknown>, input: ExperienceInput): ExperienceCandidateDraft => {
  const taskType =
    (isTaskType(candidate.task_type) ? candidate.task_type : undefined) ??
    (input.task_type !== "unknown" ? input.task_type : "general");
  const nodeType =
    (isNodeType(candidate.node_type) ? candidate.node_type : undefined) ??
    (input.outcome_signal === "failure" ? "warning" : "strategy");
  const triggerPattern = pickString(candidate.trigger_pattern) ?? input.task_summary;
  const compactHint = pickString(candidate.compact_hint);
  const successSignal = pickString(candidate.success_signal);
  const evidenceSummary = pickString(candidate.evidence_summary);

  if (!compactHint || !successSignal || !evidenceSummary) {
    throw new Error("Learning gate output missing required candidate fields");
  }

  const experienceKind = pickString(candidate.experience_kind) as ExperienceCandidateDraft["experience_kind"] | undefined;
  const confidenceSignal = isConfidenceSignal(candidate.confidence_signal) ? candidate.confidence_signal : undefined;
  const correctionScope = isCorrectionScope(candidate.correction_scope) ? candidate.correction_scope : undefined;
  const correctionCategory = isCorrectionCategory(candidate.correction_category) ? candidate.correction_category : undefined;
  const deviationPattern = pickString(candidate.deviation_pattern);
  const correctedConstraint = pickString(candidate.corrected_constraint);

  return normalizeCandidate({
    node_type: nodeType,
    scope_id: input.scope_id,
    task_type: taskType,
    experience_kind:
      experienceKind ?? (correctionScope || correctionCategory || deviationPattern || correctedConstraint ? "expectation_correction" : undefined),
    confidence_signal: confidenceSignal,
    validation_state:
      (isValidationState(candidate.validation_state) ? candidate.validation_state : undefined) ??
      (confidenceSignal ? "pending_reuse_validation" : undefined),
    correction_scope: correctionScope,
    correction_category: correctionCategory,
    deviation_pattern: deviationPattern,
    corrected_constraint: correctedConstraint,
    trigger_pattern: triggerPattern,
    applicability_notes: pickString(candidate.applicability_notes),
    env_signature: undefined,
    compact_hint: compactHint,
    goal: pickString(candidate.goal),
    recommended_steps: parseArray(candidate.recommended_steps),
    avoid_steps: parseArray(candidate.avoid_steps),
    fallback_steps: parseArray(candidate.fallback_steps),
    success_signal: successSignal,
    stop_condition: pickString(candidate.stop_condition),
    escalation_condition: pickString(candidate.escalation_condition),
    evidence_summary: evidenceSummary,
    retrieval_text: undefined,
    promotion_signal: isPromotionSignal(candidate.promotion_signal) ? candidate.promotion_signal : undefined,
    promotion_reason: pickString(candidate.promotion_reason),
    source_kind: "system_derived"
  });
};

export const applyTraceLearningGatePolicy = (
  input: ExperienceInput,
  draft: ExperienceCandidateDraft
): ExperienceCandidateDraft => {
  if (!input.trace_capsule_id) {
    return draft;
  }

  const isLowCompleteness = typeof input.trace_completeness === "number" && input.trace_completeness < 0.6;
  const isUnstable = input.trace_is_unstable === true;

  if (!isLowCompleteness && !isUnstable) {
    return draft;
  }

  const signals = buildCandidateSignals(input);
  const kind = draft.experience_kind || "none";

  let satisfiesMinRules = false;

  if (kind === "expectation_correction") {
    // expectation correction BDD: requires user-origin correction evidence OR directional correction signal, AND success outcome
    const hasCorrectionEvidence =
      (signals.trace_windows?.correction_events_count ?? 0) > 0 ||
      signals.directional_correction?.detected === true;
    const hasCorrectedOrAccepted = input.outcome_signal === "success";
    satisfiesMinRules = hasCorrectionEvidence && hasCorrectedOrAccepted;
  } else if (kind === "verification_loop") {
    // verification loop BDD: requires an objective verification event, and execution path affected
    const hasVerificationEvent = (signals.trace_windows?.verification_events_count ?? 0) > 0;
    const affectedExecution = signals.retry_count > 0 || input.outcome_signal === "success";
    satisfiesMinRules = hasVerificationEvent && affectedExecution;
  } else if (draft.node_type === "warning") {
    // warning: requires at least one file change or tool failure
    const hasFileChange = (signals.trace_windows?.file_change_events_count ?? 0) > 0;
    const hasFailure = signals.retry_count > 0;
    satisfiesMinRules = hasFileChange || hasFailure;
  } else {
    // successful fix: requires success outcome and retry_count > 0 or correction
    const hasCorrection = (signals.trace_windows?.correction_events_count ?? 0) > 0;
    satisfiesMinRules = input.outcome_signal === "success" && (signals.retry_count > 0 || hasCorrection);
  }

  if (!satisfiesMinRules) {
    return {
      ...draft,
      promotion_signal: "normal",
      promotion_reason: `restricted high confidence promotion because trace completeness is low (${input.trace_completeness}) or source is unstable, and minimum evidence rules were not satisfied`,
      confidence_signal: "unconfirmed"
    };
  }

  return draft;
};

const applyTaskManagementPromotionPolicy = (
  input: ExperienceInput,
  draft: ExperienceCandidateDraft
): ExperienceCandidateDraft => {
  // Enforce trace learning gate policy first! (Task 5.3)
  const tracePolicedDraft = applyTraceLearningGatePolicy(input, draft);

  const signals = deriveTaskManagementSignals(input);
  const preserveHighValue =
    signals.realDevLikely &&
    (
      signals.bugFixLike ||
      tracePolicedDraft.experience_kind === "expectation_correction" ||
      input.task_type === "bug_fix" ||
      input.task_type === "config_debug" ||
      input.task_type === "integration_fix"
    );

  if (tracePolicedDraft.promotion_signal !== "high_value" || preserveHighValue) {
    return tracePolicedDraft;
  }

  const downgradeReason = signals.metaLike
    ? "downgraded from high_value because the task looked meta-like and still needs real-dev reuse evidence"
    : signals.validationLike
      ? "downgraded from high_value because the task looked validation-heavy and still needs real-dev reuse evidence"
      : tracePolicedDraft.promotion_reason;

  return {
    ...tracePolicedDraft,
    promotion_signal: "normal",
    promotion_reason: downgradeReason
  };
};

export class LlmLearningGate {
  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly options: LearningGateRuntimeOptions = {}
  ) {}

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env;
  }

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private resolveDistillation(): DistillationResolution {
    return resolveDistillationResolution({
      env: this.env,
      configProvider: this.config.distillerProvider,
      configAuthMode: this.config.distillationAuthMode,
      configModel: this.config.distillerModel,
      distillationMode: this.config.distillationMode,
      allowRuleFallback: this.config.distillationAllowPassthrough
    });
  }

  private buildOpenAiUrl(baseUrl: string): string {
    if (/\/chat\/completions(?:\?.*)?$/.test(baseUrl)) {
      return baseUrl;
    }
    if (/\/v1\/?$/.test(baseUrl)) {
      return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    }
    return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }

  private buildRequestUrl(endpoint: DistillerEndpoint): string {
    if (endpoint.kind === "anthropic" || endpoint.kind === "gemini" || endpoint.kind === "bedrock") {
      return endpoint.baseUrl;
    }

    return this.buildOpenAiUrl(endpoint.baseUrl);
  }

  private buildRequestBody(endpoint: DistillerEndpoint, input: ExperienceInput): Record<string, unknown> {
    const payload = buildInputPayload(input);

    if (endpoint.kind === "anthropic") {
      const messages: AnthropicMessage[] = [{ role: "user", content: payload }];
      return {
        model: endpoint.model,
        max_tokens: 1536,
        system: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}`,
        messages,
        temperature: 0.1
      };
    }

    if (endpoint.kind === "gemini") {
      const parts: GeminiPart[] = [{ text: payload }];
      return {
        system_instruction: {
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}` }]
        },
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}` }],
        messages: [
          {
            role: "user",
            content: [{ text: payload }]
          }
        ],
        inferenceConfig: {
          maxTokens: 1536,
          temperature: 0.1
        }
      };
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}` },
      { role: "user", content: payload }
    ];

    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages,
      temperature: 0.1
    };
  }

  private buildExpectationCorrectionRepairBody(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    draft: ExperienceCandidateDraft,
    reason: string,
    directionalCorrection: NonNullable<CandidateSourceSignal["directional_correction"]>
  ): Record<string, unknown> {
    const payload = JSON.stringify(
      {
        task_summary: input.task_summary,
        task_type: input.task_type,
        context_summary: input.context_summary,
        outcome_signal: input.outcome_signal,
        tool_events: input.tool_events.map((event) => ({
          tool_name: event.tool_name,
          status: event.status,
          error_signature: event.error_signature,
          output_summary: event.output_summary
        })),
        draft: {
          task_type: draft.task_type,
          node_type: draft.node_type,
          experience_kind: draft.experience_kind,
          trigger_pattern: draft.trigger_pattern,
          compact_hint: draft.compact_hint,
          success_signal: draft.success_signal,
          evidence_summary: draft.evidence_summary
        },
        correction_window: {
          selected: directionalCorrection.detected,
          snippets: directionalCorrection.snippets,
          sources: directionalCorrection.sources
        },
        evidence_gate: {
          objective_support: directionalCorrection.objective_support,
          user_confirmation: directionalCorrection.user_confirmation
        },
        original_reason: reason
      },
      null,
      2
    );

    if (endpoint.kind === "anthropic") {
      return {
        model: endpoint.model,
        max_tokens: 512,
        system: `${EXPECTATION_CORRECTION_REPAIR_PROMPT}\n\n${EXPECTATION_CORRECTION_REPAIR_EXAMPLES}`,
        messages: [{ role: "user", content: payload }],
        temperature: 0
      };
    }

    if (endpoint.kind === "gemini") {
      return {
        system_instruction: {
          parts: [{ text: `${EXPECTATION_CORRECTION_REPAIR_PROMPT}\n\n${EXPECTATION_CORRECTION_REPAIR_EXAMPLES}` }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: payload }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: `${EXPECTATION_CORRECTION_REPAIR_PROMPT}\n\n${EXPECTATION_CORRECTION_REPAIR_EXAMPLES}` }],
        messages: [
          {
            role: "user",
            content: [{ text: payload }]
          }
        ],
        inferenceConfig: {
          maxTokens: 512,
          temperature: 0
        }
      };
    }

    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${EXPECTATION_CORRECTION_REPAIR_PROMPT}\n\n${EXPECTATION_CORRECTION_REPAIR_EXAMPLES}` },
        { role: "user", content: payload }
      ],
      temperature: 0
    };
  }

  private buildExpectationCorrectionRescueBody(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    reason: string,
    directionalCorrection: NonNullable<CandidateSourceSignal["directional_correction"]>
  ): Record<string, unknown> {
    const payload = JSON.stringify(
      {
        task_summary: input.task_summary,
        task_type: input.task_type,
        context_summary: input.context_summary,
        outcome_signal: input.outcome_signal,
        tool_events: input.tool_events.map((event) => ({
          tool_name: event.tool_name,
          status: event.status,
          error_signature: event.error_signature,
          output_summary: event.output_summary
        })),
        correction_window: {
          selected: directionalCorrection.detected,
          snippets: directionalCorrection.snippets,
          sources: directionalCorrection.sources
        },
        evidence_gate: {
          objective_support: directionalCorrection.objective_support,
          user_confirmation: directionalCorrection.user_confirmation
        },
        original_reason: reason
      },
      null,
      2
    );

    if (endpoint.kind === "anthropic") {
      return {
        model: endpoint.model,
        max_tokens: 768,
        system: EXPECTATION_CORRECTION_RESCUE_PROMPT,
        messages: [{ role: "user", content: payload }],
        temperature: 0
      };
    }

    if (endpoint.kind === "gemini") {
      return {
        system_instruction: {
          parts: [{ text: EXPECTATION_CORRECTION_RESCUE_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: payload }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: EXPECTATION_CORRECTION_RESCUE_PROMPT }],
        messages: [
          {
            role: "user",
            content: [{ text: payload }]
          }
        ],
        inferenceConfig: {
          maxTokens: 768,
          temperature: 0
        }
      };
    }

    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXPECTATION_CORRECTION_RESCUE_PROMPT },
        { role: "user", content: payload }
      ],
      temperature: 0
    };
  }

  private buildEvidenceDrivenReversalRepairBody(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    draft: ExperienceCandidateDraft,
    reason: string,
    reversal: NonNullable<CandidateSourceSignal["evidence_driven_reversal"]>
  ): Record<string, unknown> {
    const payload = JSON.stringify(
      {
        task_summary: input.task_summary,
        task_type: input.task_type,
        context_summary: input.context_summary,
        outcome_signal: input.outcome_signal,
        tool_events: input.tool_events.map((event) => ({
          tool_name: event.tool_name,
          status: event.status,
          error_signature: event.error_signature,
          output_summary: event.output_summary
        })),
        draft: {
          task_type: draft.task_type,
          node_type: draft.node_type,
          experience_kind: draft.experience_kind,
          trigger_pattern: draft.trigger_pattern,
          compact_hint: draft.compact_hint,
          success_signal: draft.success_signal,
          evidence_summary: draft.evidence_summary
        },
        reversal_window: {
          selected: reversal.detected,
          hypothesis_snippets: reversal.hypothesis_snippets,
          invalidating_snippets: reversal.invalidating_snippets,
          pivot_snippets: reversal.pivot_snippets,
          replacement_snippets: reversal.replacement_snippets,
          validating_snippets: reversal.validating_snippets
        },
        evidence_gate: {
          prior_hypothesis: reversal.prior_hypothesis,
          invalidating_evidence: reversal.invalidating_evidence,
          validating_evidence: reversal.validating_evidence
        },
        original_reason: reason
      },
      null,
      2
    );

    if (endpoint.kind === "anthropic") {
      return {
        model: endpoint.model,
        max_tokens: 640,
        system: EVIDENCE_DRIVEN_REVERSAL_REPAIR_PROMPT,
        messages: [{ role: "user", content: payload }],
        temperature: 0
      };
    }

    if (endpoint.kind === "gemini") {
      return {
        system_instruction: {
          parts: [{ text: EVIDENCE_DRIVEN_REVERSAL_REPAIR_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: payload }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: EVIDENCE_DRIVEN_REVERSAL_REPAIR_PROMPT }],
        messages: [
          {
            role: "user",
            content: [{ text: payload }]
          }
        ],
        inferenceConfig: {
          maxTokens: 640,
          temperature: 0
        }
      };
    }

    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EVIDENCE_DRIVEN_REVERSAL_REPAIR_PROMPT },
        { role: "user", content: payload }
      ],
      temperature: 0
    };
  }

  private buildEvidenceDrivenReversalRescueBody(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    reason: string,
    reversal: NonNullable<CandidateSourceSignal["evidence_driven_reversal"]>
  ): Record<string, unknown> {
    const payload = JSON.stringify(
      {
        task_summary: input.task_summary,
        task_type: input.task_type,
        context_summary: input.context_summary,
        outcome_signal: input.outcome_signal,
        tool_events: input.tool_events.map((event) => ({
          tool_name: event.tool_name,
          status: event.status,
          error_signature: event.error_signature,
          output_summary: event.output_summary
        })),
        reversal_window: {
          selected: reversal.detected,
          hypothesis_snippets: reversal.hypothesis_snippets,
          invalidating_snippets: reversal.invalidating_snippets,
          pivot_snippets: reversal.pivot_snippets,
          replacement_snippets: reversal.replacement_snippets,
          validating_snippets: reversal.validating_snippets
        },
        evidence_gate: {
          prior_hypothesis: reversal.prior_hypothesis,
          invalidating_evidence: reversal.invalidating_evidence,
          validating_evidence: reversal.validating_evidence
        },
        original_reason: reason
      },
      null,
      2
    );

    if (endpoint.kind === "anthropic") {
      return {
        model: endpoint.model,
        max_tokens: 768,
        system: EVIDENCE_DRIVEN_REVERSAL_RESCUE_PROMPT,
        messages: [{ role: "user", content: payload }],
        temperature: 0
      };
    }

    if (endpoint.kind === "gemini") {
      return {
        system_instruction: {
          parts: [{ text: EVIDENCE_DRIVEN_REVERSAL_RESCUE_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: payload }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: EVIDENCE_DRIVEN_REVERSAL_RESCUE_PROMPT }],
        messages: [
          {
            role: "user",
            content: [{ text: payload }]
          }
        ],
        inferenceConfig: {
          maxTokens: 768,
          temperature: 0
        }
      };
    }

    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EVIDENCE_DRIVEN_REVERSAL_RESCUE_PROMPT },
        { role: "user", content: payload }
      ],
      temperature: 0
    };
  }

  private parseExpectationCorrectionRepair(content: string): ExpectationCorrectionRepair | undefined {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.expectation_correction !== true) {
      return undefined;
    }

    const confidenceSignal = isConfidenceSignal(parsed.confidence_signal) ? parsed.confidence_signal : undefined;
    const validationState = isValidationState(parsed.validation_state) ? parsed.validation_state : undefined;
    const correctionScope = isCorrectionScope(parsed.correction_scope) ? parsed.correction_scope : undefined;
    const correctionCategory = isCorrectionCategory(parsed.correction_category) ? parsed.correction_category : undefined;
    const deviationPattern = pickString(parsed.deviation_pattern);
    const correctedConstraint = pickString(parsed.corrected_constraint);

    if (
      !confidenceSignal ||
      !validationState ||
      !correctionScope ||
      !correctionCategory ||
      !deviationPattern ||
      !correctedConstraint
    ) {
      return undefined;
    }

    return {
      experience_kind: "expectation_correction",
      confidence_signal: confidenceSignal,
      validation_state: validationState,
      correction_scope: correctionScope,
      correction_category: correctionCategory,
      deviation_pattern: deviationPattern,
      corrected_constraint: correctedConstraint
    };
  }

  private parseExpectationCorrectionRescue(
    content: string,
    input: ExperienceInput,
    directionalCorrection: NonNullable<CandidateSourceSignal["directional_correction"]>
  ): ExpectationCorrectionRescue | undefined {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.expectation_correction !== true) {
      return undefined;
    }

    const rawCandidate =
      parsed.candidate && typeof parsed.candidate === "object"
        ? (parsed.candidate as Record<string, unknown>)
        : undefined;
    if (!rawCandidate) {
      return undefined;
    }

    const draft = normalizeDraft(rawCandidate, input);
    if (
      draft.experience_kind !== "expectation_correction" ||
      !draft.correction_category ||
      !draft.deviation_pattern ||
      !draft.corrected_constraint
    ) {
      return undefined;
    }

    return {
      draft,
      directionalCorrectionSignal: {
        ...directionalCorrection,
        semantic_detected: true,
        correction_category: draft.correction_category,
        deviation_pattern: draft.deviation_pattern,
        corrected_constraint: draft.corrected_constraint
      }
    };
  }

  private parseEvidenceDrivenReversalRepair(content: string): EvidenceDrivenReversalRepair | undefined {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.reversal_detected !== true) {
      return undefined;
    }

    const reversalSource = parsed.reversal_source === "task_evidence" ? "task_evidence" : undefined;
    const supersededHypothesis = pickString(parsed.superseded_hypothesis);
    const replacementConstraint = pickString(parsed.replacement_constraint);
    const verificationEvidence = pickString(parsed.verification_evidence);
    const pivotSummary = pickString(parsed.pivot_summary);
    const correctionScope = isCorrectionScope(parsed.correction_scope) ? parsed.correction_scope : undefined;
    const correctionCategory = isCorrectionCategory(parsed.correction_category) ? parsed.correction_category : undefined;
    const deviationPattern = pickString(parsed.deviation_pattern);
    const correctedConstraint = pickString(parsed.corrected_constraint);

    if (
      !reversalSource ||
      !supersededHypothesis ||
      !replacementConstraint ||
      !verificationEvidence ||
      !correctionScope ||
      !correctionCategory ||
      !deviationPattern ||
      !correctedConstraint
    ) {
      return undefined;
    }

    return {
      reversal_detected: true,
      reversal_source: reversalSource,
      superseded_hypothesis: supersededHypothesis,
      replacement_constraint: replacementConstraint,
      verification_evidence: verificationEvidence,
      pivot_summary: pivotSummary,
      correction_scope: correctionScope,
      correction_category: correctionCategory,
      deviation_pattern: deviationPattern,
      corrected_constraint: correctedConstraint
    };
  }

  private parseEvidenceDrivenReversalRescue(
    content: string,
    input: ExperienceInput,
    reversal: NonNullable<CandidateSourceSignal["evidence_driven_reversal"]>
  ): EvidenceDrivenReversalRescue | undefined {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.reversal_detected !== true) {
      return undefined;
    }

    const reversalSource = parsed.reversal_source === "task_evidence" ? "task_evidence" : undefined;
    const supersededHypothesis = pickString(parsed.superseded_hypothesis);
    const replacementConstraint = pickString(parsed.replacement_constraint);
    const verificationEvidence = pickString(parsed.verification_evidence);
    const pivotSummary = pickString(parsed.pivot_summary);
    const rawCandidate =
      parsed.candidate && typeof parsed.candidate === "object"
        ? (parsed.candidate as Record<string, unknown>)
        : undefined;
    if (!rawCandidate || !reversalSource || !supersededHypothesis || !replacementConstraint || !verificationEvidence) {
      return undefined;
    }

    const draft = normalizeDraft(rawCandidate, input);
    if (
      draft.experience_kind !== "expectation_correction" ||
      !draft.correction_category ||
      !draft.deviation_pattern ||
      !draft.corrected_constraint
    ) {
      return undefined;
    }

    return {
      draft,
      evidenceDrivenReversalSignal: {
        ...reversal,
        semantic_detected: true,
        reversal_source: reversalSource,
        superseded_hypothesis: supersededHypothesis,
        replacement_constraint: replacementConstraint,
        verification_evidence: verificationEvidence,
        pivot_summary: pivotSummary,
        correction_category: draft.correction_category,
        deviation_pattern: draft.deviation_pattern,
        corrected_constraint: draft.corrected_constraint
      }
    };
  }

  private async maybeRepairExpectationCorrection(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    reason: string,
    draft: ExperienceCandidateDraft,
    directionalCorrection: CandidateSourceSignal["directional_correction"]
  ): Promise<{
    draft: ExperienceCandidateDraft;
    directionalCorrectionSignal?: NonNullable<CandidateSourceSignal["directional_correction"]>;
  }> {
    const hasCompleteExpectationCorrectionShape =
      draft.experience_kind === "expectation_correction" &&
      Boolean(
        draft.confidence_signal &&
          draft.validation_state &&
          draft.correction_scope &&
          draft.correction_category &&
          draft.deviation_pattern &&
          draft.corrected_constraint
      );

    if (input.outcome_signal !== "success" || hasCompleteExpectationCorrectionShape) {
      return {
        draft,
        directionalCorrectionSignal: directionalCorrection?.detected ? directionalCorrection : undefined
      };
    }

    if (
      !directionalCorrection?.detected ||
      (!directionalCorrection.objective_support && !directionalCorrection.user_confirmation)
    ) {
      return {
        draft,
        directionalCorrectionSignal: directionalCorrection?.detected ? directionalCorrection : undefined
      };
    }

    try {
      const response = await this.postJsonWithRetry(
        this.buildRequestUrl(endpoint),
        endpoint,
        this.buildExpectationCorrectionRepairBody(endpoint, input, draft, reason, directionalCorrection)
      );
      if (!response.ok) {
        return {
          draft,
          directionalCorrectionSignal: directionalCorrection
        };
      }

      const content = await this.parseResponseContent(endpoint, response);
      const repair = this.parseExpectationCorrectionRepair(content);
      if (!repair) {
        return {
          draft,
          directionalCorrectionSignal: directionalCorrection
        };
      }

      return {
        draft: normalizeCandidate({
          ...draft,
          ...repair
        }),
        directionalCorrectionSignal: {
          ...directionalCorrection,
          semantic_detected: true,
          correction_category: repair.correction_category,
          deviation_pattern: repair.deviation_pattern,
          corrected_constraint: repair.corrected_constraint
        }
      };
    } catch {
      return {
        draft,
        directionalCorrectionSignal: directionalCorrection
      };
    }
  }

  private async maybeRepairEvidenceDrivenReversal(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    reason: string,
    draft: ExperienceCandidateDraft,
    directionalCorrection: CandidateSourceSignal["directional_correction"],
    reversal: CandidateSourceSignal["evidence_driven_reversal"]
  ): Promise<{
    draft: ExperienceCandidateDraft;
    evidenceDrivenReversalSignal?: NonNullable<CandidateSourceSignal["evidence_driven_reversal"]>;
  }> {
    if (
      input.outcome_signal !== "success" ||
      (directionalCorrection?.correction_source &&
        directionalCorrection.correction_source !== "task_evidence" &&
        directionalCorrection.detected) ||
      !reversal?.detected ||
      !reversal.prior_hypothesis ||
      !reversal.invalidating_evidence ||
      !reversal.validating_evidence
    ) {
      return {
        draft,
        evidenceDrivenReversalSignal: reversal?.detected ? reversal : undefined
      };
    }

    try {
      const response = await this.postJsonWithRetry(
        this.buildRequestUrl(endpoint),
        endpoint,
        this.buildEvidenceDrivenReversalRepairBody(endpoint, input, draft, reason, reversal)
      );
      if (!response.ok) {
        return {
          draft,
          evidenceDrivenReversalSignal: reversal
        };
      }

      const content = await this.parseResponseContent(endpoint, response);
      const repair = this.parseEvidenceDrivenReversalRepair(content);
      if (!repair) {
        return {
          draft,
          evidenceDrivenReversalSignal: reversal
        };
      }

      return {
        draft: normalizeCandidate({
          ...draft,
          experience_kind: "expectation_correction",
          confidence_signal: draft.confidence_signal ?? "supported_by_objective_success",
          validation_state: draft.validation_state ?? "pending_reuse_validation",
          correction_scope: repair.correction_scope,
          correction_category: repair.correction_category,
          deviation_pattern: repair.deviation_pattern,
          corrected_constraint: repair.corrected_constraint
        }),
        evidenceDrivenReversalSignal: {
          ...reversal,
          semantic_detected: true,
          reversal_source: repair.reversal_source,
          superseded_hypothesis: repair.superseded_hypothesis,
          replacement_constraint: repair.replacement_constraint,
          verification_evidence: repair.verification_evidence,
          pivot_summary: repair.pivot_summary,
          correction_category: repair.correction_category,
          deviation_pattern: repair.deviation_pattern,
          corrected_constraint: repair.corrected_constraint
        }
      };
    } catch {
      return {
        draft,
        evidenceDrivenReversalSignal: reversal
      };
    }
  }

  private async maybeRescueExpectationCorrection(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    reason: string,
    directionalCorrection: CandidateSourceSignal["directional_correction"]
  ): Promise<ExpectationCorrectionRescue | undefined> {
    if (
      input.outcome_signal !== "success" ||
      !directionalCorrection?.detected ||
      (!directionalCorrection.objective_support && !directionalCorrection.user_confirmation)
    ) {
      return undefined;
    }

    try {
      const response = await this.postJsonWithRetry(
        this.buildRequestUrl(endpoint),
        endpoint,
        this.buildExpectationCorrectionRescueBody(endpoint, input, reason, directionalCorrection)
      );
      if (!response.ok) {
        return undefined;
      }

      const content = await this.parseResponseContent(endpoint, response);
      return this.parseExpectationCorrectionRescue(content, input, directionalCorrection);
    } catch {
      return undefined;
    }
  }

  private async maybeRescueEvidenceDrivenReversal(
    endpoint: DistillerEndpoint,
    input: ExperienceInput,
    reason: string,
    directionalCorrection: CandidateSourceSignal["directional_correction"],
    reversal: CandidateSourceSignal["evidence_driven_reversal"]
  ): Promise<EvidenceDrivenReversalRescue | undefined> {
    if (
      input.outcome_signal !== "success" ||
      (directionalCorrection?.correction_source &&
        directionalCorrection.correction_source !== "task_evidence" &&
        directionalCorrection.detected) ||
      !reversal?.detected ||
      !reversal.prior_hypothesis ||
      !reversal.invalidating_evidence ||
      !reversal.validating_evidence
    ) {
      return undefined;
    }

    try {
      const response = await this.postJsonWithRetry(
        this.buildRequestUrl(endpoint),
        endpoint,
        this.buildEvidenceDrivenReversalRescueBody(endpoint, input, reason, reversal)
      );
      if (!response.ok) {
        return undefined;
      }

      const content = await this.parseResponseContent(endpoint, response);
      return this.parseEvidenceDrivenReversalRescue(content, input, reversal);
    } catch {
      return undefined;
    }
  }

  private async parseResponseContent(endpoint: DistillerEndpoint, response: Response): Promise<string> {
    if (endpoint.kind === "anthropic") {
      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const textBlock = payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string");
      if (!textBlock?.text) {
        throw new Error("Learning gate response did not include a text payload");
      }
      return textBlock.text;
    }

    if (endpoint.kind === "gemini") {
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Learning gate response did not include a Gemini text payload");
      }
      return text;
    }

    if (endpoint.kind === "bedrock") {
      const payload = (await response.json()) as {
        output?: { message?: { content?: Array<{ text?: string }> } };
      };
      const text = payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Learning gate response did not include a Bedrock text payload");
      }
      return text;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Learning gate response did not include a message payload");
    }
    return content;
  }

  private buildBedrockHeaders(endpoint: Extract<DistillerEndpoint, { kind: "bedrock" }>, body: string): Record<string, string> {
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = toDateStamp(now);
    const bodyHash = sha256Hex(body);
    const target = new URL(endpoint.baseUrl);
    const canonicalHeaders =
      `content-type:application/json\nhost:${target.host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n` +
      (endpoint.sessionToken ? `x-amz-security-token:${endpoint.sessionToken}\n` : "");
    const signedHeaders = endpoint.sessionToken
      ? "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
      : "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["POST", target.pathname, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
    const credentialScope = `${dateStamp}/${endpoint.region}/${BEDROCK_SERVICE}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${endpoint.secretAccessKey}`, dateStamp), endpoint.region), BEDROCK_SERVICE),
      "aws4_request"
    );
    const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

    return {
      "Content-Type": "application/json",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": bodyHash,
      ...(endpoint.sessionToken ? { "x-amz-security-token": endpoint.sessionToken } : {}),
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${endpoint.accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`
    };
  }

  private async postJson(url: string, endpoint: DistillerEndpoint, body: Record<string, unknown>): Promise<Response> {
    const serializedBody = JSON.stringify(body);
    const headers =
      endpoint.kind === "bedrock"
        ? this.buildBedrockHeaders(endpoint, serializedBody)
        : endpoint.kind === "gemini" && endpoint.authMode === "google_adc"
          ? {
              "Content-Type": "application/json",
              ...endpoint.headers,
              Authorization: `Bearer ${await resolveGoogleAdcAccessToken({
                env: this.env,
                fetchImpl: this.fetchImpl
              })}`
            }
          : {
              "Content-Type": "application/json",
              ...endpoint.headers
            };
    const timeoutMs = resolveRequestTimeoutMs(endpoint);

    try {
      return await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: serializedBody,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (
        (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
        (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "TimeoutError")
      ) {
        throw new Error(`Learning gate request timed out after ${timeoutMs}ms`);
      }

      throw error;
    }
  }

  private async postJsonWithRetry(
    url: string,
    endpoint: DistillerEndpoint,
    body: Record<string, unknown>
  ): Promise<Response> {
    try {
      const response = await this.postJson(url, endpoint, body);
      if (response.ok || (response.status !== 429 && response.status < 500)) {
        return response;
      }
      await sleep(TRANSIENT_RETRY_DELAY_MS);
      return await this.postJson(url, endpoint, body);
    } catch (error) {
      if (!isTransientProviderFailure(error)) {
        throw error;
      }
      await sleep(TRANSIENT_RETRY_DELAY_MS);
      return await this.postJson(url, endpoint, body);
    }
  }

  async generateCandidateDrafts(input: ExperienceInput): Promise<LearningGateResult> {
    if (input.task_type === "unknown") {
      return {
        worthCapturing: false,
        reason: "task type is unknown",
        drafts: [],
        source: "disabled"
      };
    }

    const eligibility = evaluateLearningEligibility(input);
    if (!eligibility.eligible) {
      return {
        worthCapturing: false,
        reason: eligibility.reason,
        drafts: [],
        source: "disabled"
      };
    }

    const resolution = this.resolveDistillation();
    if (this.config.distillationMode === "disabled" || resolution.distillationMode === "disabled") {
      return {
        worthCapturing: false,
        reason: resolution.reason,
        drafts: [],
        source: "disabled"
      };
    }

    if (resolution.distillationMode !== "llm" || !resolution.endpoint) {
      const fallback = analyzeExperience(input);
        return {
          worthCapturing: fallback.accepted.length > 0,
          reason: fallback.accepted.length > 0 ? "captured by rule fallback" : "rule fallback rejected candidate",
          drafts: fallback.accepted.map((draft) => applyTaskManagementPromotionPolicy(input, draft)),
          source: "rule"
        };
    }

    try {
      const response = await this.postJsonWithRetry(
        this.buildRequestUrl(resolution.endpoint),
        resolution.endpoint,
        this.buildRequestBody(resolution.endpoint, input)
      );
      if (!response.ok) {
        throw new Error(`Learning gate request failed with ${response.status}`);
      }

      const content = await this.parseResponseContent(resolution.endpoint, response);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const worthCapturing = parsed.worth_capturing === true;
      const reason = pickString(parsed.reason) ?? "no reason provided";
      const candidateSignals = buildCandidateSignals(input);
      const directionalCorrection = candidateSignals.directional_correction;
      const evidenceDrivenReversal = candidateSignals.evidence_driven_reversal;

      if (!worthCapturing) {
        const rescued = await this.maybeRescueExpectationCorrection(
          resolution.endpoint,
          input,
          reason,
          directionalCorrection
        );
        if (rescued) {
          return {
            worthCapturing: true,
            reason: `rescued directional correction: ${reason}`,
            drafts: dedupeCandidates([applyTaskManagementPromotionPolicy(input, rescued.draft)]),
            source: "llm",
            directionalCorrectionSignal: rescued.directionalCorrectionSignal
          };
        }

        const rescuedReversal = await this.maybeRescueEvidenceDrivenReversal(
          resolution.endpoint,
          input,
          reason,
          directionalCorrection,
          evidenceDrivenReversal
        );
        if (rescuedReversal) {
          return {
            worthCapturing: true,
            reason: `rescued evidence-driven reversal: ${reason}`,
            drafts: dedupeCandidates([applyTaskManagementPromotionPolicy(input, rescuedReversal.draft)]),
            source: "llm",
            evidenceDrivenReversalSignal: rescuedReversal.evidenceDrivenReversalSignal
          };
        }

        return {
          worthCapturing: false,
          reason,
          drafts: [],
          source: "llm"
        };
      }

      const rawCandidate =
        parsed.candidate && typeof parsed.candidate === "object"
          ? (parsed.candidate as Record<string, unknown>)
          : undefined;
      if (!rawCandidate) {
        throw new Error("Learning gate marked worth_capturing=true without a candidate payload");
      }

      const repaired = await this.maybeRepairExpectationCorrection(
        resolution.endpoint,
        input,
        reason,
        normalizeDraft(rawCandidate, input),
        directionalCorrection
      );

      const reversalRepaired = await this.maybeRepairEvidenceDrivenReversal(
        resolution.endpoint,
        input,
        reason,
        repaired.draft,
        directionalCorrection,
        evidenceDrivenReversal
      );

      return {
        worthCapturing: true,
        reason,
        drafts: dedupeCandidates([applyTaskManagementPromotionPolicy(input, reversalRepaired.draft)]),
        source: "llm",
        directionalCorrectionSignal: repaired.directionalCorrectionSignal,
        evidenceDrivenReversalSignal: reversalRepaired.evidenceDrivenReversalSignal
      };
    } catch (error) {
      const fallback = analyzeExperience(input);
      return {
        worthCapturing: fallback.accepted.length > 0,
        reason: `llm gate failed: ${error instanceof Error ? error.message : String(error)}`,
        drafts: fallback.accepted.map((draft) => applyTaskManagementPromotionPolicy(input, draft)),
        source: "rule"
      };
    }
  }
}
