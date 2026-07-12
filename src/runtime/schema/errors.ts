export type RuntimeSchemaErrorCode =
  | "EE_SQLITE_POLICY_MISMATCH"
  | "EE_SQLITE_BUSY"
  | "EE_SQLITE_COMMIT_INTERRUPTED"
  | "EE_SQLITE_TRANSACTION_ASYNC_FORBIDDEN"
  | "EE_SQLITE_TRANSACTION_NESTING_FORBIDDEN"
  | "EE_SCHEMA_METADATA_INVALID"
  | "EE_SCHEMA_INCOMPATIBLE"
  | "EE_MIGRATION_OWNER_FORBIDDEN"
  | "EE_MIGRATION_SUPERVISOR_AUTHORITY_REQUIRED"
  | "EE_MIGRATION_AUTHORITY_STALE"
  | "EE_MIGRATION_TRANSITION_INVALID"
  | "EE_MIGRATION_PLAN_INVALID";

export class RuntimeSchemaError extends Error {
  constructor(
    public readonly code: RuntimeSchemaErrorCode,
    message: string,
    public readonly failureClass?: "system_route" | "interruption"
  ) {
    super(message);
    this.name = "RuntimeSchemaError";
  }
}
