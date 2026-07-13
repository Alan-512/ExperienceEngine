import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import {
  readSupervisorLaunchState
} from "../process/database.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  RuntimePackageActivationControlService
} from "./control.js";
import {
  readActivationHandshake,
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import {
  RuntimeActivationHandshakeRepository
} from "./handshake.js";
import {
  createOperatingSystemProcessStartTokenResolver
} from "./process-identity.js";
import type {
  ProcessStartTokenResolver
} from "./supervisor-launcher.js";
import type {
  ActivationWriter
} from "./types.js";

export type RuntimeProcessTerminator = (options: {
  processId: number;
  expectedProcessStartToken: string;
}) => boolean;

export const createVerifiedRuntimeProcessTerminator = (
  resolver: ProcessStartTokenResolver =
    createOperatingSystemProcessStartTokenResolver()
): RuntimeProcessTerminator => (options) => {
  if (resolver(options.processId) !== options.expectedProcessStartToken) {
    return false;
  }
  process.kill(options.processId);
  return true;
};

export type RuntimeActivationExpirySweepResult = {
  expired_handshake_id: string | null;
  terminated_worker: boolean;
  terminalized_launch_attempt_id: string | null;
  blocked_projection_revision: number | null;
};

export class RuntimeActivationExpiryCoordinator {
  constructor(private readonly options: {
    db: DatabaseSync;
    homeId: string;
    gatewayInstanceId: string;
    gatewayProcessStartToken: string;
    pluginPackageGenerationId: string;
    terminateProcess?: RuntimeProcessTerminator;
    idFactory?: () => string;
    clock?: RuntimeProcessAuthorityClock;
  }) {}

  sweepCurrentHandshake(): RuntimeActivationExpirySweepResult {
    const clock = this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
    const idFactory = this.options.idFactory ?? randomUUID;
    const snapshot = runRuntimeImmediateTransaction(this.options.db, {
      category: "lease",
      operation: () => {
        const observedAt = clock.captureObservedNowInTransaction(this.options.db);
        const activation = readPackageActivationAuthority(
          this.options.db,
          this.options.homeId
        );
        const handshake = activation?.preactivation_handshake_id
          ? readActivationHandshake(
            this.options.db,
            this.options.homeId,
            activation.preactivation_handshake_id
          )
          : undefined;
        const productionHandshake = activation?.production_activation_handshake_id
          ? readActivationHandshake(
            this.options.db,
            this.options.homeId,
            activation.production_activation_handshake_id
          )
          : undefined;
        const currentHandshake = handshake &&
          !["complete", "expired", "rejected"].includes(handshake.status)
          ? handshake
          : productionHandshake &&
            !["complete", "expired", "rejected"].includes(
              productionHandshake.status
            )
            ? productionHandshake
            : undefined;
        const supervisorAuthority =
          evaluateFreshSupervisorAuthorityInTransaction({
            db: this.options.db,
            homeId: this.options.homeId,
            observedAt
          });
        return {
          observedAt,
          activation,
          handshake: currentHandshake,
          worker: readWorkerLeaseByHome(this.options.db, this.options.homeId),
          supervisor: readSupervisorLeaseByHome(
            this.options.db,
            this.options.homeId
          ),
          launch: readSupervisorLaunchState(
            this.options.db,
            this.options.homeId
          ),
          supervisorAuthority
        };
      }
    });
    if (
      !snapshot.activation ||
      !snapshot.handshake ||
      toProcessAuthorityEpochMs(snapshot.handshake.expires_at) >
        toProcessAuthorityEpochMs(snapshot.observedAt)
    ) {
      return {
        expired_handshake_id: null,
        terminated_worker: false,
        terminalized_launch_attempt_id: null,
        blocked_projection_revision: null
      };
    }

    const writer: ActivationWriter = snapshot.supervisorAuthority.available &&
      snapshot.supervisorAuthority.fresh &&
      snapshot.supervisor
      ? {
        kind: "supervisor",
        supervisor_owner_id: snapshot.supervisor.owner_id,
        supervisor_lease_epoch: snapshot.supervisor.lease_epoch,
        supervisor_lease_state_revision:
          snapshot.supervisor.lease_state_revision
      }
      : {
        kind: "gateway_service_controller",
        gateway_instance_id: this.options.gatewayInstanceId,
        gateway_process_start_token:
          this.options.gatewayProcessStartToken,
        plugin_package_generation_id:
          this.options.pluginPackageGenerationId
      };
    const expectedSupervisorLeaseEpoch = writer.kind === "supervisor"
      ? writer.supervisor_lease_epoch
      : null;

    let terminatedWorker = false;
    if (
      snapshot.worker &&
      snapshot.worker.state !== "stopped" &&
      snapshot.worker.owner_id === snapshot.handshake.worker_owner_id &&
      snapshot.worker.fencing_token ===
        snapshot.handshake.worker_fencing_token
    ) {
      const terminator = this.options.terminateProcess ??
        createVerifiedRuntimeProcessTerminator();
      terminatedWorker = terminator({
        processId: snapshot.worker.owner_process_id,
        expectedProcessStartToken:
          snapshot.worker.owner_process_start_token
      });
      if (!terminatedWorker) {
        throw new Error(
          "Expired activation worker process identity could not be verified for termination."
        );
      }
      const update = this.options.db.prepare(
        `UPDATE worker_leases
         SET state = 'stopped',
             shutdown_requested_at = COALESCE(shutdown_requested_at, ?),
             drain_deadline_at = NULL,
             heartbeat_at = ?,
             last_failure_code = 'EE_ACTIVATION_HANDSHAKE_EXPIRED'
         WHERE home_id = ?
           AND owner_id = ?
           AND fencing_token = ?
           AND state <> 'stopped'`
      ).run(
        snapshot.observedAt,
        snapshot.observedAt,
        this.options.homeId,
        snapshot.worker.owner_id,
        snapshot.worker.fencing_token
      );
      if (Number(update.changes) !== 1) {
        throw new Error(
          "Expired activation worker termination lost its exact lease fence."
        );
      }
    }

    const terminalizedAttemptId: string | null = null;

    if (writer.kind !== "supervisor") {
      throw new Error(
        "Expired activation handshake requires its exact current supervisor writer."
      );
    }
    const expired = new RuntimeActivationHandshakeRepository(
      this.options.db,
      this.options.homeId,
      clock
    ).expireOrReject({
      activationId: snapshot.handshake.activation_id,
      expectedStateRevision: snapshot.handshake.state_revision,
      targetStatus: "expired",
      writer,
      failureCode: "EE_ACTIVATION_HANDSHAKE_EXPIRED"
    });

    let blockedProjectionRevision: number | null = null;
    if (
      [
        "preparing",
        "draining_old",
        "migrating",
        "preactivation_verifying",
        "production_activating"
      ].includes(snapshot.activation.activation_state)
    ) {
      const blocked = new RuntimePackageActivationControlService(
        this.options.db,
        this.options.homeId,
        clock
      ).enterBlocked({
        controlRequestId: idFactory(),
        expectedProjectionRevision:
          snapshot.activation.activation_revision,
        expectedGatewayInstanceId: this.options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch,
        failureCode: "EE_ACTIVATION_HANDSHAKE_EXPIRED",
        writer
      });
      blockedProjectionRevision = blocked.record.result_projection_revision;
    }

    return {
      expired_handshake_id: expired.activation_id,
      terminated_worker: terminatedWorker,
      terminalized_launch_attempt_id: terminalizedAttemptId,
      blocked_projection_revision: blockedProjectionRevision
    };
  }
}
