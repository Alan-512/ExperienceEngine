import { randomUUID } from "node:crypto";
import { relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  consumeGatewayRuntimeIdentityEnvelope
} from "../identity/binding.js";
import { RuntimeIdentityError } from "../identity/errors.js";
import type {
  GatewayRuntimeIdentityEnvelope,
  RuntimeHomeIdentity,
  RuntimeParticipantIdentity
} from "../identity/types.js";
import {
  PACKAGE_ACTIVATION_TIMING_POLICY,
  SUPERVISOR_RUNTIME_POLICY,
  type LaunchAuthorizationRole,
  type WorkerMode
} from "../process/constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import {
  readSupervisorLaunchState
} from "../process/database.js";
import {
  RuntimeSupervisorAuthorityRepository
} from "../process/supervisor-authority.js";
import type {
  ExpectedSupervisorAuthority,
  RuntimeProcessAuthorityClock,
  SupervisorLeaseRow,
  SupervisorLaunchAttemptRow,
  SupervisorLaunchStateRow,
  WorkerLeaseRow
} from "../process/types.js";
import {
  configureRuntimeSqlitePolicy
} from "../schema/sqlite-policy.js";
import {
  readRuntimeMigrationState
} from "../schema/migration-authority.js";
import {
  readPackageActivationAuthority,
  readLaunchAttemptById,
  readLaunchAuthorizationById,
  readWorkerLeaseByHome
} from "../activation/database.js";
import { RuntimeActivationError } from "../activation/errors.js";
import {
  createOperatingSystemProcessStartTokenResolver
} from "../activation/process-identity.js";
import type {
  ProcessStartTokenResolver
} from "../activation/supervisor-launcher.js";
import {
  PACKAGE_LOCAL_SUPERVISOR_SHUTDOWN_MESSAGE
} from "../activation/supervisor-launcher.js";
import {
  PACKAGE_LOCAL_WORKER_HANDSHAKE_ACK_MESSAGE_TYPE,
  PACKAGE_LOCAL_WORKER_HANDSHAKE_CHALLENGE_MESSAGE_TYPE,
  PACKAGE_LOCAL_WORKER_SHUTDOWN_MESSAGE,
  RuntimePackageWorkerLauncher,
  type PackageLocalWorkerHandshakeAcknowledgementMessage,
  type SpawnedWorkerProcess,
  type WorkerProcessSpawner
} from "../activation/worker-launcher.js";
import {
  RuntimePackageActivationTransitionRepository
} from "../activation/transitions.js";
import type {
  ActivationWorkerAcknowledgement,
  VerifiedPackageClosureEvidence
} from "../activation/types.js";
import {
  RuntimeSupervisorActivationHandshakeCoordinator
} from "../activation/orchestrator.js";
import {
  assertVerifiedPackageClosure
} from "../activation/repository.js";
import {
  assertRuntimeClosureManifest
} from "./closure-manifest.js";
import { canonicalJson } from "./package-generation.js";

export const PACKAGE_LOCAL_SUPERVISOR_ENV = Object.freeze({
  packageRoot: "EXPERIENCE_ENGINE_PACKAGE_ROOT",
  identityEnvelope: "EXPERIENCE_ENGINE_RUNTIME_IDENTITY_ENVELOPE",
  packageClosure: "EXPERIENCE_ENGINE_VERIFIED_PACKAGE_CLOSURE",
  launchAttemptId: "EXPERIENCE_ENGINE_LAUNCH_ATTEMPT_ID",
  launchAuthorizationId: "EXPERIENCE_ENGINE_LAUNCH_AUTHORIZATION_ID"
} as const);

export type PackageLocalSupervisorLaunchContext = {
  packageRoot: string;
  identityEnvelope: GatewayRuntimeIdentityEnvelope;
  packageClosure: VerifiedPackageClosureEvidence;
  launchAttemptId: string;
  launchAuthorizationId: string;
};

const requiredEnvironmentValue = (
  env: NodeJS.ProcessEnv,
  name: string
): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      `Package-local supervisor requires ${name}.`
    );
  }
  return value;
};

const parseJsonEnvironmentValue = <T>(
  env: NodeJS.ProcessEnv,
  name: string
): T => {
  const serialized = requiredEnvironmentValue(env, name);
  try {
    return JSON.parse(serialized) as T;
  } catch (error) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      `Package-local supervisor could not parse ${name}: ${
        error instanceof Error ? error.message : String(error)
      }.`
    );
  }
};

export const serializePackageLocalSupervisorEnvironment = (
  context: PackageLocalSupervisorLaunchContext
): NodeJS.ProcessEnv => ({
  [PACKAGE_LOCAL_SUPERVISOR_ENV.packageRoot]: context.packageRoot,
  [PACKAGE_LOCAL_SUPERVISOR_ENV.identityEnvelope]: JSON.stringify(
    context.identityEnvelope
  ),
  [PACKAGE_LOCAL_SUPERVISOR_ENV.packageClosure]: JSON.stringify(
    context.packageClosure
  ),
  [PACKAGE_LOCAL_SUPERVISOR_ENV.launchAttemptId]: context.launchAttemptId,
  [PACKAGE_LOCAL_SUPERVISOR_ENV.launchAuthorizationId]:
    context.launchAuthorizationId
});

export const parsePackageLocalSupervisorEnvironment = (
  env: NodeJS.ProcessEnv = process.env
): PackageLocalSupervisorLaunchContext => ({
  packageRoot: resolve(requiredEnvironmentValue(
    env,
    PACKAGE_LOCAL_SUPERVISOR_ENV.packageRoot
  )),
  identityEnvelope: parseJsonEnvironmentValue<GatewayRuntimeIdentityEnvelope>(
    env,
    PACKAGE_LOCAL_SUPERVISOR_ENV.identityEnvelope
  ),
  packageClosure: parseJsonEnvironmentValue<VerifiedPackageClosureEvidence>(
    env,
    PACKAGE_LOCAL_SUPERVISOR_ENV.packageClosure
  ),
  launchAttemptId: requiredEnvironmentValue(
    env,
    PACKAGE_LOCAL_SUPERVISOR_ENV.launchAttemptId
  ),
  launchAuthorizationId: requiredEnvironmentValue(
    env,
    PACKAGE_LOCAL_SUPERVISOR_ENV.launchAuthorizationId
  )
});

const resolveContextDatabasePath = (
  envelope: GatewayRuntimeIdentityEnvelope
): string => {
  const home = resolve(envelope.canonical_home_resolution.resolved_home);
  const databasePath = resolve(
    home,
    envelope.canonical_home_resolution.database_relative_path
  );
  const relativePath = relative(home, databasePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\")
  ) {
    throw new RuntimeIdentityError(
      "EE_HOME_IDENTITY_MISMATCH",
      "Package-local supervisor database path escapes the canonical runtime home."
    );
  }
  return databasePath;
};

const readCommittedHomeIdentity = (
  db: DatabaseSync,
  homeId: string
): RuntimeHomeIdentity => {
  const row = db.prepare(
    `SELECT
       home_id,
       home_layout_version,
       path_normalization_version,
       normalized_path_fingerprint,
       home_path_fingerprint_key_id,
       database_relative_path,
       created_at
     FROM runtime_control_meta
     WHERE home_id = ?
     LIMIT 1`
  ).get(homeId) as RuntimeHomeIdentity | undefined;
  if (!row) {
    throw new RuntimeIdentityError(
      "EE_HOME_IDENTITY_MISMATCH",
      `Package-local supervisor could not find canonical home ${homeId}.`
    );
  }
  return row;
};

const expectedSupervisor = (
  lease: SupervisorLeaseRow
): ExpectedSupervisorAuthority => ({
  owner_id: lease.owner_id,
  owner_process_id: lease.owner_process_id,
  owner_process_start_token: lease.owner_process_start_token,
  lease_epoch: lease.lease_epoch,
  lease_state_revision: lease.lease_state_revision
});

const assertLaunchContext = (options: {
  context: PackageLocalSupervisorLaunchContext;
  db: DatabaseSync;
  processId: number;
  processStartToken: string;
  observedAt: string;
  verifyClosure: (packageRoot: string) => {
    closureManifestDigest?: string;
  };
}): void => {
  const { context } = options;
  assertVerifiedPackageClosure(context.packageClosure, options.observedAt);
  if (
    canonicalJson(context.packageClosure.package_identity) !==
      canonicalJson(context.identityEnvelope.package)
  ) {
    throw new RuntimeIdentityError(
      "EE_PACKAGE_GENERATION_MISMATCH",
      "Supervisor identity envelope and verified package closure describe different package generations."
    );
  }
  const closure = options.verifyClosure(context.packageRoot);
  if (
    closure.closureManifestDigest !==
      context.packageClosure.closure_manifest_digest
  ) {
    throw new RuntimeIdentityError(
      "EE_RUNTIME_CLOSURE_INVALID",
      "Supervisor package closure digest does not match the verified launch evidence."
    );
  }
  const home = readCommittedHomeIdentity(
    options.db,
    context.identityEnvelope.home.home_id
  );
  const participant: RuntimeParticipantIdentity = {
    participant: "supervisor",
    home_id: home.home_id,
    home_layout_version: home.home_layout_version,
    path_normalization_version: home.path_normalization_version,
    normalized_path_fingerprint: home.normalized_path_fingerprint,
    database_relative_path: home.database_relative_path,
    package_generation_id:
      context.packageClosure.package_identity.package_generation_id,
    artifact_integrity:
      context.packageClosure.package_identity.artifact_integrity
  };
  const identity = consumeGatewayRuntimeIdentityEnvelope(
    context.identityEnvelope,
    participant
  );
  if (!identity.ok) {
    throw new RuntimeIdentityError(
      identity.code,
      `Supervisor launch identity mismatch for ${identity.field}.`
    );
  }
  if (!Number.isSafeInteger(options.processId) || options.processId <= 0) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Package-local supervisor requires a positive process id."
    );
  }
  if (!options.processStartToken) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Package-local supervisor requires an OS-derived process-start identity."
    );
  }
};

const isTerminalAttempt = (attempt: SupervisorLaunchAttemptRow): boolean =>
  attempt.attempt_state === "spawn_failed" ||
  attempt.attempt_state === "timed_out" ||
  attempt.attempt_state === "cancelled" ||
  attempt.attempt_state === "lease_expired" ||
  attempt.attempt_state === "terminated";

export class RuntimePackageLocalSupervisorLeaseSession {
  private lease: SupervisorLeaseRow | undefined;
  private launchRevision: number | undefined;

  constructor(private readonly options: {
    db: DatabaseSync;
    context: PackageLocalSupervisorLaunchContext;
    processId?: number;
    processStartTokenResolver?: ProcessStartTokenResolver;
    clock?: RuntimeProcessAuthorityClock;
    idFactory?: () => string;
    sleep?: (milliseconds: number) => Promise<void>;
    wallClockNow?: () => number;
    observedAt?: () => string;
    verifyClosure?: (packageRoot: string) => {
      closureManifestDigest?: string;
    };
  }) {}

  private get processId(): number {
    return this.options.processId ?? process.pid;
  }

  private get processStartToken(): string {
    return (
      this.options.processStartTokenResolver ??
      createOperatingSystemProcessStartTokenResolver()
    )(this.processId);
  }

  private async waitForBoundAttempt(): Promise<{
    attempt: SupervisorLaunchAttemptRow;
    launchState: SupervisorLaunchStateRow;
  }> {
    const sleep = this.options.sleep ?? ((milliseconds: number) =>
      new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
    const wallClockNow = this.options.wallClockNow ?? Date.now;
    const deadline = wallClockNow() +
      PACKAGE_ACTIVATION_TIMING_POLICY.launch_attempt_timeout_ms;
    while (true) {
      const attempt = readLaunchAttemptById(
        this.options.db,
        this.options.context.identityEnvelope.home.home_id,
        this.options.context.launchAttemptId
      );
      const launchState = readSupervisorLaunchState(
        this.options.db,
        this.options.context.identityEnvelope.home.home_id
      );
      if (!attempt || !launchState) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          "Package-local supervisor launch authority is missing."
        );
      }
      if (
        attempt.launch_authorization_id !==
          this.options.context.launchAuthorizationId ||
        attempt.package_generation_id !==
          this.options.context.packageClosure.package_identity.package_generation_id ||
        launchState.current_launch_attempt_id !== attempt.launch_attempt_id
      ) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          "Package-local supervisor launch authority does not match the provided immutable launch context."
        );
      }
      if (attempt.attempt_state === "reserved_bound") {
        return { attempt, launchState };
      }
      if (isTerminalAttempt(attempt)) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          `Package-local supervisor launch attempt is terminal: ${attempt.attempt_state}.`
        );
      }
      if (wallClockNow() >= deadline) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          "Package-local supervisor timed out waiting for child identity binding."
        );
      }
      await sleep(25);
    }
  }

  async acquireAndActivate(): Promise<SupervisorLeaseRow> {
    const processStartToken = this.processStartToken;
    assertLaunchContext({
      context: this.options.context,
      db: this.options.db,
      processId: this.processId,
      processStartToken,
      observedAt: this.options.observedAt?.() ?? new Date().toISOString(),
      verifyClosure: this.options.verifyClosure ?? assertRuntimeClosureManifest
    });
    const { attempt, launchState } = await this.waitForBoundAttempt();
    if (
      attempt.child_process_id !== this.processId ||
      attempt.child_process_start_token !== processStartToken
    ) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Package-local supervisor process identity does not match the gateway-bound child identity."
      );
    }
    const authorization = readLaunchAuthorizationById(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id,
      attempt.launch_authorization_id
    );
    if (!authorization) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Package-local supervisor launch authorization is missing."
      );
    }
    const repository = new RuntimeSupervisorAuthorityRepository(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id,
      this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK
    );
    const acquired = repository.acquireFromBoundAttempt({
      leaseKey: (this.options.idFactory ?? randomUUID)(),
      ownerId: (this.options.idFactory ?? randomUUID)(),
      ownerProcessId: this.processId,
      ownerProcessStartToken: processStartToken,
      packageIdentity: this.options.context.packageClosure.package_identity,
      attemptId: attempt.launch_attempt_id,
      expectedAttemptStateRevision: attempt.attempt_state_revision,
      expectedLaunchRevision: launchState.launch_revision,
      expectedAuthorizationRevision: authorization.authorization_revision,
      expectedAuthorizationStateRevision:
        authorization.authorization_state_revision
    });
    const launchAfterAcquisition = readSupervisorLaunchState(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id
    );
    if (!launchAfterAcquisition) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Supervisor launch state disappeared after lease acquisition."
      );
    }
    this.launchRevision = launchAfterAcquisition.launch_revision;
    this.lease = repository.renew({
      expected: expectedSupervisor(acquired),
      expectedLaunchRevision: this.launchRevision,
      nextState: "active"
    });
    return this.lease;
  }

  heartbeat(nextState: "active" | "draining" = "active"): SupervisorLeaseRow {
    if (!this.lease || this.launchRevision === undefined) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Supervisor heartbeat requires an acquired lease."
      );
    }
    const repository = new RuntimeSupervisorAuthorityRepository(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id,
      this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK
    );
    this.lease = repository.renew({
      expected: expectedSupervisor(this.lease),
      expectedLaunchRevision: this.launchRevision,
      nextState
    });
    return this.lease;
  }

  requestDrain(): SupervisorLeaseRow {
    return this.heartbeat("draining");
  }

  currentWorker(): WorkerLeaseRow | undefined {
    return readWorkerLeaseByHome(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id
    );
  }

  currentLease(): SupervisorLeaseRow {
    if (!this.lease) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Supervisor lease has not been acquired."
      );
    }
    return this.lease;
  }

  enterInitialMigrationIfNeeded(): void {
    const activation = readPackageActivationAuthority(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id
    );
    const lease = this.currentLease();
    if (
      !activation ||
      activation.activation_state !== "preparing" ||
      activation.pending_transition_kind !== "initial" ||
      activation.active_package_generation_id !== null ||
      activation.pending_package_generation_id !==
        this.options.context.packageClosure.package_identity.package_generation_id
    ) {
      return;
    }
    new RuntimePackageActivationTransitionRepository(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id,
      this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK
    ).enterMigrating({
      expectedActivationRevision: activation.activation_revision,
      writer: {
        kind: "supervisor",
        supervisor_owner_id: lease.owner_id,
        supervisor_lease_epoch: lease.lease_epoch,
        supervisor_lease_state_revision: lease.lease_state_revision
      }
    });
  }

  shouldStopForDeliberateDrain(): boolean {
    const activation = readPackageActivationAuthority(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id
    );
    const worker = this.currentWorker();
    return Boolean(
      activation &&
      activation.activation_state === "active" &&
      worker &&
      worker.state === "draining" &&
      worker.shutdown_requested_at
    );
  }

  release(): SupervisorLeaseRow {
    if (!this.lease || this.launchRevision === undefined) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Supervisor release requires an acquired lease."
      );
    }
    const attempt = readLaunchAttemptById(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id,
      this.lease.launch_attempt_id
    );
    if (!attempt) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Supervisor release requires its current launch attempt."
      );
    }
    const repository = new RuntimeSupervisorAuthorityRepository(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id,
      this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK
    );
    this.lease = repository.gracefulRelease({
      expected: expectedSupervisor(this.lease),
      expectedAttemptStateRevision: attempt.attempt_state_revision,
      expectedLaunchRevision: this.launchRevision
    });
    return this.lease;
  }
}

export const runPackageLocalSupervisorProcess = async (options: {
  env?: NodeJS.ProcessEnv;
  onReady?: (lease: SupervisorLeaseRow) => void;
  onFailure?: (error: unknown) => void;
  workerSpawner?: WorkerProcessSpawner;
} = {}): Promise<void> => {
  const context = parsePackageLocalSupervisorEnvironment(options.env);
  const databasePath = resolveContextDatabasePath(context.identityEnvelope);
  const db = new DatabaseSync(databasePath);
  configureRuntimeSqlitePolicy(db, {
    accessMode: "read_write",
    role: "supervisor"
  });
  const session = new RuntimePackageLocalSupervisorLeaseSession({ db, context });
  let workerChild: SpawnedWorkerProcess | null = null;
  let workerShutdownRequested = false;
  const workerAcknowledgements = new Map<
    string,
    ActivationWorkerAcknowledgement
  >();
  let handshakeCoordinator:
    RuntimeSupervisorActivationHandshakeCoordinator | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let stopping = false;
  let resolveStop: (() => void) | undefined;
  const stopped = new Promise<void>((resolvePromise) => {
    resolveStop = resolvePromise;
  });
  const signalWorker = (): boolean => {
    if (!workerChild) {
      return false;
    }
    if (workerShutdownRequested) {
      return true;
    }
    try {
      if (workerChild.connected && workerChild.send) {
        workerChild.send(PACKAGE_LOCAL_WORKER_SHUTDOWN_MESSAGE);
        workerShutdownRequested = true;
        return true;
      }
      const signalled = workerChild.kill("SIGTERM");
      workerShutdownRequested = signalled;
      return signalled;
    } catch {
      return false;
    }
  };
  const requestStop = (): void => {
    if (!stopping) {
      stopping = true;
      signalWorker();
      resolveStop?.();
    }
  };
  const requestStopFromIpc = (message: unknown): void => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      (message as { type?: unknown }).type ===
        PACKAGE_LOCAL_SUPERVISOR_SHUTDOWN_MESSAGE.type
    ) {
      requestStop();
    }
  };
  process.once("SIGTERM", requestStop);
  process.once("SIGINT", requestStop);
  process.on("message", requestStopFromIpc);
  try {
    const lease = await session.acquireAndActivate();
    options.onReady?.(lease);
    handshakeCoordinator = new RuntimeSupervisorActivationHandshakeCoordinator({
      db,
      homeId: context.identityEnvelope.home.home_id,
      currentSupervisor: () => session.currentLease(),
      sendWorkerChallenge: (activationId) => {
        if (!workerChild?.connected || !workerChild.send) {
          return false;
        }
        workerChild.send({
          type: PACKAGE_LOCAL_WORKER_HANDSHAKE_CHALLENGE_MESSAGE_TYPE,
          activation_id: activationId
        });
        return true;
      },
      takeWorkerAcknowledgement: (activationId) => {
        const acknowledgement = workerAcknowledgements.get(activationId);
        if (acknowledgement) {
          workerAcknowledgements.delete(activationId);
        }
        return acknowledgement;
      }
    });
    const workerPlan = (): {
      workerMode: WorkerMode;
      transitionRole: LaunchAuthorizationRole;
      schemaVersion: string;
    } | null => {
      const activation = readPackageActivationAuthority(
        db,
        context.identityEnvelope.home.home_id
      );
      const migration = readRuntimeMigrationState(
        db,
        context.identityEnvelope.home.home_id
      );
      const supervisor = session.currentLease();
      const worker = session.currentWorker();
      if (
        !activation ||
        !migration ||
        migration.migration_status !== "ready" ||
        !migration.current_schema_version ||
        migration.current_schema_version !== migration.target_schema_version ||
        (
          worker &&
          worker.state !== "stopped" &&
          Date.parse(worker.expires_at) > Date.now()
        )
      ) {
        return null;
      }
      if (
        ["migrating", "preactivation_verifying"].includes(
          activation.activation_state
        ) &&
        activation.pending_package_generation_id ===
          context.packageClosure.package_identity.package_generation_id
      ) {
        return {
          workerMode: "activation_only",
          transitionRole: supervisor.launch_authorization_role,
          schemaVersion: migration.current_schema_version
        };
      }
      if (
        ["production_activating", "active"].includes(
          activation.activation_state
        ) &&
        activation.active_package_generation_id ===
          context.packageClosure.package_identity.package_generation_id &&
        activation.pending_package_generation_id === null
      ) {
        return {
          workerMode: "production",
          transitionRole: supervisor.launch_authorization_role,
          schemaVersion: migration.current_schema_version
        };
      }
      return null;
    };
    const ensureWorker = (): void => {
      session.enterInitialMigrationIfNeeded();
      if (workerChild) {
        return;
      }
      const plan = workerPlan();
      if (!plan) {
        return;
      }
      const supervisor = session.currentLease();
      const workerOwnerId = `worker_${randomUUID()}`;
      const launched = new RuntimePackageWorkerLauncher(
        context.packageRoot,
        options.workerSpawner
      ).launch({
        packageIdentity: context.packageClosure.package_identity,
        runtimeIdentityEnvelope: context.identityEnvelope,
        packageClosure: context.packageClosure,
        workerOwnerId,
        expectedSupervisor: {
          owner_id: supervisor.owner_id,
          owner_process_id: supervisor.owner_process_id,
          owner_process_start_token: supervisor.owner_process_start_token,
          lease_epoch: supervisor.lease_epoch
        },
        workerMode: plan.workerMode,
        transitionRole: plan.transitionRole,
        schemaVersion: plan.schemaVersion
      });
      workerChild = launched.child;
      workerShutdownRequested = false;
      launched.child.on("message", (message: unknown) => {
        if (
          message &&
          typeof message === "object" &&
          "type" in message &&
          (message as { type?: unknown }).type ===
            PACKAGE_LOCAL_WORKER_HANDSHAKE_ACK_MESSAGE_TYPE &&
          "acknowledgement" in message
        ) {
          const acknowledgement = (
            message as PackageLocalWorkerHandshakeAcknowledgementMessage
          ).acknowledgement;
          workerAcknowledgements.set(
            acknowledgement.activation_id,
            acknowledgement
          );
          try {
            handshakeCoordinator?.advance();
          } catch (error) {
            options.onFailure?.(error);
          }
        }
      });
      launched.child.once("exit", () => {
        if (workerChild === launched.child) {
          workerChild = null;
          workerShutdownRequested = false;
        }
      });
    };
    ensureWorker();
    handshakeCoordinator.advance();
    heartbeat = setInterval(() => {
      try {
        if (!stopping && session.shouldStopForDeliberateDrain()) {
          requestStop();
        }
        session.heartbeat(stopping ? "draining" : "active");
        if (stopping) {
          signalWorker();
        } else {
          ensureWorker();
          handshakeCoordinator?.advance();
        }
      } catch (error) {
        options.onFailure?.(error);
        requestStop();
      }
    }, SUPERVISOR_RUNTIME_POLICY.heartbeat_interval_ms);
    await stopped;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    signalWorker();
    const workerReleaseDeadline = Date.now() + Math.min(
      SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms,
      SUPERVISOR_RUNTIME_POLICY.lease_duration_ms -
        SUPERVISOR_RUNTIME_POLICY.heartbeat_interval_ms
    );
    while (true) {
      const worker = session.currentWorker();
      if (!worker || worker.state === "stopped") {
        break;
      }
      if (Date.now() >= workerReleaseDeadline) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          "Supervisor graceful drain timed out before the worker released its lease."
        );
      }
      await new Promise<void>((resolveSleep) => setTimeout(
        resolveSleep,
        100
      ));
      signalWorker();
    }
    try {
      session.requestDrain();
    } catch {
      // A deliberate production drain may already have transitioned the lease.
    }
    session.release();
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    process.off("SIGTERM", requestStop);
    process.off("SIGINT", requestStop);
    process.off("message", requestStopFromIpc);
    db.close();
  }
};

export const PACKAGE_LOCAL_SUPERVISOR_RUNTIME_CONTRACT = Object.freeze({
  gateway_identity_envelope_required: true,
  verified_package_closure_required: true,
  os_process_start_identity_required: true,
  waits_for_gateway_child_binding: true,
  lease_acquisition_repository: "RuntimeSupervisorAuthorityRepository",
  heartbeat_interval_ms: SUPERVISOR_RUNTIME_POLICY.heartbeat_interval_ms,
  semantic_worker_execution_in_supervisor: false,
  graceful_shutdown_transport: "node_ipc",
  worker_lifecycle_owner: true,
  worker_semantic_execution_in_supervisor: false,
  activation_handshake_persistent_writer: "supervisor",
  worker_handshake_acknowledgement_transport: "node_ipc"
});
