import type { BenchmarkSummary } from "../evaluation/benchmark-summary.js";
import type {
  ExperienceLastInspection,
  ExperienceLearningSummary,
  ExperienceScopePackActivationView
} from "./service.js";

export type ExperienceRepoDeploymentStatus = {
  target: string;
  status: "missing" | "up_to_date" | "drifted";
  destination?: string;
};

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
  };
  benchmark: BenchmarkSummary;
  packs: {
    active: ExperienceScopePackActivationView[];
    matched: ExperienceScopePackActivationView[];
    enabledCount: number;
    stalePublishedPacks: number;
    latestCompiledTarget?: string;
  };
  deployment: ExperienceRepoDeploymentStatus[];
  recommendedNextAction: string;
};

const summarizeRecommendation = (input: {
  benchmark: BenchmarkSummary;
  activePacks: ExperienceScopePackActivationView[];
  deployments: ExperienceRepoDeploymentStatus[];
}): string => {
  const drifted = input.deployments.filter((entry) => entry.status === "drifted");
  if (drifted.length > 0) {
    return `Review drifted deployed targets first: ${drifted.map((entry) => entry.target).join(", ")}.`;
  }

  if (input.activePacks.length === 0) {
    return "No packs are active for this repo yet; keep using ExperienceEngine and publish a reviewed pack when repeated patterns stabilize.";
  }

  switch (input.benchmark.verdict) {
    case "healthy":
      return "Keep the current live setup and deploy compiled artifacts only when the repo needs host-native guidance files.";
    case "warming_up":
      return "Stay in shadow-style observation until this repo accumulates more repeated tasks and stronger feedback signals.";
    case "failing":
      return "Pause new live interventions for this repo, inspect harmful signals, and review active packs before redeploying guidance.";
    default:
      return "Review the current repo summary, inspect active packs, and use deploy status before deciding whether to stay live or move back to shadow.";
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
  activePacks: ExperienceScopePackActivationView[];
  matchedPacks: ExperienceScopePackActivationView[];
  deployments: ExperienceRepoDeploymentStatus[];
}): ExperienceRepoSummary => ({
  scope: input.scope,
  recent: {
    latestSessionId: input.latest?.sessionId,
    latestTaskSummary: input.latest?.summary,
    latestActivityAt: input.latest?.createdAt,
    latestIntervention: input.latest?.intervention,
    latestAutoFeedback: input.latest?.autoFeedback,
    latestAutoFeedbackReason: input.latest?.autoFeedbackReason
  },
  benchmark: input.learning.benchmark,
  packs: {
    active: input.activePacks,
    matched: input.matchedPacks,
    enabledCount: input.activePacks.filter((entry) => entry.enabled).length,
    stalePublishedPacks: input.learning.compiler.stalePublishedPacks,
    latestCompiledTarget: input.learning.compiler.latestCompiledArtifact?.target
  },
  deployment: input.deployments,
  recommendedNextAction: summarizeRecommendation({
    benchmark: input.learning.benchmark,
    activePacks: input.activePacks,
    deployments: input.deployments
  })
});
