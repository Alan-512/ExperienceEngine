import type { HybridRouteDecision, HybridRoutePolicy, HybridRouteSignals } from "./types.js";

const DEFAULT_POLICY: HybridRoutePolicy = {
  enabled: true,
  syncExplainEnabled: true,
  asyncPostmortemEnabled: true,
  policyVersion: "hybrid-phase1-v1"
};

export const deriveAsyncPostmortemEligibility = (signals: HybridRouteSignals): boolean => {
  if (signals.taskStage !== "posttask") {
    return false;
  }

  if (!signals.completedRun || !signals.terminalOutcomeRecorded) {
    return false;
  }

  if (!signals.boundedPosttaskCapsuleAvailable || !signals.rolloutAllowsAsyncPostmortem) {
    return false;
  }

  if (signals.postmortemAlreadyRecorded || signals.lightweightOrExcludedTask) {
    return false;
  }

  return (
    signals.directionalCorrectionPresent
    || signals.injectedNodeInteractionPresent
    || signals.retryOrInvalidationSignaturePresent
    || signals.meaningfulFailureSignaturePresent
    || signals.conservativeTransitionReviewWorthy
  );
};

export const selectHybridRoute = (
  signals: HybridRouteSignals,
  policy: Partial<HybridRoutePolicy> = {}
): HybridRouteDecision => {
  const effectivePolicy: HybridRoutePolicy = { ...DEFAULT_POLICY, ...policy };

  if (!effectivePolicy.enabled) {
    return {
      route: "FAST_PATH",
      reasonCode: "default_fast_path",
      policyVersion: effectivePolicy.policyVersion
    };
  }

  if (signals.explicitExplanationRequest && effectivePolicy.syncExplainEnabled) {
    return {
      route: "ESCALATE_SYNC_EXPLAIN",
      reasonCode: "explicit_explanation_request",
      policyVersion: effectivePolicy.policyVersion
    };
  }

  if (signals.existingConservativePathRequired) {
    return {
      route: "FAST_PATH_CONSERVATIVE",
      reasonCode: "existing_conservative_path_required",
      policyVersion: effectivePolicy.policyVersion
    };
  }

  if (effectivePolicy.asyncPostmortemEnabled && deriveAsyncPostmortemEligibility(signals)) {
    return {
      route: "ESCALATE_ASYNC_POSTMORTEM",
      reasonCode: "eligible_async_postmortem_review",
      policyVersion: effectivePolicy.policyVersion
    };
  }

  return {
    route: "FAST_PATH",
    reasonCode: "default_fast_path",
    policyVersion: effectivePolicy.policyVersion
  };
};

export type { HybridRouteDecision, HybridRoutePolicy, HybridRouteSignals } from "./types.js";
