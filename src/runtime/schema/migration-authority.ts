import type { DatabaseSync } from "node:sqlite";
import {
  ACTIVE_RUNTIME_MIGRATION_STATUSES,
  RUNTIME_SCHEMA_CONTRACT_VERSION,
  RUNTIME_SCHEMA_VERSION_ORDER
} from "./constants.js";
import { RuntimeSchemaError } from "./errors.js";
import {
  assertRuntimePhysicalSchemaVersion,
  readRuntimePhysicalSchemaVersion,
  setRuntimePhysicalSchemaVersion
} from "./schema-version.js";
import { runRuntimeImmediateTransaction } from "./sqlite-policy.js";
import type {
  AvailableSupervisorMigrationAuthority,
  RuntimeMigrationCheckpoint,
  RuntimeMigrationLease,
  RuntimeMigrationStateRecord,
  RuntimeMigrationStep,
  RuntimeSchemaPackageCompatibility,
  RuntimeSchemaPhysicalVerifier,
  RuntimeSchemaVersion,
  SupervisorMigrationAuthorityEvidence,
  SupervisorMigrationAuthorityProvider
} from "./types.js";

const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_RUNTIME_MIGRATION_STATUSES);

const toEpochMs = (value: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      `Invalid runtime schema timestamp: ${value}.`
    );
  }
  return parsed;
};

const changesCount = (result: { changes: number | bigint }): number => Number(result.changes);

const assertSynchronousCallbackResult = (result: unknown, label: string): void => {
  if (
    result &&
    typeof result === "object" &&
    "then" in result &&
    typeof (result as { then?: unknown }).then === "function"
  ) {
    throw new RuntimeSchemaError(
      "EE_SQLITE_TRANSACTION_ASYNC_FORBIDDEN",
      `${label} must be synchronous and local to the SQLite transaction.`
    );
  }
};

const readState = (db: DatabaseSync, homeId: string): RuntimeMigrationStateRecord | undefined =>
  db.prepare("SELECT * FROM migration_state WHERE home_id = ? LIMIT 1")
    .get(homeId) as RuntimeMigrationStateRecord | undefined;

const assertKnownSchemaVersion = (version: RuntimeSchemaVersion): void => {
  if (!RUNTIME_SCHEMA_VERSION_ORDER.includes(
    version as typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
  )) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_INCOMPATIBLE",
      `Unknown runtime schema version ${version}.`
    );
  }
};

const assertControlHomeExists = (db: DatabaseSync, homeId: string): void => {
  const row = db.prepare(
    "SELECT home_id FROM runtime_control_meta WHERE home_id = ? LIMIT 1"
  ).get(homeId) as { home_id: string } | undefined;
  if (!row) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      `Runtime schema metadata cannot bind to unknown home ${homeId}.`
    );
  }
};

const assertStateContract = (
  state: RuntimeMigrationStateRecord,
  homeId: string
): void => {
  if (state.home_id !== homeId || state.schema_contract_version !== RUNTIME_SCHEMA_CONTRACT_VERSION) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      "Runtime migration state does not match the canonical home and schema contract."
    );
  }
  if (state.migration_fencing_token < 0) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      "Runtime migration fencing token cannot be negative."
    );
  }
};

const assertAvailableSupervisorAuthority = (options: {
  evidence: SupervisorMigrationAuthorityEvidence;
  homeId: string;
  ownerId: string;
  packageGenerationId: string;
}): AvailableSupervisorMigrationAuthority => {
  const evidence = options.evidence;
  if (
    !evidence.available ||
    !evidence.fresh ||
    evidence.authority_contract_version !== "runtime-supervisor-authority-v1" ||
    evidence.authority_source !== "s3_objective_database_predicate" ||
    evidence.home_id !== options.homeId ||
    evidence.supervisor_owner_id !== options.ownerId ||
    evidence.package_generation_id !== options.packageGenerationId ||
    evidence.supervisor_lease_epoch < 1 ||
    toEpochMs(evidence.expires_at) <= toEpochMs(evidence.observed_at)
  ) {
    throw new RuntimeSchemaError(
      "EE_MIGRATION_SUPERVISOR_AUTHORITY_REQUIRED",
      "Migration lease acquisition requires current objective supervisor authority from S3."
    );
  }
  return evidence;
};

const rowToLease = (state: RuntimeMigrationStateRecord): RuntimeMigrationLease => {
  if (
    !state.current_schema_version ||
    !state.target_schema_version ||
    !state.migration_id ||
    !state.migration_owner_id ||
    !state.migration_supervisor_lease_epoch ||
    !state.migration_package_generation_id ||
    !state.migration_expires_at
  ) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      "Active runtime migration state is missing required lease fields."
    );
  }
  return {
    home_id: state.home_id,
    migration_id: state.migration_id,
    migration_owner_id: state.migration_owner_id,
    migration_supervisor_lease_epoch: state.migration_supervisor_lease_epoch,
    migration_fencing_token: state.migration_fencing_token,
    migration_revision: state.migration_fencing_token,
    migration_package_generation_id: state.migration_package_generation_id,
    source_schema_version: state.current_schema_version,
    target_schema_version: state.target_schema_version,
    migration_expires_at: state.migration_expires_at
  };
};

const assertCurrentLease = (options: {
  state: RuntimeMigrationStateRecord;
  lease: RuntimeMigrationLease;
  now: string;
}): void => {
  const { state, lease } = options;
  if (
    !ACTIVE_STATUS_SET.has(state.migration_status) ||
    state.home_id !== lease.home_id ||
    state.migration_id !== lease.migration_id ||
    state.migration_owner_id !== lease.migration_owner_id ||
    state.migration_supervisor_lease_epoch !== lease.migration_supervisor_lease_epoch ||
    state.migration_fencing_token !== lease.migration_fencing_token ||
    state.migration_package_generation_id !== lease.migration_package_generation_id ||
    state.target_schema_version !== lease.target_schema_version ||
    !state.migration_expires_at ||
    toEpochMs(state.migration_expires_at) <= toEpochMs(options.now)
  ) {
    throw new RuntimeSchemaError(
      "EE_MIGRATION_AUTHORITY_STALE",
      "The migration owner lost its current lease, fence, revision, package generation, or home binding."
    );
  }
};

export const readRuntimeMigrationState = (
  db: DatabaseSync,
  homeId: string
): RuntimeMigrationStateRecord | undefined => {
  const state = readState(db, homeId);
  if (!state) {
    return undefined;
  }
  assertStateContract(state, homeId);
  if (!state.current_schema_version) {
    throw new RuntimeSchemaError(
      "EE_SCHEMA_METADATA_INVALID",
      "Runtime schema metadata has no current schema version."
    );
  }
  assertRuntimePhysicalSchemaVersion(db, state.current_schema_version);
  return state;
};

export const initializeRuntimeSchemaMetadata = (options: {
  db: DatabaseSync;
  homeId: string;
  verifyCurrentSchema: RuntimeSchemaPhysicalVerifier;
  writer: "package_local_initializer" | "supervisor" | "plugin" | "worker";
}): RuntimeMigrationStateRecord => {
  if (options.writer !== "package_local_initializer" && options.writer !== "supervisor") {
    throw new RuntimeSchemaError(
      "EE_MIGRATION_OWNER_FORBIDDEN",
      `${options.writer} cannot initialize runtime schema metadata.`
    );
  }
  return runRuntimeImmediateTransaction(options.db, {
    category: "migration",
    operation: () => {
      assertControlHomeExists(options.db, options.homeId);
      const observedSchemaVersion = readRuntimePhysicalSchemaVersion(options.db);
      assertKnownSchemaVersion(observedSchemaVersion);
      const verificationResult = options.verifyCurrentSchema(
        options.db,
        observedSchemaVersion
      ) as unknown;
      assertSynchronousCallbackResult(verificationResult, "Schema baseline verification");
      const existing = readState(options.db, options.homeId);
      if (existing) {
        assertStateContract(existing, options.homeId);
        if (
          existing.current_schema_version !== observedSchemaVersion ||
          existing.target_schema_version !== observedSchemaVersion
        ) {
          throw new RuntimeSchemaError(
            "EE_SCHEMA_METADATA_INVALID",
            "Existing runtime schema metadata contradicts the verified physical schema."
          );
        }
        return existing;
      }
      options.db.prepare(
        `INSERT INTO migration_state (
          home_id,
          schema_contract_version,
          current_schema_version,
          target_schema_version,
          migration_status
        ) VALUES (?, ?, ?, ?, 'ready')`
      ).run(
        options.homeId,
        RUNTIME_SCHEMA_CONTRACT_VERSION,
        observedSchemaVersion,
        observedSchemaVersion
      );
      return readState(options.db, options.homeId)!;
    }
  });
};

export class RuntimeMigrationRegistry {
  private readonly byMigrationAndSource = new Map<string, RuntimeMigrationStep>();

  constructor(public readonly steps: readonly RuntimeMigrationStep[]) {
    const stepIds = new Set<string>();
    for (const step of steps) {
      assertKnownSchemaVersion(step.from_schema_version);
      assertKnownSchemaVersion(step.to_schema_version);
      if (
        !step.migration_id ||
        !step.step_id ||
        step.from_schema_version === step.to_schema_version ||
        step.recovery_mode !== "restartable_step" ||
        typeof step.verify_source !== "function" ||
        typeof step.apply !== "function" ||
        typeof step.verify_target !== "function" ||
        stepIds.has(step.step_id)
      ) {
        throw new RuntimeSchemaError(
          "EE_MIGRATION_PLAN_INVALID",
          `Invalid runtime migration step ${step.step_id || "<missing>"}.`
        );
      }
      const key = `${step.migration_id}\0${step.from_schema_version}`;
      if (this.byMigrationAndSource.has(key)) {
        throw new RuntimeSchemaError(
          "EE_MIGRATION_PLAN_INVALID",
          `Migration ${step.migration_id} has multiple steps from ${step.from_schema_version}.`
        );
      }
      stepIds.add(step.step_id);
      this.byMigrationAndSource.set(key, step);
    }
  }

  nextStep(
    migrationId: string,
    currentSchemaVersion: RuntimeSchemaVersion,
    targetSchemaVersion: RuntimeSchemaVersion
  ): RuntimeMigrationStep {
    const step = this.byMigrationAndSource.get(`${migrationId}\0${currentSchemaVersion}`);
    if (!step) {
      throw new RuntimeSchemaError(
        "EE_MIGRATION_PLAN_INVALID",
        `Migration ${migrationId} has no restartable step from ${currentSchemaVersion} toward ${targetSchemaVersion}.`
      );
    }
    const currentIndex = RUNTIME_SCHEMA_VERSION_ORDER.indexOf(
      currentSchemaVersion as typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
    );
    const nextIndex = RUNTIME_SCHEMA_VERSION_ORDER.indexOf(
      step.to_schema_version as typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
    );
    const targetIndex = RUNTIME_SCHEMA_VERSION_ORDER.indexOf(
      targetSchemaVersion as typeof RUNTIME_SCHEMA_VERSION_ORDER[number]
    );
    if (nextIndex <= currentIndex || nextIndex > targetIndex) {
      throw new RuntimeSchemaError(
        "EE_MIGRATION_PLAN_INVALID",
        `Migration step ${step.step_id} does not advance monotonically toward ${targetSchemaVersion}.`
      );
    }
    return step;
  }
}

export class RuntimeMigrationAuthorityRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string
  ) {}

  read(): RuntimeMigrationStateRecord | undefined {
    return readRuntimeMigrationState(this.db, this.homeId);
  }

  async acquire(options: {
    ownerId: string;
    migrationId: string;
    packageCompatibility: RuntimeSchemaPackageCompatibility;
    authorityProvider: SupervisorMigrationAuthorityProvider;
    leaseDurationMs: number;
  }): Promise<RuntimeMigrationLease> {
    if (!Number.isSafeInteger(options.leaseDurationMs) || options.leaseDurationMs <= 0) {
      throw new RuntimeSchemaError(
        "EE_MIGRATION_TRANSITION_INVALID",
        "Migration lease duration must be a positive bounded integer."
      );
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "migration",
      operation: () => {
        const authority = assertAvailableSupervisorAuthority({
          evidence: options.authorityProvider.getFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            packageGenerationId: options.packageCompatibility.package_generation_id,
            supervisorOwnerId: options.ownerId
          }),
          homeId: this.homeId,
          ownerId: options.ownerId,
          packageGenerationId: options.packageCompatibility.package_generation_id
        });
        const operationAt = authority.observed_at;
        const state = readState(this.db, this.homeId);
        if (!state) {
          throw new RuntimeSchemaError(
            "EE_SCHEMA_METADATA_INVALID",
            "Runtime schema metadata must be initialized before migration acquisition."
          );
        }
        assertStateContract(state, this.homeId);
        if (!state.current_schema_version) {
          throw new RuntimeSchemaError(
            "EE_SCHEMA_METADATA_INVALID",
            "Runtime schema metadata has no current schema version."
          );
        }
        assertRuntimePhysicalSchemaVersion(this.db, state.current_schema_version);
        assertKnownSchemaVersion(state.current_schema_version);
        assertKnownSchemaVersion(options.packageCompatibility.target_schema_version);
        if (
          state.current_schema_version === options.packageCompatibility.target_schema_version ||
          !options.packageCompatibility.supported_migration_from_versions.includes(
            state.current_schema_version
          )
        ) {
          throw new RuntimeSchemaError(
            "EE_SCHEMA_INCOMPATIBLE",
            `Package generation ${options.packageCompatibility.package_generation_id} does not declare a migration from ${state.current_schema_version}.`
          );
        }

        if (ACTIVE_STATUS_SET.has(state.migration_status)) {
          const isExpired = !state.migration_expires_at ||
            toEpochMs(state.migration_expires_at) <= toEpochMs(operationAt);
          if (!isExpired) {
            throw new RuntimeSchemaError(
              "EE_MIGRATION_AUTHORITY_STALE",
              "Another fresh migration owner already holds the canonical home."
            );
          }
          if (state.migration_id && state.migration_id !== options.migrationId) {
            throw new RuntimeSchemaError(
              "EE_MIGRATION_TRANSITION_INVALID",
              "An expired migration can only be recovered through its persisted migration id."
            );
          }
        } else if (state.migration_status === "failed") {
          if (state.migration_id && state.migration_id !== options.migrationId) {
            throw new RuntimeSchemaError(
              "EE_MIGRATION_TRANSITION_INVALID",
              "A failed migration must be recovered through its persisted migration id."
            );
          }
        } else if (state.migration_status !== "ready" && state.migration_status !== "idle") {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_TRANSITION_INVALID",
            `Migration cannot be acquired from state ${state.migration_status}.`
          );
        }

        const nextFence = state.migration_fencing_token + 1;
        const expiresAt = new Date(toEpochMs(operationAt) + options.leaseDurationMs).toISOString();
        const result = this.db.prepare(
          `UPDATE migration_state
           SET target_schema_version = ?,
               migration_id = ?,
               migration_owner_id = ?,
               migration_supervisor_lease_epoch = ?,
               migration_fencing_token = ?,
               migration_package_generation_id = ?,
               migration_started_at = ?,
               migration_heartbeat_at = ?,
               migration_expires_at = ?,
               migration_status = 'preparing',
               last_error_code = NULL
           WHERE home_id = ? AND migration_fencing_token = ?`
        ).run(
          options.packageCompatibility.target_schema_version,
          options.migrationId,
          options.ownerId,
          authority.supervisor_lease_epoch,
          nextFence,
          options.packageCompatibility.package_generation_id,
          operationAt,
          operationAt,
          expiresAt,
          this.homeId,
          state.migration_fencing_token
        );
        if (changesCount(result) !== 1) {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_AUTHORITY_STALE",
            "Migration acquisition lost its expected fencing-token CAS."
          );
        }
        return rowToLease(readState(this.db, this.homeId)!);
      }
    });
  }

  async renew(options: {
    lease: RuntimeMigrationLease;
    authorityProvider: SupervisorMigrationAuthorityProvider;
    leaseDurationMs: number;
  }): Promise<RuntimeMigrationLease> {
    if (!Number.isSafeInteger(options.leaseDurationMs) || options.leaseDurationMs <= 0) {
      throw new RuntimeSchemaError(
        "EE_MIGRATION_TRANSITION_INVALID",
        "Migration lease duration must be a positive bounded integer."
      );
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "migration",
      operation: () => {
        const authority = assertAvailableSupervisorAuthority({
          evidence: options.authorityProvider.getFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            packageGenerationId: options.lease.migration_package_generation_id,
            supervisorOwnerId: options.lease.migration_owner_id,
            expectedSupervisorLeaseEpoch: options.lease.migration_supervisor_lease_epoch
          }),
          homeId: this.homeId,
          ownerId: options.lease.migration_owner_id,
          packageGenerationId: options.lease.migration_package_generation_id
        });
        if (authority.supervisor_lease_epoch !== options.lease.migration_supervisor_lease_epoch) {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_AUTHORITY_STALE",
            "Migration renewal observed a different supervisor lease epoch."
          );
        }
        const operationAt = authority.observed_at;
        const state = readState(this.db, this.homeId);
        if (!state) {
          throw new RuntimeSchemaError("EE_SCHEMA_METADATA_INVALID", "Migration state is missing.");
        }
        if (!state.current_schema_version) {
          throw new RuntimeSchemaError(
            "EE_SCHEMA_METADATA_INVALID",
            "Migration state has no current physical schema version."
          );
        }
        assertRuntimePhysicalSchemaVersion(this.db, state.current_schema_version);
        assertCurrentLease({ state, lease: options.lease, now: operationAt });
        const expiresAt = new Date(toEpochMs(operationAt) + options.leaseDurationMs).toISOString();
        const result = this.db.prepare(
          `UPDATE migration_state
           SET migration_heartbeat_at = ?, migration_expires_at = ?
           WHERE home_id = ?
             AND migration_owner_id = ?
             AND migration_supervisor_lease_epoch = ?
             AND migration_fencing_token = ?`
        ).run(
          operationAt,
          expiresAt,
          this.homeId,
          options.lease.migration_owner_id,
          options.lease.migration_supervisor_lease_epoch,
          options.lease.migration_fencing_token
        );
        if (changesCount(result) !== 1) {
          throw new RuntimeSchemaError("EE_MIGRATION_AUTHORITY_STALE", "Migration renewal CAS failed.");
        }
        return rowToLease(readState(this.db, this.homeId)!);
      }
    });
  }

  async executeNextStep(options: {
    lease: RuntimeMigrationLease;
    registry: RuntimeMigrationRegistry;
    authorityProvider: SupervisorMigrationAuthorityProvider;
  }): Promise<RuntimeMigrationCheckpoint> {
    return runRuntimeImmediateTransaction(this.db, {
      category: "migration",
      operation: () => {
        const authority = assertAvailableSupervisorAuthority({
          evidence: options.authorityProvider.getFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            packageGenerationId: options.lease.migration_package_generation_id,
            supervisorOwnerId: options.lease.migration_owner_id,
            expectedSupervisorLeaseEpoch: options.lease.migration_supervisor_lease_epoch
          }),
          homeId: this.homeId,
          ownerId: options.lease.migration_owner_id,
          packageGenerationId: options.lease.migration_package_generation_id
        });
        if (authority.supervisor_lease_epoch !== options.lease.migration_supervisor_lease_epoch) {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_AUTHORITY_STALE",
            "Migration step observed a different supervisor lease epoch."
          );
        }
        const operationAt = authority.observed_at;
        const state = readState(this.db, this.homeId);
        if (!state || !state.current_schema_version || !state.target_schema_version) {
          throw new RuntimeSchemaError("EE_SCHEMA_METADATA_INVALID", "Migration state is incomplete.");
        }
        assertCurrentLease({ state, lease: options.lease, now: operationAt });
        if (state.migration_status !== "preparing" && state.migration_status !== "migrating") {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_TRANSITION_INVALID",
            `A migration step cannot run from ${state.migration_status}.`
          );
        }
        const step = options.registry.nextStep(
          options.lease.migration_id,
          state.current_schema_version,
          state.target_schema_version
        );
        assertRuntimePhysicalSchemaVersion(this.db, state.current_schema_version);
        const sourceVerificationResult = step.verify_source(this.db) as unknown;
        assertSynchronousCallbackResult(
          sourceVerificationResult,
          `Migration source verifier ${step.step_id}`
        );
        const applyResult = step.apply(this.db) as unknown;
        assertSynchronousCallbackResult(applyResult, `Migration step ${step.step_id}`);
        const targetVerificationResult = step.verify_target(this.db) as unknown;
        assertSynchronousCallbackResult(
          targetVerificationResult,
          `Migration target verifier ${step.step_id}`
        );
        setRuntimePhysicalSchemaVersion(this.db, step.to_schema_version);
        assertRuntimePhysicalSchemaVersion(this.db, step.to_schema_version);
        const nextStatus = step.to_schema_version === state.target_schema_version
          ? "verifying"
          : "migrating";
        const result = this.db.prepare(
          `UPDATE migration_state
           SET current_schema_version = ?,
               migration_status = ?,
               migration_heartbeat_at = ?
           WHERE home_id = ?
             AND migration_owner_id = ?
             AND migration_supervisor_lease_epoch = ?
             AND migration_fencing_token = ?
             AND current_schema_version = ?`
        ).run(
          step.to_schema_version,
          nextStatus,
          operationAt,
          this.homeId,
          options.lease.migration_owner_id,
          options.lease.migration_supervisor_lease_epoch,
          options.lease.migration_fencing_token,
          state.current_schema_version
        );
        if (changesCount(result) !== 1) {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_AUTHORITY_STALE",
            "Migration step lost its owner/fence/schema checkpoint CAS."
          );
        }
        return {
          migration_id: options.lease.migration_id,
          step_id: step.step_id,
          migration_fencing_token: options.lease.migration_fencing_token,
          migration_revision: options.lease.migration_revision,
          current_schema_version: step.to_schema_version,
          target_schema_version: state.target_schema_version,
          migration_status: nextStatus
        };
      }
    });
  }

  async complete(options: {
    lease: RuntimeMigrationLease;
    authorityProvider: SupervisorMigrationAuthorityProvider;
  }): Promise<RuntimeMigrationStateRecord> {
    return runRuntimeImmediateTransaction(this.db, {
      category: "migration",
      operation: () => {
        const authority = assertAvailableSupervisorAuthority({
          evidence: options.authorityProvider.getFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            packageGenerationId: options.lease.migration_package_generation_id,
            supervisorOwnerId: options.lease.migration_owner_id,
            expectedSupervisorLeaseEpoch: options.lease.migration_supervisor_lease_epoch
          }),
          homeId: this.homeId,
          ownerId: options.lease.migration_owner_id,
          packageGenerationId: options.lease.migration_package_generation_id
        });
        if (authority.supervisor_lease_epoch !== options.lease.migration_supervisor_lease_epoch) {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_AUTHORITY_STALE",
            "Migration completion observed a different supervisor lease epoch."
          );
        }
        const state = readState(this.db, this.homeId);
        if (!state || !state.current_schema_version || !state.target_schema_version) {
          throw new RuntimeSchemaError("EE_SCHEMA_METADATA_INVALID", "Migration state is incomplete.");
        }
        assertCurrentLease({ state, lease: options.lease, now: authority.observed_at });
        assertRuntimePhysicalSchemaVersion(this.db, state.current_schema_version);
        if (
          state.migration_status !== "verifying" ||
          state.current_schema_version !== state.target_schema_version
        ) {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_TRANSITION_INVALID",
            "Migration completion requires a verified target schema checkpoint."
          );
        }
        const result = this.db.prepare(
          `UPDATE migration_state
           SET migration_owner_id = NULL,
               migration_supervisor_lease_epoch = NULL,
               migration_package_generation_id = NULL,
               migration_started_at = NULL,
               migration_heartbeat_at = NULL,
               migration_expires_at = NULL,
               migration_status = 'ready',
               last_completed_migration_id = migration_id,
               last_error_code = NULL
           WHERE home_id = ?
             AND migration_owner_id = ?
             AND migration_supervisor_lease_epoch = ?
             AND migration_fencing_token = ?`
        ).run(
          this.homeId,
          options.lease.migration_owner_id,
          options.lease.migration_supervisor_lease_epoch,
          options.lease.migration_fencing_token
        );
        if (changesCount(result) !== 1) {
          throw new RuntimeSchemaError("EE_MIGRATION_AUTHORITY_STALE", "Migration completion CAS failed.");
        }
        return readState(this.db, this.homeId)!;
      }
    });
  }

  async fail(options: {
    lease: RuntimeMigrationLease;
    authorityProvider: SupervisorMigrationAuthorityProvider;
    errorCode: string;
  }): Promise<RuntimeMigrationStateRecord> {
    return runRuntimeImmediateTransaction(this.db, {
      category: "migration",
      operation: () => {
        const authority = assertAvailableSupervisorAuthority({
          evidence: options.authorityProvider.getFreshSupervisorAuthorityInTransaction({
            db: this.db,
            homeId: this.homeId,
            packageGenerationId: options.lease.migration_package_generation_id,
            supervisorOwnerId: options.lease.migration_owner_id,
            expectedSupervisorLeaseEpoch: options.lease.migration_supervisor_lease_epoch
          }),
          homeId: this.homeId,
          ownerId: options.lease.migration_owner_id,
          packageGenerationId: options.lease.migration_package_generation_id
        });
        if (authority.supervisor_lease_epoch !== options.lease.migration_supervisor_lease_epoch) {
          throw new RuntimeSchemaError(
            "EE_MIGRATION_AUTHORITY_STALE",
            "Migration failure transition observed a different supervisor lease epoch."
          );
        }
        const state = readState(this.db, this.homeId);
        if (!state) {
          throw new RuntimeSchemaError("EE_SCHEMA_METADATA_INVALID", "Migration state is missing.");
        }
        assertCurrentLease({ state, lease: options.lease, now: authority.observed_at });
        if (!state.current_schema_version) {
          throw new RuntimeSchemaError(
            "EE_SCHEMA_METADATA_INVALID",
            "Migration state has no current physical schema version."
          );
        }
        assertRuntimePhysicalSchemaVersion(this.db, state.current_schema_version);
        const result = this.db.prepare(
          `UPDATE migration_state
           SET migration_owner_id = NULL,
               migration_supervisor_lease_epoch = NULL,
               migration_package_generation_id = NULL,
               migration_started_at = NULL,
               migration_heartbeat_at = NULL,
               migration_expires_at = NULL,
               migration_status = 'failed',
               last_error_code = ?
           WHERE home_id = ?
             AND migration_owner_id = ?
             AND migration_supervisor_lease_epoch = ?
             AND migration_fencing_token = ?`
        ).run(
          options.errorCode,
          this.homeId,
          options.lease.migration_owner_id,
          options.lease.migration_supervisor_lease_epoch,
          options.lease.migration_fencing_token
        );
        if (changesCount(result) !== 1) {
          throw new RuntimeSchemaError("EE_MIGRATION_AUTHORITY_STALE", "Migration failure CAS failed.");
        }
        return readState(this.db, this.homeId)!;
      }
    });
  }
}

export const UNAVAILABLE_SUPERVISOR_MIGRATION_AUTHORITY_PROVIDER:
SupervisorMigrationAuthorityProvider = Object.freeze({
  getFreshSupervisorAuthorityInTransaction(): SupervisorMigrationAuthorityEvidence {
    return {
      available: false,
      fresh: false,
      authority_contract_version: "runtime-supervisor-authority-v1",
      reason: "s3_not_connected"
    };
  }
});

export class RuntimeMigrationCoordinator {
  constructor(
    private readonly repository: RuntimeMigrationAuthorityRepository,
    private readonly authorityProvider: SupervisorMigrationAuthorityProvider =
      UNAVAILABLE_SUPERVISOR_MIGRATION_AUTHORITY_PROVIDER
  ) {}

  async acquire(options: {
    ownerId: string;
    migrationId: string;
    packageCompatibility: RuntimeSchemaPackageCompatibility;
    leaseDurationMs: number;
  }): Promise<RuntimeMigrationLease> {
    return this.repository.acquire({
      ownerId: options.ownerId,
      migrationId: options.migrationId,
      packageCompatibility: options.packageCompatibility,
      authorityProvider: this.authorityProvider,
      leaseDurationMs: options.leaseDurationMs
    });
  }

  renew(options: {
    lease: RuntimeMigrationLease;
    leaseDurationMs: number;
  }): Promise<RuntimeMigrationLease> {
    return this.repository.renew({
      ...options,
      authorityProvider: this.authorityProvider
    });
  }

  executeNextStep(options: {
    lease: RuntimeMigrationLease;
    registry: RuntimeMigrationRegistry;
  }): Promise<RuntimeMigrationCheckpoint> {
    return this.repository.executeNextStep({
      ...options,
      authorityProvider: this.authorityProvider
    });
  }

  complete(options: {
    lease: RuntimeMigrationLease;
  }): Promise<RuntimeMigrationStateRecord> {
    return this.repository.complete({
      ...options,
      authorityProvider: this.authorityProvider
    });
  }

  fail(options: {
    lease: RuntimeMigrationLease;
    errorCode: string;
  }): Promise<RuntimeMigrationStateRecord> {
    return this.repository.fail({
      ...options,
      authorityProvider: this.authorityProvider
    });
  }
}
