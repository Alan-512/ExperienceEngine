import { describe, expect, it } from "vitest";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../../src/runtime/process/fresh-supervisor-authority.js";
import {
  RuntimeLaunchAttemptRepository,
  RuntimeLaunchAuthorizationLifecycleRepository,
  RuntimeLaunchAuthorizationIssuer
} from "../../src/runtime/process/launch-authority.js";
import {
  createAuthorizationMutationProvider,
  createCurrentSupervisorFixture,
  createRuntimeProcessAuthorityDatabase,
  createSupervisorAuthorizationMutationProvider,
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_START,
  seedGatewayHeartbeat
} from "../fixtures/runtime-process-authority-fixture.js";

const issueAndReserve = () => {
  const db = createRuntimeProcessAuthorityDatabase();
  seedGatewayHeartbeat(db);
  const clock = createFixedProcessAuthorityClock(PROCESS_FIXTURE_START);
  const issued = new RuntimeLaunchAuthorizationIssuer(
    db,
    PROCESS_FIXTURE_HOME_ID,
    createAuthorizationMutationProvider(),
    clock
  ).issue({
    authorizationId: "auth-launch-test",
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    authorizationRole: "initial_candidate",
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    expectedLaunchRevision: 0,
    issuer: {
      kind: "gateway_service_controller",
      gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
    }
  });
  const repository = new RuntimeLaunchAttemptRepository(
    db,
    PROCESS_FIXTURE_HOME_ID,
    clock
  );
  const reserved = repository.reserveByConsumingAuthorization({
    authorizationId: issued.authorization.launch_authorization_id,
    expectedAuthorizationRevision: issued.authorization.authorization_revision,
    expectedAuthorizationStateRevision: issued.authorization.authorization_state_revision,
    attemptId: "attempt-launch-test",
    packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
    authorizationRole: "initial_candidate",
    gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
    expectedLaunchRevision: issued.launchState.launch_revision
  });
  return { db, issued, repository, reserved };
};

describe("runtime launch authorization and attempt binding", () => {
  it("keeps authorization insertion unavailable before S6", () => {
    const db = createRuntimeProcessAuthorityDatabase();
    seedGatewayHeartbeat(db);
    try {
      const issuer = new RuntimeLaunchAuthorizationIssuer(
        db,
        PROCESS_FIXTURE_HOME_ID,
        undefined,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      expect(() => issuer.issue({
        authorizationId: "auth-unavailable",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: 0,
        issuer: {
          kind: "gateway_service_controller",
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
        }
      })).toThrowError(expect.objectContaining({
        code: "EE_PACKAGE_AUTHORITY_REQUIRED"
      }));
      expect(db.prepare("SELECT * FROM package_launch_authorizations").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("consumes one authorization atomically while preserving immutable issuance revision", () => {
    const { db, issued, repository, reserved } = issueAndReserve();
    try {
      const authorization = db.prepare(
        "SELECT * FROM package_launch_authorizations WHERE home_id = ? AND launch_authorization_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID, issued.authorization.launch_authorization_id) as {
        authorization_revision: number;
        authorization_state_revision: number;
        authorization_state: string;
        consumed_by_launch_attempt_id: string;
      };
      expect(authorization).toMatchObject({
        authorization_revision: 1,
        authorization_state_revision: 2,
        authorization_state: "consumed",
        consumed_by_launch_attempt_id: "attempt-launch-test"
      });
      expect(reserved.attempt).toMatchObject({
        attempt_state: "reserved_unbound",
        attempt_state_revision: 1,
        launch_authorization_revision: 1,
        launch_authorization_state_revision_at_consumption: 2,
        child_process_id: null,
        child_process_start_token: null
      });
      expect(reserved.launchState).toMatchObject({
        current_launch_attempt_id: "attempt-launch-test",
        launch_state: "launching",
        launch_count_in_window: 1
      });

      expect(() => repository.reserveByConsumingAuthorization({
        authorizationId: issued.authorization.launch_authorization_id,
        expectedAuthorizationRevision: 1,
        expectedAuthorizationStateRevision: 1,
        attemptId: "second-attempt",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: reserved.launchState.launch_revision
      })).toThrowError(expect.objectContaining({
        code: "EE_LAUNCH_AUTHORIZATION_REUSED"
      }));
      expect(db.prepare("SELECT COUNT(*) AS count FROM supervisor_launch_attempts").get())
        .toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("binds exact child identity once, supports exact idempotence, and rejects conflicting identity", () => {
    const { db, repository, reserved } = issueAndReserve();
    try {
      const first = repository.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        childProcessId: 7001,
        childProcessStartToken: "child-start-7001"
      });
      expect(first).toMatchObject({
        attempt_state: "reserved_bound",
        attempt_state_revision: 2,
        child_process_id: 7001,
        child_process_start_token: "child-start-7001"
      });
      expect(repository.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        childProcessId: 7001,
        childProcessStartToken: "child-start-7001"
      })).toEqual(first);
      expect(() => repository.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        childProcessId: 7002,
        childProcessStartToken: "child-start-7002"
      })).toThrowError(expect.objectContaining({
        code: "EE_LAUNCH_ATTEMPT_STALE"
      }));
    } finally {
      db.close();
    }
  });

  it("rejects late child binding and permits exact gateway timeout terminalization", () => {
    const { db, reserved } = issueAndReserve();
    try {
      const lateRepository = new RuntimeLaunchAttemptRepository(
        db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:31.000Z")
      );
      expect(() => lateRepository.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        childProcessId: 7003,
        childProcessStartToken: "late-child"
      })).toThrowError(expect.objectContaining({
        code: "EE_LAUNCH_ATTEMPT_STALE"
      }));
      expect(lateRepository.terminalizePreLeaseAttempt({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        terminalState: "timed_out",
        terminalCode: "launch_attempt_timeout"
      })).toMatchObject({
        attempt_state: "timed_out",
        attempt_state_revision: 2,
        terminal_code: "launch_attempt_timeout"
      });
      expect(db.prepare(
        "SELECT launch_state, last_failure_code FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        launch_state: "backoff",
        last_failure_code: "launch_attempt_timeout"
      });
    } finally {
      db.close();
    }
  });

  it("expires or cancels only an unconsumed current authorization while preserving issuance revision", () => {
    const db = createRuntimeProcessAuthorityDatabase();
    seedGatewayHeartbeat(db);
    try {
      const issued = new RuntimeLaunchAuthorizationIssuer(
        db,
        PROCESS_FIXTURE_HOME_ID,
        createAuthorizationMutationProvider(),
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).issue({
        authorizationId: "auth-expiry-test",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: 0,
        issuer: {
          kind: "gateway_service_controller",
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
        }
      });
      const lifecycle = new RuntimeLaunchAuthorizationLifecycleRepository(
        db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:01:01.000Z")
      );
      expect(lifecycle.terminalizeIssued({
        authorizationId: issued.authorization.launch_authorization_id,
        expectedAuthorizationRevision: issued.authorization.authorization_revision,
        expectedAuthorizationStateRevision: issued.authorization.authorization_state_revision,
        targetState: "expired",
        terminalCode: "launch_authorization_expired",
        writer: {
          kind: "gateway_service_controller",
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
          gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START
        }
      })).toMatchObject({
        authorization_revision: 1,
        authorization_state_revision: 2,
        authorization_state: "expired",
        terminal_code: "launch_authorization_expired"
      });
      expect(db.prepare(
        "SELECT launch_authorization_revision, launch_authorization_state_revision, launch_authorization_state FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        launch_authorization_revision: 1,
        launch_authorization_state_revision: 2,
        launch_authorization_state: "expired"
      });
    } finally {
      db.close();
    }
  });

  it("lets a fresh supervisor issue and terminalize the next authorization without replacing current authority", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const issuedAt = "2026-07-12T00:00:01.000Z";
      const issued = new RuntimeLaunchAuthorizationIssuer(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createSupervisorAuthorizationMutationProvider({
          observedAt: issuedAt,
          activationRevision: 1,
          expectedAuthorizationRevision: 2,
          expectedAuthorizationStateRevision: 2,
          expectedSupervisor: fixture.expectedSupervisor
        }),
        createFixedProcessAuthorityClock(issuedAt)
      ).issue({
        authorizationId: "auth-next-supervisor-transition",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: fixture.launchRevision,
        issuer: {
          kind: "supervisor",
          supervisorOwnerId: fixture.expectedSupervisor.owner_id,
          supervisorLeaseEpoch: fixture.expectedSupervisor.lease_epoch
        }
      });

      expect(issued.authorization).toMatchObject({
        authorization_revision: 2,
        authorization_state_revision: 1,
        authorization_state: "issued",
        issued_by_kind: "supervisor",
        issued_by_supervisor_owner_id: fixture.expectedSupervisor.owner_id,
        issued_by_supervisor_lease_epoch: fixture.expectedSupervisor.lease_epoch
      });
      expect(issued.launchState).toMatchObject({
        launch_authorization_id: "auth-next-supervisor-transition",
        launch_authorization_revision: 2,
        current_launch_attempt_id: fixture.attemptId,
        launch_state: "running"
      });
      expect(fixture.db.prepare(
        `SELECT launch_authorization_id, launch_authorization_revision,
                launch_authorization_state_revision
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        launch_authorization_id: "auth-next-supervisor-transition",
        launch_authorization_revision: 2,
        launch_authorization_state_revision: 1
      });
      expect(evaluateFreshSupervisorAuthorityInTransaction({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: issuedAt
      })).toMatchObject({
        available: true,
        fresh: true,
        launch_attempt_id: fixture.attemptId,
        supervisor_owner_id: fixture.expectedSupervisor.owner_id
      });

      const cancelled = new RuntimeLaunchAuthorizationLifecycleRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:02.000Z")
      ).terminalizeIssued({
        authorizationId: issued.authorization.launch_authorization_id,
        expectedAuthorizationRevision: issued.authorization.authorization_revision,
        expectedAuthorizationStateRevision:
          issued.authorization.authorization_state_revision,
        targetState: "cancelled",
        terminalCode: "next_launch_cancelled",
        writer: {
          kind: "supervisor",
          expected: fixture.expectedSupervisor
        }
      });
      expect(cancelled).toMatchObject({
        authorization_revision: 2,
        authorization_state_revision: 2,
        authorization_state: "cancelled"
      });
      expect(fixture.db.prepare(
        `SELECT current_launch_attempt_id, launch_state,
                launch_authorization_state_revision
         FROM supervisor_launch_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        current_launch_attempt_id: fixture.attemptId,
        launch_state: "running",
        launch_authorization_state_revision: 2
      });
      expect(evaluateFreshSupervisorAuthorityInTransaction({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: "2026-07-12T00:00:02.000Z"
      })).toMatchObject({
        available: true,
        fresh: true,
        launch_attempt_id: fixture.attemptId
      });
    } finally {
      fixture.db.close();
    }
  });

  it("fails closed on malformed S6, gateway, authorization, and attempt timestamps", () => {
    for (const provider of [
      createAuthorizationMutationProvider({ observedAt: "not-a-timestamp" }),
      createAuthorizationMutationProvider({ expiresAt: "not-a-timestamp" })
    ]) {
      const db = createRuntimeProcessAuthorityDatabase();
      seedGatewayHeartbeat(db);
      try {
        expect(() => new RuntimeLaunchAuthorizationIssuer(
          db,
          PROCESS_FIXTURE_HOME_ID,
          provider,
          createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
        ).issue({
          authorizationId: "auth-malformed-s6",
          packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
          authorizationRole: "initial_candidate",
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
          gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
          expectedLaunchRevision: 0,
          issuer: {
            kind: "gateway_service_controller",
            gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
          }
        })).toThrowError(expect.objectContaining({
          code: "EE_PROCESS_AUTHORITY_INVALID"
        }));
      } finally {
        db.close();
      }
    }

    const heartbeatDb = createRuntimeProcessAuthorityDatabase();
    seedGatewayHeartbeat(heartbeatDb);
    try {
      heartbeatDb.prepare(
        "UPDATE gateway_heartbeats SET expires_at = 'not-a-timestamp' WHERE home_id = ?"
      ).run(PROCESS_FIXTURE_HOME_ID);
      expect(() => new RuntimeLaunchAuthorizationIssuer(
        heartbeatDb,
        PROCESS_FIXTURE_HOME_ID,
        createAuthorizationMutationProvider(),
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).issue({
        authorizationId: "auth-malformed-heartbeat",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: 0,
        issuer: {
          kind: "gateway_service_controller",
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
        }
      })).toThrowError(expect.objectContaining({
        code: "EE_PROCESS_AUTHORITY_INVALID"
      }));
    } finally {
      heartbeatDb.close();
    }

    const authorizationDb = createRuntimeProcessAuthorityDatabase();
    seedGatewayHeartbeat(authorizationDb);
    try {
      const issued = new RuntimeLaunchAuthorizationIssuer(
        authorizationDb,
        PROCESS_FIXTURE_HOME_ID,
        createAuthorizationMutationProvider(),
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).issue({
        authorizationId: "auth-malformed-expiry",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: 0,
        issuer: {
          kind: "gateway_service_controller",
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
        }
      });
      authorizationDb.prepare(
        `UPDATE package_launch_authorizations
         SET expires_at = 'not-a-timestamp'
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID, issued.authorization.launch_authorization_id);
      expect(() => new RuntimeLaunchAttemptRepository(
        authorizationDb,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      ).reserveByConsumingAuthorization({
        authorizationId: issued.authorization.launch_authorization_id,
        expectedAuthorizationRevision: issued.authorization.authorization_revision,
        expectedAuthorizationStateRevision: issued.authorization.authorization_state_revision,
        attemptId: "attempt-malformed-authorization-expiry",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: issued.launchState.launch_revision
      })).toThrowError(expect.objectContaining({
        code: "EE_PROCESS_AUTHORITY_INVALID"
      }));
    } finally {
      authorizationDb.close();
    }

    const { db, repository, reserved } = issueAndReserve();
    try {
      db.prepare(
        `UPDATE supervisor_launch_attempts
         SET attempt_expires_at = 'not-a-timestamp'
         WHERE home_id = ? AND launch_attempt_id = ?`
      ).run(PROCESS_FIXTURE_HOME_ID, reserved.attempt.launch_attempt_id);
      expect(() => repository.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        childProcessId: 7999,
        childProcessStartToken: "malformed-attempt-expiry-child"
      })).toThrowError(expect.objectContaining({
        code: "EE_PROCESS_AUTHORITY_INVALID"
      }));
    } finally {
      db.close();
    }
  });
});
