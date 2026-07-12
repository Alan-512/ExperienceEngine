import {
  SUPERVISOR_RUNTIME_POLICY
} from "./constants.js";
import { toProcessAuthorityEpochMs } from "./clock.js";
import {
  computeGracefulDrainDeadline,
  computeOrphanExitDeadline
} from "./lifecycle.js";

export type ParentLossDecision = {
  authorityTransferred: false;
  stopNewClaims: true;
  drainRequested: boolean;
  drainDeadlineAt: string | null;
  selfTerminationRequired: boolean;
  selfTerminationDeadlineAt: string | null;
  reason:
    | "gateway_heartbeat_lost"
    | "supervisor_parent_lost"
    | "gateway_stop_requested";
};

export const evaluateGatewayHeartbeatLoss = (
  observedAt: string
): ParentLossDecision => ({
  authorityTransferred: false,
  stopNewClaims: true,
  drainRequested: true,
  drainDeadlineAt: computeGracefulDrainDeadline(observedAt),
  selfTerminationRequired: false,
  selfTerminationDeadlineAt: null,
  reason: "gateway_heartbeat_lost"
});

export const evaluateSupervisorParentLoss = (
  observedAt: string
): ParentLossDecision => ({
  authorityTransferred: false,
  stopNewClaims: true,
  drainRequested: true,
  drainDeadlineAt: computeGracefulDrainDeadline(observedAt),
  selfTerminationRequired: true,
  selfTerminationDeadlineAt: computeOrphanExitDeadline(observedAt),
  reason: "supervisor_parent_lost"
});

export const evaluateGatewayStopRequest = (
  observedAt: string
): ParentLossDecision => ({
  authorityTransferred: false,
  stopNewClaims: true,
  drainRequested: true,
  drainDeadlineAt: computeGracefulDrainDeadline(observedAt),
  selfTerminationRequired: true,
  selfTerminationDeadlineAt: new Date(
    toProcessAuthorityEpochMs(observedAt) +
      SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms +
      SUPERVISOR_RUNTIME_POLICY.orphan_exit_timeout_ms
  ).toISOString(),
  reason: "gateway_stop_requested"
});

export const PROCESS_LIFECYCLE_SAFETY = Object.freeze({
  gateway_heartbeat_transfers_authority: false,
  parent_loss_transfers_authority: false,
  orphan_can_claim_new_work: false,
  force_termination_requires_exact_identity: true,
  drain_timeout_ms: SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms,
  orphan_exit_timeout_ms: SUPERVISOR_RUNTIME_POLICY.orphan_exit_timeout_ms
});
