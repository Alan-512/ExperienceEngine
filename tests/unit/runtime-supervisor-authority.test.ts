import { describe, expect, it } from "vitest";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  createSupervisorMigrationAuthorityProvider,
  evaluateFreshSupervisorAuthorityInTransaction
} from "../../src/runtime/process/fresh-supervisor-authority.js";
import {
  RuntimeLaunchAttemptRepository,
  RuntimeLaunchAuthorizationIssuer
} from "../../src/runtime/process/launch-authority.js";
import {
  RuntimeSupervisorAuthorityRepository
} from "../../src/runtime/process/supervisor-authority.js";
import {
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";
import {
  createAuthorizationMutationProvider,
  createCurrentSupervisorFixture,
  PROCESS_FIXTURE_ARTIFACT,
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

describe("runtime supervisor authority", () => {
  it("derives objective freshness without gateway heartbeat or caller expectation inputs", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const direct = evaluateFreshSupervisorAuthorityInTransaction({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: PROCESS_FIXTURE_START
      });
      expect(direct).toMatchObject({
        available: true,
        fresh: true,
        authority_source: "s3_objective_database_predicate",
        supervisor_owner_id: fixture.lease.owner_id,
        supervisor_lease_epoch: fixture.lease.lease_epoch,
        supervisor_lease_state_revision: fixture.lease.lease_state_revision,
        package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        artifact_integrity: PROCESS_FIXTURE_ARTIFACT
      });

      fixture.db.prepare(
        "DELETE FROM gateway_heartbeats WHERE home_id = ?"
      ).run(PROCESS_FIXTURE_HOME_ID);
      expect(evaluateFreshSupervisorAuthorityInTransaction({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: PROCESS_FIXTURE_START
      })).toMatchObject({
        available: true,
        fresh: true,
        supervisor_owner_id: fixture.lease.owner_id
      });

      const provider = createSupervisorMigrationAuthorityProvider(
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const wrongCaller = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => provider.getFreshSupervisorAuthorityInTransaction({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
          supervisorOwnerId: "stale-caller",
          expectedSupervisorLeaseEpoch: fixture.lease.lease_epoch
        })
      });
      expect(wrongCaller).toEqual({
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: "supervisor_not_current"
      });
      expect(evaluateFreshSupervisorAuthorityInTransaction({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: PROCESS_FIXTURE_START
      })).toMatchObject({ available: true, fresh: true });
    } finally {
      fixture.db.close();
    }
  });

  it("renews only the exact current owner/epoch/revision and rejects stale callers", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const repository = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:05.000Z")
      );
      const renewed = repository.renew({
        expected: fixture.expectedSupervisor,
        expectedLaunchRevision: fixture.launchRevision,
        nextState: "active"
      });
      expect(renewed).toMatchObject({
        state: "active",
        lease_state_revision: 2,
        heartbeat_at: "2026-07-12T00:00:05.000Z",
        expires_at: "2026-07-12T00:00:25.000Z"
      });
      expect(() => repository.renew({
        expected: fixture.expectedSupervisor,
        expectedLaunchRevision: fixture.launchRevision,
        nextState: "active"
      })).toThrowError(expect.objectContaining({
        code: "EE_SUPERVISOR_AUTHORITY_STALE"
      }));
      expect(() => repository.renew({
        expected: {
          ...fixture.expectedSupervisor,
          owner_process_start_token: "stale-supervisor-process"
        },
        expectedLaunchRevision: fixture.launchRevision,
        nextState: "active"
      })).toThrowError(expect.objectContaining({
        code: "EE_SUPERVISOR_AUTHORITY_STALE"
      }));
      expect(evaluateFreshSupervisorAuthorityInTransaction({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: "2026-07-12T00:00:05.000Z"
      })).toMatchObject({
        available: true,
        fresh: true,
        supervisor_lease_state_revision: 2
      });
    } finally {
      fixture.db.close();
    }
  });

  it("gracefully releases and atomically terminalizes the matching attempt, then permits a new epoch", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const releaseRepository = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:05.000Z")
      );
      const released = releaseRepository.gracefulRelease({
        expected: fixture.expectedSupervisor,
        expectedAttemptStateRevision: fixture.attemptStateRevision,
        expectedLaunchRevision: fixture.launchRevision
      });
      expect(released).toMatchObject({
        state: "stopped",
        lease_state_revision: 2,
        lease_terminal_reason: "graceful_release",
        lease_terminal_at: "2026-07-12T00:00:05.000Z"
      });
      expect(fixture.db.prepare(
        "SELECT attempt_state, attempt_state_revision, terminal_code FROM supervisor_launch_attempts WHERE home_id = ? AND launch_attempt_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID, fixture.attemptId)).toEqual({
        attempt_state: "terminated",
        attempt_state_revision: 4,
        terminal_code: "supervisor_graceful_release"
      });
      expect(fixture.db.prepare(
        "SELECT launch_revision, launch_state FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        launch_revision: 5,
        launch_state: "idle"
      });

      const clock = createFixedProcessAuthorityClock("2026-07-12T00:00:06.000Z");
      fixture.db.prepare(
        `INSERT INTO gateway_heartbeats (
          home_id, gateway_instance_id, gateway_process_id,
          gateway_process_start_token, package_generation_id, heartbeat_at, expires_at
        ) VALUES (?, ?, 4001, ?, ?, ?, ?)
        ON CONFLICT(home_id, gateway_instance_id) DO UPDATE SET
          heartbeat_at = excluded.heartbeat_at,
          expires_at = excluded.expires_at`
      ).run(
        PROCESS_FIXTURE_HOME_ID,
        PROCESS_FIXTURE_GATEWAY_ID,
        PROCESS_FIXTURE_GATEWAY_START,
        PROCESS_FIXTURE_PACKAGE_ID,
        "2026-07-12T00:00:06.000Z",
        "2026-07-12T01:00:06.000Z"
      );
      const issued = new RuntimeLaunchAuthorizationIssuer(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createAuthorizationMutationProvider({
          observedAt: "2026-07-12T00:00:06.000Z",
          activationRevision: 1,
          expectedAuthorizationRevision: 2,
          expectedAuthorizationStateRevision: 2
        }),
        clock
      ).issue({
        authorizationId: "launch-auth-second",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: 5,
        issuer: {
          kind: "gateway_service_controller",
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID
        }
      });
      const attempts = new RuntimeLaunchAttemptRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        clock
      );
      const reserved = attempts.reserveByConsumingAuthorization({
        authorizationId: issued.authorization.launch_authorization_id,
        expectedAuthorizationRevision: 2,
        expectedAuthorizationStateRevision: 1,
        attemptId: "launch-attempt-second",
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        authorizationRole: "initial_candidate",
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: issued.launchState.launch_revision
      });
      const bound = attempts.bindChildIdentity({
        attemptId: reserved.attempt.launch_attempt_id,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        childProcessId: 5002,
        childProcessStartToken: "supervisor-start-token-second"
      });
      const launch = fixture.db.prepare(
        "SELECT launch_revision FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as { launch_revision: number };
      const second = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        clock
      ).acquireFromBoundAttempt({
        leaseKey: "supervisor-lease-second",
        ownerId: "supervisor-second",
        ownerProcessId: bound.child_process_id!,
        ownerProcessStartToken: bound.child_process_start_token!,
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        attemptId: bound.launch_attempt_id,
        expectedAttemptStateRevision: bound.attempt_state_revision,
        expectedLaunchRevision: launch.launch_revision,
        expectedAuthorizationRevision: 2,
        expectedAuthorizationStateRevision: 2
      });
      expect(second).toMatchObject({
        owner_id: "supervisor-second",
        lease_epoch: 2,
        lease_state_revision: 1,
        state: "starting"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("requires exact process-exit identity and terminalizes lease, attempt, and launch together", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const repository = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:04.000Z")
      );
      expect(() => repository.revokeVerifiedProcessExit({
        expected: fixture.expectedSupervisor,
        expectedAttemptStateRevision: fixture.attemptStateRevision,
        expectedLaunchRevision: fixture.launchRevision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        processExitEvidence: {
          exited: true,
          owner_id: fixture.lease.owner_id,
          process_id: fixture.lease.owner_process_id,
          process_start_token: "wrong-start-token",
          observed_at: "2026-07-12T00:00:04.000Z",
          exit_code: 17
        }
      })).toThrowError(expect.objectContaining({
        code: "EE_PROCESS_IDENTITY_MISMATCH"
      }));
      expect(fixture.db.prepare(
        "SELECT state, lease_state_revision FROM supervisor_leases WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        state: "starting",
        lease_state_revision: 1
      });

      expect(repository.revokeVerifiedProcessExit({
        expected: fixture.expectedSupervisor,
        expectedAttemptStateRevision: fixture.attemptStateRevision,
        expectedLaunchRevision: fixture.launchRevision,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        processExitEvidence: {
          exited: true,
          owner_id: fixture.lease.owner_id,
          process_id: fixture.lease.owner_process_id,
          process_start_token: fixture.lease.owner_process_start_token,
          observed_at: "2026-07-12T00:00:04.000Z",
          exit_code: 17
        }
      })).toMatchObject({
        state: "stopped",
        lease_terminal_reason: "verified_process_exit",
        lease_state_revision: 2
      });
      expect(fixture.db.prepare(
        "SELECT attempt_state, terminal_code FROM supervisor_launch_attempts WHERE home_id = ? AND launch_attempt_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID, fixture.attemptId)).toEqual({
        attempt_state: "terminated",
        terminal_code: "supervisor_process_exit"
      });
      expect(fixture.db.prepare(
        "SELECT launch_state, last_process_exit_code FROM supervisor_launch_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        launch_state: "backoff",
        last_process_exit_code: 17
      });
    } finally {
      fixture.db.close();
    }
  });

  it("lets renewal win an expiry race and rejects stale expiry evidence", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const renewalRepository = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:19.000Z")
      );
      const renewed = renewalRepository.renew({
        expected: fixture.expectedSupervisor,
        expectedLaunchRevision: fixture.launchRevision,
        nextState: "active"
      });
      const expiryRepository = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:21.000Z")
      );
      expect(() => expiryRepository.expireNaturally({
        expected: fixture.expectedSupervisor,
        expectedAttemptStateRevision: fixture.attemptStateRevision,
        expectedLaunchRevision: fixture.launchRevision,
        expectedHeartbeatAt: fixture.lease.heartbeat_at,
        expectedExpiresAt: fixture.lease.expires_at,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START
      })).toThrowError(expect.objectContaining({
        code: "EE_SUPERVISOR_AUTHORITY_STALE"
      }));
      expect(fixture.db.prepare(
        "SELECT state, lease_state_revision, heartbeat_at, expires_at FROM supervisor_leases WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        state: "active",
        lease_state_revision: 2,
        heartbeat_at: "2026-07-12T00:00:19.000Z",
        expires_at: "2026-07-12T00:00:39.000Z"
      });

      const winningExpiry = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:40.000Z")
      ).expireNaturally({
        expected: {
          owner_id: renewed.owner_id,
          owner_process_id: renewed.owner_process_id,
          owner_process_start_token: renewed.owner_process_start_token,
          lease_epoch: renewed.lease_epoch,
          lease_state_revision: renewed.lease_state_revision
        },
        expectedAttemptStateRevision: fixture.attemptStateRevision,
        expectedLaunchRevision: fixture.launchRevision,
        expectedHeartbeatAt: renewed.heartbeat_at,
        expectedExpiresAt: renewed.expires_at,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START
      });
      expect(winningExpiry).toMatchObject({
        state: "expired",
        lease_terminal_reason: "natural_expiry",
        lease_state_revision: 3
      });
      expect(fixture.db.prepare(
        "SELECT attempt_state FROM supervisor_launch_attempts WHERE home_id = ? AND launch_attempt_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID, fixture.attemptId)).toEqual({
        attempt_state: "lease_expired"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("fails closed on malformed observed or supervisor lease expiry timestamps", () => {
    const observedFixture = createCurrentSupervisorFixture();
    try {
      expect(() => evaluateFreshSupervisorAuthorityInTransaction({
        db: observedFixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: "not-a-timestamp"
      })).toThrowError(expect.objectContaining({
        code: "EE_PROCESS_AUTHORITY_INVALID"
      }));
    } finally {
      observedFixture.db.close();
    }

    const expiryFixture = createCurrentSupervisorFixture();
    try {
      expiryFixture.db.prepare(
        "UPDATE supervisor_leases SET expires_at = 'not-a-timestamp' WHERE home_id = ?"
      ).run(PROCESS_FIXTURE_HOME_ID);
      expect(() => evaluateFreshSupervisorAuthorityInTransaction({
        db: expiryFixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        observedAt: PROCESS_FIXTURE_START
      })).toThrowError(expect.objectContaining({
        code: "EE_PROCESS_AUTHORITY_INVALID"
      }));
    } finally {
      expiryFixture.db.close();
    }
  });
});
