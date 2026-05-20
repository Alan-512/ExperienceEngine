import type { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import type { ExperienceNode } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { transitionState, transitionValidationState } from "../feedback/state-transition.js";
import { deriveNodeOriginProfile, type NodeOriginProfile } from "./task-management-signals.js";

type LifecycleFeedback = "helped" | "harmed" | "uncertain" | "none";

const CONSECUTIVE_HARM_QUARANTINE_THRESHOLD = 2;

export const defaultDeliveryStateForState = (
  state: ExperienceNode["state"]
): NonNullable<ExperienceNode["delivery_state"]> => {
  switch (state) {
    case "candidate":
      return "shadow_only";
    case "priority_candidate":
      return "conservative_only";
    case "active":
      return "eligible";
    case "cooling":
      return "conservative_only";
    case "retired":
    default:
      return "quarantined";
  }
};

const resolveDeliveryStateAfterFeedback = (input: {
  previous: ExperienceNode;
  nextState: ExperienceNode["state"];
  feedback: LifecycleFeedback;
  nextConsecutiveHarmedCount: number;
}): NonNullable<ExperienceNode["delivery_state"]> => {
  if (input.nextState === "retired") {
    return "quarantined";
  }

  if (input.feedback === "harmed" && input.previous.state === "priority_candidate") {
    return "quarantined";
  }

  if (input.nextConsecutiveHarmedCount >= CONSECUTIVE_HARM_QUARANTINE_THRESHOLD) {
    return "quarantined";
  }

  if (input.previous.delivery_state === "quarantined") {
    return input.feedback === "helped" ? "conservative_only" : "quarantined";
  }

  return defaultDeliveryStateForState(input.nextState);
};

export const deriveNodeOriginProfileForNode = (
  inputRepo: Pick<InputRecordRepository, "listByIds">,
  node: Pick<ExperienceNode, "origin_record_ids">
): NodeOriginProfile | undefined => {
  const originRecords = inputRepo.listByIds(node.origin_record_ids);
  return originRecords.length ? deriveNodeOriginProfile(originRecords) : undefined;
};

export const applyGovernedNodeFeedback = (
  node: ExperienceNode,
  feedback: LifecycleFeedback,
  originProfile?: NodeOriginProfile
): ExperienceNode => {
  const timestamp = nowIso();
  const nextConsecutiveHarmedCount =
    feedback === "harmed"
      ? (node.consecutive_harmed_count ?? 0) + 1
      : feedback === "helped"
        ? 0
        : (node.consecutive_harmed_count ?? 0);
  const next = {
    ...node,
    helped_count: feedback === "helped" ? node.helped_count + 1 : node.helped_count,
    harmed_count: feedback === "harmed" ? node.harmed_count + 1 : node.harmed_count,
    consecutive_harmed_count: nextConsecutiveHarmedCount,
    last_feedback_verdict: feedback === "none" ? node.last_feedback_verdict : feedback,
    validation_state:
      feedback === "helped" || feedback === "harmed" ? transitionValidationState(node, feedback) : node.validation_state,
    last_helped_at: feedback === "helped" ? timestamp : node.last_helped_at,
    last_harmed_at: feedback === "harmed" ? timestamp : node.last_harmed_at,
    updated_at: timestamp
  };
  let nextState = node.state === "retired" ? "retired" : transitionState(next, { originProfile });
  let nextDeliveryState = resolveDeliveryStateAfterFeedback({
    previous: node,
    nextState,
    feedback,
    nextConsecutiveHarmedCount
  });

  const enteringQuarantine = nextDeliveryState === "quarantined" && node.delivery_state !== "quarantined";

  // Retirement/re-quarantine for nodes that cause repeated harm (attempts >= 3)
  if (enteringQuarantine && (node.quarantine_release_attempt_count ?? 0) >= 3) {
    nextDeliveryState = "retired";
    nextState = "retired";
  }

  const isQuarantineOrProbe = nextDeliveryState === "quarantined" || nextDeliveryState === "shadow_probe";

  return {
    ...next,
    state: nextState,
    delivery_state: nextDeliveryState,
    quarantined_at:
      nextDeliveryState === "quarantined"
        ? (node.quarantined_at ?? timestamp)
        : isQuarantineOrProbe ? node.quarantined_at : undefined,
    quarantine_reason:
      nextDeliveryState === "quarantined"
        ? (feedback === "harmed" && node.state === "priority_candidate"
          ? "priority_candidate_harmed"
          : nextConsecutiveHarmedCount >= CONSECUTIVE_HARM_QUARANTINE_THRESHOLD
            ? "consecutive_harms"
            : node.quarantine_reason)
        : isQuarantineOrProbe ? node.quarantine_reason : undefined,
    quarantine_lease_expires_at:
      nextDeliveryState === "quarantined"
        ? (node.quarantine_lease_expires_at ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
        : isQuarantineOrProbe ? node.quarantine_lease_expires_at : undefined,
    quarantine_original_delivery_state:
      nextDeliveryState === "quarantined"
        ? (node.quarantine_original_delivery_state ?? node.delivery_state)
        : isQuarantineOrProbe ? node.quarantine_original_delivery_state : undefined,
    quarantine_release_attempt_count:
      nextDeliveryState === "quarantined"
        ? (node.quarantine_release_attempt_count ?? 0)
        : isQuarantineOrProbe ? node.quarantine_release_attempt_count : undefined,
    quarantine_no_harm_pass_count:
      nextDeliveryState === "quarantined"
        ? (node.quarantine_no_harm_pass_count ?? 0)
        : isQuarantineOrProbe ? node.quarantine_no_harm_pass_count : undefined
  };
};
