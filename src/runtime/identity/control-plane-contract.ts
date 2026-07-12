import {
  RUNTIME_CONTROL_SCHEMA_VERSION,
  RUNTIME_DATABASE_RELATIVE_PATH,
  RUNTIME_HOME_LAYOUT_VERSION,
  RUNTIME_HOME_PATH_NORMALIZATION_VERSION
} from "./constants.js";

export type SqlColumnContract = {
  name: string;
  type: "TEXT" | "INTEGER";
  notNull?: boolean;
  defaultSql?: string;
};

export type SqlForeignKeyContract = {
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
};

export type SqlTableContract = {
  name: string;
  columns: SqlColumnContract[];
  primaryKey: string[];
  uniqueKeys?: string[][];
  foreignKeys?: SqlForeignKeyContract[];
  checks?: string[];
};

const text = (name: string, options: Omit<SqlColumnContract, "name" | "type"> = {}): SqlColumnContract => ({
  name,
  type: "TEXT",
  ...options
});

const integer = (name: string, options: Omit<SqlColumnContract, "name" | "type"> = {}): SqlColumnContract => ({
  name,
  type: "INTEGER",
  ...options
});

const homeForeignKey = (): SqlForeignKeyContract => ({
  columns: ["home_id"],
  referencedTable: "runtime_control_meta",
  referencedColumns: ["home_id"]
});

export const FIXED_CONTROL_PLANE_TABLE_NAMES = [
  "runtime_control_meta",
  "gateway_heartbeats",
  "supervisor_launch_state",
  "supervisor_launch_attempts",
  "supervisor_leases",
  "worker_leases",
  "migration_state",
  "configuration_generations",
  "configuration_pointer",
  "package_activation_state",
  "package_launch_authorizations",
  "control_request_idempotency",
  "activation_handshakes"
] as const;

export const FIXED_CONTROL_PLANE_TABLE_CONTRACTS: SqlTableContract[] = [
  {
    name: "runtime_control_meta",
    columns: [
      text("control_schema_version", { notNull: true }),
      text("home_id", { notNull: true }),
      text("home_layout_version", { notNull: true }),
      text("path_normalization_version", { notNull: true }),
      text("normalized_path_fingerprint", { notNull: true }),
      text("integrity_key_id", { notNull: true }),
      text("home_path_fingerprint_key_id", { notNull: true }),
      text("database_relative_path", { notNull: true }),
      text("created_at", { notNull: true })
    ],
    primaryKey: ["home_id"],
    uniqueKeys: [["normalized_path_fingerprint"]],
    checks: [
      `control_schema_version = '${RUNTIME_CONTROL_SCHEMA_VERSION}'`,
      `home_layout_version = '${RUNTIME_HOME_LAYOUT_VERSION}'`,
      `path_normalization_version = '${RUNTIME_HOME_PATH_NORMALIZATION_VERSION}'`,
      "home_path_fingerprint_key_id = integrity_key_id",
      `database_relative_path = '${RUNTIME_DATABASE_RELATIVE_PATH}'`
    ]
  },
  {
    name: "gateway_heartbeats",
    columns: [
      text("home_id", { notNull: true }),
      text("gateway_instance_id", { notNull: true }),
      integer("gateway_process_id", { notNull: true }),
      text("gateway_process_start_token", { notNull: true }),
      text("package_generation_id", { notNull: true }),
      text("heartbeat_at", { notNull: true }),
      text("expires_at", { notNull: true })
    ],
    primaryKey: ["home_id", "gateway_instance_id"],
    foreignKeys: [homeForeignKey()],
    checks: ["expires_at > heartbeat_at"]
  },
  {
    name: "package_launch_authorizations",
    columns: [
      text("home_id", { notNull: true }),
      text("launch_authorization_id", { notNull: true }),
      integer("authorization_revision", { notNull: true }),
      integer("authorization_state_revision", { notNull: true, defaultSql: "1" }),
      text("authorization_state", { notNull: true, defaultSql: "'issued'" }),
      text("authorized_package_generation_id", { notNull: true }),
      text("authorization_role", { notNull: true }),
      integer("launch_activation_revision_at_issuance", { notNull: true }),
      text("expected_active_package_generation_id"),
      text("expected_pending_package_generation_id"),
      text("issued_by_kind", { notNull: true }),
      text("issued_by_gateway_instance_id"),
      text("issued_by_supervisor_owner_id"),
      integer("issued_by_supervisor_lease_epoch"),
      text("issued_at", { notNull: true }),
      text("expires_at", { notNull: true }),
      text("consumed_by_launch_attempt_id"),
      text("consumed_at"),
      text("terminal_at"),
      text("terminal_code")
    ],
    primaryKey: ["home_id", "launch_authorization_id"],
    uniqueKeys: [["home_id", "authorization_revision"]],
    foreignKeys: [homeForeignKey()],
    checks: [
      "authorization_revision >= 1",
      "authorization_state_revision >= 1",
      "launch_activation_revision_at_issuance >= 0",
      "authorization_state IN ('issued', 'consumed', 'expired', 'cancelled')",
      "authorization_role IN ('initial_candidate', 'active', 'pending', 'rollback_candidate')",
      "issued_by_kind IN ('gateway_service_controller', 'supervisor')",
      "expires_at > issued_at",
      "((issued_by_kind = 'gateway_service_controller' AND issued_by_gateway_instance_id IS NOT NULL AND issued_by_supervisor_owner_id IS NULL AND issued_by_supervisor_lease_epoch IS NULL) OR (issued_by_kind = 'supervisor' AND issued_by_gateway_instance_id IS NULL AND issued_by_supervisor_owner_id IS NOT NULL AND issued_by_supervisor_lease_epoch IS NOT NULL))"
    ]
  },
  {
    name: "supervisor_launch_attempts",
    columns: [
      text("home_id", { notNull: true }),
      text("launch_attempt_id", { notNull: true }),
      integer("attempt_state_revision", { notNull: true, defaultSql: "1" }),
      text("attempt_state", { notNull: true }),
      text("launch_authorization_id", { notNull: true }),
      integer("launch_authorization_revision", { notNull: true }),
      integer("launch_authorization_state_revision_at_consumption", { notNull: true }),
      text("launch_authorization_role", { notNull: true }),
      text("package_generation_id", { notNull: true }),
      integer("launch_activation_revision_at_consumption", { notNull: true }),
      text("expected_active_package_generation_id"),
      text("expected_pending_package_generation_id"),
      text("launch_owner_gateway_instance_id", { notNull: true }),
      text("launch_owner_process_start_token", { notNull: true }),
      integer("child_process_id"),
      text("child_process_start_token"),
      text("supervisor_owner_id"),
      integer("supervisor_lease_epoch"),
      text("reserved_at", { notNull: true }),
      text("attempt_expires_at", { notNull: true }),
      text("lease_acquired_at"),
      text("terminal_at"),
      text("terminal_code")
    ],
    primaryKey: ["home_id", "launch_attempt_id"],
    uniqueKeys: [["home_id", "launch_authorization_id"]],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "launch_authorization_id"],
        referencedTable: "package_launch_authorizations",
        referencedColumns: ["home_id", "launch_authorization_id"]
      }
    ],
    checks: [
      "attempt_state_revision >= 1",
      "launch_authorization_revision >= 1",
      "launch_authorization_state_revision_at_consumption >= 2",
      "launch_activation_revision_at_consumption >= 0",
      "attempt_state IN ('reserved_unbound', 'reserved_bound', 'lease_acquired', 'spawn_failed', 'timed_out', 'cancelled', 'lease_expired', 'terminated')",
      "launch_authorization_role IN ('initial_candidate', 'active', 'pending', 'rollback_candidate')",
      "attempt_expires_at > reserved_at",
      "((child_process_id IS NULL AND child_process_start_token IS NULL) OR (child_process_id IS NOT NULL AND child_process_start_token IS NOT NULL))",
      "((supervisor_owner_id IS NULL AND supervisor_lease_epoch IS NULL) OR (supervisor_owner_id IS NOT NULL AND supervisor_lease_epoch IS NOT NULL))"
    ]
  },
  {
    name: "supervisor_launch_state",
    columns: [
      text("home_id", { notNull: true }),
      integer("launch_revision", { notNull: true, defaultSql: "0" }),
      text("gateway_instance_id"),
      text("package_generation_id"),
      text("launch_authorization_id"),
      text("launch_authorized_generation_id"),
      text("launch_authorization_role"),
      integer("launch_authorization_revision", { notNull: true, defaultSql: "0" }),
      integer("launch_authorization_state_revision", { notNull: true, defaultSql: "0" }),
      integer("expected_current_activation_revision", { notNull: true, defaultSql: "0" }),
      text("expected_active_package_generation_id"),
      text("expected_pending_package_generation_id"),
      text("current_launch_attempt_id"),
      text("launch_owner_gateway_instance_id"),
      text("launch_owner_process_start_token"),
      text("restart_window_started_at"),
      integer("launch_count_in_window", { notNull: true, defaultSql: "0" }),
      text("last_supervisor_owner_id"),
      integer("last_process_exit_code"),
      text("last_process_exit_at"),
      text("next_launch_at"),
      text("launch_started_at"),
      text("launch_expires_at"),
      text("launch_state", { notNull: true, defaultSql: "'idle'" }),
      text("last_failure_code")
    ],
    primaryKey: ["home_id"],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "launch_authorization_id"],
        referencedTable: "package_launch_authorizations",
        referencedColumns: ["home_id", "launch_authorization_id"]
      },
      {
        columns: ["home_id", "current_launch_attempt_id"],
        referencedTable: "supervisor_launch_attempts",
        referencedColumns: ["home_id", "launch_attempt_id"]
      }
    ],
    checks: [
      "launch_revision >= 0",
      "launch_authorization_revision >= 0",
      "launch_authorization_state_revision >= 0",
      "expected_current_activation_revision >= 0",
      "launch_count_in_window >= 0",
      "launch_state IN ('idle', 'launching', 'running', 'backoff', 'blocked', 'stopping')",
      "launch_authorization_role IS NULL OR launch_authorization_role IN ('initial_candidate', 'active', 'pending', 'rollback_candidate')"
    ]
  },
  {
    name: "supervisor_leases",
    columns: [
      text("supervisor_lease_key", { notNull: true }),
      text("home_id", { notNull: true }),
      text("owner_id", { notNull: true }),
      integer("owner_process_id", { notNull: true }),
      text("owner_process_start_token", { notNull: true }),
      text("gateway_instance_id", { notNull: true }),
      text("launch_attempt_id", { notNull: true }),
      text("launch_authorization_id", { notNull: true }),
      integer("launch_authorization_revision", { notNull: true }),
      integer("launch_authorization_state_revision_at_consumption", { notNull: true }),
      text("launch_authorization_role", { notNull: true }),
      integer("launch_activation_revision_at_consumption", { notNull: true }),
      text("package_generation_id", { notNull: true }),
      text("artifact_integrity", { notNull: true }),
      text("supervisor_protocol_version", { notNull: true }),
      integer("lease_state_revision", { notNull: true, defaultSql: "1" }),
      integer("lease_epoch", { notNull: true }),
      text("state", { notNull: true }),
      integer("launch_attempt_state_revision_at_acquisition", { notNull: true }),
      text("worker_restart_window_started_at"),
      integer("worker_restart_count_in_window", { notNull: true, defaultSql: "0" }),
      text("started_at", { notNull: true }),
      text("heartbeat_at", { notNull: true }),
      text("expires_at", { notNull: true }),
      text("shutdown_requested_at"),
      text("lease_terminal_at"),
      text("lease_terminal_reason"),
      text("last_failure_code")
    ],
    primaryKey: ["home_id", "supervisor_lease_key"],
    uniqueKeys: [
      ["home_id"],
      ["home_id", "owner_id", "lease_epoch"],
      ["home_id", "launch_attempt_id"]
    ],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "launch_attempt_id"],
        referencedTable: "supervisor_launch_attempts",
        referencedColumns: ["home_id", "launch_attempt_id"]
      },
      {
        columns: ["home_id", "launch_authorization_id"],
        referencedTable: "package_launch_authorizations",
        referencedColumns: ["home_id", "launch_authorization_id"]
      }
    ],
    checks: [
      "lease_state_revision >= 1",
      "lease_epoch >= 1",
      "launch_authorization_revision >= 1",
      "launch_authorization_state_revision_at_consumption >= 2",
      "launch_activation_revision_at_consumption >= 0",
      "launch_attempt_state_revision_at_acquisition >= 2",
      "worker_restart_count_in_window >= 0",
      "state IN ('starting', 'active', 'draining', 'backoff', 'blocked', 'stopped', 'expired')",
      "launch_authorization_role IN ('initial_candidate', 'active', 'pending', 'rollback_candidate')",
      "lease_terminal_reason IS NULL OR lease_terminal_reason IN ('graceful_release', 'verified_process_exit', 'natural_expiry')",
      "expires_at > heartbeat_at"
    ]
  },
  {
    name: "worker_leases",
    columns: [
      text("worker_lease_key", { notNull: true }),
      text("home_id", { notNull: true }),
      text("owner_id", { notNull: true }),
      integer("owner_process_id", { notNull: true }),
      text("owner_process_start_token", { notNull: true }),
      text("supervisor_owner_id", { notNull: true }),
      integer("supervisor_lease_epoch", { notNull: true }),
      text("package_generation_id", { notNull: true }),
      text("artifact_integrity", { notNull: true }),
      text("worker_protocol_version", { notNull: true }),
      text("schema_version", { notNull: true }),
      integer("fencing_token", { notNull: true }),
      text("worker_mode", { notNull: true }),
      text("state", { notNull: true }),
      text("started_at", { notNull: true }),
      text("heartbeat_at", { notNull: true }),
      text("expires_at", { notNull: true }),
      text("shutdown_requested_at"),
      text("drain_deadline_at"),
      text("last_failure_code")
    ],
    primaryKey: ["home_id", "worker_lease_key"],
    uniqueKeys: [["home_id"]],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "supervisor_owner_id", "supervisor_lease_epoch"],
        referencedTable: "supervisor_leases",
        referencedColumns: ["home_id", "owner_id", "lease_epoch"]
      }
    ],
    checks: [
      "supervisor_lease_epoch >= 1",
      "fencing_token >= 1",
      "worker_mode IN ('production', 'activation_only')",
      "state IN ('starting', 'active', 'draining', 'blocked', 'stopped')",
      "expires_at > heartbeat_at"
    ]
  },
  {
    name: "migration_state",
    columns: [
      text("home_id", { notNull: true }),
      text("schema_contract_version", { notNull: true }),
      text("current_schema_version"),
      text("target_schema_version"),
      text("migration_id"),
      text("migration_owner_id"),
      integer("migration_supervisor_lease_epoch"),
      integer("migration_fencing_token", { notNull: true, defaultSql: "0" }),
      text("migration_package_generation_id"),
      text("migration_started_at"),
      text("migration_heartbeat_at"),
      text("migration_expires_at"),
      text("migration_status", { notNull: true, defaultSql: "'idle'" }),
      text("last_completed_migration_id"),
      text("last_error_code")
    ],
    primaryKey: ["home_id"],
    foreignKeys: [homeForeignKey()],
    checks: [
      "migration_fencing_token >= 0",
      "migration_supervisor_lease_epoch IS NULL OR migration_supervisor_lease_epoch >= 1",
      "migration_status IN ('idle', 'preparing', 'migrating', 'verifying', 'ready', 'failed')"
    ]
  },
  {
    name: "configuration_generations",
    columns: [
      text("generation_id", { notNull: true }),
      text("home_id", { notNull: true }),
      text("parent_generation_id"),
      text("manifest_digest", { notNull: true }),
      text("integrity_key_id", { notNull: true }),
      text("profile_registry_digest", { notNull: true }),
      text("created_by_instance_id", { notNull: true }),
      text("created_at", { notNull: true }),
      text("committed_at"),
      text("generation_state", { notNull: true })
    ],
    primaryKey: ["home_id", "generation_id"],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "parent_generation_id"],
        referencedTable: "configuration_generations",
        referencedColumns: ["home_id", "generation_id"]
      }
    ],
    checks: [
      "generation_state IN ('committed', 'abandoned')",
      "((generation_state = 'committed' AND committed_at IS NOT NULL) OR generation_state = 'abandoned')"
    ]
  },
  {
    name: "configuration_pointer",
    columns: [
      text("home_id", { notNull: true }),
      text("pointer_schema_version", { notNull: true }),
      integer("pointer_revision", { notNull: true, defaultSql: "0" }),
      text("generation_id"),
      text("previous_generation_id"),
      text("manifest_digest"),
      text("commit_id"),
      text("committed_at")
    ],
    primaryKey: ["home_id"],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "generation_id"],
        referencedTable: "configuration_generations",
        referencedColumns: ["home_id", "generation_id"]
      },
      {
        columns: ["home_id", "previous_generation_id"],
        referencedTable: "configuration_generations",
        referencedColumns: ["home_id", "generation_id"]
      }
    ],
    checks: [
      "pointer_revision >= 0",
      "((generation_id IS NULL AND manifest_digest IS NULL AND commit_id IS NULL AND committed_at IS NULL) OR (generation_id IS NOT NULL AND manifest_digest IS NOT NULL AND commit_id IS NOT NULL AND committed_at IS NOT NULL))",
      "generation_id IS NULL OR generation_id <> previous_generation_id"
    ]
  },
  {
    name: "activation_handshakes",
    columns: [
      text("activation_record_schema_version", { notNull: true }),
      text("activation_id", { notNull: true }),
      integer("state_revision", { notNull: true, defaultSql: "1" }),
      text("handshake_purpose", { notNull: true }),
      text("nonce_digest", { notNull: true }),
      text("home_id", { notNull: true }),
      text("gateway_instance_id", { notNull: true }),
      text("plugin_package_generation_id", { notNull: true }),
      integer("current_activation_revision", { notNull: true }),
      integer("launch_activation_revision_at_consumption", { notNull: true }),
      text("active_package_generation_id"),
      text("pending_package_generation_id"),
      text("launch_authorization_id", { notNull: true }),
      integer("launch_authorization_revision", { notNull: true }),
      integer("launch_authorization_state_revision_at_consumption", { notNull: true }),
      text("launch_authorization_role", { notNull: true }),
      text("supervisor_launch_attempt_id", { notNull: true }),
      text("configuration_generation_id", { notNull: true }),
      text("effective_route_set_id", { notNull: true }),
      text("supervisor_owner_id", { notNull: true }),
      integer("supervisor_lease_epoch", { notNull: true }),
      text("worker_owner_id", { notNull: true }),
      integer("worker_fencing_token", { notNull: true }),
      text("worker_mode", { notNull: true }),
      text("schema_version", { notNull: true }),
      text("requested_at", { notNull: true }),
      text("supervisor_acknowledged_at"),
      text("worker_acknowledged_at"),
      text("acknowledged_at"),
      text("expires_at", { notNull: true }),
      text("status", { notNull: true, defaultSql: "'requested'" }),
      text("failure_code"),
      text("last_writer_kind", { notNull: true }),
      text("last_writer_owner_id", { notNull: true }),
      integer("last_writer_supervisor_lease_epoch")
    ],
    primaryKey: ["home_id", "activation_id"],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "launch_authorization_id"],
        referencedTable: "package_launch_authorizations",
        referencedColumns: ["home_id", "launch_authorization_id"]
      },
      {
        columns: ["home_id", "supervisor_launch_attempt_id"],
        referencedTable: "supervisor_launch_attempts",
        referencedColumns: ["home_id", "launch_attempt_id"]
      },
      {
        columns: ["home_id", "configuration_generation_id"],
        referencedTable: "configuration_generations",
        referencedColumns: ["home_id", "generation_id"]
      }
    ],
    checks: [
      "state_revision >= 1",
      "current_activation_revision >= 0",
      "launch_activation_revision_at_consumption >= 0",
      "launch_authorization_revision >= 1",
      "launch_authorization_state_revision_at_consumption >= 2",
      "supervisor_lease_epoch >= 1",
      "worker_fencing_token >= 1",
      "handshake_purpose IN ('preactivation_verification', 'production_activation')",
      "launch_authorization_role IN ('initial_candidate', 'active', 'pending', 'rollback_candidate')",
      "worker_mode IN ('production', 'activation_only')",
      "status IN ('requested', 'supervisor_acknowledged', 'worker_acknowledged', 'complete', 'expired', 'rejected')",
      "last_writer_kind IN ('plugin', 'supervisor')",
      "expires_at > requested_at",
      "((last_writer_kind = 'plugin' AND last_writer_supervisor_lease_epoch IS NULL) OR (last_writer_kind = 'supervisor' AND last_writer_supervisor_lease_epoch IS NOT NULL))"
    ]
  },
  {
    name: "package_activation_state",
    columns: [
      text("home_id", { notNull: true }),
      integer("activation_revision", { notNull: true, defaultSql: "0" }),
      text("active_package_generation_id"),
      text("pending_package_generation_id"),
      text("previous_package_generation_id"),
      text("pending_transition_kind", { notNull: true, defaultSql: "'none'" }),
      text("activation_deadline_at"),
      text("preactivation_handshake_id"),
      text("production_activation_handshake_id"),
      text("launch_authorization_id"),
      text("launch_authorized_generation_id"),
      text("launch_authorization_role", { notNull: true, defaultSql: "'none'" }),
      text("launch_authorization_state", { notNull: true, defaultSql: "'none'" }),
      integer("launch_authorization_revision", { notNull: true, defaultSql: "0" }),
      integer("launch_authorization_state_revision", { notNull: true, defaultSql: "0" }),
      text("launch_authorization_issued_at"),
      text("launch_authorization_expires_at"),
      text("launch_authorization_consumed_by_attempt_id"),
      text("launch_authorization_consumed_at"),
      text("activation_state", { notNull: true, defaultSql: "'uninitialized'" }),
      text("blocked_boundary", { notNull: true, defaultSql: "'none'" }),
      text("blocked_from_state", { notNull: true, defaultSql: "'none'" }),
      text("updated_by_kind"),
      text("updated_by_gateway_instance_id"),
      text("updated_by_supervisor_owner_id"),
      integer("updated_by_supervisor_lease_epoch"),
      text("updated_at", { notNull: true }),
      text("last_failure_code")
    ],
    primaryKey: ["home_id"],
    foreignKeys: [
      homeForeignKey(),
      {
        columns: ["home_id", "launch_authorization_id"],
        referencedTable: "package_launch_authorizations",
        referencedColumns: ["home_id", "launch_authorization_id"]
      },
      {
        columns: ["home_id", "preactivation_handshake_id"],
        referencedTable: "activation_handshakes",
        referencedColumns: ["home_id", "activation_id"]
      },
      {
        columns: ["home_id", "production_activation_handshake_id"],
        referencedTable: "activation_handshakes",
        referencedColumns: ["home_id", "activation_id"]
      }
    ],
    checks: [
      "activation_revision >= 0",
      "launch_authorization_revision >= 0",
      "launch_authorization_state_revision >= 0",
      "pending_transition_kind IN ('none', 'initial', 'upgrade', 'rollback')",
      "launch_authorization_role IN ('none', 'initial_candidate', 'active', 'pending', 'rollback_candidate')",
      "launch_authorization_state IN ('none', 'issued', 'consumed', 'expired', 'cancelled')",
      "activation_state IN ('uninitialized', 'preparing', 'draining_old', 'migrating', 'preactivation_verifying', 'production_activating', 'active', 'blocked')",
      "blocked_boundary IN ('none', 'pre_identity_initial', 'pre_identity_upgrade', 'pre_identity_rollback', 'post_identity')",
      "blocked_from_state IN ('none', 'preparing', 'draining_old', 'migrating', 'preactivation_verifying', 'production_activating')",
      "updated_by_kind IS NULL OR updated_by_kind IN ('gateway_service_controller', 'supervisor')",
      "((activation_revision = 0 AND activation_state = 'uninitialized' AND updated_by_kind IS NULL AND updated_by_gateway_instance_id IS NULL AND updated_by_supervisor_owner_id IS NULL AND updated_by_supervisor_lease_epoch IS NULL) OR (updated_by_kind = 'gateway_service_controller' AND updated_by_gateway_instance_id IS NOT NULL AND updated_by_supervisor_owner_id IS NULL AND updated_by_supervisor_lease_epoch IS NULL) OR (updated_by_kind = 'supervisor' AND updated_by_gateway_instance_id IS NULL AND updated_by_supervisor_owner_id IS NOT NULL AND updated_by_supervisor_lease_epoch IS NOT NULL))",
      "((launch_authorization_id IS NULL AND launch_authorized_generation_id IS NULL AND launch_authorization_role = 'none' AND launch_authorization_state = 'none' AND launch_authorization_revision = 0 AND launch_authorization_state_revision = 0) OR (launch_authorization_id IS NOT NULL AND launch_authorized_generation_id IS NOT NULL AND launch_authorization_role <> 'none' AND launch_authorization_state <> 'none' AND launch_authorization_revision >= 1 AND launch_authorization_state_revision >= 1))"
    ]
  },
  {
    name: "control_request_idempotency",
    columns: [
      text("home_id", { notNull: true }),
      text("control_request_id", { notNull: true }),
      text("request_digest", { notNull: true }),
      text("requested_operation", { notNull: true }),
      integer("expected_projection_revision", { notNull: true }),
      integer("expected_supervisor_lease_epoch"),
      text("expected_gateway_instance_id", { notNull: true }),
      text("request_state", { notNull: true }),
      integer("result_projection_revision", { notNull: true }),
      text("result_code", { notNull: true }),
      text("result_digest", { notNull: true }),
      text("created_at", { notNull: true }),
      text("completed_at", { notNull: true }),
      text("expires_at", { notNull: true })
    ],
    primaryKey: ["home_id", "control_request_id"],
    foreignKeys: [homeForeignKey()],
    checks: [
      "expected_projection_revision >= 0",
      "expected_supervisor_lease_epoch IS NULL OR expected_supervisor_lease_epoch >= 1",
      "result_projection_revision >= 0",
      "request_state IN ('completed', 'rejected')",
      "expires_at > completed_at",
      "completed_at >= created_at"
    ]
  }
];

const quoteIdentifier = (value: string): string => `"${value.replace(/"/gu, '""')}"`;

const createColumnSql = (column: SqlColumnContract): string => {
  const pieces = [quoteIdentifier(column.name), column.type];
  if (column.notNull) {
    pieces.push("NOT NULL");
  }
  if (column.defaultSql !== undefined) {
    pieces.push(`DEFAULT ${column.defaultSql}`);
  }
  return pieces.join(" ");
};

export const createTableSql = (table: SqlTableContract): string => {
  const definitions = table.columns.map(createColumnSql);
  definitions.push(`PRIMARY KEY (${table.primaryKey.map(quoteIdentifier).join(", ")})`);
  for (const uniqueKey of table.uniqueKeys ?? []) {
    definitions.push(`UNIQUE (${uniqueKey.map(quoteIdentifier).join(", ")})`);
  }
  for (const foreignKey of table.foreignKeys ?? []) {
    definitions.push(
      `FOREIGN KEY (${foreignKey.columns.map(quoteIdentifier).join(", ")}) ` +
      `REFERENCES ${quoteIdentifier(foreignKey.referencedTable)} ` +
      `(${foreignKey.referencedColumns.map(quoteIdentifier).join(", ")}) ` +
      "ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
    );
  }
  for (const check of table.checks ?? []) {
    definitions.push(`CHECK (${check})`);
  }

  return `CREATE TABLE ${quoteIdentifier(table.name)} (\n  ${definitions.join(",\n  ")}\n);`;
};

export const FIXED_CONTROL_PLANE_DDL = `${FIXED_CONTROL_PLANE_TABLE_CONTRACTS
  .map(createTableSql)
  .join("\n\n")}\n`;

const contractNameSet = new Set(FIXED_CONTROL_PLANE_TABLE_CONTRACTS.map((table) => table.name));
if (
  contractNameSet.size !== FIXED_CONTROL_PLANE_TABLE_NAMES.length ||
  FIXED_CONTROL_PLANE_TABLE_NAMES.some((name) => !contractNameSet.has(name))
) {
  throw new Error("Fixed control-plane table names and contracts are not exhaustive.");
}
