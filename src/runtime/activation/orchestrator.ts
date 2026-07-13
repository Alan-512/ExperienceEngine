import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import type {
  RuntimeProcessAuthorityClock,
  SupervisorLeaseRow,
  WorkerLeaseRow
} from "../process/types.js";
import type {
  RuntimeConfigurationCapability
} from "../configuration/constants.js";
import {
  DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES
} from "./constants.js";
import {
  readConfigurationPointer,
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import {
  RuntimeActivationHandshakeRepository
} from "./handshake.js";
import {
  RuntimePackageActivationTransitionRepository
} from "./transitions.js";
import type {
  ActivationHandshakeRow,
  ActivationWorkerAcknowledgement,
  GatewayActivationWriter,
  RuntimeCapabilityRouteAuthorityProvider,
  SupervisorActivationWriter
} from "./types.js";

export type RuntimeGatewayHandshakeContext = {
  configurationGenerationId: string;
  effectiveRouteSetId: string;
};

export type RuntimeGatewayHandshakeContextProvider = () =>
  RuntimeGatewayHandshakeContext | undefined;

const handshakePurposeFor = (options: {
  activationState: string;
  workerMode: WorkerLeaseRow["worker_mode"];
}): ActivationHandshakeRow["handshake_purpose"] | null => {
  if (
    options.workerMode === "activation_only" &&
    ["migrating", "preactivation_verifying"].includes(
      options.activationState
    )
  ) {
    return "preactivation_verification";
  }
  if (
    options.workerMode === "production" &&
    ["production_activating", "active"].includes(options.activationState)
  ) {
    return "production_activation";
  }
  return null;
};

const readCurrentHandshake = (options: {
  db: DatabaseSync;
  homeId: string;
  activationRevision: number;
  worker: WorkerLeaseRow;
  purpose: ActivationHandshakeRow["handshake_purpose"];
  supervisor?: SupervisorLeaseRow;
}): ActivationHandshakeRow | undefined => options.db.prepare(
  `SELECT *
   FROM activation_handshakes
   WHERE home_id = ?
     AND current_activation_revision = ?
     AND worker_owner_id = ?
     AND worker_fencing_token = ?
     AND handshake_purpose = ?
     AND (? IS NULL OR supervisor_owner_id = ?)
     AND (? IS NULL OR supervisor_lease_epoch = ?)
     AND status NOT IN ('expired', 'rejected')
   ORDER BY requested_at DESC, activation_id DESC
   LIMIT 1`
).get(
  options.homeId,
  options.activationRevision,
  options.worker.owner_id,
  options.worker.fencing_token,
  options.purpose,
  options.supervisor?.owner_id ?? null,
  options.supervisor?.owner_id ?? null,
  options.supervisor?.lease_epoch ?? null,
  options.supervisor?.lease_epoch ?? null
) as ActivationHandshakeRow | undefined;

export class RuntimeGatewayActivationHandshakeCoordinator {
  constructor(private readonly options: {
    db: DatabaseSync;
    homeId: string;
    writer: GatewayActivationWriter;
    routeAuthorityProvider: RuntimeCapabilityRouteAuthorityProvider;
    contextProvider: RuntimeGatewayHandshakeContextProvider;
    idFactory?: () => string;
    nonceDigestFactory?: () => string;
    requiredCapabilities?: readonly RuntimeConfigurationCapability[];
    clock?: RuntimeProcessAuthorityClock;
  }) {}

  requestIfReady(): ActivationHandshakeRow | undefined {
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
    const pointer = readConfigurationPointer(
      this.options.db,
      this.options.homeId
    );
    if (
      !activation ||
      !supervisor ||
      !worker ||
      worker.state !== "active" ||
      !pointer?.generation_id
    ) {
      return undefined;
    }
    const purpose = handshakePurposeFor({
      activationState: activation.activation_state,
      workerMode: worker.worker_mode
    });
    if (!purpose) {
      return undefined;
    }
    const existing = readCurrentHandshake({
      db: this.options.db,
      homeId: this.options.homeId,
      activationRevision: activation.activation_revision,
      worker,
      purpose,
      supervisor
    });
    if (existing) {
      return existing;
    }
    const context = this.options.contextProvider();
    if (
      !context ||
      context.configurationGenerationId !== pointer.generation_id ||
      !context.effectiveRouteSetId.trim()
    ) {
      return undefined;
    }
    return new RuntimeActivationHandshakeRepository(
      this.options.db,
      this.options.homeId,
      this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK,
      this.options.routeAuthorityProvider,
      this.options.requiredCapabilities ??
        DEFAULT_PRODUCTION_REQUIRED_CAPABILITIES
    ).request({
      activationId: (this.options.idFactory ?? randomUUID)(),
      nonceDigest: (this.options.nonceDigestFactory ?? randomUUID)(),
      purpose,
      configurationGenerationId: context.configurationGenerationId,
      effectiveRouteSetId: context.effectiveRouteSetId,
      workerOwnerId: worker.owner_id,
      workerFencingToken: worker.fencing_token,
      writer: this.options.writer
    });
  }
}

export type RuntimeWorkerHandshakeChallengeSender = (
  activationId: string
) => boolean;

export type RuntimeWorkerHandshakeAcknowledgementSource = (
  activationId: string
) => ActivationWorkerAcknowledgement | undefined;

const writerFromSupervisor = (
  lease: SupervisorLeaseRow
): SupervisorActivationWriter => ({
  kind: "supervisor",
  supervisor_owner_id: lease.owner_id,
  supervisor_lease_epoch: lease.lease_epoch,
  supervisor_lease_state_revision: lease.lease_state_revision
});

export class RuntimeSupervisorActivationHandshakeCoordinator {
  constructor(private readonly options: {
    db: DatabaseSync;
    homeId: string;
    currentSupervisor: () => SupervisorLeaseRow;
    sendWorkerChallenge: RuntimeWorkerHandshakeChallengeSender;
    takeWorkerAcknowledgement:
      RuntimeWorkerHandshakeAcknowledgementSource;
    clock?: RuntimeProcessAuthorityClock;
  }) {}

  advance(): string {
    const activation = readPackageActivationAuthority(
      this.options.db,
      this.options.homeId
    );
    const worker = readWorkerLeaseByHome(
      this.options.db,
      this.options.homeId
    );
    if (!activation || !worker || worker.state === "stopped") {
      return "handshake_not_ready";
    }
    const supervisor = this.options.currentSupervisor();
    const purpose = handshakePurposeFor({
      activationState: activation.activation_state,
      workerMode: worker.worker_mode
    });
    if (!purpose) {
      return "handshake_not_ready";
    }
    let handshake = readCurrentHandshake({
      db: this.options.db,
      homeId: this.options.homeId,
      activationRevision: activation.activation_revision,
      worker,
      purpose,
      supervisor
    });
    if (!handshake) {
      return "handshake_not_requested";
    }
    const writer = writerFromSupervisor(supervisor);
    const repository = new RuntimeActivationHandshakeRepository(
      this.options.db,
      this.options.homeId,
      this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK
    );
    const transitions = new RuntimePackageActivationTransitionRepository(
      this.options.db,
      this.options.homeId,
      this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK
    );
    if (handshake.status === "requested") {
      if (
        purpose === "preactivation_verification" &&
        activation.activation_state === "migrating"
      ) {
        transitions.beginPreactivationVerification({
          expectedActivationRevision: activation.activation_revision,
          handshakeId: handshake.activation_id,
          expectedWorkerOwnerId: worker.owner_id,
          expectedWorkerFencingToken: worker.fencing_token,
          writer
        });
      }
      handshake = repository.acknowledgeSupervisor({
        activationId: handshake.activation_id,
        expectedStateRevision: handshake.state_revision,
        writer
      });
      this.options.sendWorkerChallenge(handshake.activation_id);
      return "supervisor_acknowledged";
    }
    if (handshake.status === "supervisor_acknowledged") {
      const acknowledgement = this.options.takeWorkerAcknowledgement(
        handshake.activation_id
      );
      if (!acknowledgement) {
        this.options.sendWorkerChallenge(handshake.activation_id);
        return "worker_acknowledgement_pending";
      }
      handshake = repository.acknowledgeWorker({
        activationId: handshake.activation_id,
        expectedStateRevision: handshake.state_revision,
        acknowledgement,
        writer
      });
    }
    if (handshake.status === "worker_acknowledged") {
      handshake = repository.complete({
        activationId: handshake.activation_id,
        expectedStateRevision: handshake.state_revision,
        writer
      });
    }
    if (handshake.status !== "complete") {
      return `handshake_${handshake.status}`;
    }
    const currentActivation = readPackageActivationAuthority(
      this.options.db,
      this.options.homeId
    );
    if (!currentActivation) {
      return "handshake_package_missing";
    }
    if (purpose === "preactivation_verification") {
      if (currentActivation.activation_state === "preactivation_verifying") {
        transitions.publishPendingIdentity({
          expectedActivationRevision: currentActivation.activation_revision,
          preactivationHandshakeId: handshake.activation_id,
          expectedWorkerOwnerId: worker.owner_id,
          expectedWorkerFencingToken: worker.fencing_token,
          writer
        });
        return "pending_identity_published";
      }
      return "preactivation_already_published";
    }
    if (currentActivation.activation_state === "production_activating") {
      transitions.publishProductionActive({
        expectedActivationRevision: currentActivation.activation_revision,
        productionHandshakeId: handshake.activation_id,
        expectedWorkerOwnerId: worker.owner_id,
        expectedWorkerFencingToken: worker.fencing_token,
        writer
      });
      return "production_active_published";
    }
    if (currentActivation.activation_state === "active") {
      transitions.replaceActiveProductionHandshake({
        expectedActivationRevision: currentActivation.activation_revision,
        productionHandshakeId: handshake.activation_id,
        expectedWorkerOwnerId: worker.owner_id,
        expectedWorkerFencingToken: worker.fencing_token,
        writer
      });
      return "production_handshake_replaced";
    }
    return "handshake_complete_not_publishable";
  }
}

export const RUNTIME_ACTIVATION_ORCHESTRATOR_CONTRACT = Object.freeze({
  gateway_only_requests_handshake: true,
  supervisor_only_persists_handshake_transitions: true,
  worker_acknowledges_through_ipc_only: true,
  route_authority_required_before_request: true,
  production_publication_requires_complete_handshake: true
});
