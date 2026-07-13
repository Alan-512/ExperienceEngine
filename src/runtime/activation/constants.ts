import {
  PACKAGE_ACTIVATION_TIMING_POLICY
} from "../process/constants.js";

export const RUNTIME_PRODUCTION_ACTIVATION_STAGE =
  "openclaw_production_activation_s6" as const;

export const PACKAGE_ACTIVATION_CONTRACT_VERSION =
  "package-activation-v1" as const;
export const ACTIVATION_HANDSHAKE_SCHEMA_VERSION =
  "activation-handshake-v1" as const;
export const CONTROL_REQUEST_CONTRACT_VERSION =
  "openclaw-control-v1" as const;
export const STATUS_PROJECTION_SCHEMA_VERSION =
  "openclaw-runtime-status-v1" as const;
export const CONTROL_REQUEST_RETENTION_POLICY = Object.freeze({
  policy_version: "control-request-retention-v1" as const,
  minimum_retention_ms: 86_400_000,
  cleanup_batch_limit: 256
});

export const PACKAGE_ACTIVATION_STATES = [
  "uninitialized",
  "preparing",
  "draining_old",
  "migrating",
  "preactivation_verifying",
  "production_activating",
  "active",
  "blocked"
] as const;
export type PackageActivationState = typeof PACKAGE_ACTIVATION_STATES[number];

export const PACKAGE_TRANSITION_KINDS = [
  "none",
  "initial",
  "upgrade",
  "rollback"
] as const;
export type PackageTransitionKind = typeof PACKAGE_TRANSITION_KINDS[number];

export const BLOCKED_BOUNDARIES = [
  "none",
  "pre_identity_initial",
  "pre_identity_upgrade",
  "pre_identity_rollback",
  "post_identity"
] as const;
export type BlockedBoundary = typeof BLOCKED_BOUNDARIES[number];

export const BLOCKED_FROM_STATES = [
  "none",
  "preparing",
  "draining_old",
  "migrating",
  "preactivation_verifying",
  "production_activating"
] as const;
export type BlockedFromState = typeof BLOCKED_FROM_STATES[number];

export const PACKAGE_AUTHORITY_WRITER_KINDS = [
  "gateway_service_controller",
  "supervisor"
] as const;
export type PackageAuthorityWriterKind =
  typeof PACKAGE_AUTHORITY_WRITER_KINDS[number];

export const GATEWAY_PACKAGE_AUTHORITY_OPERATIONS = [
  "bootstrap_package_activation_authority",
  "initialize_package_activation",
  "consume_launch_authorization_and_reserve_attempt",
  "expire_or_cancel_unconsumed_authorization",
  "issue_active_restart_authorization",
  "issue_deterministic_replacement_authorization",
  "enter_blocked_transition",
  "retry_package_activation",
  "cancel_package_transition",
  "retry_production_activation",
  "prepare_package_rollback"
] as const;
export type GatewayPackageAuthorityOperation =
  typeof GATEWAY_PACKAGE_AUTHORITY_OPERATIONS[number];

export const OPENCLAW_NATIVE_OPERATIONS = [
  "status",
  "pause_learning",
  "resume_learning",
  "retry_blocked_system_work",
  "initialize_package_activation",
  "prepare_package_generation",
  "prepare_package_rollback",
  "retry_package_activation",
  "cancel_package_transition",
  "retry_production_activation",
  "request_drain",
  "repair_explanation"
] as const;
export type OpenClawNativeOperation = typeof OPENCLAW_NATIVE_OPERATIONS[number];

export const READ_ONLY_OPENCLAW_NATIVE_OPERATIONS = [
  "status",
  "repair_explanation"
] as const satisfies readonly OpenClawNativeOperation[];

export const MUTATING_OPENCLAW_NATIVE_OPERATIONS = [
  "pause_learning",
  "resume_learning",
  "retry_blocked_system_work",
  "initialize_package_activation",
  "prepare_package_generation",
  "prepare_package_rollback",
  "retry_package_activation",
  "cancel_package_transition",
  "retry_production_activation",
  "request_drain"
] as const satisfies readonly OpenClawNativeOperation[];

export const ACTIVATION_HANDSHAKE_PURPOSES = [
  "preactivation_verification",
  "production_activation"
] as const;
export type ActivationHandshakePurpose =
  typeof ACTIVATION_HANDSHAKE_PURPOSES[number];

export const ACTIVATION_HANDSHAKE_STATES = [
  "requested",
  "supervisor_acknowledged",
  "worker_acknowledged",
  "complete",
  "expired",
  "rejected"
] as const;
export type ActivationHandshakeState =
  typeof ACTIVATION_HANDSHAKE_STATES[number];

export const ACTIVATION_HANDSHAKE_TRANSITIONS = Object.freeze({
  requested: Object.freeze({
    supervisor_acknowledged: "current_supervisor",
    expired: "current_supervisor",
    rejected: "current_supervisor"
  }),
  supervisor_acknowledged: Object.freeze({
    worker_acknowledged: "current_supervisor_after_worker_ipc",
    expired: "current_supervisor",
    rejected: "current_supervisor"
  }),
  worker_acknowledged: Object.freeze({
    complete: "current_supervisor",
    expired: "current_supervisor",
    rejected: "current_supervisor"
  }),
  complete: Object.freeze({}),
  expired: Object.freeze({}),
  rejected: Object.freeze({})
} satisfies Record<ActivationHandshakeState, Readonly<Record<string, string>>>);

export const PACKAGE_ACTIVATION_STATE_CONTRACT = Object.freeze({
  uninitialized: Object.freeze({
    deadline: "forbidden",
    pendingTransitionKinds: Object.freeze(["none"] as const),
    blockedBoundary: "none",
    entryWriters: Object.freeze(["bootstrap", "initial_cancellation"] as const),
    exits: Object.freeze(["preparing"] as const)
  }),
  preparing: Object.freeze({
    deadline: "required",
    pendingTransitionKinds: Object.freeze(["initial", "upgrade", "rollback"] as const),
    blockedBoundary: "none",
    entryWriters: Object.freeze(["gateway_initialization", "supervisor", "blocked_control"] as const),
    exits: Object.freeze(["draining_old", "migrating", "blocked"] as const)
  }),
  draining_old: Object.freeze({
    deadline: "required",
    pendingTransitionKinds: Object.freeze(["upgrade", "rollback"] as const),
    blockedBoundary: "none",
    entryWriters: Object.freeze(["current_old_supervisor"] as const),
    exits: Object.freeze(["migrating", "blocked"] as const)
  }),
  migrating: Object.freeze({
    deadline: "required",
    pendingTransitionKinds: Object.freeze(["initial", "upgrade", "rollback"] as const),
    blockedBoundary: "none",
    entryWriters: Object.freeze(["current_pending_supervisor"] as const),
    exits: Object.freeze(["preactivation_verifying", "blocked"] as const)
  }),
  preactivation_verifying: Object.freeze({
    deadline: "required",
    pendingTransitionKinds: Object.freeze(["initial", "upgrade", "rollback"] as const),
    blockedBoundary: "none",
    entryWriters: Object.freeze(["current_pending_supervisor"] as const),
    exits: Object.freeze(["production_activating", "blocked"] as const)
  }),
  production_activating: Object.freeze({
    deadline: "required",
    pendingTransitionKinds: Object.freeze(["none"] as const),
    blockedBoundary: "none",
    entryWriters: Object.freeze(["identity_cas_supervisor", "post_identity_retry"] as const),
    exits: Object.freeze(["active", "blocked"] as const)
  }),
  active: Object.freeze({
    deadline: "forbidden",
    pendingTransitionKinds: Object.freeze(["none"] as const),
    blockedBoundary: "none",
    entryWriters: Object.freeze(["production_handshake_supervisor", "pre_identity_cancellation"] as const),
    exits: Object.freeze(["preparing", "active"] as const)
  }),
  blocked: Object.freeze({
    deadline: "historical",
    pendingTransitionKinds: Object.freeze(["none", "initial", "upgrade", "rollback"] as const),
    blockedBoundary: "required_non_none",
    entryWriters: Object.freeze(["current_supervisor", "whitelisted_gateway"] as const),
    exits: Object.freeze(["uninitialized", "preparing", "production_activating", "active"] as const)
  })
} satisfies Record<PackageActivationState, Readonly<{
  deadline: "forbidden" | "required" | "historical";
  pendingTransitionKinds: readonly PackageTransitionKind[];
  blockedBoundary: "none" | "required_non_none";
  entryWriters: readonly string[];
  exits: readonly PackageActivationState[];
}>>);

export const BLOCKED_BOUNDARY_EXIT_CONTRACT = Object.freeze({
  none: Object.freeze([] as const),
  pre_identity_initial: Object.freeze([
    "retry_package_activation",
    "cancel_package_transition"
  ] as const),
  pre_identity_upgrade: Object.freeze([
    "retry_package_activation",
    "cancel_package_transition"
  ] as const),
  pre_identity_rollback: Object.freeze([
    "retry_package_activation",
    "cancel_package_transition"
  ] as const),
  post_identity: Object.freeze([
    "retry_production_activation",
    "prepare_package_rollback"
  ] as const)
} satisfies Record<BlockedBoundary, readonly GatewayPackageAuthorityOperation[]>);

export const PRE_IDENTITY_CANCEL_OUTCOME_CONTRACT = Object.freeze({
  none: Object.freeze({ legal: false, target_state: null }),
  pre_identity_initial: Object.freeze({
    legal: true,
    target_state: "uninitialized" as const,
    preserved_production_handshake_required: false,
    selected_active_supervisor_may_continue: false,
    gateway_replacement_authorization: "forbidden" as const
  }),
  pre_identity_upgrade: Object.freeze({
    legal: true,
    target_state: "active_with_preserved_handshake_or_production_activating" as const,
    preserved_production_handshake_required_for_active: true,
    selected_active_supervisor_may_continue: true,
    gateway_replacement_authorization: "required_without_preserved_handshake" as const
  }),
  pre_identity_rollback: Object.freeze({
    legal: true,
    target_state: "production_activating" as const,
    preserved_production_handshake_required_for_active: false,
    selected_active_supervisor_may_continue: true,
    gateway_replacement_authorization: "required_without_selected_active_supervisor" as const
  }),
  post_identity: Object.freeze({ legal: false, target_state: null })
} satisfies Record<BlockedBoundary, Readonly<Record<string, unknown>>>);

export const GATEWAY_PACKAGE_AUTHORITY_EFFECTS = Object.freeze({
  bootstrap_package_activation_authority: Object.freeze([
    "create_revision_zero_uninitialized"
  ] as const),
  initialize_package_activation: Object.freeze([
    "select_initial_pending_generation",
    "advance_activation_revision",
    "create_deadline",
    "issue_initial_authorization",
    "reset_launch_budget"
  ] as const),
  consume_launch_authorization_and_reserve_attempt: Object.freeze([
    "consume_current_authorization",
    "reserve_unique_launch_attempt"
  ] as const),
  expire_or_cancel_unconsumed_authorization: Object.freeze([
    "terminalize_unconsumed_authorization"
  ] as const),
  issue_active_restart_authorization: Object.freeze([
    "preserve_package_identity",
    "issue_active_authorization"
  ] as const),
  issue_deterministic_replacement_authorization: Object.freeze([
    "preserve_package_identity",
    "issue_deterministic_authorization"
  ] as const),
  enter_blocked_transition: Object.freeze([
    "preserve_package_identity",
    "advance_activation_revision",
    "persist_blocked_boundary",
    "invalidate_production_handshake"
  ] as const),
  retry_package_activation: Object.freeze([
    "preserve_pre_identity_package_identity",
    "advance_activation_revision",
    "create_deadline",
    "clear_blocked_fields"
  ] as const),
  cancel_package_transition: Object.freeze([
    "preserve_or_clear_selected_active_identity",
    "advance_activation_revision",
    "clear_transition_authority",
    "select_boundary_specific_cancel_target_state",
    "never_restore_rollback_handshake",
    "issue_active_replacement_when_selected_supervisor_absent",
    "reject_pending_generation_supervisor"
  ] as const),
  retry_production_activation: Object.freeze([
    "preserve_post_identity_active_identity",
    "advance_activation_revision",
    "create_deadline",
    "clear_production_handshake_pointer"
  ] as const),
  prepare_package_rollback: Object.freeze([
    "select_explicit_rollback_target",
    "advance_activation_revision",
    "create_deadline",
    "issue_rollback_authorization"
  ] as const)
} satisfies Record<GatewayPackageAuthorityOperation, readonly string[]>);

export const WRITER_MODE_CONTRACT = Object.freeze({
  gateway: Object.freeze({
    expected_supervisor_lease_epoch: null,
    requires_current_gateway: true,
    requires_fresh_supervisor_authority: false,
    supervisor_identity_forbidden: true
  }),
  supervisor: Object.freeze({
    expected_supervisor_lease_epoch: "positive_integer",
    requires_current_gateway: false,
    requires_fresh_supervisor_authority: true,
    gateway_writer_identity_forbidden: true
  })
});

export const PACKAGE_ACTIVATION_FIELDS = [
  "home_id",
  "activation_revision",
  "active_package_generation_id",
  "pending_package_generation_id",
  "previous_package_generation_id",
  "pending_transition_kind",
  "activation_deadline_at",
  "preactivation_handshake_id",
  "production_activation_handshake_id",
  "launch_authorization_id",
  "launch_authorized_generation_id",
  "launch_authorization_role",
  "launch_authorization_state",
  "launch_authorization_revision",
  "launch_authorization_state_revision",
  "launch_authorization_issued_at",
  "launch_authorization_expires_at",
  "launch_authorization_consumed_by_attempt_id",
  "launch_authorization_consumed_at",
  "activation_state",
  "blocked_boundary",
  "blocked_from_state",
  "updated_by_kind",
  "updated_by_gateway_instance_id",
  "updated_by_supervisor_owner_id",
  "updated_by_supervisor_lease_epoch",
  "updated_at",
  "last_failure_code"
] as const;

export const ACTIVATION_HANDSHAKE_FIELDS = [
  "activation_record_schema_version",
  "activation_id",
  "state_revision",
  "handshake_purpose",
  "nonce_digest",
  "home_id",
  "gateway_instance_id",
  "plugin_package_generation_id",
  "current_activation_revision",
  "launch_activation_revision_at_consumption",
  "active_package_generation_id",
  "pending_package_generation_id",
  "launch_authorization_id",
  "launch_authorization_revision",
  "launch_authorization_state_revision_at_consumption",
  "launch_authorization_role",
  "supervisor_launch_attempt_id",
  "configuration_generation_id",
  "effective_route_set_id",
  "supervisor_owner_id",
  "supervisor_lease_epoch",
  "worker_owner_id",
  "worker_fencing_token",
  "worker_mode",
  "schema_version",
  "requested_at",
  "supervisor_acknowledged_at",
  "worker_acknowledged_at",
  "acknowledged_at",
  "expires_at",
  "status",
  "failure_code",
  "last_writer_kind",
  "last_writer_owner_id",
  "last_writer_supervisor_lease_epoch"
] as const;

export const CONTROL_IDEMPOTENCY_FIELDS = [
  "home_id",
  "control_request_id",
  "request_digest",
  "requested_operation",
  "expected_projection_revision",
  "expected_supervisor_lease_epoch",
  "expected_gateway_instance_id",
  "request_state",
  "result_projection_revision",
  "result_code",
  "result_digest",
  "created_at",
  "completed_at",
  "expires_at"
] as const;

export const STATUS_PROJECTION_FIELDS = [
  "projection_schema_version",
  "projection_revision",
  "home_id",
  "package_generation_id",
  "configuration_generation_id",
  "effective_route_set_id",
  "gateway_instance_id",
  "plugin_activation_state",
  "package_activation_state",
  "package_activation_revision",
  "blocked_boundary",
  "production_activation_handshake_id",
  "production_handshake_current_activation_revision",
  "launch_authorization_id",
  "launch_authorization_revision",
  "launch_authorization_state_revision",
  "current_launch_attempt_id",
  "supervisor_launch_activation_revision_at_consumption",
  "supervisor_state",
  "supervisor_lease_epoch",
  "supervisor_lease_state_revision",
  "fresh_supervisor_authority",
  "worker_state",
  "worker_fencing_token",
  "worker_heartbeat_fresh",
  "production_activation_authorized",
  "migration_status",
  "schema_version",
  "queue_state",
  "blocked_counts_by_failure_code",
  "capability_routes",
  "last_updated_at"
] as const;

export const SETUP_STATES = ["installed", "initialized", "ready"] as const;
export const QUALITY_PROJECTION_PROFILES = [
  "evaluated_recommended",
  "custom"
] as const;
export const CORE_LEARNING_QUALITY_STATES = [
  "production",
  "contract_valid_quality_unbenchmarked",
  "validation_stale",
  "validation_invalid",
  "missing_configuration"
] as const;
export const LEARNING_HEALTH_STATES = [
  "healthy",
  "degraded",
  "paused",
  "explicitly_disabled"
] as const;
export const VALUE_STATES = ["warming_up", "first_value_reached"] as const;
export const OUTCOME_CONFIRMED_VALUE_STATES = ["not_reached", "reached"] as const;

export const PRODUCTION_ACTIVATION_REQUIRED_BINDINGS = [
  "home_identity",
  "active_package_generation",
  "current_activation_revision",
  "complete_unexpired_production_handshake",
  "historical_launch_authorization_and_attempt",
  "fresh_supervisor_owner_and_epoch",
  "fresh_production_worker_owner_and_fence",
  "ready_schema",
  "current_configuration_generation",
  "current_effective_route_set"
] as const;

export const DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES = [
  "learning_gate",
  "distillation",
  "embedding"
] as const;

export const PRODUCTION_LEARNING_READY_CAPABILITY_REQUIREMENTS = Object.freeze({
  validation_status: "valid",
  benchmark_assurance: Object.freeze(["recommended", "supported"] as const),
  runtime_health: Object.freeze(["healthy", "degraded_fallback"] as const)
});

export const PACKAGE_ACTIVATION_CONTRACT_FIXTURE = Object.freeze({
  contract_version: PACKAGE_ACTIVATION_CONTRACT_VERSION,
  timing_policy: PACKAGE_ACTIVATION_TIMING_POLICY,
  activation_states: PACKAGE_ACTIVATION_STATES,
  transition_kinds: PACKAGE_TRANSITION_KINDS,
  blocked_boundaries: BLOCKED_BOUNDARIES,
  blocked_from_states: BLOCKED_FROM_STATES,
  gateway_operations: GATEWAY_PACKAGE_AUTHORITY_OPERATIONS,
  native_operations: OPENCLAW_NATIVE_OPERATIONS,
  handshake_purposes: ACTIVATION_HANDSHAKE_PURPOSES,
  handshake_states: ACTIVATION_HANDSHAKE_STATES,
  state_contract: PACKAGE_ACTIVATION_STATE_CONTRACT,
  blocked_exit_contract: BLOCKED_BOUNDARY_EXIT_CONTRACT,
  pre_identity_cancel_outcome_contract: PRE_IDENTITY_CANCEL_OUTCOME_CONTRACT,
  gateway_effects: GATEWAY_PACKAGE_AUTHORITY_EFFECTS,
  writer_modes: WRITER_MODE_CONTRACT,
  activation_fields: PACKAGE_ACTIVATION_FIELDS,
  handshake_fields: ACTIVATION_HANDSHAKE_FIELDS,
  control_fields: CONTROL_IDEMPOTENCY_FIELDS,
  status_fields: STATUS_PROJECTION_FIELDS,
  production_activation_bindings: PRODUCTION_ACTIVATION_REQUIRED_BINDINGS,
  readiness_requirements: PRODUCTION_LEARNING_READY_CAPABILITY_REQUIREMENTS
});
