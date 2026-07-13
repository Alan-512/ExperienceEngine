import { describe, expect, it } from "vitest";
import {
  RuntimePackageActivationControlService,
  RuntimeControlRequestRepository
} from "../../src/runtime/activation/control.js";
import {
  RuntimePackageActivationRepository
} from "../../src/runtime/activation/repository.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  GatewayHeartbeatRepository
} from "../../src/runtime/process/gateway-heartbeat.js";
import {
  RuntimeSupervisorAuthorityRepository
} from "../../src/runtime/process/supervisor-authority.js";
import {
  ACTIVATION_FIXTURE_GATEWAY_ID,
  ACTIVATION_FIXTURE_GATEWAY_START,
  ACTIVATION_FIXTURE_HOME_ID,
  ACTIVATION_FIXTURE_NOW,
  ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
  ACTIVATION_FIXTURE_PACKAGE_ID,
  activationGatewayWriter,
  createRuntimeProductionActivationDatabase,
  readActivationFixtureRow,
  seedActivationGatewayHeartbeat
} from "../fixtures/runtime-production-activation-fixture.js";
import {
  createRuntimeProductionLifecycleFixture,
  expectedSupervisorFromLease,
  expectedWorkerFromLease,
  supervisorWriterFromLease,
  PROCESS_FIXTURE_PACKAGE_CLOSURE
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const CANCEL_UPGRADE_TIME = "2026-07-12T00:00:01.000Z";
const CANCEL_UPGRADE_GATEWAY_ID = "gateway-cancel-upgrade-test";
const CANCEL_UPGRADE_GATEWAY_START = "gateway-cancel-upgrade-start-test";
const CANCEL_UPGRADE_PACKAGE_ID = "pkg-cancel-upgrade-test";
const CANCEL_UPGRADE_CLOSURE = {
  ...PROCESS_FIXTURE_PACKAGE_CLOSURE,
  package_identity: {
    ...PROCESS_FIXTURE_PACKAGE_IDENTITY,
    package_version: "0.4.9-cancel-test",
    package_generation_id: CANCEL_UPGRADE_PACKAGE_ID,
    artifact_integrity: "artifact-cancel-upgrade-test",
    install_record_identity: "install-cancel-upgrade-test"
  },
  closure_manifest_digest: "closure-cancel-upgrade-test",
  verified_at: CANCEL_UPGRADE_TIME
};

const initializeGatewayControlledActivation = () => {
  const db = createRuntimeProductionActivationDatabase();
  seedActivationGatewayHeartbeat(db);
  const initialized = new RuntimePackageActivationRepository(
    db,
    ACTIVATION_FIXTURE_HOME_ID,
    createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
  ).initializePackageActivation({
    expectedActivationRevision: 0,
    expectedLaunchRevision: 0,
    authorizationId: "authorization-control-initial",
    packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
    writer: activationGatewayWriter()
  });
  return {
    db,
    initialized,
    service: new RuntimePackageActivationControlService(
      db,
      ACTIVATION_FIXTURE_HOME_ID,
      createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
    )
  };
};

describe("runtime production control protocol", () => {
  it("enters and cancels an initial blocked transition with replay-safe idempotency", () => {
    const fixture = initializeGatewayControlledActivation();
    try {
      const blocked = fixture.service.enterBlocked({
        controlRequestId: "control-enter-blocked-initial",
        expectedProjectionRevision:
          fixture.initialized.activation.activation_revision,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer: activationGatewayWriter()
      });
      expect(blocked).toMatchObject({
        replayed: false,
        record: {
          request_state: "completed",
          result_projection_revision: 2,
          result_code: "blocked_transition_entered"
        }
      });
      expect(readActivationFixtureRow(fixture.db)).toMatchObject({
        activation_revision: 2,
        activation_state: "blocked",
        blocked_boundary: "pre_identity_initial",
        blocked_from_state: "preparing",
        pending_package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
        active_package_generation_id: null
      });

      const replay = fixture.service.enterBlocked({
        controlRequestId: "control-enter-blocked-initial",
        expectedProjectionRevision:
          fixture.initialized.activation.activation_revision,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer: activationGatewayWriter()
      });
      expect(replay.replayed).toBe(true);
      expect(readActivationFixtureRow(fixture.db)?.activation_revision).toBe(2);

      expect(() => fixture.service.enterBlocked({
        controlRequestId: "control-enter-blocked-initial",
        expectedProjectionRevision:
          fixture.initialized.activation.activation_revision,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        failureCode: "EE_DIFFERENT_FAILURE",
        writer: activationGatewayWriter()
      })).toThrowError(/different normalized request digest/u);

      const cancelled = fixture.service.cancelPackageTransition({
        controlRequestId: "control-cancel-initial",
        expectedProjectionRevision: 2,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        writer: activationGatewayWriter()
      });
      expect(cancelled.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 3,
        result_code: "initial_package_activation_cancelled"
      });
      expect(readActivationFixtureRow(fixture.db)).toMatchObject({
        activation_revision: 3,
        activation_state: "uninitialized",
        active_package_generation_id: null,
        pending_package_generation_id: null,
        launch_authorization_id: null,
        launch_authorization_revision: 1,
        launch_authorization_state_revision: 0,
        blocked_boundary: "none"
      });
      const historicalAuthorization = fixture.db.prepare(
        `SELECT authorization_state, terminal_code
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        fixture.initialized.authorization.launch_authorization_id
      ) as Record<string, unknown>;
      expect(historicalAuthorization).toEqual({
        authorization_state: "cancelled",
        terminal_code: "package_transition_cancelled"
      });
      const launchProjection = fixture.db.prepare(
        `SELECT launch_authorization_id, launch_authorized_generation_id,
                launch_authorization_role, launch_authorization_state_revision
         FROM supervisor_launch_state WHERE home_id = ?`
      ).get(ACTIVATION_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(launchProjection).toEqual({
        launch_authorization_id: null,
        launch_authorized_generation_id: null,
        launch_authorization_role: null,
        launch_authorization_state_revision: 0
      });
    } finally {
      fixture.db.close();
    }
  });

  it("cancels a pre-identity upgrade back to the selected active generation and closes pending authority", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      new GatewayHeartbeatRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(CANCEL_UPGRADE_TIME)
      ).publish({
        gatewayInstanceId: CANCEL_UPGRADE_GATEWAY_ID,
        gatewayProcessId: 9901,
        gatewayProcessStartToken: CANCEL_UPGRADE_GATEWAY_START,
        packageGenerationId: CANCEL_UPGRADE_PACKAGE_ID,
        heartbeatDurationMs: 3_600_000
      });
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(CANCEL_UPGRADE_TIME)
      );
      const writer = supervisorWriterFromLease(fixture.supervisorLease);
      const launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      service.preparePackageGeneration({
        controlRequestId: "control-cancel-upgrade-prepare",
        expectedProjectionRevision: fixture.activation.activation_revision,
        expectedGatewayInstanceId: CANCEL_UPGRADE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        authorizationId: "authorization-cancel-upgrade-test",
        expectedLaunchRevision: launch.launch_revision,
        packageClosure: CANCEL_UPGRADE_CLOSURE,
        writer
      });
      service.enterBlocked({
        controlRequestId: "control-cancel-upgrade-block",
        expectedProjectionRevision: 3,
        expectedGatewayInstanceId: CANCEL_UPGRADE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer
      });
      const cancelled = service.cancelPackageTransition({
        controlRequestId: "control-cancel-upgrade",
        expectedProjectionRevision: 4,
        expectedGatewayInstanceId: CANCEL_UPGRADE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        writer
      });
      expect(cancelled.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 5,
        result_code: "package_transition_cancelled_to_active"
      });
      const activation = fixture.db.prepare(
        `SELECT activation_revision, activation_state,
                active_package_generation_id, pending_package_generation_id,
                pending_transition_kind, production_activation_handshake_id,
                launch_authorization_id, launch_authorization_state_revision,
                blocked_boundary
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toEqual({
        activation_revision: 5,
        activation_state: "active",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        pending_package_generation_id: null,
        pending_transition_kind: "none",
        production_activation_handshake_id:
          fixture.productionHandshake.activation_id,
        launch_authorization_id: null,
        launch_authorization_state_revision: 0,
        blocked_boundary: "none"
      });
      const pendingAuthorization = fixture.db.prepare(
        `SELECT authorization_state, terminal_code
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        "authorization-cancel-upgrade-test"
      ) as Record<string, unknown>;
      expect(pendingAuthorization).toEqual({
        authorization_state: "cancelled",
        terminal_code: "package_transition_cancelled"
      });
      const worker = fixture.db.prepare(
        `SELECT state, shutdown_requested_at, drain_deadline_at, last_failure_code
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(worker).toEqual({
        state: "stopped",
        shutdown_requested_at: CANCEL_UPGRADE_TIME,
        drain_deadline_at: null,
        last_failure_code: "package_transition_cancelled"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("cancels pre-identity rollback to production activation while preserving a current selected-generation supervisor", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_state = 'production_activating',
             activation_deadline_at = '2026-07-12T00:10:00.000Z',
             production_activation_handshake_id = NULL,
             previous_package_generation_id = 'pkg-rollback-target-test'
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID);
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const writer = supervisorWriterFromLease(fixture.supervisorLease);
      service.enterBlocked({
        controlRequestId: "control-rollback-cancel-post-block",
        expectedProjectionRevision: 2,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer
      });
      let launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      service.prepareRollback({
        controlRequestId: "control-rollback-cancel-prepare",
        expectedProjectionRevision: 3,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        authorizationId: "authorization-rollback-cancel-test",
        expectedLaunchRevision: launch.launch_revision,
        writer
      });
      service.enterBlocked({
        controlRequestId: "control-rollback-cancel-pre-block",
        expectedProjectionRevision: 4,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        failureCode: "EE_PREACTIVATION_FAILED",
        writer
      });
      const cancelled = service.cancelPackageTransition({
        controlRequestId: "control-rollback-cancel-current-supervisor",
        expectedProjectionRevision: 5,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        writer
      });
      expect(cancelled.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 6,
        result_code: "package_transition_cancelled_requires_production_handshake"
      });
      expect(fixture.db.prepare(
        `SELECT activation_state, active_package_generation_id,
                pending_package_generation_id, pending_transition_kind,
                production_activation_handshake_id, launch_authorization_id,
                blocked_boundary, activation_deadline_at
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toMatchObject({
        activation_state: "production_activating",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        pending_package_generation_id: null,
        pending_transition_kind: "none",
        production_activation_handshake_id: null,
        launch_authorization_id: null,
        blocked_boundary: "none"
      });
      launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const renewed = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).renew({
        expected: expectedSupervisorFromLease(fixture.supervisorLease),
        expectedLaunchRevision: launch.launch_revision,
        nextState: "active"
      });
      expect(renewed).toMatchObject({
        package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        state: "active",
        lease_state_revision: fixture.supervisorLease.lease_state_revision + 1
      });
    } finally {
      fixture.db.close();
    }
  });

  it("cancels pre-identity rollback through the gateway with a fresh active restart authorization", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.workerRepository.release({
        expectedWorker: expectedWorkerFromLease(fixture.productionWorker),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease)
      });
      const launchBeforeRelease = fixture.db.prepare(
        `SELECT launch_revision, current_launch_attempt_id
         FROM supervisor_launch_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as {
        launch_revision: number;
        current_launch_attempt_id: string;
      };
      const attemptBeforeRelease = fixture.db.prepare(
        `SELECT attempt_state_revision
         FROM supervisor_launch_attempts
         WHERE home_id = ? AND launch_attempt_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        launchBeforeRelease.current_launch_attempt_id
      ) as { attempt_state_revision: number };
      new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).gracefulRelease({
        expected: expectedSupervisorFromLease(fixture.supervisorLease),
        expectedAttemptStateRevision:
          attemptBeforeRelease.attempt_state_revision,
        expectedLaunchRevision: launchBeforeRelease.launch_revision
      });
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_state = 'production_activating',
             activation_deadline_at = '2026-07-12T00:10:00.000Z',
             production_activation_handshake_id = NULL,
             previous_package_generation_id = 'pkg-rollback-target-gateway-test'
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID);
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const gatewayWriter = {
        kind: "gateway_service_controller" as const,
        gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
        gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
        plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
      };
      service.enterBlocked({
        controlRequestId: "control-rollback-gateway-post-block",
        expectedProjectionRevision: 2,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer: gatewayWriter
      });
      let launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      service.prepareRollback({
        controlRequestId: "control-rollback-gateway-prepare",
        expectedProjectionRevision: 3,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        authorizationId: "authorization-rollback-gateway-target",
        expectedLaunchRevision: launch.launch_revision,
        writer: gatewayWriter
      });
      service.enterBlocked({
        controlRequestId: "control-rollback-gateway-pre-block",
        expectedProjectionRevision: 4,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        failureCode: "EE_PREACTIVATION_FAILED",
        writer: gatewayWriter
      });
      launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const cancelled = service.cancelPackageTransition({
        controlRequestId: "control-rollback-gateway-cancel",
        expectedProjectionRevision: 5,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        authorizationId: "authorization-rollback-active-restart",
        expectedLaunchRevision: launch.launch_revision,
        writer: gatewayWriter
      });
      expect(cancelled.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 6,
        result_code: "package_transition_cancelled_active_restart_authorized"
      });
      expect(fixture.db.prepare(
        `SELECT activation_state, active_package_generation_id,
                pending_package_generation_id, production_activation_handshake_id,
                launch_authorization_id, launch_authorized_generation_id,
                launch_authorization_role, launch_authorization_state,
                blocked_boundary
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        activation_state: "production_activating",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        pending_package_generation_id: null,
        production_activation_handshake_id: null,
        launch_authorization_id: "authorization-rollback-active-restart",
        launch_authorized_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        launch_authorization_role: "active",
        launch_authorization_state: "issued",
        blocked_boundary: "none"
      });
      expect(fixture.db.prepare(
        `SELECT authorization_state, terminal_code
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        "authorization-rollback-gateway-target"
      )).toEqual({
        authorization_state: "cancelled",
        terminal_code: "package_transition_cancelled"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("retries a pre-identity block with a new authorization and terminalizes the replaced issued row", () => {
    const fixture = initializeGatewayControlledActivation();
    try {
      fixture.service.enterBlocked({
        controlRequestId: "control-enter-blocked-retry",
        expectedProjectionRevision: 1,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        failureCode: "EE_SUPERVISOR_UNAVAILABLE",
        writer: activationGatewayWriter()
      });
      const retried = fixture.service.retryPackageActivation({
        controlRequestId: "control-retry-package",
        expectedProjectionRevision: 2,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        authorizationId: "authorization-control-retry",
        expectedLaunchRevision: fixture.initialized.launchState.launch_revision,
        writer: activationGatewayWriter()
      });
      expect(retried.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 3,
        result_code: "package_activation_retry_started"
      });
      expect(readActivationFixtureRow(fixture.db)).toMatchObject({
        activation_revision: 3,
        activation_state: "preparing",
        pending_package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
        pending_transition_kind: "initial",
        launch_authorization_id: "authorization-control-retry",
        launch_authorization_revision: 2,
        launch_authorization_state: "issued",
        blocked_boundary: "none"
      });
      const historical = fixture.db.prepare(
        `SELECT authorization_state, terminal_code
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        fixture.initialized.authorization.launch_authorization_id
      ) as { authorization_state: string; terminal_code: string };
      expect(historical).toEqual({
        authorization_state: "cancelled",
        terminal_code: "replaced_by_package_activation_retry"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("persists a stale rejection and replays it without applying a later state", () => {
    const fixture = initializeGatewayControlledActivation();
    try {
      const rejected = fixture.service.cancelPackageTransition({
        controlRequestId: "control-stale-rejected",
        expectedProjectionRevision: 0,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        writer: activationGatewayWriter()
      });
      expect(rejected.record).toMatchObject({
        request_state: "rejected",
        result_projection_revision: 1,
        result_code: "EE_CONTROL_REQUEST_STALE"
      });
      const replay = fixture.service.cancelPackageTransition({
        controlRequestId: "control-stale-rejected",
        expectedProjectionRevision: 0,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        writer: activationGatewayWriter()
      });
      expect(replay.replayed).toBe(true);
      expect(replay.record.request_state).toBe("rejected");
      expect(readActivationFixtureRow(fixture.db)?.activation_revision).toBe(1);
    } finally {
      fixture.db.close();
    }
  });

  it("retries only the post-identity production handshake without changing package identity", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_state = 'production_activating',
             activation_deadline_at = '2026-07-12T12:10:00.000Z',
             production_activation_handshake_id = NULL
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID);
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const writer = supervisorWriterFromLease(fixture.supervisorLease);
      service.enterBlocked({
        controlRequestId: "control-enter-post-identity",
        expectedProjectionRevision: 2,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer
      });
      const blockedWorker = fixture.db.prepare(
        `SELECT state, shutdown_requested_at, drain_deadline_at, last_failure_code
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(blockedWorker).toMatchObject({
        state: "blocked",
        shutdown_requested_at: PROCESS_FIXTURE_START,
        last_failure_code: "EE_ACTIVATION_HANDSHAKE_FAILED"
      });
      expect(blockedWorker.drain_deadline_at).not.toBeNull();
      const retried = service.retryProductionActivation({
        controlRequestId: "control-retry-production",
        expectedProjectionRevision: 3,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        writer
      });
      expect(retried.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 4,
        result_code: "production_activation_retry_started"
      });
      const activation = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toMatchObject({
        activation_revision: 4,
        activation_state: "production_activating",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        pending_package_generation_id: null,
        pending_transition_kind: "none",
        production_activation_handshake_id: null,
        blocked_boundary: "none"
      });
      const retryWorker = fixture.db.prepare(
        `SELECT state, fencing_token, shutdown_requested_at,
                drain_deadline_at, last_failure_code
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(retryWorker).toEqual({
        state: "stopped",
        fencing_token: fixture.productionWorker.fencing_token,
        shutdown_requested_at: PROCESS_FIXTURE_START,
        drain_deadline_at: null,
        last_failure_code: "production_activation_retry_worker_fenced"
      });
      expect(activation).toMatchObject({
        launch_authorization_id:
          fixture.activation.launch_authorization_id,
        launch_authorization_state: "consumed"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("issues a fresh active authorization for post-identity retry after supervisor authority is terminal", () => {
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
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_state = 'production_activating',
             activation_deadline_at = '2026-07-12T00:10:00.000Z',
             production_activation_handshake_id = NULL
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID);
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const gatewayWriter = {
        kind: "gateway_service_controller" as const,
        gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
        gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
        plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
      };
      service.enterBlocked({
        controlRequestId: "control-gateway-post-identity-block",
        expectedProjectionRevision: fixture.activation.activation_revision,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer: gatewayWriter
      });
      const launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const retried = service.retryProductionActivation({
        controlRequestId: "control-gateway-post-identity-retry",
        expectedProjectionRevision: fixture.activation.activation_revision + 1,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        authorizationId: "authorization-gateway-production-retry",
        expectedLaunchRevision: launch.launch_revision,
        writer: gatewayWriter
      });
      expect(retried.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: fixture.activation.activation_revision + 2,
        result_code: "production_activation_retry_replacement_authorized"
      });
      const activation = fixture.db.prepare(
        `SELECT activation_revision, activation_state,
                active_package_generation_id, production_activation_handshake_id,
                launch_authorization_id, launch_authorized_generation_id,
                launch_authorization_role, launch_authorization_state
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toEqual({
        activation_revision: fixture.activation.activation_revision + 2,
        activation_state: "production_activating",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        production_activation_handshake_id: null,
        launch_authorization_id: "authorization-gateway-production-retry",
        launch_authorized_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        launch_authorization_role: "active",
        launch_authorization_state: "issued"
      });
      const authorization = fixture.db.prepare(
        `SELECT authorization_state, authorization_role,
                authorized_package_generation_id
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        "authorization-gateway-production-retry"
      ) as Record<string, unknown>;
      expect(authorization).toEqual({
        authorization_state: "issued",
        authorization_role: "active",
        authorized_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
      });
    } finally {
      fixture.db.close();
    }
  });

  it("prepares an explicit rollback target without confusing gateway and launch package identity", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_state = 'production_activating',
             activation_deadline_at = '2026-07-12T12:10:00.000Z',
             production_activation_handshake_id = NULL,
             previous_package_generation_id = 'pkg-previous-production-test'
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID);
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const writer = supervisorWriterFromLease(fixture.supervisorLease);
      service.enterBlocked({
        controlRequestId: "control-enter-rollback-boundary",
        expectedProjectionRevision: 2,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        failureCode: "EE_ACTIVATION_HANDSHAKE_FAILED",
        writer
      });
      const launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const prepared = service.prepareRollback({
        controlRequestId: "control-prepare-rollback",
        expectedProjectionRevision: 3,
        expectedGatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        authorizationId: "authorization-explicit-rollback-test",
        expectedLaunchRevision: launch.launch_revision,
        writer
      });
      expect(prepared.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: 4,
        result_code: "package_rollback_prepared"
      });
      const activation = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toMatchObject({
        activation_revision: 4,
        activation_state: "preparing",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        pending_package_generation_id: "pkg-previous-production-test",
        pending_transition_kind: "rollback",
        launch_authorization_id: "authorization-explicit-rollback-test",
        launch_authorized_generation_id: "pkg-previous-production-test",
        launch_authorization_role: "rollback_candidate"
      });
      const authorization = fixture.db.prepare(
        `SELECT authorized_package_generation_id, issued_by_kind
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        "authorization-explicit-rollback-test"
      ) as Record<string, unknown>;
      expect(authorization).toEqual({
        authorized_package_generation_id: "pkg-previous-production-test",
        issued_by_kind: "supervisor"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("cleans only expired terminal idempotency rows behind an exact projection revision", () => {
    const fixture = initializeGatewayControlledActivation();
    try {
      fixture.service.cancelPackageTransition({
        controlRequestId: "control-retention-test",
        expectedProjectionRevision: 0,
        expectedGatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        expectedSupervisorLeaseEpoch: null,
        writer: activationGatewayWriter()
      });
      const repository = new RuntimeControlRequestRepository(
        fixture.db,
        ACTIVATION_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      );
      expect(repository.cleanupExpired({
        expectedProjectionRevision: 1,
        observedAt: "2026-07-13T12:00:01.000Z"
      })).toBe(1);
      expect(repository.read("control-retention-test")).toBeUndefined();
    } finally {
      fixture.db.close();
    }
  });
});
