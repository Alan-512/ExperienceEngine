import type { ExperienceCandidateDraft, ExperienceNodeType } from "../types/domain.js";

export type DistillationResult = ExperienceCandidateDraft & {
  node_type: ExperienceNodeType;
  distillation_mode_used?: "llm" | "rule" | "disabled";
  distillation_source?: "explicit_provider" | "rule" | "disabled";
};
