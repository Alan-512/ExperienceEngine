import { describe, expect, it } from "vitest";
import {
  createS6LearningQueueProductionWriteAuthorityProvider,
  createS6ProcessProductionWriteAuthorityProvider,
  createS6WorkerAcquisitionAuthorityProvider
} from "../../src/runtime/activation/authority.js";
import {
  RuntimePackageActivationControlService
} from "../../src/runtime/activation/control.js";
import {
  RuntimeActivationHandshakeRepository
} from "../../src/runtime/activation/handshake.js";
import {
  RuntimePackageActivationTransitionRepository
} from "../../src/runtime/activation/transitions.js";
import type {
  RuntimeCapabilityRouteAuthorityProvider,
  VerifiedPackageClosureEvidence
} from "../../src/runtime/activation/types.js";
import {
  requireProductionWriteAuthorityInTransaction
} from "../../src/runtime/learning-queue/authority.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  GatewayHeartbeatRepository
} from "../../src/runtime/process/gateway-heartbeat.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../../src/runtime/process/fresh-supervisor-authority.js";
import {
  RuntimeLaunchAttemptRepository
} from "../../src/runtime/process/launch-authority.js";
import {
  RuntimeSupervisorAuthorityRepository
} from "../../src/runtime/process/supervisor-authority.js";
import {
  RuntimeWorkerAuthorityRepository
} from "../../src/runtime/process/worker-authority.js";
import {
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";
import {
  acknowledgementFromHandshake,
  createFixtureRouteAuthorityProvider,
  createRuntimeProductionLifecycleFixture,
  expectedSupervisorFromLease,
  expectedWorkerFromLease,
  PRODUCTION_FIXTURE_CONFIGURATION_ID,
  PRODUCTION_FIXTURE_ROUTE_SET_ID,
  supervisorWriterFromLease
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY
} from "../fixtures/runtime-process-authority-fixture.js";

const UPGRADE_TIME = "2026-07-12T00:00:01.000Z";
const UPGRADE_GATEWAY_ID = "gateway-upgrade-production-test";
const UPGRADE_GATEWAY_START = "gateway-upgrade-start-production-test";
const UPGRADE_PACKAGE_ID = "pkg-upgrade-production-test";

const UPGRADE_PACKAGE_IDENTITY = {
  ...PROCESS_FIXTURE_PACKAGE_IDENTITY,
  package_version: "0.4.9-test",
  package_generation_id: UPGRADE_PACKAGE_ID,
  artifact_integrity: "artifact-upgrade-production-test",
  install_record_identity: "install-upgrade-production-test"
};

const UPGRADE_PACKAGE_CLOSURE: VerifiedPackageClosureEvidence = {
  verified: true,
  package_identity: UPGRADE_PACKAGE_IDENTITY,
  closure_manifest_digest: "closure-upgrade-production-test",
  evidence_class: "source_repo",
  verified_at: UPGRADE_TIME
};

const upgradeGatewayWriter = () => ({
  kind: "gateway_service_controller" as const,
  gateway_instance_id: UPGRADE_GATEWAY_ID,
  gateway_process_start_token: UPGRADE_GATEWAY_START,
  plugin_package_generation_id: UPGRADE_PACKAGE_ID
});

const routeProvider: RuntimeCapabilityRouteAuthorityProvider = {
  getCapabilityRouteAuthorityInTransaction(input) {
    return {
      available: true,
      fresh: true,
      authority_contract_version: "s6-capability-route-authority-v1",
      home_id: input.homeId,
      configuration_generation_id: input.configurationGenerationId,
      package_generation_id: input.packageGenerationId,
      effective_route_set_id: input.effectiveRouteSetId,
      effective_route_revision: 7,
      capability: input.capability,
      route_fingerprint: `route-${input.packageGenerationId}`,
      validation_current: true,
      observed_at: UPGRADE_TIME,
      expires_at: "2026-07-12T00:00:15.000Z"
    };
  }
};

describe("runtime production package upgrade", () => {
  it("drains the old generation with bounded completion authority and activates the verified pending generation", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      new GatewayHeartbeatRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      ).publish({
        gatewayInstanceId: UPGRADE_GATEWAY_ID,
        gatewayProcessId: 9201,
        gatewayProcessStartToken: UPGRADE_GATEWAY_START,
        packageGenerationId: UPGRADE_PACKAGE_ID,
        heartbeatDurationMs: 3_600_000
      });
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      );
      const oldSupervisorWriter = supervisorWriterFromLease(fixture.supervisorLease);
      const freshBeforePrepare = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => evaluateFreshSupervisorAuthorityInTransaction({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          observedAt: UPGRADE_TIME
        })
      });
      expect(freshBeforePrepare).toMatchObject({
        available: true,
        fresh: true,
        supervisor_owner_id: oldSupervisorWriter.supervisor_owner_id,
        supervisor_lease_epoch: oldSupervisorWriter.supervisor_lease_epoch,
        supervisor_lease_state_revision:
          oldSupervisorWriter.supervisor_lease_state_revision
      });
      const launchBeforePrepare = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const prepared = service.preparePackageGeneration({
        controlRequestId: "control-prepare-upgrade-test",
        expectedProjectionRevision: fixture.activation.activation_revision,
        expectedGatewayInstanceId: UPGRADE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        authorizationId: "authorization-upgrade-pending-test",
        expectedLaunchRevision: launchBeforePrepare.launch_revision,
        packageClosure: UPGRADE_PACKAGE_CLOSURE,
        writer: oldSupervisorWriter
      });
      expect(prepared.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 3,
        result_code: "package_generation_prepared"
      });
      const preparing = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(preparing).toMatchObject({
        activation_revision: 3,
        activation_state: "preparing",
        active_package_generation_id:
          PROCESS_FIXTURE_PACKAGE_IDENTITY.package_generation_id,
        pending_package_generation_id: UPGRADE_PACKAGE_ID,
        previous_package_generation_id:
          PROCESS_FIXTURE_PACKAGE_IDENTITY.package_generation_id,
        pending_transition_kind: "upgrade",
        production_activation_handshake_id:
          fixture.productionHandshake.activation_id,
        launch_authorization_id: "authorization-upgrade-pending-test",
        launch_authorization_role: "pending"
      });

      service.requestDrain({
        controlRequestId: "control-request-upgrade-drain-test",
        expectedProjectionRevision: 3,
        expectedGatewayInstanceId: UPGRADE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        expectedWorkerOwnerId: fixture.productionWorker.owner_id,
        expectedWorkerFencingToken: fixture.productionWorker.fencing_token,
        writer: oldSupervisorWriter
      });
      const drainingWorker = fixture.db.prepare(
        "SELECT * FROM worker_leases WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as typeof fixture.productionWorker;
      expect(drainingWorker).toMatchObject({
        state: "draining",
        worker_mode: "production",
        package_generation_id:
          PROCESS_FIXTURE_PACKAGE_IDENTITY.package_generation_id
      });
      expect(drainingWorker.drain_deadline_at).not.toBeNull();

      const drainingRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createS6WorkerAcquisitionAuthorityProvider(
          createFixedProcessAuthorityClock(UPGRADE_TIME)
        ),
        createS6ProcessProductionWriteAuthorityProvider(
          createFixedProcessAuthorityClock(UPGRADE_TIME),
          createFixtureRouteAuthorityProvider(UPGRADE_TIME)
        ),
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      );
      expect(() => drainingRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(drainingWorker),
        operation: "queue_claim"
      })).toThrowError(/remain disabled until exact S6 production authority is current/u);
      expect(() => drainingRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(drainingWorker),
        operation: "queue_renew"
      })).toThrowError(/remain disabled until exact S6 production authority is current/u);
      expect(() => drainingRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(drainingWorker),
        operation: "queue_complete"
      })).toThrowError(/remain disabled until exact S6 production authority is current/u);

      const queueProvider = createS6LearningQueueProductionWriteAuthorityProvider({
        routeAuthorityProvider: routeProvider,
        clock: createFixedProcessAuthorityClock(UPGRADE_TIME)
      });
      expect(() => runRuntimeImmediateTransaction(fixture.db, {
        category: "protected_result_commit",
        operation: () => requireProductionWriteAuthorityInTransaction({
          db: fixture.db,
          provider: queueProvider,
          operation: "new_claim",
          homeId: PROCESS_FIXTURE_HOME_ID,
          now: UPGRADE_TIME
        })
      })).toThrowError(/unavailable for this queue operation/u);
      expect(() => runRuntimeImmediateTransaction(fixture.db, {
        category: "protected_result_commit",
        operation: () => requireProductionWriteAuthorityInTransaction({
          db: fixture.db,
          provider: queueProvider,
          operation: "semantic_completion",
          homeId: PROCESS_FIXTURE_HOME_ID,
          now: UPGRADE_TIME
        })
      })).toThrowError(/unavailable for this queue operation/u);

      const stoppedOldWorker = drainingRepository.release({
        expectedWorker: expectedWorkerFromLease(drainingWorker),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease)
      });
      expect(stoppedOldWorker.state).toBe("stopped");
      const oldAttempt = fixture.db.prepare(
        `SELECT attempt_state_revision
         FROM supervisor_launch_attempts
         WHERE home_id = ? AND launch_attempt_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        fixture.supervisorLease.launch_attempt_id
      ) as { attempt_state_revision: number };
      const launchBeforeRelease = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      ).gracefulRelease({
        expected: expectedSupervisorFromLease(fixture.supervisorLease),
        expectedAttemptStateRevision: oldAttempt.attempt_state_revision,
        expectedLaunchRevision: launchBeforeRelease.launch_revision
      });

      const activationWithPendingAuthorization = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as {
        launch_authorization_id: string;
        launch_authorization_revision: number;
        launch_authorization_state_revision: number;
      };
      const launchAfterRelease = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const attempts = new RuntimeLaunchAttemptRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      );
      const reserved = attempts.reserveByConsumingAuthorization({
        authorizationId:
          activationWithPendingAuthorization.launch_authorization_id,
        expectedAuthorizationRevision:
          activationWithPendingAuthorization.launch_authorization_revision,
        expectedAuthorizationStateRevision:
          activationWithPendingAuthorization.launch_authorization_state_revision,
        attemptId: "attempt-upgrade-pending-test",
        packageGenerationId: UPGRADE_PACKAGE_ID,
        authorizationRole: "pending",
        gatewayInstanceId: UPGRADE_GATEWAY_ID,
        gatewayProcessStartToken: UPGRADE_GATEWAY_START,
        expectedLaunchRevision: launchAfterRelease.launch_revision
      });
      const bound = attempts.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: UPGRADE_GATEWAY_ID,
        gatewayProcessStartToken: UPGRADE_GATEWAY_START,
        packageGenerationId: UPGRADE_PACKAGE_ID,
        childProcessId: 9301,
        childProcessStartToken: "supervisor-upgrade-child-start-test"
      });
      const launchForNewSupervisor = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const newSupervisor = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      ).acquireFromBoundAttempt({
        leaseKey: "supervisor-lease-upgrade-test",
        ownerId: "supervisor-upgrade-test",
        ownerProcessId: bound.child_process_id!,
        ownerProcessStartToken: bound.child_process_start_token!,
        packageIdentity: UPGRADE_PACKAGE_IDENTITY,
        attemptId: bound.launch_attempt_id,
        expectedAttemptStateRevision: bound.attempt_state_revision,
        expectedLaunchRevision: launchForNewSupervisor.launch_revision,
        expectedAuthorizationRevision:
          activationWithPendingAuthorization.launch_authorization_revision,
        expectedAuthorizationStateRevision:
          reserved.attempt.launch_authorization_state_revision_at_consumption
      });
      const transitionRepository = new RuntimePackageActivationTransitionRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      );
      transitionRepository.enterMigratingAfterDrain({
        expectedActivationRevision: 3,
        writer: supervisorWriterFromLease(newSupervisor)
      });

      const newWorkerRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createS6WorkerAcquisitionAuthorityProvider(
          createFixedProcessAuthorityClock(UPGRADE_TIME)
        ),
        createS6ProcessProductionWriteAuthorityProvider(
          createFixedProcessAuthorityClock(UPGRADE_TIME),
          createFixtureRouteAuthorityProvider(UPGRADE_TIME)
        ),
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      );
      const activationWorkerStarting = newWorkerRepository.acquire({
        leaseKey: "worker-upgrade-activation-test",
        ownerId: "worker-upgrade-activation-test",
        ownerProcessId: 9401,
        ownerProcessStartToken: "worker-upgrade-activation-start-test",
        expectedSupervisor: expectedSupervisorFromLease(newSupervisor),
        packageIdentity: UPGRADE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "activation_only",
        transitionRole: "pending"
      });
      const activationWorker = newWorkerRepository.renew({
        expectedWorker: expectedWorkerFromLease(activationWorkerStarting),
        expectedSupervisor: expectedSupervisorFromLease(newSupervisor),
        nextState: "active"
      });
      const handshakeRepository = new RuntimeActivationHandshakeRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME),
        createFixtureRouteAuthorityProvider(UPGRADE_TIME)
      );
      const preactivation = handshakeRepository.request({
        activationId: "preactivation-upgrade-test",
        nonceDigest: "nonce-preactivation-upgrade-test",
        purpose: "preactivation_verification",
        configurationGenerationId: PRODUCTION_FIXTURE_CONFIGURATION_ID,
        effectiveRouteSetId: PRODUCTION_FIXTURE_ROUTE_SET_ID,
        workerOwnerId: activationWorker.owner_id,
        workerFencingToken: activationWorker.fencing_token,
        writer: upgradeGatewayWriter()
      });
      transitionRepository.beginPreactivationVerification({
        expectedActivationRevision: 3,
        handshakeId: preactivation.activation_id,
        expectedWorkerOwnerId: activationWorker.owner_id,
        expectedWorkerFencingToken: activationWorker.fencing_token,
        writer: supervisorWriterFromLease(newSupervisor)
      });
      const preSupervisor = handshakeRepository.acknowledgeSupervisor({
        activationId: preactivation.activation_id,
        expectedStateRevision: preactivation.state_revision,
        writer: supervisorWriterFromLease(newSupervisor)
      });
      const preWorker = handshakeRepository.acknowledgeWorker({
        activationId: preactivation.activation_id,
        expectedStateRevision: preSupervisor.state_revision,
        acknowledgement: acknowledgementFromHandshake(preSupervisor),
        writer: supervisorWriterFromLease(newSupervisor)
      });
      const preComplete = handshakeRepository.complete({
        activationId: preactivation.activation_id,
        expectedStateRevision: preWorker.state_revision,
        writer: supervisorWriterFromLease(newSupervisor)
      });
      const productionActivating = transitionRepository.publishPendingIdentity({
        expectedActivationRevision: 3,
        preactivationHandshakeId: preComplete.activation_id,
        expectedWorkerOwnerId: activationWorker.owner_id,
        expectedWorkerFencingToken: activationWorker.fencing_token,
        writer: supervisorWriterFromLease(newSupervisor)
      });
      expect(productionActivating).toMatchObject({
        activation_revision: 4,
        activation_state: "production_activating",
        active_package_generation_id: UPGRADE_PACKAGE_ID,
        previous_package_generation_id:
          PROCESS_FIXTURE_PACKAGE_IDENTITY.package_generation_id,
        pending_package_generation_id: null
      });

      const productionWorkerStarting = newWorkerRepository.acquire({
        leaseKey: "worker-upgrade-production-test",
        ownerId: "worker-upgrade-production-test",
        ownerProcessId: 9501,
        ownerProcessStartToken: "worker-upgrade-production-start-test",
        expectedSupervisor: expectedSupervisorFromLease(newSupervisor),
        packageIdentity: UPGRADE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "production",
        transitionRole: "pending"
      });
      const productionWorker = newWorkerRepository.renew({
        expectedWorker: expectedWorkerFromLease(productionWorkerStarting),
        expectedSupervisor: expectedSupervisorFromLease(newSupervisor),
        nextState: "active"
      });
      const productionHandshakeRequested = handshakeRepository.request({
        activationId: "production-activation-upgrade-test",
        nonceDigest: "nonce-production-activation-upgrade-test",
        purpose: "production_activation",
        configurationGenerationId: PRODUCTION_FIXTURE_CONFIGURATION_ID,
        effectiveRouteSetId: PRODUCTION_FIXTURE_ROUTE_SET_ID,
        workerOwnerId: productionWorker.owner_id,
        workerFencingToken: productionWorker.fencing_token,
        writer: upgradeGatewayWriter()
      });
      const productionSupervisor = handshakeRepository.acknowledgeSupervisor({
        activationId: productionHandshakeRequested.activation_id,
        expectedStateRevision: productionHandshakeRequested.state_revision,
        writer: supervisorWriterFromLease(newSupervisor)
      });
      const productionWorkerAck = handshakeRepository.acknowledgeWorker({
        activationId: productionHandshakeRequested.activation_id,
        expectedStateRevision: productionSupervisor.state_revision,
        acknowledgement: acknowledgementFromHandshake(productionSupervisor),
        writer: supervisorWriterFromLease(newSupervisor)
      });
      const productionComplete = handshakeRepository.complete({
        activationId: productionHandshakeRequested.activation_id,
        expectedStateRevision: productionWorkerAck.state_revision,
        writer: supervisorWriterFromLease(newSupervisor)
      });
      const active = transitionRepository.publishProductionActive({
        expectedActivationRevision: 4,
        productionHandshakeId: productionComplete.activation_id,
        expectedWorkerOwnerId: productionWorker.owner_id,
        expectedWorkerFencingToken: productionWorker.fencing_token,
        writer: supervisorWriterFromLease(newSupervisor)
      });
      expect(active).toMatchObject({
        activation_revision: 4,
        activation_state: "active",
        active_package_generation_id: UPGRADE_PACKAGE_ID,
        previous_package_generation_id:
          PROCESS_FIXTURE_PACKAGE_IDENTITY.package_generation_id,
        production_activation_handshake_id:
          productionComplete.activation_id
      });
    } finally {
      fixture.db.close();
    }
  });
});
