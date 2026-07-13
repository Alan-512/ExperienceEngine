import { describe, expect, it } from "vitest";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  RuntimePackageActivationRepository
} from "../../src/runtime/activation/repository.js";
import { RuntimeActivationError } from "../../src/runtime/activation/errors.js";
import {
  ACTIVATION_FIXTURE_GATEWAY_ID,
  ACTIVATION_FIXTURE_HOME_ID,
  ACTIVATION_FIXTURE_NOW,
  ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
  ACTIVATION_FIXTURE_PACKAGE_ID,
  activationGatewayWriter,
  createRuntimeProductionActivationDatabase,
  readActivationFixtureRow,
  seedActivationGatewayHeartbeat
} from "../fixtures/runtime-production-activation-fixture.js";

const createRepository = (db: ReturnType<typeof createRuntimeProductionActivationDatabase>) =>
  new RuntimePackageActivationRepository(
    db,
    ACTIVATION_FIXTURE_HOME_ID,
    createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
  );

describe("runtime package activation repository", () => {
  it("bootstraps a missing fixed-home authority at revision zero only", () => {
    const db = createRuntimeProductionActivationDatabase({ includeActivationRow: false });
    try {
      const row = createRepository(db).bootstrapPackageActivationAuthority();
      expect(row).toMatchObject({
        home_id: ACTIVATION_FIXTURE_HOME_ID,
        activation_revision: 0,
        activation_state: "uninitialized",
        pending_transition_kind: "none",
        updated_by_kind: null
      });
    } finally {
      db.close();
    }
  });

  it("adopts an existing uninitialized authority without resetting a nonzero revision", () => {
    const db = createRuntimeProductionActivationDatabase({
      activationRevision: 7,
      launchAuthorizationRevision: 4
    });
    try {
      const row = createRepository(db).bootstrapPackageActivationAuthority();
      expect(row.activation_revision).toBe(7);
      expect(row.updated_by_gateway_instance_id).toBe(ACTIVATION_FIXTURE_GATEWAY_ID);
    } finally {
      db.close();
    }
  });

  it("rejects revision-zero bootstrap when historical activation authority residue exists", () => {
    const db = createRuntimeProductionActivationDatabase({ includeActivationRow: false });
    try {
      db.prepare(
        `INSERT INTO control_request_idempotency (
          home_id,
          control_request_id,
          request_digest,
          requested_operation,
          expected_projection_revision,
          expected_gateway_instance_id,
          request_state,
          result_projection_revision,
          result_code,
          result_digest,
          created_at,
          completed_at,
          expires_at
        ) VALUES (?, 'request-residue', 'digest', 'pause_learning', 0, 'gateway', 'rejected', 0, 'rejected', 'result', ?, ?, ?)`
      ).run(
        ACTIVATION_FIXTURE_HOME_ID,
        ACTIVATION_FIXTURE_NOW,
        ACTIVATION_FIXTURE_NOW,
        "2026-07-13T12:00:00.000Z"
      );
      expect(() => createRepository(db).bootstrapPackageActivationAuthority()).toThrowError(
        /authority residue/u
      );
    } finally {
      db.close();
    }
  });

  it("initializes revision zero atomically with pending identity, deadline, authorization, and launch pointer", () => {
    const db = createRuntimeProductionActivationDatabase();
    try {
      seedActivationGatewayHeartbeat(db);
      const result = createRepository(db).initializePackageActivation({
        expectedActivationRevision: 0,
        expectedLaunchRevision: 0,
        authorizationId: "authorization-initial-zero",
        packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
        writer: activationGatewayWriter()
      });
      expect(result.activation).toMatchObject({
        activation_revision: 1,
        activation_state: "preparing",
        active_package_generation_id: null,
        pending_package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
        pending_transition_kind: "initial",
        launch_authorization_id: "authorization-initial-zero",
        launch_authorization_role: "initial_candidate",
        launch_authorization_state: "issued",
        launch_authorization_revision: 1,
        launch_authorization_state_revision: 1,
        updated_by_kind: "gateway_service_controller",
        updated_by_gateway_instance_id: ACTIVATION_FIXTURE_GATEWAY_ID
      });
      expect(result.activation.activation_deadline_at).toBe("2026-07-12T12:10:00.000Z");
      expect(result.authorization).toMatchObject({
        authorization_revision: 1,
        authorization_state_revision: 1,
        authorization_state: "issued",
        authorization_role: "initial_candidate",
        launch_activation_revision_at_issuance: 1
      });
      expect(result.launchState).toMatchObject({
        launch_revision: 1,
        launch_count_in_window: 0,
        restart_window_started_at: null,
        current_launch_attempt_id: null,
        expected_current_activation_revision: 1
      });
    } finally {
      db.close();
    }
  });

  it("initializes any exact valid nonzero uninitialized revision", () => {
    const db = createRuntimeProductionActivationDatabase({
      activationRevision: 7,
      launchAuthorizationRevision: 4
    });
    try {
      seedActivationGatewayHeartbeat(db);
      const result = createRepository(db).initializePackageActivation({
        expectedActivationRevision: 7,
        expectedLaunchRevision: 0,
        authorizationId: "authorization-initial-seven",
        packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
        writer: activationGatewayWriter()
      });
      expect(result.activation.activation_revision).toBe(8);
      expect(result.authorization.launch_activation_revision_at_issuance).toBe(8);
      expect(result.authorization.authorization_revision).toBe(5);
      expect(result.activation.activation_state).toBe("preparing");
    } finally {
      db.close();
    }
  });

  it("rejects a stale initialization revision without partial package or authorization mutation", () => {
    const db = createRuntimeProductionActivationDatabase({ activationRevision: 3 });
    try {
      seedActivationGatewayHeartbeat(db);
      expect(() => createRepository(db).initializePackageActivation({
        expectedActivationRevision: 2,
        expectedLaunchRevision: 0,
        authorizationId: "authorization-stale",
        packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
        writer: activationGatewayWriter()
      })).toThrowError(RuntimeActivationError);
      expect(readActivationFixtureRow(db)).toMatchObject({
        activation_revision: 3,
        activation_state: "uninitialized",
        pending_package_generation_id: null,
        launch_authorization_id: null
      });
      const authorizationCount = db.prepare(
        "SELECT COUNT(*) AS count FROM package_launch_authorizations WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID) as { count: number };
      expect(authorizationCount.count).toBe(0);
    } finally {
      db.close();
    }
  });

  it("rejects package closure evidence with incompatible protocols and rolls back", () => {
    const db = createRuntimeProductionActivationDatabase();
    try {
      seedActivationGatewayHeartbeat(db);
      expect(() => createRepository(db).initializePackageActivation({
        expectedActivationRevision: 0,
        expectedLaunchRevision: 0,
        authorizationId: "authorization-bad-protocol",
        packageClosure: {
          ...ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
          package_identity: {
            ...ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
            worker_protocol_version: "runtime-worker-v999"
          }
        },
        writer: activationGatewayWriter()
      })).toThrowError(/protocols are incompatible/u);
      expect(readActivationFixtureRow(db)).toMatchObject({
        activation_revision: 0,
        activation_state: "uninitialized"
      });
    } finally {
      db.close();
    }
  });

  it("requires the exact current gateway heartbeat identity", () => {
    const db = createRuntimeProductionActivationDatabase();
    try {
      expect(() => createRepository(db).initializePackageActivation({
        expectedActivationRevision: 0,
        expectedLaunchRevision: 0,
        authorizationId: "authorization-no-gateway",
        packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
        writer: activationGatewayWriter()
      })).toThrowError(/current gateway heartbeat identity/u);
      expect(readActivationFixtureRow(db)?.activation_revision).toBe(0);
    } finally {
      db.close();
    }
  });
});
