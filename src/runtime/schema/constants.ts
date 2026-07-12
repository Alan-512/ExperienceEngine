export const SQLITE_RUNTIME_POLICY = Object.freeze({
  sqlite_runtime_policy_version: "sqlite-runtime-v1",
  journal_mode: "wal",
  synchronous: "full",
  foreign_keys: true,
  busy_timeout_ms: 5000,
  application_retry_attempts: 1,
  application_backoff_ms: [] as readonly number[]
});

export const RUNTIME_SCHEMA_CONTRACT_VERSION = "runtime-schema-contract-v1" as const;

export const RUNTIME_SCHEMA_VERSION_ORDER = [
  "legacy-learning-v0",
  "runtime-schema-v1"
] as const;

export const RUNTIME_SCHEMA_SQLITE_USER_VERSIONS = Object.freeze({
  "legacy-learning-v0": 0,
  "runtime-schema-v1": 1
} as const);

export const RUNTIME_MIGRATION_STATUSES = [
  "idle",
  "preparing",
  "migrating",
  "verifying",
  "ready",
  "failed"
] as const;

export type RuntimeMigrationStatus = typeof RUNTIME_MIGRATION_STATUSES[number];

export const ACTIVE_RUNTIME_MIGRATION_STATUSES = [
  "preparing",
  "migrating",
  "verifying"
] as const satisfies readonly RuntimeMigrationStatus[];

export const RUNTIME_PLUGIN_DATABASE_MODES = [
  "interaction_ready",
  "interaction_read_only",
  "status_only_warming",
  "blocked_incompatible"
] as const;

export type RuntimePluginDatabaseMode = typeof RUNTIME_PLUGIN_DATABASE_MODES[number];

export const RUNTIME_PLUGIN_DATABASE_OPERATIONS = [
  "status",
  "repair_explanation",
  "db_prompt_injection",
  "retrieval",
  "producer_write",
  "learning_write"
] as const;

export type RuntimePluginDatabaseOperation = typeof RUNTIME_PLUGIN_DATABASE_OPERATIONS[number];

export const RUNTIME_PLUGIN_MODE_PERMISSIONS: Readonly<
  Record<RuntimePluginDatabaseMode, Readonly<Record<RuntimePluginDatabaseOperation, boolean>>>
> = Object.freeze({
  interaction_ready: Object.freeze({
    status: true,
    repair_explanation: true,
    db_prompt_injection: true,
    retrieval: true,
    producer_write: true,
    learning_write: false
  }),
  interaction_read_only: Object.freeze({
    status: true,
    repair_explanation: true,
    db_prompt_injection: true,
    retrieval: true,
    producer_write: false,
    learning_write: false
  }),
  status_only_warming: Object.freeze({
    status: true,
    repair_explanation: true,
    db_prompt_injection: false,
    retrieval: false,
    producer_write: false,
    learning_write: false
  }),
  blocked_incompatible: Object.freeze({
    status: true,
    repair_explanation: true,
    db_prompt_injection: false,
    retrieval: false,
    producer_write: false,
    learning_write: false
  })
});

export const RUNTIME_SQLITE_FAILURE_MAPPINGS = Object.freeze({
  contention_before_semantic_work: Object.freeze({
    code: "EE_SQLITE_BUSY",
    failure_class: "system_route"
  }),
  fenced_result_commit_interrupted: Object.freeze({
    code: "EE_SQLITE_COMMIT_INTERRUPTED",
    failure_class: "interruption"
  })
});

export const RUNTIME_SCHEMA_FOUNDATION_STAGE = "schema_authority_foundation_only" as const;
