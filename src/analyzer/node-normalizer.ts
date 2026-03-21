import type { ExperienceCandidateDraft } from "../types/domain.js";
import { normalizeWhitespace, toSentence, truncate } from "../utils/text.js";

const cleanList = (items?: string[]): string[] | undefined => {
  if (!items?.length) {
    return undefined;
  }

  const normalized = items.map((item) => truncate(toSentence(normalizeWhitespace(item)), 180)).slice(0, 4);
  return normalized.length ? normalized : undefined;
};

export const normalizeCandidate = (candidate: ExperienceCandidateDraft): ExperienceCandidateDraft => ({
  ...candidate,
  deviation_pattern: candidate.deviation_pattern
    ? truncate(toSentence(normalizeWhitespace(candidate.deviation_pattern)), 180)
    : undefined,
  corrected_constraint: candidate.corrected_constraint
    ? truncate(toSentence(normalizeWhitespace(candidate.corrected_constraint)), 180)
    : undefined,
  trigger_pattern: truncate(normalizeWhitespace(candidate.trigger_pattern), 180),
  compact_hint: truncate(toSentence(candidate.compact_hint), 220),
  evidence_summary: truncate(toSentence(candidate.evidence_summary), 220),
  success_signal: truncate(toSentence(candidate.success_signal), 180),
  applicability_notes: candidate.applicability_notes
    ? truncate(toSentence(candidate.applicability_notes), 180)
    : undefined,
  recommended_steps: cleanList(candidate.recommended_steps),
  avoid_steps: cleanList(candidate.avoid_steps),
  fallback_steps: cleanList(candidate.fallback_steps)
});
