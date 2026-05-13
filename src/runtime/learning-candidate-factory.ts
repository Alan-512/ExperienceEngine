import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";
import type {
  CandidateSourceSignal,
  DistillationJob,
  ExperienceCandidate,
  ExperienceCandidateDraft,
  ExperienceInput
} from "../types/domain.js";

const toEvidence = (input: ExperienceInput): string[] =>
  input.tool_events.map((event) =>
    [event.tool_name, event.status, event.error_signature ?? event.output_summary]
      .filter(Boolean)
      .join(": ")
  );

const buildCandidateSourceSignal = (input: ExperienceInput): CandidateSourceSignal => {
  const signals = buildCandidateSignals(input);

  return {
    task_summary: input.task_summary,
    context_summary: input.context_summary,
    outcome_signal: input.outcome_signal,
    tool_events: input.tool_events,
    evidence: toEvidence(input),
    failure_signature: signals.failure_signature,
    retry_count: signals.retry_count,
    correction_signals: signals.correction_signals,
    directional_correction: signals.directional_correction,
    evidence_driven_reversal: signals.evidence_driven_reversal,
    tool_event_summary: signals.tool_event_summary
  };
};

const mergeDirectionalCorrectionIntoSourceSignal = (
  sourceSignal: CandidateSourceSignal,
  draft: ExperienceCandidateDraft
): CandidateSourceSignal => {
  const directionalCorrection = sourceSignal.directional_correction;
  if (!directionalCorrection) {
    return sourceSignal;
  }

  const semanticDetected = Boolean(
    draft.experience_kind === "expectation_correction" &&
      draft.correction_category &&
      draft.deviation_pattern &&
      draft.corrected_constraint
  );

  if (!semanticDetected) {
    return sourceSignal;
  }

  return {
    ...sourceSignal,
    directional_correction: {
      ...directionalCorrection,
      semantic_detected: true,
      correction_category: draft.correction_category,
      deviation_pattern: draft.deviation_pattern,
      corrected_constraint: draft.corrected_constraint
    }
  };
};

const mergeEvidenceDrivenReversalIntoSourceSignal = (
  sourceSignal: CandidateSourceSignal,
  draft: ExperienceCandidateDraft
): CandidateSourceSignal => {
  const reversal = sourceSignal.evidence_driven_reversal;
  if (!reversal) {
    return sourceSignal;
  }

  const semanticDetected = Boolean(
    draft.experience_kind === "expectation_correction" &&
      draft.correction_category &&
      draft.deviation_pattern &&
      draft.corrected_constraint
  );

  if (!semanticDetected) {
    return sourceSignal;
  }

  return {
    ...sourceSignal,
    evidence_driven_reversal: {
      ...reversal,
      semantic_detected: true,
      correction_category: draft.correction_category,
      deviation_pattern: draft.deviation_pattern,
      corrected_constraint: draft.corrected_constraint
    }
  };
};

const summarizeRawCandidate = (sourceSignal: CandidateSourceSignal): string => {
  const fragments = [...sourceSignal.tool_event_summary];
  if (sourceSignal.failure_signature) {
    fragments.unshift(`failure signature: ${sourceSignal.failure_signature}`);
  }
  return fragments.slice(0, 3).join(" | ");
};

const resolveCandidateKind = (
  input: ExperienceInput,
  sourceSignal: CandidateSourceSignal
): NonNullable<ExperienceCandidate["candidate_kind"]> => {
  if (input.outcome_signal === "success") {
    return "successful_fix";
  }
  if (sourceSignal.retry_count > 1) {
    return "retry_pattern";
  }
  if (sourceSignal.correction_signals.length > 0) {
    return "correction";
  }
  return "failure";
};

export const draftToCandidate = (
  draft: ExperienceCandidateDraft,
  input: ExperienceInput,
  originRecordId: string,
  taskRunId?: string,
  directionalCorrectionSignal?: CandidateSourceSignal["directional_correction"],
  evidenceDrivenReversalSignal?: CandidateSourceSignal["evidence_driven_reversal"]
): ExperienceCandidate => {
  const timestamp = nowIso();
  const baseSourceSignal = buildCandidateSourceSignal(input);
  const sourceSignal = mergeEvidenceDrivenReversalIntoSourceSignal(
    mergeDirectionalCorrectionIntoSourceSignal(
      {
        ...baseSourceSignal,
        directional_correction: directionalCorrectionSignal ?? baseSourceSignal.directional_correction,
        evidence_driven_reversal: evidenceDrivenReversalSignal ?? baseSourceSignal.evidence_driven_reversal
      },
      draft
    ),
    draft
  );
  const candidateId = stableId(
    "candidate",
    [draft.scope_id, draft.task_type, draft.node_type, draft.compact_hint, originRecordId].join(":")
  );

  return {
    id: candidateId,
    task_run_id: taskRunId ?? originRecordId,
    candidate_kind: resolveCandidateKind(input, sourceSignal),
    ...draft,
    source_record_id: originRecordId,
    source_context_summary: input.context_summary,
    source_outcome_signal: input.outcome_signal,
    raw_summary: summarizeRawCandidate(sourceSignal),
    failure_signature: sourceSignal.failure_signature,
    source_signal: sourceSignal,
    lifecycle_state: "pending",
    retry_count: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
};

export const candidateToInitialJob = (
  candidate: ExperienceCandidate,
  extractorProfile: string
): DistillationJob => {
  const timestamp = nowIso();

  return {
    id: stableId("distill", candidate.id),
    candidate_id: candidate.id,
    status: "pending",
    extractor_profile: extractorProfile,
    retry_count: candidate.retry_count,
    created_at: timestamp,
    updated_at: timestamp
  };
};
