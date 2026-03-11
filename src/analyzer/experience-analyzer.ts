import type { AnalyzerResult } from "../types/analyzer.js";
import type { ExperienceCandidate, ExperienceInput } from "../types/domain.js";
import { dedupeCandidates } from "./node-deduper.js";
import { normalizeCandidate } from "./node-normalizer.js";
import { shouldStoreCandidate } from "./storage-gate.js";
import { extractStrategies } from "./strategy-extractor.js";
import { extractWarnings } from "./warning-extractor.js";

export const analyzeExperience = (input: ExperienceInput): AnalyzerResult => {
  const rawCandidates = [...extractStrategies(input), ...extractWarnings(input)].map(normalizeCandidate);
  const candidates = dedupeCandidates(rawCandidates);

  const accepted: ExperienceCandidate[] = [];
  const rejected: ExperienceCandidate[] = [];
  const reasons: string[] = [];

  for (const candidate of candidates) {
    if (shouldStoreCandidate(candidate, input)) {
      accepted.push(candidate);
    } else {
      rejected.push(candidate);
      reasons.push(`Rejected ${candidate.node_type} candidate for task ${input.task_type}.`);
    }
  }

  return { accepted, rejected, reasons, source: input };
};

