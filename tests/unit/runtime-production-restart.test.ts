import { describe, expect, it } from "vitest";
import {
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
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

describe("runtime production active restart", () => {
  it("keeps package identity and activation revision while replacing supervisor, worker fence, and production handshake", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.workerRepository.release({
        expectedWorker: expectedWorkerFromLease(fixture.productionWorker),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease)
      });
      const attempt = fixture.db.prepare(
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
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).gracefulRelease({
        expected: expectedSupervisorFromLease(fixture.supervisorLease),
        expectedAttemptStateRevision: attempt.attempt_state_revision,
        expectedLaunchRevision: launchBeforeRelease.launch_revision
      });

      const launchAfterRelease = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const issued = service.issueActiveRestartAuthorization({
        controlRequestId: "control-active-restart-test",
        expectedProjectionRevision: fixture.activation.activation_revision,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        authorizationId: "authorization-active-restart-test",
        expectedLaunchRevision: launchAfterRelease.launch_revision,
        writer: {
          kind: "gateway_service_controller",
          gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
          gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
          plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
        }
      });
      expect(issued.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: fixture.activation.activation_revision,
        result_code: "active_restart_authorization_issued"
      });
      const activationAfterIssue = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activationAfterIssue).toMatchObject({
        activation_revision: fixture.activation.activation_revision,
        activation_state: "active",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        production_activation_handshake_id:
          fixture.productionHandshake.activation_id,
        launch_authorization_id: "authorization-active-restart-test",
        launch_authorization_role: "active",
        launch_authorization_state: "issued"
      });

      const launchForAttempt = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const activationProjection = fixture.db.prepare(
        `SELECT launch_authorization_revision,
                launch_authorization_state_revision
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as {
        launch_authorization_revision: number;
        launch_authorization_state_revision: number;
      };
      const attempts = new RuntimeLaunchAttemptRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const reserved = attempts.reserveByConsumingAuthorization({
        authorizationId: "authorization-active-restart-test",
        expectedAuthorizationRevision:
          activationProjection.launch_authorization_revision,
        expectedAuthorizationStateRevision:
          activationProjection.launch_authorization_state_revision,
        attemptId: "attempt-active-restart-test",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "active",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: launchForAttempt.launch_revision
      });
      const bound = attempts.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        childProcessId: 9601,
        childProcessStartToken: "supervisor-active-restart-start-test"
      });
      const launchForSupervisor = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const restartedSupervisor = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).acquireFromBoundAttempt({
        leaseKey: "supervisor-lease-active-restart-test",
        ownerId: "supervisor-active-restart-test",
        ownerProcessId: bound.child_process_id!,
        ownerProcessStartToken: bound.child_process_start_token!,
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        attemptId: bound.launch_attempt_id,
        expectedAttemptStateRevision: bound.attempt_state_revision,
        expectedLaunchRevision: launchForSupervisor.launch_revision,
        expectedAuthorizationRevision:
          activationProjection.launch_authorization_revision,
        expectedAuthorizationStateRevision:
          reserved.attempt.launch_authorization_state_revision_at_consumption
      });
      const workerRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createS6WorkerAcquisitionAuthorityProvider(
          createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
        ),
        createS6ProcessProductionWriteAuthorityProvider(
          createFixedProcessAuthorityClock(PROCESS_FIXTURE_START),
          createFixtureRouteAuthorityProvider()
        ),
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const startingWorker = workerRepository.acquire({
        leaseKey: "worker-active-restart-test",
        ownerId: "worker-active-restart-test",
        ownerProcessId: 9701,
        ownerProcessStartToken: "worker-active-restart-start-test",
        expectedSupervisor: expectedSupervisorFromLease(restartedSupervisor),
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "production",
        transitionRole: "active"
      });
      const productionWorker = workerRepository.renew({
        expectedWorker: expectedWorkerFromLease(startingWorker),
        expectedSupervisor: expectedSupervisorFromLease(restartedSupervisor),
        nextState: "active"
      });
      expect(productionWorker.fencing_token).toBeGreaterThan(
        fixture.productionWorker.fencing_token
      );

      const handshakes = new RuntimeActivationHandshakeRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START),
        createFixtureRouteAuthorityProvider()
      );
      const requested = handshakes.request({
        activationId: "production-handshake-active-restart-test",
        nonceDigest: "nonce-active-restart-test",
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
      const writer = supervisorWriterFromLease(restartedSupervisor);
      const supervisorAck = handshakes.acknowledgeSupervisor({
        activationId: requested.activation_id,
        expectedStateRevision: requested.state_revision,
        writer
      });
      const workerAck = handshakes.acknowledgeWorker({
        activationId: requested.activation_id,
        expectedStateRevision: supervisorAck.state_revision,
        acknowledgement: acknowledgementFromHandshake(supervisorAck),
        writer
      });
      const complete = handshakes.complete({
        activationId: requested.activation_id,
        expectedStateRevision: workerAck.state_revision,
        writer
      });
      const active = new RuntimePackageActivationTransitionRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).replaceActiveProductionHandshake({
        expectedActivationRevision: fixture.activation.activation_revision,
        productionHandshakeId: complete.activation_id,
        expectedWorkerOwnerId: productionWorker.owner_id,
        expectedWorkerFencingToken: productionWorker.fencing_token,
        writer
      });
      expect(active).toMatchObject({
        activation_revision: fixture.activation.activation_revision,
        activation_state: "active",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        production_activation_handshake_id: complete.activation_id
      });
      expect(active.production_activation_handshake_id).not.toBe(
        fixture.productionHandshake.activation_id
      );
    } finally {
      fixture.db.close();
    }
  });
});
