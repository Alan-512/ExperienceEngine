import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RUNTIME_CONFIGURATION_CAPABILITIES,
  RUNTIME_ROUTE_PROJECTION_AUTHORITY_VERSION,
  RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH
} from "../../src/runtime/configuration/constants.js";
import {
  RuntimeConfigurationError
} from "../../src/runtime/configuration/errors.js";
import {
  RuntimeRouteProjectionRepository,
  readRuntimeRouteProjection
} from "../../src/runtime/configuration/route-authority.js";
import type {
  MutableRouteProjectionAuthorityProvider,
  RuntimeRouteEnvelope,
  WorkerCapabilityHealthObservation
} from "../../src/runtime/configuration/types.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  RuntimeWorkerAuthorityRepository
} from "../../src/runtime/process/worker-authority.js";
import {
  createCurrentSupervisorFixture,
  createWorkerAcquisitionProvider,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-runtime-route-projection-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const createEnvelope = (): RuntimeRouteEnvelope => ({
  route_envelope_schema_version: "runtime-route-envelope-v1",
  home_id: PROCESS_FIXTURE_HOME_ID,
  configuration_generation_id: "configuration-process-fixture",
  package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
  effective_route_set_id: "routes-process-fixture",
  override_snapshot_fingerprint: "override-process-fixture",
  capabilities: {
    learning_gate: {
      enabled: true,
      primary_route_fingerprint: "learning-gate-primary-fingerprint",
      ordered_fallback_route_fingerprints: [],
      contract_version: "learning-gate-contract-v1",
      validation_record_ids: ["validation-learning-gate"],
      auth_identity_fingerprint: "auth-learning-gate"
    },
    distillation: {
      enabled: true,
      primary_route_fingerprint: "distillation-primary-fingerprint",
      ordered_fallback_route_fingerprints: ["distillation-fallback-fingerprint"],
      contract_version: "distillation-contract-v1",
      validation_record_ids: ["validation-distillation-primary", "validation-distillation-fallback"],
      auth_identity_fingerprint: "auth-distillation"
    },
    embedding: {
      enabled: true,
      primary_route_fingerprint: "embedding-primary-fingerprint",
      ordered_fallback_route_fingerprints: [],
      contract_version: "embedding-contract-v1",
      validation_record_ids: ["validation-embedding"],
      auth_identity_fingerprint: "auth-embedding"
    },
    sync_second_opinion: {
      enabled: false,
      primary_route_fingerprint: null,
      ordered_fallback_route_fingerprints: [],
      contract_version: "sync-second-opinion-contract-v1",
      validation_record_ids: [],
      auth_identity_fingerprint: null
    },
    hybrid_postmortem: {
      enabled: false,
      primary_route_fingerprint: null,
      ordered_fallback_route_fingerprints: [],
      contract_version: "hybrid-postmortem-contract-v1",
      validation_record_ids: [],
      auth_identity_fingerprint: null
    }
  },
  created_at: PROCESS_FIXTURE_START
});

const createObservation = (options: {
  workerOwnerId: string;
  workerFencingToken: number;
}): WorkerCapabilityHealthObservation => ({
  observation_schema_version: "worker-capability-health-observation-v1",
  home_id: PROCESS_FIXTURE_HOME_ID,
  configuration_generation_id: "configuration-process-fixture",
  package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
  effective_route_set_id: "routes-process-fixture",
  worker_owner_id: options.workerOwnerId,
  worker_fencing_token: options.workerFencingToken,
  schema_version: "legacy-learning-v0",
  observed_at: PROCESS_FIXTURE_START,
  capabilities: {
    learning_gate: {
      active_route_id: "learning-gate-primary",
      active_route_kind: "primary",
      runtime_health: "healthy",
      failure_code: null,
      checked_at: PROCESS_FIXTURE_START
    },
    distillation: {
      active_route_id: "distillation-primary",
      active_route_kind: "primary",
      runtime_health: "healthy",
      failure_code: null,
      checked_at: PROCESS_FIXTURE_START
    },
    embedding: {
      active_route_id: "embedding-primary",
      active_route_kind: "primary",
      runtime_health: "healthy",
      failure_code: null,
      checked_at: PROCESS_FIXTURE_START
    },
    sync_second_opinion: {
      active_route_id: null,
      active_route_kind: "none",
      runtime_health: "disabled",
      failure_code: null,
      checked_at: PROCESS_FIXTURE_START
    },
    hybrid_postmortem: {
      active_route_id: null,
      active_route_kind: "none",
      runtime_health: "disabled",
      failure_code: null,
      checked_at: PROCESS_FIXTURE_START
    }
  }
});

const createCurrentWorkerFixture = () => {
  const fixture = createCurrentSupervisorFixture();
  const clock = createFixedProcessAuthorityClock(PROCESS_FIXTURE_START);
  const workerRepository = new RuntimeWorkerAuthorityRepository(
    fixture.db,
    PROCESS_FIXTURE_HOME_ID,
    createWorkerAcquisitionProvider({
      observedAt: PROCESS_FIXTURE_START,
      mode: "production"
    }),
    undefined,
    clock
  );
  const starting = workerRepository.acquire({
    leaseKey: "worker-route-projection",
    ownerId: "worker-route-projection",
    ownerProcessId: 7001,
    ownerProcessStartToken: "worker-route-projection-start",
    expectedSupervisor: fixture.expectedSupervisor,
    packageIdentity: PROCESS_FIXTURE_PACKAGE_IDENTITY,
    schemaVersion: "legacy-learning-v0",
    workerMode: "production",
    transitionRole: "initial_candidate"
  });
  const worker = workerRepository.renew({
    expectedWorker: {
      owner_id: starting.owner_id,
      owner_process_id: starting.owner_process_id,
      owner_process_start_token: starting.owner_process_start_token,
      fencing_token: starting.fencing_token
    },
    expectedSupervisor: fixture.expectedSupervisor,
    nextState: "active"
  });
  return { fixture, worker };
};

const createProjectionAuthorityProvider = (): MutableRouteProjectionAuthorityProvider => ({
  getMutableRouteProjectionAuthorityInTransaction(input) {
    return {
      available: true,
      fresh: true,
      authority_contract_version: RUNTIME_ROUTE_PROJECTION_AUTHORITY_VERSION,
      operation: "mutable_route_projection",
      home_id: input.homeId,
      configuration_generation_id: input.configurationGenerationId,
      package_generation_id: input.packageGenerationId,
      effective_route_set_id: input.effectiveRouteSetId,
      supervisor_owner_id: input.supervisorOwnerId,
      supervisor_lease_epoch: input.supervisorLeaseEpoch,
      worker_owner_id: input.workerOwnerId,
      worker_fencing_token: input.workerFencingToken,
      schema_version: input.schemaVersion,
      observed_at: PROCESS_FIXTURE_START,
      expires_at: "2026-07-12T01:00:00.000Z"
    };
  }
});

describe("runtime route projection authority", () => {
  it("keeps mutable route-health projection fail-closed before S6", async () => {
    const canonicalHome = makeTempDir();
    const { fixture, worker } = createCurrentWorkerFixture();
    try {
      const repository = new RuntimeRouteProjectionRepository(
        fixture.db,
        canonicalHome,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      await expect(repository.replaceFromWorkerObservation({
        writerKind: "supervisor",
        writerInstanceId: "supervisor-writer",
        expectedProjectionRevision: 0,
        expectedSupervisor: fixture.expectedSupervisor,
        envelope: createEnvelope(),
        observation: createObservation({
          workerOwnerId: worker.owner_id,
          workerFencingToken: worker.fencing_token
        })
      })).rejects.toMatchObject({
        code: "EE_ROUTE_PROJECTION_AUTHORITY_UNAVAILABLE"
      });
      const read = await repository.read();
      expect(read.status).toBe("missing");
      expect(Object.values(read.capabilities).every((state) =>
        state.runtime_health === "unknown_warming"
      )).toBe(true);
    } finally {
      fixture.db.close();
    }
  });

  it("rejects plugin and worker persistent writes even when all other inputs are current", async () => {
    const canonicalHome = makeTempDir();
    const { fixture, worker } = createCurrentWorkerFixture();
    try {
      const repository = new RuntimeRouteProjectionRepository(
        fixture.db,
        canonicalHome,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      for (const writerKind of ["plugin", "worker"] as const) {
        await expect(repository.replaceFromWorkerObservation({
          writerKind,
          writerInstanceId: `${writerKind}-writer`,
          expectedProjectionRevision: 0,
          expectedSupervisor: fixture.expectedSupervisor,
          envelope: createEnvelope(),
          observation: createObservation({
            workerOwnerId: worker.owner_id,
            workerFencingToken: worker.fencing_token
          }),
          authorityProvider: createProjectionAuthorityProvider()
        })).rejects.toMatchObject({ code: "EE_ROUTE_PROJECTION_WRITE_FORBIDDEN" });
      }
    } finally {
      fixture.db.close();
    }
  });

  it("rejects malformed or logically impossible worker health observations", async () => {
    const canonicalHome = makeTempDir();
    const { fixture, worker } = createCurrentWorkerFixture();
    try {
      const repository = new RuntimeRouteProjectionRepository(
        fixture.db,
        canonicalHome,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const malformedTime = createObservation({
        workerOwnerId: worker.owner_id,
        workerFencingToken: worker.fencing_token
      });
      malformedTime.observed_at = "2026-07-12T00:00:00+00:00";
      await expect(repository.replaceFromWorkerObservation({
        writerKind: "supervisor",
        writerInstanceId: "supervisor-writer",
        expectedProjectionRevision: 0,
        expectedSupervisor: fixture.expectedSupervisor,
        envelope: createEnvelope(),
        observation: malformedTime,
        authorityProvider: createProjectionAuthorityProvider()
      })).rejects.toMatchObject({ code: "EE_ROUTE_AUTHORITY_INVALID" });

      const impossibleHealth = createObservation({
        workerOwnerId: worker.owner_id,
        workerFencingToken: worker.fencing_token
      });
      impossibleHealth.capabilities.learning_gate = {
        active_route_id: null,
        active_route_kind: "none",
        runtime_health: "healthy",
        failure_code: null,
        checked_at: PROCESS_FIXTURE_START
      };
      await expect(repository.replaceFromWorkerObservation({
        writerKind: "supervisor",
        writerInstanceId: "supervisor-writer",
        expectedProjectionRevision: 0,
        expectedSupervisor: fixture.expectedSupervisor,
        envelope: createEnvelope(),
        observation: impossibleHealth,
        authorityProvider: createProjectionAuthorityProvider()
      })).rejects.toMatchObject({ code: "EE_ROUTE_AUTHORITY_INVALID" });
    } finally {
      fixture.db.close();
    }
  });

  it("atomically replaces the complete projection only with current supervisor, worker fence, and S6 authority", async () => {
    const canonicalHome = makeTempDir();
    const { fixture, worker } = createCurrentWorkerFixture();
    try {
      const repository = new RuntimeRouteProjectionRepository(
        fixture.db,
        canonicalHome,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      const envelope = createEnvelope();
      const observation = createObservation({
        workerOwnerId: worker.owner_id,
        workerFencingToken: worker.fencing_token
      });
      const projection = await repository.replaceFromWorkerObservation({
        writerKind: "supervisor",
        writerInstanceId: "supervisor-writer",
        expectedProjectionRevision: 0,
        expectedSupervisor: fixture.expectedSupervisor,
        envelope,
        observation,
        authorityProvider: createProjectionAuthorityProvider()
      });
      expect(projection).toMatchObject({
        projection_revision: 1,
        home_id: PROCESS_FIXTURE_HOME_ID,
        configuration_generation_id: envelope.configuration_generation_id,
        package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        effective_route_set_id: envelope.effective_route_set_id,
        supervisor_owner_id: fixture.expectedSupervisor.owner_id,
        supervisor_lease_epoch: fixture.expectedSupervisor.lease_epoch,
        worker_owner_id: worker.owner_id,
        worker_fencing_token: worker.fencing_token
      });
      expect(Object.keys(projection.capabilities).sort()).toEqual(
        [...RUNTIME_CONFIGURATION_CAPABILITIES].sort()
      );
      const current = await repository.read({
        homeId: PROCESS_FIXTURE_HOME_ID,
        configurationGenerationId: envelope.configuration_generation_id,
        packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        effectiveRouteSetId: envelope.effective_route_set_id,
        supervisorOwnerId: fixture.expectedSupervisor.owner_id,
        supervisorLeaseEpoch: fixture.expectedSupervisor.lease_epoch,
        workerOwnerId: worker.owner_id,
        workerFencingToken: worker.fencing_token
      });
      expect(current.status).toBe("current");
      expect(current.projection).toEqual(projection);
      const projectionText = readFileSync(
        join(canonicalHome, ...RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH.split("/")),
        "utf8"
      );
      expect(projectionText).toContain("\"projection_revision\": 1");
      expect(projectionText).not.toContain("partial");

      await expect(repository.replaceFromWorkerObservation({
        writerKind: "supervisor",
        writerInstanceId: "supervisor-writer",
        expectedProjectionRevision: 0,
        expectedSupervisor: fixture.expectedSupervisor,
        envelope,
        observation,
        authorityProvider: createProjectionAuthorityProvider()
      })).rejects.toBeInstanceOf(RuntimeConfigurationError);

      await expect(repository.replaceFromWorkerObservation({
        writerKind: "supervisor",
        writerInstanceId: "supervisor-writer",
        expectedProjectionRevision: 1,
        expectedSupervisor: fixture.expectedSupervisor,
        envelope,
        observation: {
          ...observation,
          worker_fencing_token: worker.fencing_token + 1
        },
        authorityProvider: createProjectionAuthorityProvider()
      })).rejects.toMatchObject({ code: "EE_ROUTE_AUTHORITY_INVALID" });
    } finally {
      fixture.db.close();
    }
  });

  it("ignores a projection whose worker fence no longer matches current authority", async () => {
    const canonicalHome = makeTempDir();
    const { fixture, worker } = createCurrentWorkerFixture();
    try {
      const repository = new RuntimeRouteProjectionRepository(
        fixture.db,
        canonicalHome,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      );
      await repository.replaceFromWorkerObservation({
        writerKind: "supervisor",
        writerInstanceId: "supervisor-writer",
        expectedProjectionRevision: 0,
        expectedSupervisor: fixture.expectedSupervisor,
        envelope: createEnvelope(),
        observation: createObservation({
          workerOwnerId: worker.owner_id,
          workerFencingToken: worker.fencing_token
        }),
        authorityProvider: createProjectionAuthorityProvider()
      });
      const stale = await readRuntimeRouteProjection({
        canonicalHome,
        expected: {
          homeId: PROCESS_FIXTURE_HOME_ID,
          configurationGenerationId: "configuration-process-fixture",
          packageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
          effectiveRouteSetId: "routes-process-fixture",
          workerOwnerId: worker.owner_id,
          workerFencingToken: worker.fencing_token + 1
        }
      });
      expect(stale.status).toBe("authority_mismatch");
      expect(Object.values(stale.capabilities).some((state) =>
        state.runtime_health === "healthy"
      )).toBe(false);
    } finally {
      fixture.db.close();
    }
  });
});
