import { describe, expect, it } from "vitest";
import {
  deriveAsyncPostmortemEligibility,
  selectHybridRoute,
  type HybridRouteSignals
} from "../../../src/hybrid/router.js";

const baseSignals = (): HybridRouteSignals => ({
  taskStage: "prompt",
  explicitExplanationRequest: false,
  existingConservativePathRequired: false,
  completedRun: false,
  terminalOutcomeRecorded: false,
  boundedPosttaskCapsuleAvailable: false,
  postmortemAlreadyRecorded: false,
  lightweightOrExcludedTask: false,
  directionalCorrectionPresent: false,
  injectedNodeInteractionPresent: false,
  retryOrInvalidationSignaturePresent: false,
  meaningfulFailureSignaturePresent: false,
  conservativeTransitionReviewWorthy: false,
  rolloutAllowsAsyncPostmortem: true
});

describe("deriveAsyncPostmortemEligibility", () => {
  it("returns true for an eligible completed run with a review-worthy trigger", () => {
    expect(
      deriveAsyncPostmortemEligibility({
        ...baseSignals(),
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: true,
        directionalCorrectionPresent: true
      })
    ).toBe(true);
  });

  it("returns false for a lightweight wording-only run even when posttask signals exist", () => {
    expect(
      deriveAsyncPostmortemEligibility({
        ...baseSignals(),
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: true,
        meaningfulFailureSignaturePresent: true,
        lightweightOrExcludedTask: true
      })
    ).toBe(false);
  });

  it("returns false when the run already has an equivalent postmortem artifact", () => {
    expect(
      deriveAsyncPostmortemEligibility({
        ...baseSignals(),
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: true,
        injectedNodeInteractionPresent: true,
        postmortemAlreadyRecorded: true
      })
    ).toBe(false);
  });

  it("returns false when no bounded posttask capsule is available", () => {
    expect(
      deriveAsyncPostmortemEligibility({
        ...baseSignals(),
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        retryOrInvalidationSignaturePresent: true
      })
    ).toBe(false);
  });

  it("returns false when rollout policy disables async postmortem review", () => {
    expect(
      deriveAsyncPostmortemEligibility({
        ...baseSignals(),
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: true,
        injectedNodeInteractionPresent: true,
        rolloutAllowsAsyncPostmortem: false
      })
    ).toBe(false);
  });
});

describe("selectHybridRoute", () => {
  it("defaults to FAST_PATH for normal routine work", () => {
    expect(selectHybridRoute(baseSignals())).toMatchObject({
      route: "FAST_PATH",
      reasonCode: "default_fast_path",
      policyVersion: "hybrid-phase1-v1"
    });
  });

  it("returns FAST_PATH_CONSERVATIVE for already-bounded conservative cases", () => {
    expect(
      selectHybridRoute({
        ...baseSignals(),
        existingConservativePathRequired: true
      })
    ).toMatchObject({
      route: "FAST_PATH_CONSERVATIVE",
      reasonCode: "existing_conservative_path_required"
    });
  });

  it("returns ESCALATE_SYNC_EXPLAIN only for explicit explanation requests", () => {
    expect(
      selectHybridRoute({
        ...baseSignals(),
        explicitExplanationRequest: true
      })
    ).toMatchObject({
      route: "ESCALATE_SYNC_EXPLAIN",
      reasonCode: "explicit_explanation_request"
    });
  });

  it("returns ESCALATE_ASYNC_POSTMORTEM for deterministic eligible posttask runs", () => {
    expect(
      selectHybridRoute({
        ...baseSignals(),
        taskStage: "posttask",
        completedRun: true,
        terminalOutcomeRecorded: true,
        boundedPosttaskCapsuleAvailable: true,
        injectedNodeInteractionPresent: true
      })
    ).toMatchObject({
      route: "ESCALATE_ASYNC_POSTMORTEM",
      reasonCode: "eligible_async_postmortem_review"
    });
  });
});
