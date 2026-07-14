import { describe, expect, it, vi } from "vitest";
import {
  RuntimePackageLocalServiceController
} from "../../src/runtime/activation/service-controller.js";
import {
  RuntimePackageActivationRepository
} from "../../src/runtime/activation/repository.js";
import {
  RuntimePackageLocalSupervisorLeaseSession
} from "../../src/runtime/package/supervisor-runtime.js";
import {
  RuntimePackageLocalWorkerLeaseSession,
  parsePackageLocalWorkerEnvironment
} from "../../src/runtime/package/worker-runtime.js";
import {
  RuntimePackageWorkerLauncher,
  type PackageLocalWorkerLaunchContext,
  type SpawnedWorkerProcess,
  type WorkerProcessSpawner
} from "../../src/runtime/activation/worker-launcher.js";
import type {
  SpawnedSupervisorProcess
} from "../../src/runtime/activation/supervisor-launcher.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  initializeRuntimeSchemaMetadata
} from "../../src/runtime/schema/migration-authority.js";
import {
  ACTIVATION_FIXTURE_GATEWAY_ID,
  ACTIVATION_FIXTURE_GATEWAY_START,
  ACTIVATION_FIXTURE_HOME_ID,
  ACTIVATION_FIXTURE_NOW,
  ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
  ACTIVATION_FIXTURE_PACKAGE_ID,
  createActivationFixtureRuntimeIdentityEnvelope,
  createRuntimeProductionActivationDatabase
} from "../fixtures/runtime-production-activation-fixture.js";

const fakeSupervisorChild = (pid: number): SpawnedSupervisorProcess => ({
  pid,
  kill: vi.fn(() => true),
  once: vi.fn() as unknown as SpawnedSupervisorProcess["once"],
  unref: vi.fn()
});

const fakeWorkerChild = (pid: number): SpawnedWorkerProcess => ({
  pid,
  kill: vi.fn(() => true),
  once: vi.fn() as unknown as SpawnedWorkerProcess["once"],
  on: vi.fn() as unknown as SpawnedWorkerProcess["on"],
  unref: vi.fn(),
  connected: true,
  send: vi.fn(() => true) as unknown as SpawnedWorkerProcess["send"]
});

const createActivationWorkerAuthority = async () => {
  const db = createRuntimeProductionActivationDatabase();
  const envelope = createActivationFixtureRuntimeIdentityEnvelope();
  const ids = ["attempt-worker-runtime-test"];
  const controller = new RuntimePackageLocalServiceController({
    db,
    homeId: ACTIVATION_FIXTURE_HOME_ID,
    gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
    gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
    currentPluginPackageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
    runtimeIdentityEnvelope: envelope,
    resolvePackageGeneration: () => ({
      packageRoot: process.cwd(),
      packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE
    }),
    processStartTokenResolver: (pid) => `os-worker-supervisor-${pid}`,
    spawner: () => fakeSupervisorChild(8911),
    idFactory: () => ids.shift()!,
    clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
  });
  expect(controller.start()).toMatchObject({
    ok: false,
    code: "package_activation_initialization_required"
  });
  new RuntimePackageActivationRepository(
    db,
    ACTIVATION_FIXTURE_HOME_ID,
    createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
  ).initializePackageActivation({
    expectedActivationRevision: 0,
    expectedLaunchRevision: 0,
    authorizationId: "authorization-worker-runtime-test",
    packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
    writer: {
      kind: "gateway_service_controller",
      gateway_instance_id: ACTIVATION_FIXTURE_GATEWAY_ID,
      gateway_process_start_token: ACTIVATION_FIXTURE_GATEWAY_START,
      plugin_package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID
    }
  });
  expect(controller.start()).toMatchObject({
    ok: true,
    code: "supervisor_launch_reserved_and_bound"
  });
  const supervisorIds = [
    "supervisor-lease-worker-runtime-test",
    "supervisor-owner-worker-runtime-test"
  ];
  const supervisor = new RuntimePackageLocalSupervisorLeaseSession({
    db,
    context: {
      packageRoot: process.cwd(),
      identityEnvelope: envelope,
      packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
      launchAttemptId: "attempt-worker-runtime-test",
      launchAuthorizationId: "authorization-worker-runtime-test"
    },
    processId: 8911,
    processStartTokenResolver: (pid) => `os-worker-supervisor-${pid}`,
    idFactory: () => supervisorIds.shift()!,
    clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW),
    observedAt: () => ACTIVATION_FIXTURE_NOW,
    verifyClosure: () => ({
      closureManifestDigest:
        ACTIVATION_FIXTURE_PACKAGE_CLOSURE.closure_manifest_digest
    })
  });
  const supervisorLease = await supervisor.acquireAndActivate();
  initializeRuntimeSchemaMetadata({
    db,
    homeId: ACTIVATION_FIXTURE_HOME_ID,
    writer: "package_local_initializer",
    verifyCurrentSchema() {
      return undefined;
    }
  });
  supervisor.enterInitialMigrationIfNeeded();
  const context: PackageLocalWorkerLaunchContext = {
    context_schema_version: "package-local-worker-context-v1",
    identityEnvelope: envelope,
    packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
    workerOwnerId: "worker-owner-runtime-test",
    expectedSupervisor: {
      owner_id: supervisorLease.owner_id,
      owner_process_id: supervisorLease.owner_process_id,
      owner_process_start_token: supervisorLease.owner_process_start_token,
      lease_epoch: supervisorLease.lease_epoch
    },
    workerMode: "activation_only",
    transitionRole: "initial_candidate",
    schemaVersion: "legacy-learning-v0"
  };
  return { db, supervisor, supervisorLease, context };
};

describe("package-local worker runtime", () => {
  it("passes one immutable worker context through the package-local launcher", () => {
    const child = fakeWorkerChild(8921);
    const spawner = vi.fn((_: Parameters<WorkerProcessSpawner>[0]) => child);
    const envelope = createActivationFixtureRuntimeIdentityEnvelope();
    const launched = new RuntimePackageWorkerLauncher(
      process.cwd(),
      spawner
    ).launch({
      packageIdentity: ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
      runtimeIdentityEnvelope: envelope,
      packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
      workerOwnerId: "worker-owner-launcher-test",
      expectedSupervisor: {
        owner_id: "supervisor-owner-launcher-test",
        owner_process_id: 8901,
        owner_process_start_token: "supervisor-start-launcher-test",
        lease_epoch: 1
      },
      workerMode: "activation_only",
      transitionRole: "initial_candidate",
      schemaVersion: "legacy-learning-v0"
    });
    expect(launched).toMatchObject({
      childProcessId: 8921,
      workerOwnerId: "worker-owner-launcher-test"
    });
    const spawnOptions = spawner.mock.calls[0][0];
    expect(parsePackageLocalWorkerEnvironment(spawnOptions.env)).toMatchObject({
      workerOwnerId: "worker-owner-launcher-test",
      workerMode: "activation_only",
      transitionRole: "initial_candidate",
      schemaVersion: "legacy-learning-v0"
    });
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("acquires a monotonic activation-only fence and releases under the exact supervisor epoch", async () => {
    const fixture = await createActivationWorkerAuthority();
    try {
      const worker = new RuntimePackageLocalWorkerLeaseSession({
        db: fixture.db,
        packageRoot: process.cwd(),
        context: fixture.context,
        processId: 8922,
        processStartTokenResolver: (pid) => `os-worker-runtime-${pid}`,
        idFactory: () => "worker-lease-key-runtime-test",
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW),
        observedAt: () => ACTIVATION_FIXTURE_NOW,
        verifyClosure: () => ({
          closureManifestDigest:
            ACTIVATION_FIXTURE_PACKAGE_CLOSURE.closure_manifest_digest
        })
      });
      const active = worker.acquireAndActivate();
      expect(active).toMatchObject({
        owner_id: "worker-owner-runtime-test",
        owner_process_id: 8922,
        owner_process_start_token: "os-worker-runtime-8922",
        supervisor_owner_id: fixture.supervisorLease.owner_id,
        supervisor_lease_epoch: fixture.supervisorLease.lease_epoch,
        worker_mode: "activation_only",
        state: "active",
        fencing_token: 1
      });
      expect(worker.release()).toMatchObject({
        state: "stopped",
        fencing_token: 1
      });
      expect(fixture.supervisor.release()).toMatchObject({
        state: "stopped",
        lease_terminal_reason: "graceful_release"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("rejects a worker context bound to a different supervisor process", async () => {
    const fixture = await createActivationWorkerAuthority();
    try {
      const worker = new RuntimePackageLocalWorkerLeaseSession({
        db: fixture.db,
        packageRoot: process.cwd(),
        context: {
          ...fixture.context,
          expectedSupervisor: {
            ...fixture.context.expectedSupervisor,
            owner_process_start_token: "different-supervisor-process"
          }
        },
        processId: 8923,
        processStartTokenResolver: (pid) => `os-worker-runtime-${pid}`,
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW),
        observedAt: () => ACTIVATION_FIXTURE_NOW,
        verifyClosure: () => ({
          closureManifestDigest:
            ACTIVATION_FIXTURE_PACKAGE_CLOSURE.closure_manifest_digest
        })
      });
      expect(() => worker.acquireAndActivate()).toThrowError(
        /exact current supervisor process and epoch/u
      );
      expect(fixture.db.prepare(
        "SELECT * FROM worker_leases WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID)).toBeUndefined();
    } finally {
      fixture.supervisor.release();
      fixture.db.close();
    }
  });
});
