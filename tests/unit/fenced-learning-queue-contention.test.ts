import {
  mkdtempSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  FencedLearningQueueRepository
} from "../../src/runtime/learning-queue/repository.js";
import {
  bootstrapDatabase
} from "../../src/store/sqlite/db.js";
import {
  CandidateRepository
} from "../../src/store/sqlite/repositories/candidate-repo.js";
import {
  createMaintenanceAuthorityProvider,
  createProductionAuthorityProvider,
  createQueueCandidate,
  createQueueSemanticOrigin,
  QUEUE_FIXTURE_CLAIM_EXPIRY,
  QUEUE_FIXTURE_HOME_ID,
  QUEUE_FIXTURE_NOW
} from "../fixtures/fenced-learning-queue-fixture.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("fenced learning queue contention", () => {
  it("maps write-lock contention before claim to EE_SQLITE_BUSY and commits exactly one later claim", () => {
    const directory = mkdtempSync(join(tmpdir(), "ee-fenced-queue-contention-"));
    tempDirs.push(directory);
    const databasePath = join(directory, "learning.db");
    const firstDb = new DatabaseSync(databasePath);
    const secondDb = new DatabaseSync(databasePath);
    try {
      bootstrapDatabase(firstDb);
      bootstrapDatabase(secondDb);
      secondDb.exec("PRAGMA busy_timeout = 1");
      new CandidateRepository(firstDb).upsert(createQueueCandidate());
      const first = new FencedLearningQueueRepository(
        firstDb,
        QUEUE_FIXTURE_HOME_ID,
        createProductionAuthorityProvider(),
        createMaintenanceAuthorityProvider()
      );
      const second = new FencedLearningQueueRepository(
        secondDb,
        QUEUE_FIXTURE_HOME_ID,
        createProductionAuthorityProvider(),
        createMaintenanceAuthorityProvider()
      );
      first.registerPendingJob({
        jobId: "job-contention",
        candidateId: "candidate-fenced-queue",
        extractorProfile: "balanced",
        routeFingerprint: "route-fingerprint-fenced-queue",
        semanticOrigin: createQueueSemanticOrigin(),
        createdAt: QUEUE_FIXTURE_NOW
      });

      firstDb.exec("BEGIN IMMEDIATE");
      expect(() => second.claimNext({
        claimId: "claim-lost-to-lock",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })).toThrowError(expect.objectContaining({ code: "EE_SQLITE_BUSY" }));
      firstDb.exec("ROLLBACK");

      const winner = first.claimNext({
        claimId: "claim-contention-winner",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      });
      expect(winner).toMatchObject({
        status: "processing",
        claim_id: "claim-contention-winner",
        system_attempt_count: 1
      });
      expect(second.claimNext({
        claimId: "claim-contention-duplicate",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })).toBeUndefined();
      expect(firstDb.prepare(
        `SELECT COUNT(*) AS count FROM distillation_jobs
         WHERE home_id = ? AND status = 'processing'`
      ).get(QUEUE_FIXTURE_HOME_ID)).toEqual({ count: 1 });
    } finally {
      if (firstDb.isTransaction) {
        firstDb.exec("ROLLBACK");
      }
      firstDb.close();
      secondDb.close();
    }
  });
});

