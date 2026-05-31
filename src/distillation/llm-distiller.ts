
import type {
  ConfidenceSignal,
  CorrectionCategory,
  CorrectionScope,
  ExperienceCandidate,
  ExperienceCandidateDraft,
  ExperienceInput,
  ExperienceKind,
  PromotionSignal,
  ValidationState
} from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { DistillationResult } from "./types.js";
import {
  resolveDistillationResolution,
  resolveDistillerEndpoints,
  type DistillationResolution,
  type DistillerEndpoint
} from "./host-llm.js";
import { DEFAULT_DISTILLER_SYSTEM_PROMPT, buildCandidatePayload } from "./prompt-contract.js";
import { LlmRequestDispatcher } from "./llm-request-dispatcher.js";

type DistillerRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
};



const parseArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : undefined;

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const normalizeRiskLevel = (value: unknown): "low" | "medium" | "high" | undefined => {
  const normalized = pickString(value)?.toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return undefined;
};

const EXPERIENCE_KINDS: ExperienceKind[] = [
  "execution_pattern",
  "config_troubleshooting",
  "verification_loop",
  "warning",
  "expectation_correction"
];
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

const isExperienceKind = (value: unknown): value is ExperienceKind =>
  typeof value === "string" && EXPERIENCE_KINDS.includes(value as ExperienceKind);
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

const withRiskLevel = (summary: string | undefined, riskLevel: string | undefined): string => {
  const trimmed = pickString(summary) ?? "";
  if (!riskLevel) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("risk level:")) {
    return trimmed;
  }
  return trimmed ? `Risk level: ${riskLevel}. ${trimmed}` : `Risk level: ${riskLevel}.`;
};

const validateDistillationPayload = (
  parsed: Record<string, unknown>
): {
  compactHint: string;
  triggerConditions: string;
  successCriteria: string;
  riskLevel: "low" | "medium" | "high";
} => {
  const compactHint = pickString(parsed.compact_hint);
  const triggerConditions = pickString(parsed.trigger_conditions);
  const successCriteria = pickString(parsed.success_criteria);
  const riskLevel = normalizeRiskLevel(parsed.risk_level);
  const missing: string[] = [];

  if (!compactHint) {
    missing.push("compact_hint");
  }
  if (!triggerConditions) {
    missing.push("trigger_conditions");
  }
  if (!successCriteria) {
    missing.push("success_criteria");
  }
  if (!riskLevel) {
    missing.push("risk_level");
  }

  if (missing.length) {
    throw new Error(`Distillation output missing required fields: ${missing.join(", ")}`);
  }

  return {
    compactHint: compactHint!,
    triggerConditions: triggerConditions!,
    successCriteria: successCriteria!,
    riskLevel: riskLevel!
  };
};

const applyFallbacks = (
  candidate: ExperienceCandidate,
  parsed: Record<string, unknown>,
  validated?: {
    compactHint: string;
    triggerConditions: string;
    successCriteria: string;
    riskLevel: "low" | "medium" | "high";
  }
): DistillationResult => {
  const triggerConditions =
    validated?.triggerConditions ?? pickString(parsed.trigger_conditions) ?? pickString(parsed.applicability_notes);
  const successCriteria =
    validated?.successCriteria ?? pickString(parsed.success_criteria) ?? pickString(parsed.success_signal);
  const riskLevel = validated?.riskLevel ?? normalizeRiskLevel(parsed.risk_level);
  const evidenceSummary = withRiskLevel(pickString(parsed.evidence_summary) ?? candidate.evidence_summary, riskLevel);

  return {
    node_type: candidate.node_type,
    scope_id: candidate.scope_id,
    task_type: candidate.task_type,
    experience_kind: isExperienceKind(parsed.experience_kind) ? parsed.experience_kind : candidate.experience_kind,
    confidence_signal: isConfidenceSignal(parsed.confidence_signal)
      ? parsed.confidence_signal
      : candidate.confidence_signal,
    validation_state: isValidationState(parsed.validation_state) ? parsed.validation_state : candidate.validation_state,
    correction_scope: isCorrectionScope(parsed.correction_scope) ? parsed.correction_scope : candidate.correction_scope,
    correction_category: isCorrectionCategory(parsed.correction_category)
      ? parsed.correction_category
      : candidate.correction_category,
    deviation_pattern: pickString(parsed.deviation_pattern) ?? candidate.deviation_pattern,
    corrected_constraint: pickString(parsed.corrected_constraint) ?? candidate.corrected_constraint,
    trigger_pattern: candidate.trigger_pattern,
    applicability_notes: triggerConditions ?? candidate.applicability_notes,
    env_signature: candidate.env_signature,
    compact_hint: validated?.compactHint ?? pickString(parsed.compact_hint) ?? candidate.compact_hint,
    goal: pickString(parsed.goal) ?? candidate.goal,
    recommended_steps: parseArray(parsed.recommended_steps) ?? candidate.recommended_steps,
    avoid_steps: parseArray(parsed.avoid_steps) ?? candidate.avoid_steps,
    fallback_steps: parseArray(parsed.fallback_steps) ?? candidate.fallback_steps,
    success_signal: successCriteria ?? candidate.success_signal,
    stop_condition: pickString(parsed.stop_condition) ?? candidate.stop_condition,
    escalation_condition: pickString(parsed.escalation_condition) ?? candidate.escalation_condition,
    evidence_summary: evidenceSummary,
    retrieval_text: candidate.retrieval_text,
    promotion_signal: isPromotionSignal(parsed.promotion_signal) ? parsed.promotion_signal : candidate.promotion_signal,
    promotion_reason: pickString(parsed.promotion_reason) ?? candidate.promotion_reason,
    source_kind: candidate.source_kind
  };
};

const passthroughDistillation = (candidate: ExperienceCandidate): DistillationResult => ({
  ...applyFallbacks(candidate, {}),
  distillation_mode_used: "rule",
  distillation_source: "rule"
});

const resolveTemperature = (profile: ExperienceEngineConfig["distillerProfile"]): number => {
  switch (profile) {
    case "high_quality":
      return 0.3;
    case "fast":
      return 0;
    case "balanced":
    default:
      return 0.1;
  }
};



const isTransientProviderFailure = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /timed out/i.test(message) ||
    /aborted/i.test(message) ||
    /failed with (?:HTTP\s+)?429\b/i.test(message) ||
    /failed with (?:HTTP\s+)?5\d{2}\b/i.test(message) ||
    /did not include a/i.test(message)
  );
};

export class LlmDistiller {
  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly options: DistillerRuntimeOptions = {}
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



  async distill(candidate: ExperienceCandidate): Promise<DistillationResult> {
    const resolution = this.resolveDistillation();
    if (resolution.distillationMode === "disabled") {
      if (this.config.distillationMode === "llm" || !this.config.distillationAllowPassthrough) {
        throw new Error("Distillation requires a configured LLM endpoint");
      }
      throw new Error(resolution.reason);
    }

    if (resolution.distillationMode === "rule") {
      return passthroughDistillation(candidate);
    }

    const endpoints = resolveDistillerEndpoints({
      env: this.env,
      configProvider: this.config.distillerProvider,
      configAuthMode: this.config.distillationAuthMode,
      configModel: this.config.distillerModel,
      configFallbackChain: this.config.distillationFallbackChain
    });

    if (endpoints.length === 0) {
      throw new Error("Distillation resolution did not provide a reusable endpoint.");
    }

    try {
      const content = await LlmRequestDispatcher.execute(endpoints, {
        systemPrompt: DEFAULT_DISTILLER_SYSTEM_PROMPT,
        userPrompt: buildCandidatePayload(candidate),
        temperature: resolveTemperature(this.config.distillerProfile),
        responseJson: true,
        fetchImpl: this.fetchImpl,
        env: this.env,
        fallbackCodes: this.config.distillationFallbackCodes,
        maxTokens: 1024,
        maxRetries: this.config.distillationMaxRetries
      });

      const parsed = JSON.parse(content) as Record<string, unknown>;
      const validated = validateDistillationPayload(parsed);
      return {
        ...applyFallbacks(candidate, parsed, validated),
        distillation_mode_used: "llm",
        distillation_source: resolution.distillationSource
      };
    } catch (error) {
      if (this.config.distillationAllowPassthrough && isTransientProviderFailure(error)) {
        return passthroughDistillation(candidate);
      }
      throw error;
    }
  }
}
