import type { ExperienceCandidate, ExperienceInput } from "./domain.js";

export type AnalyzerResult = {
  accepted: ExperienceCandidate[];
  rejected: ExperienceCandidate[];
  reasons: string[];
  source: ExperienceInput;
};

