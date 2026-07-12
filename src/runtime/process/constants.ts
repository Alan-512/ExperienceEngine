export const RUNTIME_PROCESS_AUTHORITY_STAGE =
  "process_authority_foundation_s3" as const;

export const RUNTIME_SUPERVISOR_PROTOCOL_VERSION =
  "runtime-supervisor-v1" as const;
export const RUNTIME_WORKER_PROTOCOL_VERSION = "runtime-worker-v1" as const;

export const PACKAGE_ACTIVATION_TIMING_POLICY = Object.freeze({
  policy_version: "package-activation-v1" as const,
  activation_deadline_ms: 600_000,
  launch_authorization_ttl_ms: 60_000,
  launch_attempt_timeout_ms: 30_000,
  preactivation_handshake_ttl_ms: 60_000,
  production_handshake_ttl_ms: 60_000
});

export const SUPERVISOR_RUNTIME_POLICY = Object.freeze({
  policy_version: "supervisor-runtime-v1" as const,
  heartbeat_interval_ms: 5_000,
  lease_duration_ms: 20_000,
  max_supervisor_launches_per_window: 3,
  max_worker_restarts_per_window: 3,
  restart_window_ms: 600_000,
  restart_backoff_ms: Object.freeze([1_000, 5_000, 30_000] as const),
  graceful_drain_timeout_ms: 30_000,
  orphan_exit_timeout_ms: 20_000
});

export const LAUNCH_AUTHORIZATION_ROLES = [
  "initial_candidate",
  "active",
  "pending",
  "rollback_candidate"
] as const;
export type LaunchAuthorizationRole = typeof LAUNCH_AUTHORIZATION_ROLES[number];

export const LAUNCH_AUTHORIZATION_STATES = [
  "issued",
  "consumed",
  "expired",
  "cancelled"
] as const;
export type LaunchAuthorizationState = typeof LAUNCH_AUTHORIZATION_STATES[number];

export const LAUNCH_ATTEMPT_STATES = [
  "reserved_unbound",
  "reserved_bound",
  "lease_acquired",
  "spawn_failed",
  "timed_out",
  "cancelled",
  "lease_expired",
  "terminated"
] as const;
export type LaunchAttemptState = typeof LAUNCH_ATTEMPT_STATES[number];

export const SUPERVISOR_LEASE_STATES = [
  "starting",
  "active",
  "draining",
  "backoff",
  "blocked",
  "stopped",
  "expired"
] as const;
export type SupervisorLeaseState = typeof SUPERVISOR_LEASE_STATES[number];

export const FRESH_SUPERVISOR_LEASE_STATES = [
  "starting",
  "active",
  "draining",
  "backoff",
  "blocked"
] as const satisfies readonly SupervisorLeaseState[];

export const SUPERVISOR_RENEWABLE_STATES = [
  "starting",
  "active",
  "draining"
] as const satisfies readonly SupervisorLeaseState[];

export const SUPERVISOR_LEASE_TERMINAL_REASONS = [
  "graceful_release",
  "verified_process_exit",
  "natural_expiry"
] as const;
export type SupervisorLeaseTerminalReason =
  typeof SUPERVISOR_LEASE_TERMINAL_REASONS[number];

export const WORKER_MODES = ["production", "activation_only"] as const;
export type WorkerMode = typeof WORKER_MODES[number];

export const WORKER_LEASE_STATES = [
  "starting",
  "active",
  "draining",
  "blocked",
  "stopped"
] as const;
export type WorkerLeaseState = typeof WORKER_LEASE_STATES[number];

export const ACTIVATION_ONLY_WORKER_OPERATIONS = [
  "schema_compatibility_validation",
  "migration_checkpoint_validation",
  "runtime_health_probe",
  "preactivation_handshake",
  "production_activation_handshake"
] as const;
export type ActivationOnlyWorkerOperation =
  typeof ACTIVATION_ONLY_WORKER_OPERATIONS[number];

export const PRODUCTION_SEMANTIC_WORKER_OPERATIONS = [
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
] as const;
export type ProductionSemanticWorkerOperation =
  typeof PRODUCTION_SEMANTIC_WORKER_OPERATIONS[number];

export const LAUNCH_ATTEMPT_TRANSITION_MATRIX = Object.freeze({
  reserved_unbound: Object.freeze({
    reserved_bound: "launch_owning_gateway_service_controller",
    spawn_failed: "launch_owning_gateway_service_controller",
    timed_out: "current_or_launch_owning_gateway_service_controller",
    cancelled: "current_gateway_service_controller"
  }),
  reserved_bound: Object.freeze({
    lease_acquired: "child_supervisor",
    timed_out: "current_or_launch_owning_gateway_service_controller",
    cancelled: "current_gateway_service_controller",
    terminated: "current_or_launch_owning_gateway_service_controller"
  }),
  lease_acquired: Object.freeze({
    lease_expired: "current_gateway_service_controller",
    terminated: "current_supervisor_or_gateway_service_controller"
  }),
  spawn_failed: Object.freeze({}),
  timed_out: Object.freeze({}),
  cancelled: Object.freeze({}),
  lease_expired: Object.freeze({}),
  terminated: Object.freeze({})
} satisfies Record<LaunchAttemptState, Readonly<Record<string, string>>>);

export const AUTHORIZATION_TRANSITION_MATRIX = Object.freeze({
  issued: Object.freeze({
    consumed: "launch_owning_gateway_service_controller",
    expired: "fresh_supervisor_or_whitelisted_gateway",
    cancelled: "fresh_supervisor_or_whitelisted_gateway"
  }),
  consumed: Object.freeze({}),
  expired: Object.freeze({}),
  cancelled: Object.freeze({})
} satisfies Record<LaunchAuthorizationState, Readonly<Record<string, string>>>);

export const SUPERVISOR_LEASE_LIFECYCLE_MATRIX = Object.freeze({
  renewal: Object.freeze({
    writer: "current_supervisor_owner",
    terminal_reason: null,
    attempt_result: "lease_acquired"
  }),
  graceful_release: Object.freeze({
    writer: "current_supervisor_owner",
    terminal_reason: "graceful_release",
    attempt_result: "terminated"
  }),
  verified_process_exit: Object.freeze({
    writer: "current_gateway_service_controller",
    terminal_reason: "verified_process_exit",
    attempt_result: "terminated"
  }),
  natural_expiry: Object.freeze({
    writer: "current_gateway_service_controller",
    terminal_reason: "natural_expiry",
    attempt_result: "lease_expired"
  })
});

export const PROCESS_AUTHORITY_PRODUCTION_CAPABILITIES = Object.freeze({
  package_authorization_issuer_connected: false,
  worker_acquisition_authority_connected: false,
  production_activation_connected: false,
  queue_claiming_enabled: false,
  semantic_writes_enabled: false,
  production_learning_ready: false,
  learning_runtime_active: false
});
