import type { ExperienceCandidateDraft, ExperienceNodeType } from "../types/domain.js";

export type DistillationResult = ExperienceCandidateDraft & {
  node_type: ExperienceNodeType;
};
