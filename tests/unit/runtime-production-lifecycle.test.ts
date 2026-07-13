import { describe, expect, it } from "vitest";
import {
  createS6SupervisorMigrationAuthorityProvider,
  createS6LearningQueueProductionWriteAuthorityProvider,
  createS6ProcessProductionWriteAuthorityProvider,
  evaluateCanonicalProductionActivationInTransaction
} from "../../src/runtime/activation/authority.js";
import {
  createSupervisorMigrationAuthorityProvider
} from "../../src/runtime/process/fresh-supervisor-authority.js";
import {
  RuntimePackageActivationControlService
} from "../../src/runtime/activation/control.js";
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
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";
import type {
  RuntimeCapabilityRouteAuthorityProvider
} from "../../src/runtime/activation/types.js";
import {
  acknowledgementFromHandshake,
  createRuntimeProductionLifecycleFixture,
  expectedWorkerFromLease,
  PRODUCTION_FIXTURE_CONFIGURATION_ID,
  PRODUCTION_FIXTURE_ROUTE_SET_ID,
  supervisorWriterFromLease
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const currentRouteProvider = (
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
      effective_route_revision: 3,
      capability: input.capability,
      route_fingerprint: "distillation-route-production-lifecycle-test",
      validation_current: true,
      observed_at: observedAt,
      expires_at: "2026-07-12T12:00:15.000Z"
    };
  }
});

describe("runtime production activation lifecycle", () => {
  it("allows schema migration authority only for the exact pending generation in migrating state", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const provider = createS6SupervisorMigrationAuthorityProvider(
        createSupervisorMigrationAuthorityProvider(
          createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
        )
      );
      const readAuthority = () => runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => provider.getFreshSupervisorAuthorityInTransaction({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
          supervisorOwnerId: fixture.supervisorLease.owner_id,
          expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch
        })
      });
      expect(readAuthority()).toMatchObject({
        available: false,
        fresh: false,
        reason: "supervisor_not_current"
      });
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET active_package_generation_id = NULL,
             pending_package_generation_id = ?,
             previous_package_generation_id = NULL,
             pending_transition_kind = 'initial',
             activation_state = 'migrating',
             activation_deadline_at = '2026-07-12T00:10:00.000Z',
             preactivation_handshake_id = NULL,
             production_activation_handshake_id = NULL,
             blocked_boundary = 'none',
             blocked_from_state = 'none'
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_PACKAGE_ID, PROCESS_FIXTURE_HOME_ID);
      expect(readAuthority()).toMatchObject({
        available: true,
        fresh: true,
        package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        supervisor_owner_id: fixture.supervisorLease.owner_id,
        supervisor_lease_epoch: fixture.supervisorLease.lease_epoch
      });
    } finally {
      fixture.db.close();
    }
  });

  it("completes the two-stage handshake and separates current from historical launch revision", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      expect(fixture.activation).toMatchObject({
        activation_revision: 2,
        activation_state: "active",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        pending_package_generation_id: null,
        pending_transition_kind: "none",
        production_activation_handshake_id: fixture.productionHandshake.activation_id,
        activation_deadline_at: null
      });
      expect(fixture.productionHandshake).toMatchObject({
        handshake_purpose: "production_activation",
        status: "complete",
        state_revision: 4,
        current_activation_revision: 2,
        launch_activation_revision_at_consumption: 1,
        worker_mode: "production",
        configuration_generation_id: PRODUCTION_FIXTURE_CONFIGURATION_ID,
        effective_route_set_id: PRODUCTION_FIXTURE_ROUTE_SET_ID
      });
      expect(
        fixture.productionHandshake.current_activation_revision
      ).not.toBe(
        fixture.productionHandshake.launch_activation_revision_at_consumption
      );
      expect(fixture.productionWorker.fencing_token).toBe(2);
    } finally {
      fixture.db.close();
    }
  });

  it("authorizes process semantic work only after the exact production handshake is current", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      expect(fixture.workerRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(fixture.productionWorker),
        operation: "queue_claim"
      })).toMatchObject({
        allowed: true,
        effectiveMode: "production",
        semanticWriteAuthorized: true
      });
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_state = 'production_activating',
             activation_deadline_at = '2026-07-12T12:10:00.000Z',
             production_activation_handshake_id = NULL
         WHERE home_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID);
      expect(() => fixture.workerRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(fixture.productionWorker),
        operation: "queue_claim"
      })).toThrowError(/remain disabled until exact S6 production authority is current/u);
    } finally {
      fixture.db.close();
    }
  });

  it("supplies the richer S5 queue authority only with current validated route evidence", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const unavailableProvider = createS6LearningQueueProductionWriteAuthorityProvider({
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(() => runRuntimeImmediateTransaction(fixture.db, {
        category: "protected_result_commit",
        operation: () => requireProductionWriteAuthorityInTransaction({
          db: fixture.db,
          provider: unavailableProvider,
          operation: "new_claim",
          homeId: PROCESS_FIXTURE_HOME_ID,
          now: PROCESS_FIXTURE_START
        })
      })).toThrowError(/unavailable for this queue operation/u);

      const provider = createS6LearningQueueProductionWriteAuthorityProvider({
        routeAuthorityProvider: currentRouteProvider(),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "protected_result_commit",
        operation: () => requireProductionWriteAuthorityInTransaction({
          db: fixture.db,
          provider,
          operation: "new_claim",
          homeId: PROCESS_FIXTURE_HOME_ID,
          now: PROCESS_FIXTURE_START
        })
      });
      expect(evidence).toMatchObject({
        authorized: true,
        fresh: true,
        worker_mode: "production",
        worker_lease_state: "active",
        package_generation_role: "active",
        activation_revision: 2,
        production_activation_handshake_id:
          fixture.productionHandshake.activation_id,
        configuration_generation_id: PRODUCTION_FIXTURE_CONFIGURATION_ID,
        effective_route_set_id: PRODUCTION_FIXTURE_ROUTE_SET_ID,
        effective_route_revision: 3,
        capability: "distillation",
        route_fingerprint: "distillation-route-production-lifecycle-test",
        job_schema_version: "fenced-learning-job-v1",
        candidate_schema_version: "fenced-learning-candidate-v1",
        node_schema_version: "fenced-learning-node-v1"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("rejects handshake replay and a mismatched worker nonce binding", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      expect(() => fixture.handshakeRepository.acknowledgeWorker({
        activationId: fixture.productionHandshake.activation_id,
        expectedStateRevision: fixture.productionHandshake.state_revision,
        acknowledgement: {
          ...acknowledgementFromHandshake(fixture.productionHandshake),
          nonce_digest: "wrong-nonce"
        },
        writer: {
          kind: "supervisor",
          supervisor_owner_id: fixture.supervisorLease.owner_id,
          supervisor_lease_epoch: fixture.supervisorLease.lease_epoch,
          supervisor_lease_state_revision:
            fixture.supervisorLease.lease_state_revision
        }
      })).toThrowError(/revision, state, or expiry CAS/u);
      expect(fixture.handshakeRepository.read(
        fixture.productionHandshake.activation_id
      )?.state_revision).toBe(4);
    } finally {
      fixture.db.close();
    }
  });

  it("invalidates canonical production authority when the worker fence changes", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.db.prepare(
        "UPDATE worker_leases SET fencing_token = fencing_token + 1 WHERE home_id = ?"
      ).run(PROCESS_FIXTURE_HOME_ID);
      const provider = createS6ProcessProductionWriteAuthorityProvider(
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START),
        currentRouteProvider()
      );
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "protected_result_commit",
        operation: () => provider.getProductionWriteAuthorityInTransaction({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          workerOwnerId: fixture.productionWorker.owner_id,
          workerFencingToken: fixture.productionWorker.fencing_token,
          operation: "queue_claim"
        })
      });
      expect(evidence).toMatchObject({
        available: false,
        fresh: false,
        reason: "production_activation_not_current"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("invalidates the handshake when a newer gateway instance becomes current", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const later = "2026-07-12T12:00:01.000Z";
      new GatewayHeartbeatRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(later)
      ).publish({
        gatewayInstanceId: "gateway-new-production-lifecycle-test",
        gatewayProcessId: 9101,
        gatewayProcessStartToken: "gateway-new-start-production-lifecycle-test",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        heartbeatDurationMs: 3_600_000
      });
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "protected_result_commit",
        operation: () => evaluateCanonicalProductionActivationInTransaction({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          observedAt: later
        })
      });
      expect(evidence).toMatchObject({
        available: false,
        fresh: false,
        reason: "production_activation_not_current"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("allows only existing-claim renewal and completion during deliberate active-runtime drain", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const service = new RuntimePackageActivationControlService(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const result = service.requestDrain({
        controlRequestId: "control-deliberate-runtime-drain",
        expectedProjectionRevision: fixture.activation.activation_revision,
        expectedGatewayInstanceId: fixture.productionHandshake.gateway_instance_id,
        expectedSupervisorLeaseEpoch: fixture.supervisorLease.lease_epoch,
        expectedWorkerOwnerId: fixture.productionWorker.owner_id,
        expectedWorkerFencingToken: fixture.productionWorker.fencing_token,
        writer: supervisorWriterFromLease(fixture.supervisorLease)
      });
      expect(result.record).toMatchObject({
        request_state: "completed",
        result_projection_revision: fixture.activation.activation_revision,
        result_code: "deliberate_runtime_drain_requested"
      });
      const activation = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toMatchObject({
        activation_revision: fixture.activation.activation_revision,
        activation_state: "active",
        production_activation_handshake_id:
          fixture.productionHandshake.activation_id
      });
      const drainingWorker = fixture.db.prepare(
        "SELECT * FROM worker_leases WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as typeof fixture.productionWorker;
      expect(drainingWorker).toMatchObject({
        state: "draining",
        shutdown_requested_at: PROCESS_FIXTURE_START
      });
      expect(() => fixture.workerRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(drainingWorker),
        operation: "queue_claim"
      })).toThrowError(/exact S6 production authority is current/u);
      expect(fixture.workerRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(drainingWorker),
        operation: "queue_renew"
      })).toMatchObject({
        allowed: true,
        semanticWriteAuthorized: true
      });
      expect(fixture.workerRepository.assertProtectedOperation({
        expectedWorker: expectedWorkerFromLease(drainingWorker),
        operation: "queue_complete"
      })).toMatchObject({
        allowed: true,
        semanticWriteAuthorized: true
      });
    } finally {
      fixture.db.close();
    }
  });
});
