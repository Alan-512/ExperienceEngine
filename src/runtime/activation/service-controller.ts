import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  PACKAGE_ACTIVATION_TIMING_POLICY,
  SUPERVISOR_RUNTIME_POLICY,
  type LaunchAuthorizationRole
} from "../process/constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import {
  readSupervisorLaunchState
} from "../process/database.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import {
  GatewayHeartbeatRepository
} from "../process/gateway-heartbeat.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  RuntimePackageActivationControlService
} from "./control.js";
import {
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import {
  createOperatingSystemProcessStartTokenResolver
} from "./process-identity.js";
import {
  RuntimePackageActivationRepository
} from "./repository.js";
import {
  PACKAGE_LOCAL_SUPERVISOR_SHUTDOWN_MESSAGE,
  RuntimePackageSupervisorLauncher,
  type ProcessStartTokenResolver,
  type SpawnedSupervisorProcess,
  type SupervisorProcessSpawner
} from "./supervisor-launcher.js";
import type {
  VerifiedPackageClosureEvidence
} from "./types.js";
import type {
  GatewayRuntimeIdentityEnvelope
} from "../identity/types.js";
import type {
  OpenClawRuntimeLifecycleResult
} from "./native-service.js";
import type {
  RuntimeGatewayActivationHandshakeCoordinator
} from "./orchestrator.js";

export type RuntimePackageGenerationDescriptor = {
  packageRoot: string;
  packageClosure: VerifiedPackageClosureEvidence;
};

export type RuntimePackageGenerationResolver = (
  packageGenerationId: string
) => RuntimePackageGenerationDescriptor | undefined;

const assertLaunchRole = (role: string): LaunchAuthorizationRole => {
  if (
    role !== "initial_candidate" &&
    role !== "active" &&
    role !== "pending" &&
    role !== "rollback_candidate"
  ) {
    throw new Error(`Package launch authorization role ${role} is not launchable.`);
  }
  return role;
};

export class RuntimePackageLocalServiceController {
  private child: SpawnedSupervisorProcess | null = null;
  private childShutdownRequested = false;
  private gatewayHeartbeatTimer: NodeJS.Timeout | null = null;

  private signalRetainedSupervisor(): boolean {
    const child = this.child;
    if (!child) {
      return false;
    }
    if (this.childShutdownRequested) {
      return true;
    }
    try {
      if (child.connected && child.send) {
        child.send(PACKAGE_LOCAL_SUPERVISOR_SHUTDOWN_MESSAGE);
        this.childShutdownRequested = true;
        return true;
      }
      const signalled = child.kill("SIGTERM");
      if (signalled) {
        this.childShutdownRequested = true;
      }
      return signalled;
    } catch {
      return false;
    }
  }

  constructor(private readonly options: {
    db: DatabaseSync;
    homeId: string;
    gatewayInstanceId: string;
    gatewayProcessId?: number;
    gatewayProcessStartToken: string;
    currentPluginPackageGenerationId: string;
    runtimeIdentityEnvelope: GatewayRuntimeIdentityEnvelope;
    resolvePackageGeneration: RuntimePackageGenerationResolver;
    processStartTokenResolver?: ProcessStartTokenResolver;
    spawner?: SupervisorProcessSpawner;
    idFactory?: () => string;
    gatewayHeartbeatDurationMs?: number;
    activationHandshakeCoordinator?: Pick<
      RuntimeGatewayActivationHandshakeCoordinator,
      "requestIfReady"
    >;
    clock?: RuntimeProcessAuthorityClock;
  }) {}

  private requestActivationHandshakeIfReady(): void {
    try {
      this.options.activationHandshakeCoordinator?.requestIfReady();
    } catch {
      // Configuration, route, worker, or package authority may converge later.
    }
  }

  private publishGatewayHeartbeat(): void {
    const clock = this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
    new GatewayHeartbeatRepository(
      this.options.db,
      this.options.homeId,
      clock
    ).publish({
      gatewayInstanceId: this.options.gatewayInstanceId,
      gatewayProcessId: this.options.gatewayProcessId ?? process.pid,
      gatewayProcessStartToken: this.options.gatewayProcessStartToken,
      packageGenerationId: this.options.currentPluginPackageGenerationId,
      heartbeatDurationMs: this.options.gatewayHeartbeatDurationMs ??
        PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms
    });
  }

  private ensureGatewayHeartbeatLoop(): void {
    if (this.gatewayHeartbeatTimer) {
      return;
    }
    const duration = this.options.gatewayHeartbeatDurationMs ??
      PACKAGE_ACTIVATION_TIMING_POLICY.activation_deadline_ms;
    const interval = Math.max(
      1_000,
      Math.min(
        SUPERVISOR_RUNTIME_POLICY.heartbeat_interval_ms,
        Math.floor(duration / 2)
      )
    );
    this.gatewayHeartbeatTimer = setInterval(() => {
      try {
        this.publishGatewayHeartbeat();
        this.requestActivationHandshakeIfReady();
      } catch {
        this.stopGatewayHeartbeatLoop();
      }
    }, interval);
    this.gatewayHeartbeatTimer.unref();
  }

  private stopGatewayHeartbeatLoop(): void {
    if (!this.gatewayHeartbeatTimer) {
      return;
    }
    clearInterval(this.gatewayHeartbeatTimer);
    this.gatewayHeartbeatTimer = null;
  }

  start(): OpenClawRuntimeLifecycleResult {
    const clock = this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
    const idFactory = this.options.idFactory ?? randomUUID;
    this.publishGatewayHeartbeat();

    const freshSupervisor = runRuntimeImmediateTransaction(this.options.db, {
      category: "lease",
      operation: () => {
        const observedAt = clock.captureObservedNowInTransaction(this.options.db);
        return evaluateFreshSupervisorAuthorityInTransaction({
          db: this.options.db,
          homeId: this.options.homeId,
          observedAt
        });
      }
    });
    if (freshSupervisor.available && freshSupervisor.fresh) {
      this.ensureGatewayHeartbeatLoop();
      this.requestActivationHandshakeIfReady();
      return {
        ok: true,
        code: "supervisor_already_current",
        detail: {
          supervisor_owner_id: freshSupervisor.supervisor_owner_id,
          supervisor_lease_epoch: freshSupervisor.supervisor_lease_epoch
        }
      };
    }

    const repository = new RuntimePackageActivationRepository(
      this.options.db,
      this.options.homeId,
      clock
    );
    let activation = repository.read() ??
      repository.bootstrapPackageActivationAuthority();
    let launchState = readSupervisorLaunchState(
      this.options.db,
      this.options.homeId
    );

    if (activation.activation_state === "uninitialized") {
      this.ensureGatewayHeartbeatLoop();
      return {
        ok: false,
        code: "package_activation_initialization_required",
        detail: {
          package_generation_id:
            this.options.currentPluginPackageGenerationId,
          projection_revision: activation.activation_revision,
          launch_revision: launchState?.launch_revision ?? 0
        }
      };
    } else if (
      activation.activation_state === "active" &&
      activation.active_package_generation_id ===
        this.options.currentPluginPackageGenerationId &&
      activation.launch_authorization_state !== "issued"
    ) {
      new RuntimePackageActivationControlService(
        this.options.db,
        this.options.homeId,
        clock
      ).issueActiveRestartAuthorization({
        controlRequestId: idFactory(),
        expectedProjectionRevision: activation.activation_revision,
        expectedGatewayInstanceId: this.options.gatewayInstanceId,
        authorizationId: idFactory(),
        expectedLaunchRevision: launchState?.launch_revision ?? 0,
        writer: {
          kind: "gateway_service_controller",
          gateway_instance_id: this.options.gatewayInstanceId,
          gateway_process_start_token: this.options.gatewayProcessStartToken,
          plugin_package_generation_id:
            this.options.currentPluginPackageGenerationId
        }
      });
      activation = repository.read()!;
      launchState = readSupervisorLaunchState(
        this.options.db,
        this.options.homeId
      );
    }

    if (
      !activation.launch_authorization_id ||
      !activation.launch_authorized_generation_id ||
      activation.launch_authorization_state !== "issued"
    ) {
      return {
        ok: false,
        code: "launch_authorization_not_issued",
        detail: {
          package_activation_state: activation.activation_state,
          package_activation_revision: activation.activation_revision
        }
      };
    }
    const descriptor = this.options.resolvePackageGeneration(
      activation.launch_authorized_generation_id
    );
    if (!descriptor) {
      return {
        ok: false,
        code: "authorized_package_generation_not_resolvable",
        detail: {
          authorized_package_generation_id:
            activation.launch_authorized_generation_id
        }
      };
    }
    const launcher = new RuntimePackageSupervisorLauncher(
      this.options.db,
      this.options.homeId,
      descriptor.packageRoot,
      this.options.processStartTokenResolver ??
        createOperatingSystemProcessStartTokenResolver(),
      this.options.spawner,
      clock
    );
    const launched = launcher.launch({
      packageIdentity: descriptor.packageClosure.package_identity,
      runtimeIdentityEnvelope: this.options.runtimeIdentityEnvelope,
      packageClosure: descriptor.packageClosure,
      authorizationId: activation.launch_authorization_id,
      expectedAuthorizationRevision:
        activation.launch_authorization_revision,
      expectedAuthorizationStateRevision:
        activation.launch_authorization_state_revision,
      authorizationRole: assertLaunchRole(
        activation.launch_authorization_role
      ),
      attemptId: idFactory(),
      gatewayInstanceId: this.options.gatewayInstanceId,
      gatewayProcessStartToken: this.options.gatewayProcessStartToken,
      expectedLaunchRevision: launchState?.launch_revision ?? 0
    });
    this.child = launched.child;
    this.childShutdownRequested = false;
    launched.child.once("exit", () => {
      if (this.child === launched.child) {
        this.child = null;
        this.childShutdownRequested = false;
      }
    });
    this.ensureGatewayHeartbeatLoop();
    this.requestActivationHandshakeIfReady();
    return {
      ok: true,
      code: "supervisor_launch_reserved_and_bound",
      detail: {
        launch_attempt_id: launched.attempt.launch_attempt_id,
        package_generation_id:
          launched.attempt.package_generation_id,
        child_process_id: launched.attempt.child_process_id
      }
    };
  }

  stop(): OpenClawRuntimeLifecycleResult {
    this.stopGatewayHeartbeatLoop();
    const clock = this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
    const idFactory = this.options.idFactory ?? randomUUID;
    const activation = readPackageActivationAuthority(
      this.options.db,
      this.options.homeId
    );
    const supervisor = readSupervisorLeaseByHome(
      this.options.db,
      this.options.homeId
    );
    const worker = readWorkerLeaseByHome(
      this.options.db,
      this.options.homeId
    );
    if (!activation || !supervisor || !worker || worker.state === "stopped") {
      const supervisorSignalSent = this.signalRetainedSupervisor();
      return {
        ok: true,
        code: supervisorSignalSent
          ? "supervisor_stop_signalled"
          : "runtime_already_stopped",
        detail: {
          supervisor_signal_sent: supervisorSignalSent
        }
      };
    }
    if (worker.worker_mode !== "production") {
      const supervisorSignalSent = this.signalRetainedSupervisor();
      return {
        ok: supervisorSignalSent,
        code: supervisorSignalSent
          ? "supervisor_stop_signalled"
          : "activation_worker_stop_signal_unavailable",
        detail: {
          worker_mode: worker.worker_mode,
          package_activation_state: activation.activation_state,
          supervisor_signal_sent: supervisorSignalSent
        }
      };
    }
    const childSpawnedByService = this.child !== null;
    const result = new RuntimePackageActivationControlService(
      this.options.db,
      this.options.homeId,
      clock
    ).requestDrain({
      controlRequestId: idFactory(),
      expectedProjectionRevision: activation.activation_revision,
      expectedGatewayInstanceId: this.options.gatewayInstanceId,
      expectedSupervisorLeaseEpoch: supervisor.lease_epoch,
      expectedWorkerOwnerId: worker.owner_id,
      expectedWorkerFencingToken: worker.fencing_token,
      writer: {
        kind: "supervisor",
        supervisor_owner_id: supervisor.owner_id,
        supervisor_lease_epoch: supervisor.lease_epoch,
        supervisor_lease_state_revision: supervisor.lease_state_revision
      }
    });
    const supervisorSignalSent = this.signalRetainedSupervisor();
    return {
      ok: result.record.request_state === "completed",
      code: result.record.result_code,
      detail: {
        projection_revision: result.record.result_projection_revision,
        child_spawned_by_service: childSpawnedByService,
        supervisor_signal_sent: supervisorSignalSent
      }
    };
  }
}
