import type { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import type { ExperienceNode } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { transitionState, transitionValidationState } from "../feedback/state-transition.js";
import { deriveNodeOriginProfile, type NodeOriginProfile } from "./task-management-signals.js";

type LifecycleFeedback = "helped" | "harmed" | "none";

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
  const next = {
    ...node,
    helped_count: feedback === "helped" ? node.helped_count + 1 : node.helped_count,
    harmed_count: feedback === "harmed" ? node.harmed_count + 1 : node.harmed_count,
    validation_state: feedback === "none" ? node.validation_state : transitionValidationState(node, feedback),
    last_helped_at: feedback === "helped" ? timestamp : node.last_helped_at,
    last_harmed_at: feedback === "harmed" ? timestamp : node.last_harmed_at,
    updated_at: timestamp
  };

  return {
    ...next,
    state: node.state === "retired" ? "retired" : transitionState(next, { originProfile })
  };
};
