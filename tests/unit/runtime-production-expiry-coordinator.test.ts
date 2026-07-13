import { describe, expect, it, vi } from "vitest";
import {
  RuntimeActivationExpiryCoordinator
} from "../../src/runtime/activation/expiry-coordinator.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  createFixtureRouteAuthorityProvider,
  createRuntimeProductionLifecycleFixture,
  PRODUCTION_FIXTURE_CONFIGURATION_ID,
  PRODUCTION_FIXTURE_ROUTE_SET_ID,
  supervisorWriterFromLease
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";
import {
  RuntimeActivationHandshakeRepository
} from "../../src/runtime/activation/handshake.js";

const prepareExpiredProductionHandshake = () => {
  const fixture = createRuntimeProductionLifecycleFixture();
  fixture.db.prepare(
    `UPDATE package_activation_state
     SET activation_state = 'production_activating',
         production_activation_handshake_id = NULL,
         activation_deadline_at = '2026-07-12T00:10:00.000Z'
     WHERE home_id = ?`
  ).run(PROCESS_FIXTURE_HOME_ID);
  const repository = new RuntimeActivationHandshakeRepository(
    fixture.db,
    PROCESS_FIXTURE_HOME_ID,
    createFixedProcessAuthorityClock(PROCESS_FIXTURE_START),
    createFixtureRouteAuthorityProvider()
  );
  const requested = repository.request({
    activationId: "production-handshake-expiry-test",
    nonceDigest: "nonce-production-handshake-expiry-test",
    purpose: "production_activation",
    configurationGenerationId: PRODUCTION_FIXTURE_CONFIGURATION_ID,
    effectiveRouteSetId: PRODUCTION_FIXTURE_ROUTE_SET_ID,
    workerOwnerId: fixture.productionWorker.owner_id,
    workerFencingToken: fixture.productionWorker.fencing_token,
    writer: {
      kind: "gateway_service_controller",
      gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
      gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
      plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
    }
  });
  fixture.db.prepare(
    `UPDATE activation_handshakes
     SET expires_at = ?
     WHERE home_id = ? AND activation_id = ?`
  ).run(
    "2026-07-12T00:00:01.000Z",
    PROCESS_FIXTURE_HOME_ID,
    requested.activation_id
  );
  fixture.db.prepare(
    `UPDATE package_activation_state
     SET production_activation_handshake_id = ?
     WHERE home_id = ?`
  ).run(requested.activation_id, PROCESS_FIXTURE_HOME_ID);
  return { fixture, repository, requested };
};

describe("runtime activation expiry coordinator", () => {
  it("kills the exact bound worker, expires the handshake, and enters post-identity blocked recovery", () => {
    const { fixture, requested } = prepareExpiredProductionHandshake();
    try {
      const terminateProcess = vi.fn(() => true);
      const ids = ["control-expired-production-handshake"];
      const result = new RuntimeActivationExpiryCoordinator({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        pluginPackageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        terminateProcess,
        idFactory: () => ids.shift()!,
        clock: createFixedProcessAuthorityClock("2026-07-12T00:00:02.000Z")
      }).sweepCurrentHandshake();
      expect(result).toEqual({
        expired_handshake_id: requested.activation_id,
        terminated_worker: true,
        terminalized_launch_attempt_id: null,
        blocked_projection_revision: 3
      });
      expect(terminateProcess).toHaveBeenCalledWith({
        processId: fixture.productionWorker.owner_process_id,
        expectedProcessStartToken:
          fixture.productionWorker.owner_process_start_token
      });
      const handshake = fixture.db.prepare(
        `SELECT status, state_revision, failure_code
         FROM activation_handshakes
         WHERE home_id = ? AND activation_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        requested.activation_id
      ) as Record<string, unknown>;
      expect(handshake).toMatchObject({
        status: "expired",
        state_revision: 2,
        failure_code: "EE_ACTIVATION_HANDSHAKE_EXPIRED"
      });
      const worker = fixture.db.prepare(
        "SELECT state, last_failure_code FROM worker_leases WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(worker).toEqual({
        state: "stopped",
        last_failure_code: "EE_ACTIVATION_HANDSHAKE_EXPIRED"
      });
      const activation = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toMatchObject({
        activation_revision: 3,
        activation_state: "blocked",
        blocked_boundary: "post_identity",
        blocked_from_state: "production_activating",
        production_activation_handshake_id: null,
        last_failure_code: "EE_ACTIVATION_HANDSHAKE_EXPIRED"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("fails closed without mutating handshake or package state when process identity termination fails", () => {
    const { fixture, requested } = prepareExpiredProductionHandshake();
    try {
      const coordinator = new RuntimeActivationExpiryCoordinator({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        pluginPackageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        terminateProcess: () => false,
        clock: createFixedProcessAuthorityClock("2026-07-12T00:00:02.000Z")
      });
      expect(() => coordinator.sweepCurrentHandshake()).toThrowError(
        /could not be verified for termination/u
      );
      const handshake = fixture.db.prepare(
        `SELECT status, state_revision
         FROM activation_handshakes
         WHERE home_id = ? AND activation_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        requested.activation_id
      ) as Record<string, unknown>;
      expect(handshake).toEqual({
        status: "requested",
        state_revision: 1
      });
      const activation = fixture.db.prepare(
        `SELECT activation_revision, activation_state,
                production_activation_handshake_id
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toEqual({
        activation_revision: 2,
        activation_state: "production_activating",
        production_activation_handshake_id: requested.activation_id
      });
    } finally {
      fixture.db.close();
    }
  });
});
