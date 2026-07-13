import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  consumeGatewayRuntimeIdentityEnvelope
} from "../identity/binding.js";
import type {
  RuntimeParticipantIdentity
} from "../identity/types.js";
import {
  createS6ProcessProductionWriteAuthorityProvider,
  createS6WorkerAcquisitionAuthorityProvider
} from "../activation/authority.js";
import {
  readActivationHandshake,
  readSupervisorLeaseByHome,
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
  PACKAGE_LOCAL_WORKER_HANDSHAKE_ACK_MESSAGE_TYPE,
  PACKAGE_LOCAL_WORKER_HANDSHAKE_CHALLENGE_MESSAGE_TYPE,
  PACKAGE_LOCAL_WORKER_READY_MESSAGE_TYPE,
  PACKAGE_LOCAL_WORKER_SHUTDOWN_MESSAGE,
  type PackageLocalWorkerHandshakeChallenge,
  type PackageLocalWorkerLaunchContext
} from "../activation/worker-launcher.js";
import type {
  ActivationWorkerAcknowledgement
} from "../activation/types.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import {
  SUPERVISOR_RUNTIME_POLICY
} from "../process/constants.js";
import type {
  ExpectedSupervisorAuthority,
  ExpectedWorkerAuthority,
  RuntimeProcessAuthorityClock,
  SupervisorLeaseRow,
  WorkerLeaseRow
} from "../process/types.js";
import {
  RuntimeWorkerAuthorityRepository
} from "../process/worker-authority.js";
import {
  configureRuntimeSqlitePolicy
} from "../schema/sqlite-policy.js";
import {
  assertVerifiedPackageClosure
} from "../activation/repository.js";
import {
  assertRuntimeClosureManifest
} from "./closure-manifest.js";
import { canonicalJson } from "./package-generation.js";
import {
  createCurrentPackageWorkerSemanticQueueExecutor,
  PACKAGE_WORKER_SEMANTIC_QUEUE_POLICY,
  type PackageWorkerSemanticQueueExecutor
} from "./semantic-queue-executor.js";

export const PACKAGE_LOCAL_WORKER_CONTEXT_ENV =
  "EXPERIENCE_ENGINE_WORKER_CONTEXT_JSON" as const;

const parseContext = (value: string | undefined): PackageLocalWorkerLaunchContext => {
  if (!value) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Package-local worker context is missing."
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Package-local worker context is not valid JSON."
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { context_schema_version?: unknown }).context_schema_version !==
      "package-local-worker-context-v1"
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Package-local worker context has an unsupported shape."
    );
  }
  return parsed as PackageLocalWorkerLaunchContext;
};

export const parsePackageLocalWorkerEnvironment = (
  env: NodeJS.ProcessEnv = process.env
): PackageLocalWorkerLaunchContext => parseContext(
  env[PACKAGE_LOCAL_WORKER_CONTEXT_ENV]
);

export const createWorkerHandshakeAcknowledgement = (options: {
  db: DatabaseSync;
  homeId: string;
  activationId: string;
  worker: WorkerLeaseRow;
}): ActivationWorkerAcknowledgement => {
  const handshake = readActivationHandshake(
    options.db,
    options.homeId,
    options.activationId
  );
  if (
    !handshake ||
    handshake.status !== "supervisor_acknowledged" ||
    handshake.worker_owner_id !== options.worker.owner_id ||
    handshake.worker_fencing_token !== options.worker.fencing_token ||
    handshake.worker_mode !== options.worker.worker_mode ||
    handshake.schema_version !== options.worker.schema_version ||
    handshake.plugin_package_generation_id !==
      options.worker.package_generation_id ||
    handshake.supervisor_owner_id !== options.worker.supervisor_owner_id ||
    handshake.supervisor_lease_epoch !==
      options.worker.supervisor_lease_epoch
  ) {
    throw new RuntimeActivationError(
      "EE_ACTIVATION_HANDSHAKE_STALE",
      "Worker IPC acknowledgement requires the exact supervisor-acknowledged handshake and current worker fence."
    );
  }
  return {
    activation_id: handshake.activation_id,
    nonce_digest: handshake.nonce_digest,
    home_id: handshake.home_id,
    worker_owner_id: options.worker.owner_id,
    worker_fencing_token: options.worker.fencing_token,
    worker_mode: options.worker.worker_mode,
    schema_version: options.worker.schema_version,
    configuration_generation_id: handshake.configuration_generation_id,
    effective_route_set_id: handshake.effective_route_set_id,
    package_generation_id: options.worker.package_generation_id,
    current_activation_revision: handshake.current_activation_revision,
    launch_activation_revision_at_consumption:
      handshake.launch_activation_revision_at_consumption,
    launch_authorization_id: handshake.launch_authorization_id,
    launch_authorization_revision: handshake.launch_authorization_revision,
    launch_authorization_state_revision_at_consumption:
      handshake.launch_authorization_state_revision_at_consumption,
    launch_authorization_role: handshake.launch_authorization_role,
    supervisor_launch_attempt_id: handshake.supervisor_launch_attempt_id
  };
};

const databasePathFromContext = (
  context: PackageLocalWorkerLaunchContext
): string => resolve(
  context.identityEnvelope.canonical_home_resolution.resolved_home,
  context.identityEnvelope.home.database_relative_path
);

const expectedSupervisor = (lease: SupervisorLeaseRow): ExpectedSupervisorAuthority => ({
  owner_id: lease.owner_id,
  owner_process_id: lease.owner_process_id,
  owner_process_start_token: lease.owner_process_start_token,
  lease_epoch: lease.lease_epoch,
  lease_state_revision: lease.lease_state_revision
});

const expectedWorker = (lease: WorkerLeaseRow): ExpectedWorkerAuthority => ({
  owner_id: lease.owner_id,
  owner_process_id: lease.owner_process_id,
  owner_process_start_token: lease.owner_process_start_token,
  fencing_token: lease.fencing_token
});

const participantFromContext = (
  context: PackageLocalWorkerLaunchContext
): RuntimeParticipantIdentity => ({
  participant: "worker",
  home_id: context.identityEnvelope.home.home_id,
  home_layout_version: context.identityEnvelope.home.home_layout_version,
  path_normalization_version:
    context.identityEnvelope.home.path_normalization_version,
  normalized_path_fingerprint:
    context.identityEnvelope.home.normalized_path_fingerprint,
  database_relative_path: context.identityEnvelope.home.database_relative_path,
  package_generation_id:
    context.packageClosure.package_identity.package_generation_id,
  artifact_integrity: context.packageClosure.package_identity.artifact_integrity
});

const assertContext = (options: {
  db: DatabaseSync;
  context: PackageLocalWorkerLaunchContext;
  packageRoot: string;
  observedAt: string;
  verifyClosure: (packageRoot: string) => {
    closureManifestDigest?: string;
  };
}): SupervisorLeaseRow => {
  const closure = options.verifyClosure(options.packageRoot);
  assertVerifiedPackageClosure(options.context.packageClosure, options.observedAt);
  if (
    closure.closureManifestDigest !==
      options.context.packageClosure.closure_manifest_digest
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_CLOSURE_REQUIRED",
      "Worker package closure digest does not match verified launch evidence."
    );
  }
  if (
    canonicalJson(options.context.identityEnvelope.package) !==
      canonicalJson(options.context.packageClosure.package_identity)
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_CLOSURE_REQUIRED",
      "Worker identity envelope does not match verified package closure evidence."
    );
  }
  const identity = consumeGatewayRuntimeIdentityEnvelope(
    options.context.identityEnvelope,
    participantFromContext(options.context)
  );
  if (!identity.ok) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      `Worker runtime identity mismatch at ${identity.field}.`
    );
  }
  const supervisor = readSupervisorLeaseByHome(
    options.db,
    options.context.identityEnvelope.home.home_id
  );
  if (
    !supervisor ||
    supervisor.owner_id !== options.context.expectedSupervisor.owner_id ||
    supervisor.owner_process_id !==
      options.context.expectedSupervisor.owner_process_id ||
    supervisor.owner_process_start_token !==
      options.context.expectedSupervisor.owner_process_start_token ||
    supervisor.lease_epoch !== options.context.expectedSupervisor.lease_epoch ||
    supervisor.package_generation_id !==
      options.context.packageClosure.package_identity.package_generation_id
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Worker context is not bound to the exact current supervisor process and epoch."
    );
  }
  return supervisor;
};

export class RuntimePackageLocalWorkerLeaseSession {
  private lease: WorkerLeaseRow | undefined;

  constructor(private readonly options: {
    db: DatabaseSync;
    packageRoot: string;
    context: PackageLocalWorkerLaunchContext;
    processStartTokenResolver?: ProcessStartTokenResolver;
    clock?: RuntimeProcessAuthorityClock;
    processId?: number;
    observedAt?: () => string;
    idFactory?: () => string;
    verifyClosure?: (packageRoot: string) => {
      closureManifestDigest?: string;
    };
  }) {}

  private repository(): RuntimeWorkerAuthorityRepository {
    const clock = this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
    return new RuntimeWorkerAuthorityRepository(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id,
      createS6WorkerAcquisitionAuthorityProvider(clock),
      createS6ProcessProductionWriteAuthorityProvider(clock),
      clock
    );
  }

  private currentSupervisor(): SupervisorLeaseRow {
    const supervisor = readSupervisorLeaseByHome(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id
    );
    if (
      !supervisor ||
      supervisor.owner_id !== this.options.context.expectedSupervisor.owner_id ||
      supervisor.lease_epoch !== this.options.context.expectedSupervisor.lease_epoch
    ) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Worker lost its exact supervisor owner or epoch."
      );
    }
    return supervisor;
  }

  acquireAndActivate(): WorkerLeaseRow {
    const clock = this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
    const supervisor = assertContext({
      db: this.options.db,
      context: this.options.context,
      packageRoot: this.options.packageRoot,
      observedAt: this.options.observedAt?.() ?? new Date().toISOString(),
      verifyClosure: this.options.verifyClosure ?? assertRuntimeClosureManifest
    });
    const processId = this.options.processId ?? process.pid;
    const ownerProcessStartToken = (
      this.options.processStartTokenResolver ??
        createOperatingSystemProcessStartTokenResolver()
    )(processId);
    const starting = this.repository().acquire({
      leaseKey: `worker-lease-${(this.options.idFactory ?? randomUUID)()}`,
      ownerId: this.options.context.workerOwnerId,
      ownerProcessId: processId,
      ownerProcessStartToken,
      expectedSupervisor: expectedSupervisor(supervisor),
      packageIdentity: this.options.context.packageClosure.package_identity,
      schemaVersion: this.options.context.schemaVersion,
      workerMode: this.options.context.workerMode,
      transitionRole: this.options.context.transitionRole
    });
    this.lease = this.repository().renew({
      expectedWorker: expectedWorker(starting),
      expectedSupervisor: expectedSupervisor(this.currentSupervisor()),
      nextState: "active"
    });
    return this.lease;
  }

  current(): WorkerLeaseRow | undefined {
    return readWorkerLeaseByHome(
      this.options.db,
      this.options.context.identityEnvelope.home.home_id
    );
  }

  heartbeat(): WorkerLeaseRow {
    const current = this.current();
    if (!current || !this.lease || current.owner_id !== this.lease.owner_id) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Worker heartbeat lost its current owner projection."
      );
    }
    this.lease = this.repository().renew({
      expectedWorker: expectedWorker(current),
      expectedSupervisor: expectedSupervisor(this.currentSupervisor()),
      nextState: current.state === "draining" ? "draining" : "active"
    });
    return this.lease;
  }

  release(): WorkerLeaseRow | undefined {
    const current = this.current();
    if (!current || current.state === "stopped") {
      this.lease = current;
      return current;
    }
    let releasable = current;
    if (current.state === "active" || current.state === "starting") {
      releasable = this.repository().requestDrain({
        expectedWorker: expectedWorker(current),
        expectedSupervisor: expectedSupervisor(this.currentSupervisor())
      });
    }
    this.lease = this.repository().release({
      expectedWorker: expectedWorker(releasable),
      expectedSupervisor: expectedSupervisor(this.currentSupervisor())
    });
    return this.lease;
  }
}

const packageRootFromRuntimeModule = (): string => resolve(
  fileURLToPath(new URL("../../..", import.meta.url))
);

export const runPackageLocalWorkerProcess = async (options: {
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  onReady?: (lease: WorkerLeaseRow) => void;
  onFailure?: (error: unknown) => void;
  createSemanticExecutor?:
    typeof createCurrentPackageWorkerSemanticQueueExecutor;
  semanticPollIntervalMs?: number;
} = {}): Promise<void> => {
  const context = parsePackageLocalWorkerEnvironment(options.env);
  const packageRoot = options.packageRoot ?? packageRootFromRuntimeModule();
  const db = new DatabaseSync(databasePathFromContext(context));
  configureRuntimeSqlitePolicy(db, {
    accessMode: "read_write",
    role: "worker"
  });
  const session = new RuntimePackageLocalWorkerLeaseSession({
    db,
    packageRoot,
    context
  });
  let heartbeat: NodeJS.Timeout | undefined;
  let semanticDrainTimer: NodeJS.Timeout | undefined;
  let semanticExecutor: PackageWorkerSemanticQueueExecutor | undefined;
  let semanticDrainPromise: Promise<void> | undefined;
  let stopping = false;
  let resolveStop: (() => void) | undefined;
  const stopped = new Promise<void>((resolvePromise) => {
    resolveStop = resolvePromise;
  });
  const requestStop = (): void => {
    if (!stopping) {
      stopping = true;
      resolveStop?.();
    }
  };
  const handleIpcMessage = (message: unknown): void => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      (message as { type?: unknown }).type ===
        PACKAGE_LOCAL_WORKER_SHUTDOWN_MESSAGE.type
    ) {
      requestStop();
      return;
    }
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      (message as { type?: unknown }).type ===
        PACKAGE_LOCAL_WORKER_HANDSHAKE_CHALLENGE_MESSAGE_TYPE
    ) {
      try {
        const challenge = message as PackageLocalWorkerHandshakeChallenge;
        const worker = session.current();
        if (!worker || worker.state === "stopped") {
          throw new RuntimeActivationError(
            "EE_ACTIVATION_HANDSHAKE_STALE",
            "Worker handshake challenge arrived without a current worker fence."
          );
        }
        process.send?.({
          type: PACKAGE_LOCAL_WORKER_HANDSHAKE_ACK_MESSAGE_TYPE,
          acknowledgement: createWorkerHandshakeAcknowledgement({
            db,
            homeId: context.identityEnvelope.home.home_id,
            activationId: challenge.activation_id,
            worker
          })
        });
      } catch (error) {
        options.onFailure?.(error);
      }
    }
  };
  process.once("SIGTERM", requestStop);
  process.once("SIGINT", requestStop);
  process.on("message", handleIpcMessage);
  try {
    const lease = session.acquireAndActivate();
    options.onReady?.(lease);
    process.send?.({
      type: PACKAGE_LOCAL_WORKER_READY_MESSAGE_TYPE,
      worker_owner_id: lease.owner_id,
      worker_fencing_token: lease.fencing_token,
      worker_mode: lease.worker_mode
    });
    if (context.workerMode === "production") {
      const closure = assertRuntimeClosureManifest(packageRoot);
      if (!closure.packageBuildId) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_CLOSURE_REQUIRED",
          "Production worker closure is missing its package build id."
        );
      }
      const drainSemanticQueue = (): void => {
        if (stopping || semanticDrainPromise) {
          return;
        }
        semanticDrainPromise = (async () => {
          try {
            const current = session.current();
            if (
              !current ||
              current.worker_mode !== "production" ||
              current.state === "stopped" ||
              current.state === "blocked" ||
              current.shutdown_requested_at !== null
            ) {
              return;
            }
            semanticExecutor ??= await (
              options.createSemanticExecutor ??
              createCurrentPackageWorkerSemanticQueueExecutor
            )({
              db,
              canonicalHome:
                context.identityEnvelope.canonical_home_resolution
                  .resolved_home,
              homeId: context.identityEnvelope.home.home_id,
              packageRoot,
              packageBuildId: closure.packageBuildId!,
              packageIdentity: context.packageClosure.package_identity
            });
            if (!semanticExecutor) {
              return;
            }
            const result = await semanticExecutor.drainOne();
            if (result.status === "authority_unavailable") {
              semanticExecutor = undefined;
            }
          } catch (error) {
            semanticExecutor = undefined;
            options.onFailure?.(error);
          }
        })().finally(() => {
          semanticDrainPromise = undefined;
        });
      };
      semanticDrainTimer = setInterval(
        drainSemanticQueue,
        options.semanticPollIntervalMs ??
          PACKAGE_WORKER_SEMANTIC_QUEUE_POLICY.poll_interval_ms
      );
      semanticDrainTimer.unref?.();
      drainSemanticQueue();
    }
    heartbeat = setInterval(() => {
      try {
        const current = session.current();
        if (
          !current ||
          current.state === "stopped" ||
          current.state === "blocked" ||
          current.state === "draining" ||
          current.shutdown_requested_at !== null
        ) {
          requestStop();
          return;
        }
        session.heartbeat();
      } catch (error) {
        options.onFailure?.(error);
        requestStop();
      }
    }, SUPERVISOR_RUNTIME_POLICY.heartbeat_interval_ms);
    await stopped;
    if (semanticDrainTimer) {
      clearInterval(semanticDrainTimer);
      semanticDrainTimer = undefined;
    }
    await semanticDrainPromise;
    session.release();
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    if (semanticDrainTimer) {
      clearInterval(semanticDrainTimer);
    }
    process.off("SIGTERM", requestStop);
    process.off("SIGINT", requestStop);
    process.off("message", handleIpcMessage);
    db.close();
  }
};

export const PACKAGE_LOCAL_WORKER_RUNTIME_CONTRACT = Object.freeze({
  supervisor_process_and_epoch_required: true,
  os_process_start_identity_required: true,
  s6_worker_acquisition_provider_required: true,
  worker_fence_monotonic: true,
  graceful_shutdown_transport: "node_ipc",
  handshake_acknowledgement_transport: "node_ipc",
  worker_persists_handshake_rows: false,
  semantic_queue_execution_connected: true,
  semantic_queue_authority: "s5_fenced_learning_queue",
  semantic_provider_work_inside_sqlite_authority_transaction: false,
  authority_loss_consumes_content_retry: false
});
