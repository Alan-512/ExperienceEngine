import { describe, expect, it } from "vitest";
import {
  ACTIVATION_ONLY_WORKER_OPERATIONS,
  AUTHORIZATION_TRANSITION_MATRIX,
  FRESH_SUPERVISOR_LEASE_STATES,
  LAUNCH_ATTEMPT_STATES,
  LAUNCH_ATTEMPT_TRANSITION_MATRIX,
  LAUNCH_AUTHORIZATION_ROLES,
  LAUNCH_AUTHORIZATION_STATES,
  PACKAGE_ACTIVATION_TIMING_POLICY,
  PROCESS_AUTHORITY_PRODUCTION_CAPABILITIES,
  PRODUCTION_SEMANTIC_WORKER_OPERATIONS,
  SUPERVISOR_LEASE_LIFECYCLE_MATRIX,
  SUPERVISOR_LEASE_STATES,
  SUPERVISOR_RUNTIME_POLICY,
  WORKER_LEASE_STATES,
  WORKER_MODES
} from "../../src/runtime/process/constants.js";
import {
  assertSafeForceTerminationIdentity,
  computeBoundedRestartDecision,
  evaluateWorkerOperation,
  mayForceTerminateStaleProcess
} from "../../src/runtime/process/lifecycle.js";
import {
  evaluateGatewayHeartbeatLoss,
  evaluateGatewayStopRequest,
  evaluateSupervisorParentLoss
} from "../../src/runtime/process/process-lifecycle.js";

describe("runtime process authority frozen contract", () => {
  it("materializes the exhaustive S3 roles, states, transitions, and timing policies", () => {
    expect(LAUNCH_AUTHORIZATION_ROLES).toEqual([
      "initial_candidate",
      "active",
      "pending",
      "rollback_candidate"
    ]);
    expect(LAUNCH_AUTHORIZATION_STATES).toEqual([
      "issued",
      "consumed",
      "expired",
      "cancelled"
    ]);
    expect(LAUNCH_ATTEMPT_STATES).toEqual([
      "reserved_unbound",
      "reserved_bound",
      "lease_acquired",
      "spawn_failed",
      "timed_out",
      "cancelled",
      "lease_expired",
      "terminated"
    ]);
    expect(SUPERVISOR_LEASE_STATES).toEqual([
      "starting",
      "active",
      "draining",
      "backoff",
      "blocked",
      "stopped",
      "expired"
    ]);
    expect(FRESH_SUPERVISOR_LEASE_STATES).not.toContain("stopped");
    expect(FRESH_SUPERVISOR_LEASE_STATES).not.toContain("expired");
    expect(WORKER_MODES).toEqual(["production", "activation_only"]);
    expect(WORKER_LEASE_STATES).toEqual([
      "starting",
      "active",
      "draining",
      "blocked",
      "stopped"
    ]);
    expect(Object.keys(LAUNCH_ATTEMPT_TRANSITION_MATRIX)).toEqual(LAUNCH_ATTEMPT_STATES);
    expect(Object.keys(AUTHORIZATION_TRANSITION_MATRIX)).toEqual(
      LAUNCH_AUTHORIZATION_STATES
    );
    expect(SUPERVISOR_LEASE_LIFECYCLE_MATRIX).toMatchObject({
      renewal: { attempt_result: "lease_acquired" },
      graceful_release: {
        terminal_reason: "graceful_release",
        attempt_result: "terminated"
      },
      verified_process_exit: {
        terminal_reason: "verified_process_exit",
        attempt_result: "terminated"
      },
      natural_expiry: {
        terminal_reason: "natural_expiry",
        attempt_result: "lease_expired"
      }
    });
    expect(PACKAGE_ACTIVATION_TIMING_POLICY).toEqual({
      policy_version: "package-activation-v1",
      activation_deadline_ms: 600_000,
      launch_authorization_ttl_ms: 60_000,
      launch_attempt_timeout_ms: 30_000,
      preactivation_handshake_ttl_ms: 60_000,
      production_handshake_ttl_ms: 60_000
    });
    expect(SUPERVISOR_RUNTIME_POLICY).toEqual({
      policy_version: "supervisor-runtime-v1",
      heartbeat_interval_ms: 5_000,
      lease_duration_ms: 20_000,
      max_supervisor_launches_per_window: 3,
      max_worker_restarts_per_window: 3,
      restart_window_ms: 600_000,
      restart_backoff_ms: [1_000, 5_000, 30_000],
      graceful_drain_timeout_ms: 30_000,
      orphan_exit_timeout_ms: 20_000
    });
  });

  it("keeps activation-only operations exact and every semantic operation blocked without S6", () => {
    expect(ACTIVATION_ONLY_WORKER_OPERATIONS).toEqual([
      "schema_compatibility_validation",
      "migration_checkpoint_validation",
      "runtime_health_probe",
      "preactivation_handshake",
      "production_activation_handshake"
    ]);
    expect(PRODUCTION_SEMANTIC_WORKER_OPERATIONS).toEqual([
      "queue_claim",
      "queue_renew",
      "queue_complete",
      "queue_block",
      "queue_failure",
      "queue_discard",
      "candidate_write",
      "node_write",
      "embedding_write",
      "attribution_write",
      "governance_write",
      "route_projection_write",
      "hybrid_postmortem_write"
    ]);
    for (const operation of ACTIVATION_ONLY_WORKER_OPERATIONS) {
      expect(evaluateWorkerOperation({
        workerMode: "activation_only",
        operation,
        productionActivationAuthorized: false
      })).toMatchObject({
        allowed: true,
        effectiveMode: "activation_only",
        reason: "activation_only_allowlist"
      });
    }
    for (const operation of PRODUCTION_SEMANTIC_WORKER_OPERATIONS) {
      expect(evaluateWorkerOperation({
        workerMode: "production",
        operation,
        productionActivationAuthorized: false
      })).toMatchObject({
        allowed: false,
        effectiveMode: "activation_only",
        reason: "production_activation_required"
      });
    }
    expect(PROCESS_AUTHORITY_PRODUCTION_CAPABILITIES).toEqual({
      package_authorization_issuer_connected: false,
      worker_acquisition_authority_connected: false,
      production_activation_connected: false,
      queue_claiming_enabled: false,
      semantic_writes_enabled: false,
      production_learning_ready: false,
      learning_runtime_active: false
    });
  });

  it("enforces bounded restart windows and backoff without hidden retries", () => {
    const first = computeBoundedRestartDecision({
      countInWindow: 0,
      windowStartedAt: null,
      observedAt: "2026-07-12T00:00:00.000Z",
      kind: "supervisor_launch"
    });
    const second = computeBoundedRestartDecision({
      countInWindow: first.nextCountInWindow,
      windowStartedAt: first.windowStartedAt,
      observedAt: "2026-07-12T00:00:01.000Z",
      kind: "supervisor_launch"
    });
    const third = computeBoundedRestartDecision({
      countInWindow: second.nextCountInWindow,
      windowStartedAt: second.windowStartedAt,
      observedAt: "2026-07-12T00:00:06.000Z",
      kind: "supervisor_launch"
    });
    const blocked = computeBoundedRestartDecision({
      countInWindow: third.nextCountInWindow,
      windowStartedAt: third.windowStartedAt,
      observedAt: "2026-07-12T00:00:36.000Z",
      kind: "supervisor_launch"
    });
    expect(first.nextLaunchAt).toBe("2026-07-12T00:00:01.000Z");
    expect(second.nextLaunchAt).toBe("2026-07-12T00:00:06.000Z");
    expect(third.nextLaunchAt).toBe("2026-07-12T00:00:36.000Z");
    expect(blocked).toMatchObject({
      allowed: false,
      nextCountInWindow: 3,
      nextLaunchAt: null,
      blockedReason: "restart_budget_exhausted"
    });
  });

  it("never treats gateway or parent loss as authority transfer", () => {
    expect(evaluateGatewayHeartbeatLoss("2026-07-12T00:00:00.000Z")).toEqual({
      authorityTransferred: false,
      stopNewClaims: true,
      drainRequested: true,
      drainDeadlineAt: "2026-07-12T00:00:30.000Z",
      selfTerminationRequired: false,
      selfTerminationDeadlineAt: null,
      reason: "gateway_heartbeat_lost"
    });
    expect(evaluateSupervisorParentLoss("2026-07-12T00:00:00.000Z")).toEqual({
      authorityTransferred: false,
      stopNewClaims: true,
      drainRequested: true,
      drainDeadlineAt: "2026-07-12T00:00:30.000Z",
      selfTerminationRequired: true,
      selfTerminationDeadlineAt: "2026-07-12T00:00:20.000Z",
      reason: "supervisor_parent_lost"
    });
    expect(evaluateGatewayStopRequest("2026-07-12T00:00:00.000Z")).toMatchObject({
      authorityTransferred: false,
      stopNewClaims: true,
      selfTerminationDeadlineAt: "2026-07-12T00:00:50.000Z"
    });
  });

  it("requires the complete persisted process identity before force termination", () => {
    const identity = {
      owner_id: "worker-a",
      process_id: 6001,
      process_start_token: "start-a",
      package_generation_id: "pkg-a",
      supervisor_lease_epoch: 7,
      worker_fencing_token: 9
    };
    expect(mayForceTerminateStaleProcess({
      storedAuthority: identity,
      observedProcess: identity
    })).toBe(true);
    const wrongFence = { ...identity, worker_fencing_token: 10 };
    expect(mayForceTerminateStaleProcess({
      storedAuthority: identity,
      observedProcess: wrongFence
    })).toBe(false);
    expect(() => assertSafeForceTerminationIdentity({
      storedAuthority: identity,
      observedProcess: wrongFence
    })).toThrowError(expect.objectContaining({
      code: "EE_FORCE_TERMINATION_IDENTITY_INCOMPLETE"
    }));
  });
});
