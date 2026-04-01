import type { HybridInvocationTrace, HybridReviewArtifact } from "../types/domain.js";

export type HybridPhase1ReleaseRecommendation = "blocked" | "shadow_only" | "canary_ready" | "live_ready";

export type HybridPhase1RolloutSummary = {
  routeDistribution: Record<string, number>;
  syncEscalationRate: number;
  asyncReviewSchedulingRate: number;
  workerOutputValidityRate: number;
  fallbackRate: number;
  explanationQualitySummary: {
    surfaced: number;
    shadowed: number;
    fallbacks: number;
  };
  postmortemQualitySummary: {
    storedArtifacts: number;
    policyGatedArtifacts: number;
    rejectedRuns: number;
  };
  phase2ExplainSummary?: {
    llmBackedAttempts: number;
    llmBackedFallbacks: number;
    recommendation: "blocked" | "shadow_only" | "canary_ready" | "live_ready";
  };
  phase3PostmortemSummary?: {
    llmBackedAttempts: number;
    llmBackedFallbacks: number;
    recommendation: "blocked" | "shadow_only" | "canary_ready" | "live_ready";
  };
  releaseGate?: {
    stage: "offline" | "shadow" | "canary";
    routeGatePassed: boolean;
    explainGatePassed: boolean;
    postmortemGatePassed: boolean;
    runtimeGuardrailsPassed: boolean;
  };
  recommendation: HybridPhase1ReleaseRecommendation;
};

const ratio = (value: number, total: number): number =>
  total > 0 ? Number((value / total).toFixed(4)) : 0;

export const buildHybridPhase1RolloutSummary = (input: {
  traces: HybridInvocationTrace[];
  artifacts: HybridReviewArtifact[];
  releaseGate?: {
    stage: "offline" | "shadow" | "canary";
    routeGatePassed: boolean;
    explainGatePassed: boolean;
    postmortemGatePassed: boolean;
    runtimeGuardrailsPassed: boolean;
  };
  phase2ExplainGate?: {
    stage: "offline" | "shadow" | "canary";
    explainFaithfulnessPassed: boolean;
    explainFallbackRatePassed: boolean;
    explainTimeoutRatePassed: boolean;
  };
  phase3PostmortemGate?: {
    stage: "offline" | "shadow" | "canary";
    schemaValidOutputRatePassed: boolean;
    timeoutFallbackRatePassed: boolean;
    providerUnavailableFallbackRatePassed: boolean;
    blockedClassificationStabilityPassed: boolean;
    artifactSpamRatePassed: boolean;
    backlogGrowthPassed: boolean;
  };
}): HybridPhase1RolloutSummary => {
  const routeDistribution = input.traces.reduce<Record<string, number>>((acc, trace) => {
    acc[trace.route] = (acc[trace.route] ?? 0) + 1;
    return acc;
  }, {});

  const totalTraces = input.traces.length;
  const syncEscalations = input.traces.filter((trace) => trace.route === "ESCALATE_SYNC_EXPLAIN").length;
  const asyncReviews = input.traces.filter((trace) => trace.route === "ESCALATE_ASYNC_POSTMORTEM").length;
  const accepted = input.traces.filter((trace) => trace.validation_status === "accepted").length;
  const fallbacks = input.traces.filter((trace) => trace.validation_status === "fallback").length;

  const explainTraces = input.traces.filter((trace) => trace.worker_task === "explain_decision");
  const postmortemTraces = input.traces.filter((trace) => trace.worker_task === "postmortem_review");

  const explanationQualitySummary = {
    surfaced: explainTraces.filter((trace) => trace.output_action === "surfaced").length,
    shadowed: explainTraces.filter((trace) => trace.output_action === "none").length,
    fallbacks: explainTraces.filter((trace) => trace.validation_status === "fallback").length
  };

  const postmortemQualitySummary = {
    storedArtifacts: postmortemTraces.filter((trace) => trace.output_action === "stored").length,
    policyGatedArtifacts: input.artifacts.filter((artifact) => artifact.approval_class === "policy_gated").length,
    rejectedRuns: postmortemTraces.filter((trace) => trace.output_action === "rejected").length
  };

  const llmExplainTraces = explainTraces.filter((trace) => trace.worker_profile_version?.startsWith("hybrid-explain-llm"));
  const phase2ExplainGate = input.phase2ExplainGate;
  let phase2ExplainSummary: HybridPhase1RolloutSummary["phase2ExplainSummary"];
  if (phase2ExplainGate) {
    const explainGatesPassed =
      phase2ExplainGate.explainFaithfulnessPassed
      && phase2ExplainGate.explainFallbackRatePassed
      && phase2ExplainGate.explainTimeoutRatePassed;
    let recommendation: HybridPhase1ReleaseRecommendation = "blocked";
    if (explainGatesPassed) {
      if (phase2ExplainGate.stage === "offline") {
        recommendation = "shadow_only";
      } else if (phase2ExplainGate.stage === "shadow") {
        recommendation = "canary_ready";
      } else if (phase2ExplainGate.stage === "canary") {
        recommendation = "live_ready";
      }
    }
    phase2ExplainSummary = {
      llmBackedAttempts: llmExplainTraces.length,
      llmBackedFallbacks: llmExplainTraces.filter((trace) => trace.validation_status === "fallback").length,
      recommendation
    };
  }

  const llmPostmortemTraces = postmortemTraces.filter((trace) =>
    trace.worker_profile_version?.startsWith("hybrid-postmortem-llm")
  );
  const phase3PostmortemGate = input.phase3PostmortemGate;
  let phase3PostmortemSummary: HybridPhase1RolloutSummary["phase3PostmortemSummary"];
  if (phase3PostmortemGate) {
    const postmortemGatesPassed =
      phase3PostmortemGate.schemaValidOutputRatePassed
      && phase3PostmortemGate.timeoutFallbackRatePassed
      && phase3PostmortemGate.providerUnavailableFallbackRatePassed
      && phase3PostmortemGate.blockedClassificationStabilityPassed
      && phase3PostmortemGate.artifactSpamRatePassed
      && phase3PostmortemGate.backlogGrowthPassed;
    let recommendation: HybridPhase1ReleaseRecommendation = "blocked";
    if (postmortemGatesPassed) {
      if (phase3PostmortemGate.stage === "offline") {
        recommendation = "shadow_only";
      } else if (phase3PostmortemGate.stage === "shadow") {
        recommendation = "canary_ready";
      } else if (phase3PostmortemGate.stage === "canary") {
        recommendation = "live_ready";
      }
    }
    phase3PostmortemSummary = {
      llmBackedAttempts: llmPostmortemTraces.length,
      llmBackedFallbacks: llmPostmortemTraces.filter((trace) => trace.validation_status === "fallback").length,
      recommendation
    };
  }

  const gate = input.releaseGate;
  let recommendation: HybridPhase1ReleaseRecommendation = "blocked";
  const gatesPassed =
    gate?.routeGatePassed === true
    && gate.explainGatePassed === true
    && gate.postmortemGatePassed === true
    && gate.runtimeGuardrailsPassed === true;
  if (gatesPassed && totalTraces > 0) {
    if (gate?.stage === "offline") {
      recommendation = "shadow_only";
    } else if (gate?.stage === "shadow") {
      recommendation = "canary_ready";
    } else if (gate?.stage === "canary") {
      recommendation = "live_ready";
    }
  }

  return {
    routeDistribution,
    syncEscalationRate: ratio(syncEscalations, totalTraces),
    asyncReviewSchedulingRate: ratio(asyncReviews, totalTraces),
    workerOutputValidityRate: ratio(accepted, totalTraces),
    fallbackRate: ratio(fallbacks, totalTraces),
    explanationQualitySummary,
    postmortemQualitySummary,
    phase2ExplainSummary,
    phase3PostmortemSummary,
    releaseGate: gate,
    recommendation
  };
};
