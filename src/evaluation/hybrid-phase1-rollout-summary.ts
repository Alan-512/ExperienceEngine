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
    releaseGate: gate,
    recommendation
  };
};
