import type { ExperienceCandidate } from "../types/domain.js";

export const DEFAULT_DISTILLER_SYSTEM_PROMPT = `You turn coding-task experience candidates into compact intervention hints.
Use hindsight framing: if the agent knew one key fact earlier, what would it do differently?

Return strict JSON with keys:
- compact_hint
- trigger_conditions
- success_criteria
- risk_level
- recommended_steps
- avoid_steps
- fallback_steps
- evidence_summary
- goal (optional)
- applicability_notes (optional)
- promotion_signal (optional: normal | high_value)
- promotion_reason (optional)

Rules:
- Keep compact_hint to 1-2 sentences, action-oriented.
- trigger_conditions describes when to apply the hint (short phrase).
- success_criteria describes the terminal success evidence (short phrase).
- risk_level must be one of: low, medium, high.
- Preserve the original node_type intent (strategy or warning).
- Keep recommendations specific to the candidate evidence.
- Use sourceSignal (failure_signature, retry_count, correction_signals, directional_correction, evidence_driven_reversal, tool_event_summary) to ground the hindsight.
- Do not invent tools or outcomes not present in the candidate.
- For expectation_correction, keep only real solution-direction corrections; do not reframe wording-only, copy-only, or presentation-only refinements as reusable experience.
- When sourceSignal.directional_correction is present, use it to preserve the original deviation, corrected constraint, and supporting evidence instead of drifting into generic advice.
- When sourceSignal.evidence_driven_reversal is present, preserve the disproven hypothesis, the replacement constraint, and the validating evidence instead of collapsing the lesson into a generic verification loop.
- recommended_steps / avoid_steps / fallback_steps must be arrays of short strings.`;

export const buildCandidatePayload = (candidate: ExperienceCandidate): string =>
  JSON.stringify(
    {
      nodeType: candidate.node_type,
      taskType: candidate.task_type,
      experienceKind: candidate.experience_kind,
      confidenceSignal: candidate.confidence_signal,
      validationState: candidate.validation_state,
      correctionScope: candidate.correction_scope,
      correctionCategory: candidate.correction_category,
      deviationPattern: candidate.deviation_pattern,
      correctedConstraint: candidate.corrected_constraint,
      triggerPattern: candidate.trigger_pattern,
      compactHintDraft: candidate.compact_hint,
      goalDraft: candidate.goal,
      applicabilityNotesDraft: candidate.applicability_notes,
      recommendedStepsDraft: candidate.recommended_steps ?? [],
      avoidStepsDraft: candidate.avoid_steps ?? [],
      fallbackStepsDraft: candidate.fallback_steps ?? [],
      successSignalDraft: candidate.success_signal,
      stopConditionDraft: candidate.stop_condition,
      escalationConditionDraft: candidate.escalation_condition,
      evidenceSummaryDraft: candidate.evidence_summary,
      sourceSignal: candidate.source_signal
    },
    null,
    2
  );
