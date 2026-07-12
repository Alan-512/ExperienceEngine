import type {
  BenchmarkAssurance,
  ProfileEntryStatus
} from "../configuration/constants.js";

export const FENCED_LEARNING_QUEUE_CONTRACT_VERSION =
  "fenced-learning-queue-v1" as const;
export const FENCED_LEARNING_QUEUE_STAGE =
  "fenced_learning_queue_s5" as const;
export const PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION =
  "s6-production-write-authority-v1" as const;
export const LEARNING_QUEUE_MAINTENANCE_AUTHORITY_CONTRACT_VERSION =
  "s6-learning-queue-maintenance-authority-v1" as const;
export const ROUTE_FAILURE_ESCALATION_POLICY_VERSION =
  "route-escalation-disabled-v1" as const;
export const SEMANTIC_ORIGIN_PROVENANCE_SCHEMA_VERSION =
  "semantic-origin-provenance-v1" as const;
export const SEMANTIC_ORIGIN_COMPACTION_SCHEMA_VERSION =
  "semantic-origin-compaction-v1" as const;
export const CUSTOM_GENERATION_DELIVERY_CAP_VERSION =
  "custom-shadow-only-v1" as const;

export const LEARNING_JOB_STATES = [
  "pending",
  "processing",
  "blocked",
  "failed",
  "succeeded",
  "discarded"
] as const;
export type LearningJobState = (typeof LEARNING_JOB_STATES)[number];

export const LEARNING_CANDIDATE_STATES = [
  "pending",
  "blocked",
  "failed",
  "distilled",
  "discarded"
] as const;
export type LearningCandidateState =
  (typeof LEARNING_CANDIDATE_STATES)[number];

export const LEARNING_FAILURE_CLASSES = [
  "system_route",
  "candidate_content",
  "interruption",
  "terminal"
] as const;
export type LearningFailureClass =
  (typeof LEARNING_FAILURE_CLASSES)[number];

export const LEARNING_FAILURE_SCOPES = [
  "provider_route",
  "candidate",
  "embedding_route",
  "sqlite",
  "supervisor",
  "worker_claim",
  "home",
  "schema",
  "package",
  "configuration",
  "activation",
  "control",
  "host_tooling"
] as const;
export type LearningFailureScope =
  (typeof LEARNING_FAILURE_SCOPES)[number];

export const LEARNING_FAILURE_CODES = [
  "EE_PROVIDER_TRANSIENT",
  "EE_PROVIDER_RATE_LIMITED",
  "EE_PROVIDER_AUTH_INVALID",
  "EE_PROVIDER_MODEL_INVALID",
  "EE_PROVIDER_CONFIGURATION_INVALID",
  "EE_PROVIDER_CONTRACT_INVALID",
  "EE_ROUTE_OUTPUT_SCHEMA_INVALID",
  "EE_CANDIDATE_OUTPUT_SCHEMA_INVALID",
  "EE_CANDIDATE_CONTENT_INVALID",
  "EE_EMBEDDING_TRANSIENT",
  "EE_EMBEDDING_CONFIGURATION_INVALID",
  "EE_SQLITE_BUSY",
  "EE_SQLITE_COMMIT_INTERRUPTED",
  "EE_SUPERVISOR_UNAVAILABLE",
  "EE_SUPERVISOR_RESTART_EXHAUSTED",
  "EE_WORKER_INTERRUPTED",
  "EE_CLAIM_EXPIRED",
  "EE_FENCING_REJECTED",
  "EE_ACTIVATION_FENCING_REJECTED",
  "EE_HOME_IDENTITY_MISMATCH",
  "EE_INTEGRITY_KEY_MISMATCH",
  "EE_SCHEMA_MIGRATION_REQUIRED",
  "EE_SCHEMA_MIGRATION_FAILED",
  "EE_SCHEMA_INCOMPATIBLE",
  "EE_PACKAGE_INCOMPATIBLE",
  "EE_CONFIGURATION_POINTER_CONFLICT",
  "EE_ACTIVATION_HANDSHAKE_FAILED",
  "EE_ACTIVATION_HANDSHAKE_EXPIRED",
  "EE_ACTIVATION_HANDSHAKE_REPLAY",
  "EE_ACTIVATION_HANDSHAKE_AUTHORITY_MISMATCH",
  "EE_CONTROL_REQUEST_CONFLICT",
  "EE_CONTROL_REQUEST_STALE",
  "EE_OPENCLAW_EXECUTABLE_UNRESOLVED",
  "EE_CANDIDATE_MISSING",
  "EE_OPERATOR_CANCELLED"
] as const;
export type LearningFailureCode =
  (typeof LEARNING_FAILURE_CODES)[number];

export const LEARNING_QUEUE_PROTECTED_OPERATIONS = [
  "new_claim",
  "claim_renewal",
  "worker_block",
  "worker_failure",
  "worker_discard",
  "semantic_completion"
] as const;
export type LearningQueueProtectedOperation =
  (typeof LEARNING_QUEUE_PROTECTED_OPERATIONS)[number];

export const LEARNING_QUEUE_MAINTENANCE_OPERATIONS = [
  "recover_authority_loss",
  "resume_blocked",
  "operator_cancel"
] as const;
export type LearningQueueMaintenanceOperation =
  (typeof LEARNING_QUEUE_MAINTENANCE_OPERATIONS)[number];

export const PROTECTED_WRITE_OPERATION_MATRIX = Object.freeze({
  new_claim: ["active"],
  claim_renewal: ["active", "draining"],
  worker_block: ["active"],
  worker_failure: ["active"],
  worker_discard: ["active"],
  semantic_completion: ["active", "draining"]
} as const satisfies Record<
  LearningQueueProtectedOperation,
  readonly ("active" | "draining")[]
>);

export type LearningQueueTransitionKind =
  | "blocked"
  | "candidate_failed"
  | "interrupted_pending"
  | "terminal_discard"
  | "pending_without_claim"
  | "processing_until_expiry"
  | "no_queue_mutation";

export type LearningQueueCounterEffect =
  | "system_attempt"
  | "content_retry"
  | "interruption"
  | "none";

export type LearningFailurePolicy = {
  failure_class: LearningFailureClass;
  failure_scope: LearningFailureScope;
  transition: LearningQueueTransitionKind;
  job_next_state: LearningJobState | null;
  candidate_next_state: LearningCandidateState | null;
  counter_effect: LearningQueueCounterEffect;
  automatic_retry: "none" | "bounded" | "provider_backoff" | "claim_recovery";
  resume_trigger: string | null;
};

const blocked = (
  failureScope: LearningFailureScope,
  automaticRetry: LearningFailurePolicy["automatic_retry"],
  resumeTrigger: string
): LearningFailurePolicy => ({
  failure_class: "system_route",
  failure_scope: failureScope,
  transition: "blocked",
  job_next_state: "blocked",
  candidate_next_state: "blocked",
  counter_effect: "system_attempt",
  automatic_retry: automaticRetry,
  resume_trigger: resumeTrigger
});

const interrupted = (
  failureScope: LearningFailureScope,
  transition: "interrupted_pending" | "processing_until_expiry" =
    "interrupted_pending"
): LearningFailurePolicy => ({
  failure_class: "interruption",
  failure_scope: failureScope,
  transition,
  job_next_state: transition === "processing_until_expiry" ? "processing" : "pending",
  candidate_next_state: "pending",
  counter_effect: "interruption",
  automatic_retry: "claim_recovery",
  resume_trigger: "current recovery authority or exact claim-expiry recovery"
});

const candidateFailure = (
  resumeTrigger: string
): LearningFailurePolicy => ({
  failure_class: "candidate_content",
  failure_scope: "candidate",
  transition: "candidate_failed",
  job_next_state: "failed",
  candidate_next_state: "failed",
  counter_effect: "content_retry",
  automatic_retry: "bounded",
  resume_trigger: resumeTrigger
});

const noQueueMutation = (
  failureScope: LearningFailureScope
): LearningFailurePolicy => ({
  failure_class: "system_route",
  failure_scope: failureScope,
  transition: "no_queue_mutation",
  job_next_state: null,
  candidate_next_state: null,
  counter_effect: "none",
  automatic_retry: "none",
  resume_trigger: null
});

export const LEARNING_FAILURE_POLICIES = Object.freeze({
  EE_PROVIDER_TRANSIENT: blocked(
    "provider_route",
    "bounded",
    "primary or validated fallback health probe succeeds"
  ),
  EE_PROVIDER_RATE_LIMITED: blocked(
    "provider_route",
    "provider_backoff",
    "rate-limit backoff expires and route probe succeeds"
  ),
  EE_PROVIDER_AUTH_INVALID: blocked(
    "provider_route",
    "none",
    "operator repairs credentials and validation succeeds"
  ),
  EE_PROVIDER_MODEL_INVALID: blocked(
    "provider_route",
    "none",
    "operator changes route and validation succeeds"
  ),
  EE_PROVIDER_CONFIGURATION_INVALID: blocked(
    "provider_route",
    "none",
    "configuration generation is replaced and validation succeeds"
  ),
  EE_PROVIDER_CONTRACT_INVALID: blocked(
    "provider_route",
    "none",
    "route or contract changes and validation succeeds"
  ),
  EE_ROUTE_OUTPUT_SCHEMA_INVALID: blocked(
    "provider_route",
    "none",
    "route validation succeeds under the required contract"
  ),
  EE_CANDIDATE_OUTPUT_SCHEMA_INVALID: candidateFailure(
    "candidate succeeds, content retry exhausts, or operator acts"
  ),
  EE_CANDIDATE_CONTENT_INVALID: candidateFailure(
    "candidate succeeds or content retry exhausts"
  ),
  EE_EMBEDDING_TRANSIENT: blocked(
    "embedding_route",
    "bounded",
    "embedding route probe succeeds"
  ),
  EE_EMBEDDING_CONFIGURATION_INVALID: blocked(
    "embedding_route",
    "none",
    "embedding configuration and validation succeed"
  ),
  EE_SQLITE_BUSY: {
    failure_class: "system_route",
    failure_scope: "sqlite",
    transition: "pending_without_claim",
    job_next_state: "pending",
    candidate_next_state: "pending",
    counter_effect: "system_attempt",
    automatic_retry: "bounded",
    resume_trigger: "a later atomic claim succeeds"
  },
  EE_SQLITE_COMMIT_INTERRUPTED: interrupted("sqlite", "processing_until_expiry"),
  EE_SUPERVISOR_UNAVAILABLE: interrupted("supervisor"),
  EE_SUPERVISOR_RESTART_EXHAUSTED: blocked(
    "supervisor",
    "none",
    "operator repair or a new package generation restores supervisor health"
  ),
  EE_WORKER_INTERRUPTED: interrupted("worker_claim"),
  EE_CLAIM_EXPIRED: interrupted("worker_claim"),
  EE_FENCING_REJECTED: interrupted("worker_claim"),
  EE_ACTIVATION_FENCING_REJECTED: interrupted("worker_claim"),
  EE_HOME_IDENTITY_MISMATCH: blocked(
    "home",
    "none",
    "plugin, supervisor, worker, and configuration resolve the same home identity"
  ),
  EE_INTEGRITY_KEY_MISMATCH: blocked(
    "home",
    "none",
    "machine integrity key identity is restored through operator repair"
  ),
  EE_SCHEMA_MIGRATION_REQUIRED: blocked(
    "schema",
    "none",
    "current migration owner completes and verifies migration"
  ),
  EE_SCHEMA_MIGRATION_FAILED: blocked(
    "schema",
    "none",
    "operator repair or compatible package migration succeeds"
  ),
  EE_SCHEMA_INCOMPATIBLE: blocked(
    "schema",
    "none",
    "a schema-compatible package generation becomes active"
  ),
  EE_PACKAGE_INCOMPATIBLE: blocked(
    "package",
    "none",
    "a compatible package generation becomes active"
  ),
  EE_CONFIGURATION_POINTER_CONFLICT: noQueueMutation("configuration"),
  EE_ACTIVATION_HANDSHAKE_FAILED: blocked(
    "activation",
    "bounded",
    "a current end-to-end activation handshake succeeds"
  ),
  EE_ACTIVATION_HANDSHAKE_EXPIRED: blocked(
    "activation",
    "bounded",
    "a replacement production activation handshake completes"
  ),
  EE_ACTIVATION_HANDSHAKE_REPLAY: blocked(
    "activation",
    "none",
    "a fresh non-replayed production activation handshake completes"
  ),
  EE_ACTIVATION_HANDSHAKE_AUTHORITY_MISMATCH: blocked(
    "activation",
    "none",
    "handshake authority matches current process and configuration authority"
  ),
  EE_CONTROL_REQUEST_CONFLICT: noQueueMutation("control"),
  EE_CONTROL_REQUEST_STALE: noQueueMutation("control"),
  EE_OPENCLAW_EXECUTABLE_UNRESOLVED: noQueueMutation("host_tooling"),
  EE_CANDIDATE_MISSING: {
    failure_class: "terminal",
    failure_scope: "candidate",
    transition: "terminal_discard",
    job_next_state: "discarded",
    candidate_next_state: "discarded",
    counter_effect: "none",
    automatic_retry: "none",
    resume_trigger: null
  },
  EE_OPERATOR_CANCELLED: {
    failure_class: "terminal",
    failure_scope: "candidate",
    transition: "terminal_discard",
    job_next_state: "discarded",
    candidate_next_state: "discarded",
    counter_effect: "none",
    automatic_retry: "none",
    resume_trigger: null
  }
} as const satisfies Record<LearningFailureCode, LearningFailurePolicy>);

export const SEMANTIC_ORIGIN_ASSURANCE_ORDER: Record<BenchmarkAssurance, number> = {
  unbenchmarked: 0,
  supported: 1,
  recommended: 2
};

export const SEMANTIC_ORIGIN_PROFILE_STATUS_RISK: Record<ProfileEntryStatus, number> = {
  active: 0,
  deprecated: 1,
  revoked: 2
};

export const MAX_EXACT_NODE_PROVENANCE_KEYS = 64 as const;

export const FENCED_LEARNING_QUEUE_CONTRACT_FIXTURE = Object.freeze({
  contract_version: FENCED_LEARNING_QUEUE_CONTRACT_VERSION,
  job_states: LEARNING_JOB_STATES,
  candidate_states: LEARNING_CANDIDATE_STATES,
  failure_codes: LEARNING_FAILURE_CODES,
  failure_classes: LEARNING_FAILURE_CLASSES,
  failure_scopes: LEARNING_FAILURE_SCOPES,
  protected_write_matrix: PROTECTED_WRITE_OPERATION_MATRIX,
  failure_policies: LEARNING_FAILURE_POLICIES,
  route_failure_escalation_policy_version:
    ROUTE_FAILURE_ESCALATION_POLICY_VERSION,
  automatic_candidate_to_route_escalation: false,
  semantic_origin_provenance_schema_version:
    SEMANTIC_ORIGIN_PROVENANCE_SCHEMA_VERSION,
  max_exact_node_provenance_keys: MAX_EXACT_NODE_PROVENANCE_KEYS,
  custom_generation_delivery_cap_version:
    CUSTOM_GENERATION_DELIVERY_CAP_VERSION,
  production_queue_claiming_enabled_without_s6: false,
  semantic_completion_enabled_without_s6: false
});

