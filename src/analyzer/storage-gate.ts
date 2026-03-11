import type { ExperienceCandidate, ExperienceInput } from "../types/domain.js";

export const shouldStoreCandidate = (candidate: ExperienceCandidate, input: ExperienceInput): boolean => {
  if (input.task_type === "unknown") {
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

