import { describe, expect, it } from "vitest";
import {
  RuntimeGatewayActivationHandshakeCoordinator,
  RuntimeSupervisorActivationHandshakeCoordinator,
  RUNTIME_ACTIVATION_ORCHESTRATOR_CONTRACT
} from "../../src/runtime/activation/orchestrator.js";
import type {
  RuntimeCapabilityRouteAuthorityProvider
} from "../../src/runtime/activation/types.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  createWorkerHandshakeAcknowledgement
} from "../../src/runtime/package/worker-runtime.js";
import {
  createRuntimeProductionLifecycleFixture,
  expectedSupervisorFromLease,
  expectedWorkerFromLease,
  PRODUCTION_FIXTURE_CONFIGURATION_ID,
  PRODUCTION_FIXTURE_ROUTE_SET_ID
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const routeProvider = (): RuntimeCapabilityRouteAuthorityProvider => ({
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
      route_fingerprint: `orchestrator-${input.capability}`,
      validation_current: true,
      observed_at: PROCESS_FIXTURE_START,
      expires_at: "2026-07-12T12:00:15.000Z"
    };
  }
});

describe("runtime activation orchestration", () => {
  it("keeps gateway, supervisor, and worker handshake responsibilities separate", () => {
    expect(RUNTIME_ACTIVATION_ORCHESTRATOR_CONTRACT).toEqual({
      gateway_only_requests_handshake: true,
      supervisor_only_persists_handshake_transitions: true,
      worker_acknowledges_through_ipc_only: true,
      route_authority_required_before_request: true,
      production_publication_requires_complete_handshake: true
    });
  });

  it("requests and publishes a fresh production handshake for a replacement worker fence", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.workerRepository.release({
        expectedWorker: expectedWorkerFromLease(fixture.productionWorker),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease)
      });
      const starting = fixture.workerRepository.acquire({
        leaseKey: "worker-orchestrator-replacement-lease",
        ownerId: "worker-orchestrator-replacement",
        ownerProcessId: 9711,
        ownerProcessStartToken: "worker-orchestrator-replacement-start",
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease),
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "production",
        transitionRole: fixture.supervisorLease.launch_authorization_role
      });
      const replacementWorker = fixture.workerRepository.renew({
        expectedWorker: expectedWorkerFromLease(starting),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease),
        nextState: "active"
      });
      expect(replacementWorker.fencing_token).toBe(
        fixture.productionWorker.fencing_token + 1
      );

      const gateway = new RuntimeGatewayActivationHandshakeCoordinator({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        writer: {
          kind: "gateway_service_controller",
          gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
          gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
          plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
        },
        routeAuthorityProvider: routeProvider(),
        contextProvider: () => ({
          configurationGenerationId: PRODUCTION_FIXTURE_CONFIGURATION_ID,
          effectiveRouteSetId: PRODUCTION_FIXTURE_ROUTE_SET_ID
        }),
        idFactory: () => "activation-orchestrator-production",
        nonceDigestFactory: () => "nonce-orchestrator-production",
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const requested = gateway.requestIfReady();
      expect(requested).toMatchObject({
        activation_id: "activation-orchestrator-production",
        handshake_purpose: "production_activation",
        status: "requested",
        worker_owner_id: replacementWorker.owner_id,
        worker_fencing_token: replacementWorker.fencing_token
      });

      let challengedActivationId: string | null = null;
      let acknowledgement = undefined as ReturnType<
        typeof createWorkerHandshakeAcknowledgement
      > | undefined;
      const supervisor = new RuntimeSupervisorActivationHandshakeCoordinator({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        currentSupervisor: () => fixture.db.prepare(
          "SELECT * FROM supervisor_leases WHERE home_id = ?"
        ).get(PROCESS_FIXTURE_HOME_ID) as typeof fixture.supervisorLease,
        sendWorkerChallenge: (activationId) => {
          challengedActivationId = activationId;
          return true;
        },
        takeWorkerAcknowledgement: (activationId) => {
          if (acknowledgement?.activation_id !== activationId) {
            return undefined;
          }
          const value = acknowledgement;
          acknowledgement = undefined;
          return value;
        },
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(supervisor.advance()).toBe("supervisor_acknowledged");
      expect(challengedActivationId).toBe(
        "activation-orchestrator-production"
      );
      acknowledgement = createWorkerHandshakeAcknowledgement({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        activationId: challengedActivationId!,
        worker: replacementWorker
      });
      expect(supervisor.advance()).toBe("production_handshake_replaced");

      const activation = fixture.db.prepare(
        `SELECT activation_state, activation_revision,
                production_activation_handshake_id
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toEqual({
        activation_state: "active",
        activation_revision: fixture.activation.activation_revision,
        production_activation_handshake_id:
          "activation-orchestrator-production"
      });
      const complete = fixture.db.prepare(
        `SELECT status, state_revision, worker_fencing_token
         FROM activation_handshakes
         WHERE home_id = ? AND activation_id = ?`
      ).get(
        PROCESS_FIXTURE_HOME_ID,
        "activation-orchestrator-production"
      ) as Record<string, unknown>;
      expect(complete).toEqual({
        status: "complete",
        state_revision: 4,
        worker_fencing_token: replacementWorker.fencing_token
      });
      expect(gateway.requestIfReady()?.activation_id).toBe(
        "activation-orchestrator-production"
      );
    } finally {
      fixture.db.close();
    }
  });

  it("orchestrates preactivation verification before publishing pending identity", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.workerRepository.release({
        expectedWorker: expectedWorkerFromLease(fixture.productionWorker),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease)
      });
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET active_package_generation_id = NULL,
             pending_package_generation_id = ?,
             previous_package_generation_id = NULL,
             pending_transition_kind = 'initial',
             activation_deadline_at = '2026-07-12T12:10:00.000Z',
             preactivation_handshake_id = NULL,
             production_activation_handshake_id = NULL,
             activation_state = 'migrating',
             blocked_boundary = 'none',
             blocked_from_state = 'none'
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_PACKAGE_ID, PROCESS_FIXTURE_HOME_ID);
      const starting = fixture.workerRepository.acquire({
        leaseKey: "worker-orchestrator-preactivation-lease",
        ownerId: "worker-orchestrator-preactivation",
        ownerProcessId: 9713,
        ownerProcessStartToken: "worker-orchestrator-preactivation-start",
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease),
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "activation_only",
        transitionRole: "initial_candidate"
      });
      const activationWorker = fixture.workerRepository.renew({
        expectedWorker: expectedWorkerFromLease(starting),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease),
        nextState: "active"
      });
      const gateway = new RuntimeGatewayActivationHandshakeCoordinator({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        writer: {
          kind: "gateway_service_controller",
          gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
          gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
          plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
        },
        routeAuthorityProvider: routeProvider(),
        contextProvider: () => ({
          configurationGenerationId: PRODUCTION_FIXTURE_CONFIGURATION_ID,
          effectiveRouteSetId: PRODUCTION_FIXTURE_ROUTE_SET_ID
        }),
        idFactory: () => "activation-orchestrator-preactivation",
        nonceDigestFactory: () => "nonce-orchestrator-preactivation",
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(gateway.requestIfReady()).toMatchObject({
        activation_id: "activation-orchestrator-preactivation",
        handshake_purpose: "preactivation_verification",
        status: "requested",
        worker_fencing_token: activationWorker.fencing_token
      });

      let acknowledgement = undefined as ReturnType<
        typeof createWorkerHandshakeAcknowledgement
      > | undefined;
      const supervisor = new RuntimeSupervisorActivationHandshakeCoordinator({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        currentSupervisor: () => fixture.db.prepare(
          "SELECT * FROM supervisor_leases WHERE home_id = ?"
        ).get(PROCESS_FIXTURE_HOME_ID) as typeof fixture.supervisorLease,
        sendWorkerChallenge: () => true,
        takeWorkerAcknowledgement: (activationId) => {
          if (acknowledgement?.activation_id !== activationId) {
            return undefined;
          }
          const value = acknowledgement;
          acknowledgement = undefined;
          return value;
        },
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(supervisor.advance()).toBe("supervisor_acknowledged");
      expect(fixture.db.prepare(
        `SELECT activation_state, preactivation_handshake_id
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        activation_state: "preactivation_verifying",
        preactivation_handshake_id: "activation-orchestrator-preactivation"
      });
      acknowledgement = createWorkerHandshakeAcknowledgement({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        activationId: "activation-orchestrator-preactivation",
        worker: activationWorker
      });
      expect(supervisor.advance()).toBe("pending_identity_published");
      expect(fixture.db.prepare(
        `SELECT activation_revision, activation_state,
                active_package_generation_id, pending_package_generation_id,
                preactivation_handshake_id, production_activation_handshake_id
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        activation_revision: fixture.activation.activation_revision + 1,
        activation_state: "production_activating",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        pending_package_generation_id: null,
        preactivation_handshake_id: "activation-orchestrator-preactivation",
        production_activation_handshake_id: null
      });
      expect(fixture.db.prepare(
        `SELECT state, worker_mode, fencing_token
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        state: "stopped",
        worker_mode: "activation_only",
        fencing_token: activationWorker.fencing_token
      });
    } finally {
      fixture.db.close();
    }
  });

  it("does not request a handshake without current route context", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const gateway = new RuntimeGatewayActivationHandshakeCoordinator({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        writer: {
          kind: "gateway_service_controller",
          gateway_instance_id: PROCESS_FIXTURE_GATEWAY_ID,
          gateway_process_start_token: PROCESS_FIXTURE_GATEWAY_START,
          plugin_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID
        },
        routeAuthorityProvider: routeProvider(),
        contextProvider: () => undefined,
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(gateway.requestIfReady()?.activation_id).toBe(
        fixture.productionHandshake.activation_id
      );
      fixture.workerRepository.release({
        expectedWorker: expectedWorkerFromLease(fixture.productionWorker),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease)
      });
      const starting = fixture.workerRepository.acquire({
        leaseKey: "worker-orchestrator-no-context-lease",
        ownerId: "worker-orchestrator-no-context",
        ownerProcessId: 9712,
        ownerProcessStartToken: "worker-orchestrator-no-context-start",
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease),
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "production",
        transitionRole: fixture.supervisorLease.launch_authorization_role
      });
      fixture.workerRepository.renew({
        expectedWorker: expectedWorkerFromLease(starting),
        expectedSupervisor: expectedSupervisorFromLease(fixture.supervisorLease),
        nextState: "active"
      });
      expect(gateway.requestIfReady()).toBeUndefined();
    } finally {
      fixture.db.close();
    }
  });
});
