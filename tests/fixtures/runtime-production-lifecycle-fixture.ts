import type { DatabaseSync } from "node:sqlite";
import {
  CONFIGURATION_POINTER_SCHEMA_VERSION
} from "../../src/runtime/configuration/constants.js";
import {
  createS6ProcessProductionWriteAuthorityProvider,
  createS6WorkerAcquisitionAuthorityProvider
} from "../../src/runtime/activation/authority.js";
import {
  RuntimeActivationHandshakeRepository
} from "../../src/runtime/activation/handshake.js";
import {
  RuntimePackageActivationRepository
} from "../../src/runtime/activation/repository.js";
import {
  RuntimePackageActivationTransitionRepository
} from "../../src/runtime/activation/transitions.js";
import type {
  ActivationHandshakeRow,
  ActivationWorkerAcknowledgement,
  PackageActivationAuthorityRow,
  SupervisorActivationWriter,
  RuntimeCapabilityRouteAuthorityProvider,
  VerifiedPackageClosureEvidence
} from "../../src/runtime/activation/types.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  RuntimeLaunchAttemptRepository
} from "../../src/runtime/process/launch-authority.js";
import {
  RuntimeSupervisorAuthorityRepository
} from "../../src/runtime/process/supervisor-authority.js";
import {
  RuntimeWorkerAuthorityRepository
} from "../../src/runtime/process/worker-authority.js";
import type {
  ExpectedSupervisorAuthority,
  ExpectedWorkerAuthority,
  SupervisorLeaseRow,
  WorkerLeaseRow
} from "../../src/runtime/process/types.js";
import {
  createRuntimeProcessAuthorityDatabase,
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START,
  seedGatewayHeartbeat
} from "./runtime-process-authority-fixture.js";

export const PRODUCTION_FIXTURE_CONFIGURATION_ID =
  "configuration-production-lifecycle-test";
export const PRODUCTION_FIXTURE_ROUTE_SET_ID =
  "routes-production-lifecycle-test";
export const PRODUCTION_FIXTURE_PREACTIVATION_ID =
  "preactivation-production-lifecycle-test";
export const PRODUCTION_FIXTURE_ACTIVATION_ID =
  "production-activation-lifecycle-test";

const fixedClock = () => createFixedProcessAuthorityClock(PROCESS_FIXTURE_START);

export const createFixtureRouteAuthorityProvider = (
  observedAt = PROCESS_FIXTURE_START
): RuntimeCapabilityRouteAuthorityProvider => ({
  getCapabilityRouteAuthorityInTransaction(input) {
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-capability-route-authority-v1",
      home_id: input.homeId,
      configuration_generation_id: input.configurationGenerationId,
      package_generation_id: input.packageGenerationId,
      effective_route_set_id: input.effectiveRouteSetId,
      effective_route_revision: 1,
      capability: input.capability,
      route_fingerprint: `fixture-route-${input.capability}`,
      validation_current: true,
      observed_at: observedAt,
      expires_at: new Date(new Date(observedAt).getTime() + 15_000).toISOString()
    };
  }
});

export const PROCESS_FIXTURE_PACKAGE_CLOSURE: VerifiedPackageClosureEvidence = {
  verified: true,
  package_identity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
  closure_manifest_digest: "closure-process-production-lifecycle-test",
  evidence_class: "source_repo",
  verified_at: PROCESS_FIXTURE_START
};

export const seedProductionConfiguration = (db: DatabaseSync): void => {
  db.prepare(
    `INSERT INTO configuration_generations (
      generation_id,
      home_id,
      parent_generation_id,
      manifest_digest,
      integrity_key_id,
      profile_registry_digest,
      created_by_instance_id,
      created_at,
      committed_at,
      generation_state
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'committed')`
  ).run(
    PRODUCTION_FIXTURE_CONFIGURATION_ID,
    PROCESS_FIXTURE_HOME_ID,
    "manifest-production-lifecycle-test",
    "integrity-key-test",
    PROCESS_FIXTURE_PACKAGE_IDENTITY.profile_registry_digest,
    PROCESS_FIXTURE_GATEWAY_ID,
    PROCESS_FIXTURE_START,
    PROCESS_FIXTURE_START
  );
  db.prepare(
    `INSERT INTO configuration_pointer (
      home_id,
      pointer_schema_version,
      pointer_revision,
      generation_id,
      previous_generation_id,
      manifest_digest,
      commit_id,
      committed_at
    ) VALUES (?, ?, 1, ?, NULL, ?, ?, ?)`
  ).run(
    PROCESS_FIXTURE_HOME_ID,
    CONFIGURATION_POINTER_SCHEMA_VERSION,
    PRODUCTION_FIXTURE_CONFIGURATION_ID,
    "manifest-production-lifecycle-test",
    "commit-production-lifecycle-test",
    PROCESS_FIXTURE_START
  );
};

export const expectedSupervisorFromLease = (
  lease: SupervisorLeaseRow
): ExpectedSupervisorAuthority => ({
  owner_id: lease.owner_id,
  owner_process_id: lease.owner_process_id,
  owner_process_start_token: lease.owner_process_start_token,
  lease_epoch: lease.lease_epoch,
  lease_state_revision: lease.lease_state_revision
});

export const supervisorWriterFromLease = (
  lease: SupervisorLeaseRow
): SupervisorActivationWriter => ({
  kind: "supervisor",
  supervisor_owner_id: lease.owner_id,
  supervisor_lease_epoch: lease.lease_epoch,
  supervisor_lease_state_revision: lease.lease_state_revision
});

export const expectedWorkerFromLease = (
  worker: WorkerLeaseRow
): ExpectedWorkerAuthority => ({
  owner_id: worker.owner_id,
  owner_process_id: worker.owner_process_id,
  owner_process_start_token: worker.owner_process_start_token,
  fencing_token: worker.fencing_token
});

export const acknowledgementFromHandshake = (
  handshake: ActivationHandshakeRow
): ActivationWorkerAcknowledgement => ({
  activation_id: handshake.activation_id,
  nonce_digest: handshake.nonce_digest,
  home_id: handshake.home_id,
  worker_owner_id: handshake.worker_owner_id,
  worker_fencing_token: handshake.worker_fencing_token,
  worker_mode: handshake.worker_mode,
  schema_version: handshake.schema_version,
  configuration_generation_id: handshake.configuration_generation_id,
  effective_route_set_id: handshake.effective_route_set_id,
  package_generation_id: handshake.plugin_package_generation_id,
  current_activation_revision: handshake.current_activation_revision,
  launch_activation_revision_at_consumption:
    handshake.launch_activation_revision_at_consumption,
  launch_authorization_id: handshake.launch_authorization_id,
  launch_authorization_revision: handshake.launch_authorization_revision,
  launch_authorization_state_revision_at_consumption:
    handshake.launch_authorization_state_revision_at_consumption,
  launch_authorization_role: handshake.launch_authorization_role,
  supervisor_launch_attempt_id: handshake.supervisor_launch_attempt_id
});

export type RuntimeProductionLifecycleFixture = {
  db: DatabaseSync;
  activation: PackageActivationAuthorityRow;
  supervisorLease: SupervisorLeaseRow;
  productionWorker: WorkerLeaseRow;
  productionHandshake: ActivationHandshakeRow;
  workerRepository: RuntimeWorkerAuthorityRepository;
  handshakeRepository: RuntimeActivationHandshakeRepository;
  transitionRepository: RuntimePackageActivationTransitionRepository;
};

export const createRuntimeProductionLifecycleFixture = (): RuntimeProductionLifecycleFixture => {
  const db = createRuntimeProcessAuthorityDatabase();
  seedGatewayHeartbeat(db);
  seedProductionConfiguration(db);
  const activationRepository = new RuntimePackageActivationRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    fixedClock()
  );
  const initialized = activationRepository.initializePackageActivation({
    expectedActivationRevision: 0,
    expectedLaunchRevision: 0,
    authorizationId: "authorization-production-lifecycle-test",
    packageClosure: PROCESS_FIXTURE_PACKAGE_CLOSURE,
    writer: {
      kind: "gateway_service_controller",
      gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
      gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
      plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
    }
  });
  const attempts = new RuntimeLaunchAttemptRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    fixedClock()
  );
  const reserved = attempts.reserveByConsumingAuthorization({
    authorizationId: initialized.authorization.launch_authorization_id,
    expectedAuthorizationRevision:
      initialized.authorization.authorization_revision,
    expectedAuthorizationStateRevision:
      initialized.authorization.authorization_state_revision,
    attemptId: "attempt-production-lifecycle-test",
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    authorizationRole: "initial_candidate",
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    expectedLaunchRevision: initialized.launchState.launch_revision
  });
  const bound = attempts.bindChildIdentity({
    attemptId: reserved.attempt.launch_attempt_id,
    expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
    expectedLaunchRevision: reserved.launchState.launch_revision,
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    childProcessId: 8201,
    childProcessStartToken: "supervisor-process-production-lifecycle-test"
  });
  const currentLaunch = db.prepare(
    "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
  ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
  const supervisorLease = new RuntimeSupervisorAuthorityRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    fixedClock()
  ).acquireFromBoundAttempt({
    leaseKey: "supervisor-lease-production-lifecycle-test",
    ownerId: "supervisor-production-lifecycle-test",
    ownerProcessId: bound.child_process_id!,
    ownerProcessStartToken: bound.child_process_start_token!,
    packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
    attemptId: bound.launch_attempt_id,
    expectedAttemptStateRevision: bound.attempt_state_revision,
    expectedLaunchRevision: currentLaunch.launch_revision,
    expectedAuthorizationRevision:
      initialized.authorization.authorization_revision,
    expectedAuthorizationStateRevision:
      reserved.attempt.launch_authorization_state_revision_at_consumption
  });
  const transitionRepository = new RuntimePackageActivationTransitionRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    fixedClock()
  );
  const supervisorWriter = supervisorWriterFromLease(supervisorLease);
  transitionRepository.enterMigrating({
    expectedActivationRevision: initialized.activation.activation_revision,
    writer: supervisorWriter
  });
  const workerRepository = new RuntimeWorkerAuthorityRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    createS6WorkerAcquisitionAuthorityProvider(fixedClock()),
    createS6ProcessProductionWriteAuthorityProvider(
      fixedClock(),
      createFixtureRouteAuthorityProvider()
    ),
    fixedClock()
  );
  const activationWorkerStarting = workerRepository.acquire({
    leaseKey: "worker-activation-production-lifecycle-test",
    ownerId: "worker-activation-production-lifecycle-test",
    ownerProcessId: 8301,
    ownerProcessStartToken: "worker-activation-start-production-lifecycle-test",
    expectedSupervisor: expectedSupervisorFromLease(supervisorLease),
    packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
    schemaVersion: "legacy-learning-v0",
    workerMode: "activation_only",
    transitionRole: "initial_candidate"
  });
  const activationWorker = workerRepository.renew({
    expectedWorker: expectedWorkerFromLease(activationWorkerStarting),
    expectedSupervisor: expectedSupervisorFromLease(supervisorLease),
    nextState: "active"
  });
  const handshakeRepository = new RuntimeActivationHandshakeRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    fixedClock(),
    createFixtureRouteAuthorityProvider()
  );
  const requestedPreactivation = handshakeRepository.request({
    activationId: PRODUCTION_FIXTURE_PREACTIVATION_ID,
    nonceDigest: "nonce-preactivation-production-lifecycle-test",
    purpose: "preactivation_verification",
    configurationGenerationId: PRODUCTION_FIXTURE_CONFIGURATION_ID,
    effectiveRouteSetId: PRODUCTION_FIXTURE_ROUTE_SET_ID,
    workerOwnerId: activationWorker.owner_id,
    workerFencingToken: activationWorker.fencing_token,
    writer: {
      kind: "gateway_service_controller",
      gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
      gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
      plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
    }
  });
  transitionRepository.beginPreactivationVerification({
    expectedActivationRevision: initialized.activation.activation_revision,
    handshakeId: requestedPreactivation.activation_id,
    expectedWorkerOwnerId: activationWorker.owner_id,
    expectedWorkerFencingToken: activationWorker.fencing_token,
    writer: supervisorWriter
  });
  const supervisorAcknowledgedPreactivation =
    handshakeRepository.acknowledgeSupervisor({
      activationId: requestedPreactivation.activation_id,
      expectedStateRevision: requestedPreactivation.state_revision,
      writer: supervisorWriter
    });
  const workerAcknowledgedPreactivation = handshakeRepository.acknowledgeWorker({
    activationId: requestedPreactivation.activation_id,
    expectedStateRevision: supervisorAcknowledgedPreactivation.state_revision,
    acknowledgement: acknowledgementFromHandshake(
      supervisorAcknowledgedPreactivation
    ),
    writer: supervisorWriter
  });
  const completePreactivation = handshakeRepository.complete({
    activationId: requestedPreactivation.activation_id,
    expectedStateRevision: workerAcknowledgedPreactivation.state_revision,
    writer: supervisorWriter
  });
  const productionActivating = transitionRepository.publishPendingIdentity({
    expectedActivationRevision: initialized.activation.activation_revision,
    preactivationHandshakeId: completePreactivation.activation_id,
    expectedWorkerOwnerId: activationWorker.owner_id,
    expectedWorkerFencingToken: activationWorker.fencing_token,
    writer: supervisorWriter
  });
  const productionWorkerStarting = workerRepository.acquire({
    leaseKey: "worker-production-lifecycle-test",
    ownerId: "worker-production-lifecycle-test",
    ownerProcessId: 8401,
    ownerProcessStartToken: "worker-production-start-lifecycle-test",
    expectedSupervisor: expectedSupervisorFromLease(supervisorLease),
    packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
    schemaVersion: "legacy-learning-v0",
    workerMode: "production",
    transitionRole: "initial_candidate"
  });
  const productionWorker = workerRepository.renew({
    expectedWorker: expectedWorkerFromLease(productionWorkerStarting),
    expectedSupervisor: expectedSupervisorFromLease(supervisorLease),
    nextState: "active"
  });
  const requestedProduction = handshakeRepository.request({
    activationId: PRODUCTION_FIXTURE_ACTIVATION_ID,
    nonceDigest: "nonce-production-activation-lifecycle-test",
    purpose: "production_activation",
    configurationGenerationId: PRODUCTION_FIXTURE_CONFIGURATION_ID,
    effectiveRouteSetId: PRODUCTION_FIXTURE_ROUTE_SET_ID,
    workerOwnerId: productionWorker.owner_id,
    workerFencingToken: productionWorker.fencing_token,
    writer: {
      kind: "gateway_service_controller",
      gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
      gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
      plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
    }
  });
  const supervisorAcknowledgedProduction = handshakeRepository.acknowledgeSupervisor({
    activationId: requestedProduction.activation_id,
    expectedStateRevision: requestedProduction.state_revision,
    writer: supervisorWriter
  });
  const workerAcknowledgedProduction = handshakeRepository.acknowledgeWorker({
    activationId: requestedProduction.activation_id,
    expectedStateRevision: supervisorAcknowledgedProduction.state_revision,
    acknowledgement: acknowledgementFromHandshake(supervisorAcknowledgedProduction),
    writer: supervisorWriter
  });
  const productionHandshake = handshakeRepository.complete({
    activationId: requestedProduction.activation_id,
    expectedStateRevision: workerAcknowledgedProduction.state_revision,
    writer: supervisorWriter
  });
  const activation = transitionRepository.publishProductionActive({
    expectedActivationRevision: productionActivating.activation_revision,
    productionHandshakeId: productionHandshake.activation_id,
    expectedWorkerOwnerId: productionWorker.owner_id,
    expectedWorkerFencingToken: productionWorker.fencing_token,
    writer: supervisorWriter
  });
  return {
    db,
    activation,
    supervisorLease,
    productionWorker,
    productionHandshake,
    workerRepository,
    handshakeRepository,
    transitionRepository
  };
};
