import type { BenchmarkSummary } from "../evaluation/benchmark-summary.js";
import type { RepoPolicy } from "../types/domain.js";
import type { ExperienceLastInspection, ExperienceLearningSummary } from "./service.js";

export type ExperienceRepoSummary = {
  scope: {
    scopeId: string;
    scopeName?: string;
    rootPath?: string;
  };
  recent: {
    latestSessionId?: string;
    latestTaskSummary?: string;
    latestActivityAt?: string;
    latestIntervention?: ExperienceLastInspection["intervention"];
    latestAutoFeedback?: ExperienceLastInspection["autoFeedback"];
    latestAutoFeedbackReason?: ExperienceLastInspection["autoFeedbackReason"];
    latestDecisionExplanation?: ExperienceLastInspection["decisionExplanation"];
    latestTrustSummary?: ExperienceLastInspection["trustSummary"];
  };
  benchmark: BenchmarkSummary;
  policy?: {
    configuredMode: RepoPolicy["configured_mode"];
    effectiveMode: RepoPolicy["effective_mode"];
    circuitState: RepoPolicy["circuit_state"];
    circuitReason?: string;
    liveDiagnosticsDisabled: boolean;
    updatedAt: string;
    lastTrippedAt?: string;
    restoredAt?: string;
  };
  recommendedNextAction: string;
};

const summarizeRecommendation = (benchmark: BenchmarkSummary): string => {
  switch (benchmark.verdict) {
    case "healthy":
      return "Keep the current live setup and continue collecting helped and harmed signals.";
    case "warming_up":
      return "Stay in observation mode until this repo accumulates more repeated tasks and stronger feedback signals.";
    case "failing":
      return "Pause new live interventions for this repo, inspect harmful signals, and review the active node set.";
    default:
      return "Review the current repo summary and recent interventions before deciding whether to stay live or move back to shadow.";
  }
};

export const buildRepoSummary = (input: {
  scope: {
    scopeId: string;
    scopeName?: string;
    rootPath?: string;
  };
  latest?: ExperienceLastInspection;
  learning: ExperienceLearningSummary;
  policy?: RepoPolicy;
}): ExperienceRepoSummary => ({
  scope: input.scope,
  recent: {
    latestSessionId: input.latest?.sessionId,
    latestTaskSummary: input.latest?.summary,
    latestActivityAt: input.latest?.createdAt,
    latestIntervention: input.latest?.intervention,
    latestAutoFeedback: input.latest?.autoFeedback,
    latestAutoFeedbackReason: input.latest?.autoFeedbackReason,
    latestDecisionExplanation: input.latest?.decisionExplanation,
    latestTrustSummary: input.latest?.trustSummary
  },
  benchmark: input.learning.benchmark,
  policy: input.policy
    ? {
        configuredMode: input.policy.configured_mode,
        effectiveMode: input.policy.effective_mode,
        circuitState: input.policy.circuit_state,
        circuitReason: input.policy.circuit_reason,
        liveDiagnosticsDisabled: input.policy.live_diagnostics_disabled,
        updatedAt: input.policy.updated_at,
        lastTrippedAt: input.policy.last_tripped_at,
        restoredAt: input.policy.restored_at
      }
    : undefined,
  recommendedNextAction: summarizeRecommendation(input.learning.benchmark)
});
