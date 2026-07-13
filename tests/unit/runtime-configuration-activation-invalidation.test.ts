import { describe, expect, it } from "vitest";
import {
  createS6ConfigurationActivationInvalidationProvider
} from "../../src/runtime/activation/configuration-invalidation.js";
import {
  evaluateCanonicalProductionActivationInTransaction
} from "../../src/runtime/activation/authority.js";
import {
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";
import {
  createRuntimeProductionLifecycleFixture,
  PRODUCTION_FIXTURE_CONFIGURATION_ID
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const COMMIT_TIME = "2026-07-12T00:00:01.000Z";
const NEXT_CONFIGURATION_ID = "configuration-invalidation-next-test";

const seedNextConfiguration = (
  fixture: ReturnType<typeof createRuntimeProductionLifecycleFixture>
): void => {
  fixture.db.prepare(
    `INSERT INTO configuration_generations (
      generation_id, home_id, parent_generation_id, manifest_digest,
      integrity_key_id, profile_registry_digest, created_by_instance_id,
      created_at, committed_at, generation_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed')`
  ).run(
    NEXT_CONFIGURATION_ID,
    PROCESS_FIXTURE_HOME_ID,
    PRODUCTION_FIXTURE_CONFIGURATION_ID,
    "manifest-invalidation-next-test",
    "integrity-key-test",
    "profile-registry-test",
    "configuration-invalidation-test",
    COMMIT_TIME,
    COMMIT_TIME
  );
};

describe("runtime configuration activation invalidation", () => {
  it("commits the pointer change and exact production worker block in one transaction", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      seedNextConfiguration(fixture);
      const provider = createS6ConfigurationActivationInvalidationProvider();
      runRuntimeImmediateTransaction(fixture.db, {
        category: "configuration_commit",
        operation: () => {
          provider.invalidateForConfigurationCommitInTransaction({
            db: fixture.db,
            homeId: PROCESS_FIXTURE_HOME_ID,
            currentConfigurationGenerationId:
              PRODUCTION_FIXTURE_CONFIGURATION_ID,
            nextConfigurationGenerationId: NEXT_CONFIGURATION_ID,
            committedAt: COMMIT_TIME
          });
          const update = fixture.db.prepare(
            `UPDATE configuration_pointer
             SET pointer_revision = pointer_revision + 1,
                 previous_generation_id = generation_id,
                 generation_id = ?,
                 manifest_digest = ?,
                 commit_id = ?,
                 committed_at = ?
             WHERE home_id = ? AND generation_id = ?`
          ).run(
            NEXT_CONFIGURATION_ID,
            "manifest-invalidation-next-test",
            "commit-invalidation-next-test",
            COMMIT_TIME,
            PROCESS_FIXTURE_HOME_ID,
            PRODUCTION_FIXTURE_CONFIGURATION_ID
          );
          expect(Number(update.changes)).toBe(1);
        }
      });
      expect(fixture.db.prepare(
        `SELECT generation_id, previous_generation_id
         FROM configuration_pointer WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        generation_id: NEXT_CONFIGURATION_ID,
        previous_generation_id: PRODUCTION_FIXTURE_CONFIGURATION_ID
      });
      expect(fixture.db.prepare(
        `SELECT state, fencing_token, shutdown_requested_at,
                drain_deadline_at, last_failure_code
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toMatchObject({
        state: "blocked",
        fencing_token: fixture.productionWorker.fencing_token,
        shutdown_requested_at: COMMIT_TIME,
        last_failure_code: "EE_CONFIGURATION_POINTER_CONFLICT"
      });
      const canonical = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => evaluateCanonicalProductionActivationInTransaction({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          observedAt: COMMIT_TIME
        })
      });
      expect(canonical).toMatchObject({ available: false, fresh: false });
    } finally {
      fixture.db.close();
    }
  });

  it("rolls the worker block back when the enclosing configuration transaction fails", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const provider = createS6ConfigurationActivationInvalidationProvider();
      expect(() => runRuntimeImmediateTransaction(fixture.db, {
        category: "configuration_commit",
        operation: () => {
          provider.invalidateForConfigurationCommitInTransaction({
            db: fixture.db,
            homeId: PROCESS_FIXTURE_HOME_ID,
            currentConfigurationGenerationId:
              PRODUCTION_FIXTURE_CONFIGURATION_ID,
            nextConfigurationGenerationId: NEXT_CONFIGURATION_ID,
            committedAt: COMMIT_TIME
          });
          throw new Error("abort configuration commit");
        }
      })).toThrowError("abort configuration commit");
      expect(fixture.db.prepare(
        `SELECT state, shutdown_requested_at, drain_deadline_at,
                last_failure_code
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        state: "active",
        shutdown_requested_at: null,
        drain_deadline_at: null,
        last_failure_code: null
      });
      expect(fixture.db.prepare(
        `SELECT generation_id FROM configuration_pointer WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        generation_id: PRODUCTION_FIXTURE_CONFIGURATION_ID
      });
    } finally {
      fixture.db.close();
    }
  });
});
