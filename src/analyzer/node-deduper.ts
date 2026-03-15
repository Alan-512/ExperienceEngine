import type { ExperienceCandidateDraft } from "../types/domain.js";

export const dedupeCandidates = (candidates: ExperienceCandidateDraft[]): ExperienceCandidateDraft[] => {
  const seen = new Set<string>();
  const deduped: ExperienceCandidateDraft[] = [];

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
