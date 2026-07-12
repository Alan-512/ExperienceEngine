import { describe, expect, it } from "vitest";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  RuntimeSupervisorAuthorityRepository
} from "../../src/runtime/process/supervisor-authority.js";
import {
  RuntimeWorkerAuthorityRepository
} from "../../src/runtime/process/worker-authority.js";
import {
  createCurrentSupervisorFixture,
  createProductionWriteProvider,
  createWorkerAcquisitionProvider,
  PROCESS_FIXTURE_ARTIFACT,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const acquireWorker = (options: {
  mode?: "production" | "activation_only";
  ownerId?: string;
  ownerProcessId?: number;
} = {}) => {
  const fixture = createCurrentSupervisorFixture();
  const mode = options.mode ?? "activation_only";
  const repository = new RuntimeWorkerAuthorityRepository(
    fixture.db,
    PROCESS_FIXTURE_HOME_ID,
    createWorkerAcquisitionProvider({
      observedAt: PROCESS_FIXTURE_START,
      mode
    }),
    undefined,
    createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
  );
  const worker = repository.acquire({
    leaseKey: "worker-lease-test",
    ownerId: options.ownerId ?? "worker-a",
    ownerProcessId: options.ownerProcessId ?? 6001,
    ownerProcessStartToken: "worker-start-a",
    expectedSupervisor: fixture.expectedSupervisor,
    packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
    schemaVersion: "legacy-learning-v0",
    workerMode: mode,
    transitionRole: "initial_candidate"
  });
  return { fixture, repository, worker };
};

const expectedWorker = (worker: {
  owner_id: string;
  owner_process_id: number;
  owner_process_start_token: string;
  fencing_token: number;
}) => ({
  owner_id: worker.owner_id,
  owner_process_id: worker.owner_process_id,
  owner_process_start_token: worker.owner_process_start_token,
  fencing_token: worker.fencing_token
});

describe("runtime worker authority", () => {
  it("keeps runtime worker acquisition unavailable before S6", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const repository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        undefined,
        undefined,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      expect(() => repository.acquire({
        leaseKey: "worker-unavailable",
        ownerId: "worker-unavailable",
        ownerProcessId: 6101,
        ownerProcessStartToken: "worker-unavailable-start",
        expectedSupervisor: fixture.expectedSupervisor,
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "activation_only",
        transitionRole: "initial_candidate"
      })).toThrowError(expect.objectContaining({
        code: "EE_WORKER_ACQUISITION_AUTHORITY_REQUIRED"
      }));
      expect(fixture.db.prepare("SELECT * FROM worker_leases").all()).toEqual([]);
    } finally {
      fixture.db.close();
    }
  });

  it("acquires one activation-only worker and enforces its exact operation allowlist", () => {
    const { fixture, repository, worker } = acquireWorker();
    try {
      expect(worker).toMatchObject({
        owner_id: "worker-a",
        fencing_token: 1,
        worker_mode: "activation_only",
        state: "starting",
        supervisor_owner_id: fixture.lease.owner_id,
        supervisor_lease_epoch: fixture.lease.lease_epoch
      });
      expect(repository.assertProtectedOperation({
        expectedWorker: expectedWorker(worker),
        operation: "runtime_health_probe"
      })).toMatchObject({
        allowed: true,
        effectiveMode: "activation_only",
        semanticWriteAuthorized: false
      });
      expect(() => repository.assertProtectedOperation({
        expectedWorker: {
          ...expectedWorker(worker),
          owner_process_start_token: "stale-worker-process"
        },
        operation: "runtime_health_probe"
      })).toThrowError(expect.objectContaining({
        code: "EE_WORKER_AUTHORITY_STALE"
      }));
      expect(() => repository.assertProtectedOperation({
        expectedWorker: expectedWorker(worker),
        operation: "queue_claim"
      })).toThrowError(expect.objectContaining({
        code: "EE_WORKER_OPERATION_FORBIDDEN"
      }));
    } finally {
      fixture.db.close();
    }
  });

  it("keeps a production-mode worker semantically activation-only until exact S6 write authority", () => {
    const fixture = createCurrentSupervisorFixture();
    try {
      const acquisition = createWorkerAcquisitionProvider({
        observedAt: PROCESS_FIXTURE_START,
        mode: "production"
      });
      const blockedRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        acquisition,
        undefined,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const worker = blockedRepository.acquire({
        leaseKey: "worker-production",
        ownerId: "worker-production",
        ownerProcessId: 6201,
        ownerProcessStartToken: "worker-production-start",
        expectedSupervisor: fixture.expectedSupervisor,
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "production",
        transitionRole: "initial_candidate"
      });
      expect(blockedRepository.assertProtectedOperation({
        expectedWorker: expectedWorker(worker),
        operation: "production_activation_handshake"
      })).toMatchObject({
        allowed: true,
        effectiveMode: "activation_only",
        semanticWriteAuthorized: false
      });
      expect(() => blockedRepository.assertProtectedOperation({
        expectedWorker: expectedWorker(worker),
        operation: "queue_claim"
      })).toThrowError(expect.objectContaining({
        code: "EE_WORKER_OPERATION_FORBIDDEN"
      }));

      const authorizedRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        acquisition,
        createProductionWriteProvider({
          observedAt: PROCESS_FIXTURE_START,
          operation: "queue_claim"
        }),
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      expect(authorizedRepository.assertProtectedOperation({
        expectedWorker: expectedWorker(worker),
        operation: "queue_claim"
      })).toMatchObject({
        allowed: true,
        effectiveMode: "production",
        semanticWriteAuthorized: true
      });
      expect(() => authorizedRepository.assertProtectedOperation({
        expectedWorker: expectedWorker(worker),
        operation: "node_write"
      })).toThrowError(expect.objectContaining({
        code: "EE_WORKER_OPERATION_FORBIDDEN"
      }));
    } finally {
      fixture.db.close();
    }
  });

  it("renews, drains, and releases only the current owner and fence", () => {
    const { fixture, worker } = acquireWorker();
    try {
      const activeRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createWorkerAcquisitionProvider({ observedAt: PROCESS_FIXTURE_START }),
        undefined,
        createFixedProcessAuthorityClock("2026-07-12T00:00:05.000Z")
      );
      const active = activeRepository.renew({
        expectedWorker: expectedWorker(worker),
        expectedSupervisor: fixture.expectedSupervisor,
        nextState: "active"
      });
      expect(active).toMatchObject({
        state: "active",
        heartbeat_at: "2026-07-12T00:00:05.000Z",
        expires_at: "2026-07-12T00:00:25.000Z"
      });
      const drainRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createWorkerAcquisitionProvider({ observedAt: PROCESS_FIXTURE_START }),
        undefined,
        createFixedProcessAuthorityClock("2026-07-12T00:00:06.000Z")
      );
      expect(drainRepository.requestDrain({
        expectedWorker: expectedWorker(active),
        expectedSupervisor: fixture.expectedSupervisor
      })).toMatchObject({
        state: "draining",
        shutdown_requested_at: "2026-07-12T00:00:06.000Z",
        drain_deadline_at: "2026-07-12T00:00:36.000Z"
      });
      expect(() => drainRepository.release({
        expectedWorker: {
          ...expectedWorker(active),
          fencing_token: active.fencing_token - 1
        },
        expectedSupervisor: fixture.expectedSupervisor
      })).toThrowError(expect.objectContaining({
        code: "EE_WORKER_AUTHORITY_STALE"
      }));
      const releaseRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createWorkerAcquisitionProvider({ observedAt: PROCESS_FIXTURE_START }),
        undefined,
        createFixedProcessAuthorityClock("2026-07-12T00:00:07.000Z")
      );
      expect(releaseRepository.release({
        expectedWorker: expectedWorker(active),
        expectedSupervisor: fixture.expectedSupervisor
      })).toMatchObject({
        state: "stopped",
        heartbeat_at: "2026-07-12T00:00:06.999Z",
        expires_at: "2026-07-12T00:00:07.000Z"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("takes over only an expired worker with a strictly increasing fence", () => {
    const { fixture, worker } = acquireWorker({ ownerId: "worker-old" });
    try {
      const supervisorRepository = new RuntimeSupervisorAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock("2026-07-12T00:00:10.000Z")
      );
      const renewedSupervisor = supervisorRepository.renew({
        expected: fixture.expectedSupervisor,
        expectedLaunchRevision: fixture.launchRevision,
        nextState: "active"
      });
      const expectedSupervisor = {
        owner_id: renewedSupervisor.owner_id,
        owner_process_id: renewedSupervisor.owner_process_id,
        owner_process_start_token: renewedSupervisor.owner_process_start_token,
        lease_epoch: renewedSupervisor.lease_epoch,
        lease_state_revision: renewedSupervisor.lease_state_revision
      };
      const takeoverRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createWorkerAcquisitionProvider({
          observedAt: "2026-07-12T00:00:21.000Z"
        }),
        undefined,
        createFixedProcessAuthorityClock("2026-07-12T00:00:21.000Z")
      );
      const replacement = takeoverRepository.acquire({
        leaseKey: "worker-lease-replacement",
        ownerId: "worker-new",
        ownerProcessId: 6302,
        ownerProcessStartToken: "worker-new-start",
        expectedSupervisor,
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "activation_only",
        transitionRole: "initial_candidate"
      });
      expect(replacement).toMatchObject({
        owner_id: "worker-new",
        fencing_token: worker.fencing_token + 1,
        state: "starting"
      });
      expect(() => takeoverRepository.assertProtectedOperation({
        expectedWorker: expectedWorker(worker),
        operation: "runtime_health_probe"
      })).toThrowError(expect.objectContaining({
        code: "EE_WORKER_AUTHORITY_STALE"
      }));
      expect(takeoverRepository.assertProtectedOperation({
        expectedWorker: expectedWorker(replacement),
        operation: "runtime_health_probe"
      })).toMatchObject({ allowed: true, semanticWriteAuthorized: false });
    } finally {
      fixture.db.close();
    }
  });

  it("records exact worker crash evidence and advances supervisor restart budget atomically", () => {
    const { fixture, worker } = acquireWorker();
    try {
      const repository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createWorkerAcquisitionProvider({ observedAt: PROCESS_FIXTURE_START }),
        undefined,
        createFixedProcessAuthorityClock("2026-07-12T00:00:05.000Z")
      );
      expect(() => repository.recordCrashAndConsumeRestartBudget({
        expectedWorker: expectedWorker(worker),
        expectedSupervisor: fixture.expectedSupervisor,
        processExitEvidence: {
          exited: true,
          owner_id: worker.owner_id,
          process_id: worker.owner_process_id,
          process_start_token: "wrong-worker-start",
          observed_at: "2026-07-12T00:00:05.000Z",
          exit_code: 9
        },
        failureCode: "worker_crash"
      })).toThrowError(expect.objectContaining({
        code: "EE_PROCESS_IDENTITY_MISMATCH"
      }));
      const result = repository.recordCrashAndConsumeRestartBudget({
        expectedWorker: expectedWorker(worker),
        expectedSupervisor: fixture.expectedSupervisor,
        processExitEvidence: {
          exited: true,
          owner_id: worker.owner_id,
          process_id: worker.owner_process_id,
          process_start_token: worker.owner_process_start_token,
          observed_at: "2026-07-12T00:00:05.000Z",
          exit_code: 9
        },
        failureCode: "worker_crash"
      });
      expect(result).toMatchObject({
        restartAllowed: true,
        nextRestartAt: "2026-07-12T00:00:06.000Z",
        restartCountInWindow: 1,
        worker: {
          state: "stopped",
          last_failure_code: "worker_crash",
          heartbeat_at: "2026-07-12T00:00:04.999Z",
          expires_at: "2026-07-12T00:00:05.000Z"
        }
      });
      expect(fixture.db.prepare(
        "SELECT lease_state_revision, worker_restart_count_in_window FROM supervisor_leases WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID)).toEqual({
        lease_state_revision: 2,
        worker_restart_count_in_window: 1
      });
    } finally {
      fixture.db.close();
    }
  });

  it("fails closed on malformed S6 worker-acquisition and production-write timestamps", () => {
    for (const provider of [
      createWorkerAcquisitionProvider({
        observedAt: "not-a-timestamp"
      }),
      createWorkerAcquisitionProvider({
        observedAt: PROCESS_FIXTURE_START,
        expiresAt: "not-a-timestamp"
      })
    ]) {
      const fixture = createCurrentSupervisorFixture();
      try {
        const repository = new RuntimeWorkerAuthorityRepository(
          fixture.db,
          PROCESS_FIXTURE_HOME_ID,
          provider,
          undefined,
          createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
        );
        expect(() => repository.acquire({
          leaseKey: "worker-malformed-s6",
          ownerId: "worker-malformed-s6",
          ownerProcessId: 6401,
          ownerProcessStartToken: "worker-malformed-s6-start",
          expectedSupervisor: fixture.expectedSupervisor,
          packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
          schemaVersion: "legacy-learning-v0",
          workerMode: "activation_only",
          transitionRole: "initial_candidate"
        })).toThrowError(expect.objectContaining({
          code: "EE_PROCESS_AUTHORITY_INVALID"
        }));
      } finally {
        fixture.db.close();
      }
    }

    const fixture = createCurrentSupervisorFixture();
    try {
      const acquisition = createWorkerAcquisitionProvider({
        observedAt: PROCESS_FIXTURE_START,
        mode: "production"
      });
      const acquisitionRepository = new RuntimeWorkerAuthorityRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        acquisition,
        undefined,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const worker = acquisitionRepository.acquire({
        leaseKey: "worker-malformed-production",
        ownerId: "worker-malformed-production",
        ownerProcessId: 6402,
        ownerProcessStartToken: "worker-malformed-production-start",
        expectedSupervisor: fixture.expectedSupervisor,
        packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
        schemaVersion: "legacy-learning-v0",
        workerMode: "production",
        transitionRole: "initial_candidate"
      });
      for (const productionProvider of [
        createProductionWriteProvider({
          observedAt: "not-a-timestamp",
          operation: "queue_claim"
        }),
        createProductionWriteProvider({
          observedAt: PROCESS_FIXTURE_START,
          expiresAt: "not-a-timestamp",
          operation: "queue_claim"
        })
      ]) {
        const repository = new RuntimeWorkerAuthorityRepository(
          fixture.db,
          PROCESS_FIXTURE_HOME_ID,
          acquisition,
          productionProvider,
          createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
        );
        expect(() => repository.assertProtectedOperation({
          expectedWorker: expectedWorker(worker),
          operation: "queue_claim"
        })).toThrowError(expect.objectContaining({
          code: "EE_PROCESS_AUTHORITY_INVALID"
        }));
      }
    } finally {
      fixture.db.close();
    }
  });
});
