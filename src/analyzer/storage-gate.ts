import type { ExperienceCandidateDraft, ExperienceInput } from "../types/domain.js";
import { buildCandidateSignals } from "./candidate-signals.js";

export const shouldStoreCandidate = (candidate: ExperienceCandidateDraft, input: ExperienceInput): boolean => {
  if (input.task_type === "unknown") {
    return false;
  }

  const signals = buildCandidateSignals(input);
  if (!signals.criticality || !signals.improvement_room || !signals.recoverable_path) {
    return false;
  }

  if (!candidate.compact_hint || candidate.compact_hint.length < 20) {
    return false;
  }

  if (!candidate.evidence_summary || candidate.evidence_summary.length < 12) {
    return false;
  }

  return true;
};
