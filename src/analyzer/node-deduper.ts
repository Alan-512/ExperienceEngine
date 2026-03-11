import type { ExperienceCandidate } from "../types/domain.js";

export const dedupeCandidates = (candidates: ExperienceCandidate[]): ExperienceCandidate[] => {
  const seen = new Set<string>();
  const deduped: ExperienceCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.scope_id}:${candidate.task_type}:${candidate.node_type}:${candidate.compact_hint.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
};

