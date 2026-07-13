import { describe, expect, it } from "vitest";
import {
  createS6LearningQueueMaintenanceAuthorityProvider
} from "../../src/runtime/activation/authority.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  createFixtureRouteAuthorityProvider,
  createRuntimeProductionLifecycleFixture
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";
import {
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";

const createMaintenanceJobTable = (
  fixture: ReturnType<typeof createRuntimeProductionLifecycleFixture>
): void => {
  fixture.db.exec(`
    CREATE TABLE distillation_jobs (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL,
      status TEXT NOT NULL,
      claim_id TEXT
    );
  `);
};

describe("runtime production maintenance authority", () => {
  it("allows interruption recovery from fresh supervisor authority without semantic route authority", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      createMaintenanceJobTable(fixture);
      fixture.db.prepare(
        "INSERT INTO distillation_jobs VALUES (?, ?, 'processing', ?)"
      ).run("job-recover-test", PROCESS_FIXTURE_HOME_ID, "claim-recover-test");
      const provider = createS6LearningQueueMaintenanceAuthorityProvider({
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => provider.getLearningQueueMaintenanceAuthorityInTransaction({
          db: fixture.db,
          operation: "recover_authority_loss",
          homeId: PROCESS_FIXTURE_HOME_ID,
          jobId: "job-recover-test",
          claimId: "claim-recover-test",
          observedAt: PROCESS_FIXTURE_START
        })
      });
      expect(evidence).toMatchObject({
        available: true,
        fresh: true,
        operation: "recover_authority_loss",
        owner_kind: "supervisor",
        owner_id: fixture.supervisorLease.owner_id,
        supervisor_lease_epoch: fixture.supervisorLease.lease_epoch,
        configuration_generation_id: null,
        effective_route_set_id: null,
        route_fingerprint: null,
        validation_current: null
      });
    } finally {
      fixture.db.close();
    }
  });

  it("requires exact claim binding for authority-loss recovery", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      createMaintenanceJobTable(fixture);
      fixture.db.prepare(
        "INSERT INTO distillation_jobs VALUES (?, ?, 'processing', ?)"
      ).run("job-claim-mismatch", PROCESS_FIXTURE_HOME_ID, "claim-current");
      const provider = createS6LearningQueueMaintenanceAuthorityProvider({
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => provider.getLearningQueueMaintenanceAuthorityInTransaction({
          db: fixture.db,
          operation: "recover_authority_loss",
          homeId: PROCESS_FIXTURE_HOME_ID,
          jobId: "job-claim-mismatch",
          claimId: "claim-stale",
          observedAt: PROCESS_FIXTURE_START
        })
      });
      expect(evidence).toMatchObject({
        available: false,
        fresh: false,
        reason: "recovery_authority_not_current"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("requires current validated distillation route authority before resuming blocked work", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      createMaintenanceJobTable(fixture);
      fixture.db.prepare(
        "INSERT INTO distillation_jobs VALUES (?, ?, 'blocked', NULL)"
      ).run("job-resume-test", PROCESS_FIXTURE_HOME_ID);

      const unavailable = createS6LearningQueueMaintenanceAuthorityProvider({
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const unavailableEvidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => unavailable.getLearningQueueMaintenanceAuthorityInTransaction({
          db: fixture.db,
          operation: "resume_blocked",
          homeId: PROCESS_FIXTURE_HOME_ID,
          jobId: "job-resume-test",
          observedAt: PROCESS_FIXTURE_START
        })
      });
      expect(unavailableEvidence).toMatchObject({
        available: false,
        fresh: false
      });

      const provider = createS6LearningQueueMaintenanceAuthorityProvider({
        routeAuthorityProvider: createFixtureRouteAuthorityProvider(),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => provider.getLearningQueueMaintenanceAuthorityInTransaction({
          db: fixture.db,
          operation: "resume_blocked",
          homeId: PROCESS_FIXTURE_HOME_ID,
          jobId: "job-resume-test",
          observedAt: PROCESS_FIXTURE_START
        })
      });
      expect(evidence).toMatchObject({
        available: true,
        fresh: true,
        operation: "resume_blocked",
        configuration_generation_id:
          fixture.productionHandshake.configuration_generation_id,
        effective_route_set_id:
          fixture.productionHandshake.effective_route_set_id,
        effective_route_revision: 1,
        capability: "distillation",
        route_fingerprint: "fixture-route-distillation",
        validation_current: true
      });
    } finally {
      fixture.db.close();
    }
  });

  it("allows operator cancel only with an explicit unexpired operator authority", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      createMaintenanceJobTable(fixture);
      fixture.db.prepare(
        "INSERT INTO distillation_jobs VALUES (?, ?, 'blocked', NULL)"
      ).run("job-operator-cancel", PROCESS_FIXTURE_HOME_ID);
      const provider = createS6LearningQueueMaintenanceAuthorityProvider({
        operatorAuthority: {
          ownerId: "operator-runtime-test",
          expiresAt: "2026-07-12T00:01:00.000Z"
        },
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => provider.getLearningQueueMaintenanceAuthorityInTransaction({
          db: fixture.db,
          operation: "operator_cancel",
          homeId: PROCESS_FIXTURE_HOME_ID,
          jobId: "job-operator-cancel",
          observedAt: PROCESS_FIXTURE_START
        })
      });
      expect(evidence).toMatchObject({
        available: true,
        fresh: true,
        owner_kind: "operator",
        owner_id: "operator-runtime-test",
        supervisor_lease_epoch: null
      });

      const expired = createS6LearningQueueMaintenanceAuthorityProvider({
        operatorAuthority: {
          ownerId: "operator-runtime-test",
          expiresAt: "2026-07-11T23:59:59.000Z"
        },
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const expiredEvidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => expired.getLearningQueueMaintenanceAuthorityInTransaction({
          db: fixture.db,
          operation: "operator_cancel",
          homeId: PROCESS_FIXTURE_HOME_ID,
          jobId: "job-operator-cancel",
          observedAt: PROCESS_FIXTURE_START
        })
      });
      expect(expiredEvidence).toMatchObject({
        available: false,
        fresh: false
      });
    } finally {
      fixture.db.close();
    }
  });
});
