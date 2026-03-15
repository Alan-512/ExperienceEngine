import type { ExperienceCandidateDraft, ExperienceInput } from "./domain.js";

export type AnalyzerResult = {
  accepted: ExperienceCandidateDraft[];
  rejected: ExperienceCandidateDraft[];
  reasons: string[];
  source: ExperienceInput;
};
