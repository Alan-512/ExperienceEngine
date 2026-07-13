import { describe, expect, it, vi } from "vitest";
import {
  RuntimePackageLocalSupervisorLeaseSession,
  parsePackageLocalSupervisorEnvironment,
  serializePackageLocalSupervisorEnvironment,
  type PackageLocalSupervisorLaunchContext
} from "../../src/runtime/package/supervisor-runtime.js";
import {
  RuntimePackageLocalServiceController
} from "../../src/runtime/activation/service-controller.js";
import type {
  SpawnedSupervisorProcess
} from "../../src/runtime/activation/supervisor-launcher.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
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

const fakeChild = (pid: number): SpawnedSupervisorProcess => ({
  pid,
  kill: vi.fn(() => true),
  once: vi.fn() as unknown as SpawnedSupervisorProcess["once"],
  unref: vi.fn()
});

const createBoundSupervisorLaunch = () => {
  const db = createRuntimeProductionActivationDatabase();
  const ids = [
    "authorization-supervisor-runtime-test",
    "attempt-supervisor-runtime-test"
  ];
  const envelope = createActivationFixtureRuntimeIdentityEnvelope();
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
    processStartTokenResolver: (pid) => `os-supervisor-runtime-${pid}`,
    spawner: () => fakeChild(8811),
    idFactory: () => ids.shift()!,
    clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
  });
  expect(controller.start()).toMatchObject({
    ok: true,
    code: "supervisor_launch_reserved_and_bound"
  });
  const context: PackageLocalSupervisorLaunchContext = {
    packageRoot: process.cwd(),
    identityEnvelope: envelope,
    packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
    launchAttemptId: "attempt-supervisor-runtime-test",
    launchAuthorizationId: "authorization-supervisor-runtime-test"
  };
  return { db, context };
};

describe("package-local supervisor runtime", () => {
  it("round-trips the immutable launcher environment", () => {
    const context: PackageLocalSupervisorLaunchContext = {
      packageRoot: process.cwd(),
      identityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
      packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
      launchAttemptId: "attempt-environment-test",
      launchAuthorizationId: "authorization-environment-test"
    };
    expect(parsePackageLocalSupervisorEnvironment(
      serializePackageLocalSupervisorEnvironment(context)
    )).toEqual(context);
  });

  it("acquires the exact bound attempt, becomes active, and releases gracefully", async () => {
    const fixture = createBoundSupervisorLaunch();
    try {
      const generatedIds = [
        "supervisor-lease-key-runtime-test",
        "supervisor-owner-runtime-test"
      ];
      const session = new RuntimePackageLocalSupervisorLeaseSession({
        db: fixture.db,
        context: fixture.context,
        processId: 8811,
        processStartTokenResolver: (pid) => `os-supervisor-runtime-${pid}`,
        idFactory: () => generatedIds.shift()!,
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW),
        observedAt: () => ACTIVATION_FIXTURE_NOW,
        verifyClosure: () => ({
          closureManifestDigest:
            ACTIVATION_FIXTURE_PACKAGE_CLOSURE.closure_manifest_digest
        })
      });
      const active = await session.acquireAndActivate();
      expect(active).toMatchObject({
        owner_id: "supervisor-owner-runtime-test",
        owner_process_id: 8811,
        owner_process_start_token: "os-supervisor-runtime-8811",
        package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
        state: "active",
        lease_epoch: 1,
        lease_state_revision: 2
      });
      const stopped = session.release();
      expect(stopped).toMatchObject({
        state: "stopped",
        lease_terminal_reason: "graceful_release"
      });
      const attempt = fixture.db.prepare(
        `SELECT attempt_state, terminal_code
         FROM supervisor_launch_attempts
         WHERE home_id = ? AND launch_attempt_id = ?`
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        fixture.context.launchAttemptId
      ) as Record<string, unknown>;
      expect(attempt).toEqual({
        attempt_state: "terminated",
        terminal_code: "supervisor_graceful_release"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("rejects a process whose OS start identity differs from the gateway binding", async () => {
    const fixture = createBoundSupervisorLaunch();
    try {
      const session = new RuntimePackageLocalSupervisorLeaseSession({
        db: fixture.db,
        context: fixture.context,
        processId: 8811,
        processStartTokenResolver: () => "different-os-start-token",
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW),
        observedAt: () => ACTIVATION_FIXTURE_NOW,
        verifyClosure: () => ({
          closureManifestDigest:
            ACTIVATION_FIXTURE_PACKAGE_CLOSURE.closure_manifest_digest
        })
      });
      await expect(session.acquireAndActivate()).rejects.toThrowError(
        /does not match the gateway-bound child identity/u
      );
      expect(fixture.db.prepare(
        "SELECT * FROM supervisor_leases WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID)).toBeUndefined();
    } finally {
      fixture.db.close();
    }
  });

  it("rejects an envelope whose package identity differs from closure evidence", async () => {
    const fixture = createBoundSupervisorLaunch();
    try {
      const session = new RuntimePackageLocalSupervisorLeaseSession({
        db: fixture.db,
        context: {
          ...fixture.context,
          identityEnvelope: {
            ...fixture.context.identityEnvelope,
            package: {
              ...fixture.context.identityEnvelope.package,
              artifact_integrity: "different-artifact"
            }
          }
        },
        processId: 8811,
        processStartTokenResolver: (pid) => `os-supervisor-runtime-${pid}`,
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW),
        observedAt: () => ACTIVATION_FIXTURE_NOW,
        verifyClosure: () => ({
          closureManifestDigest:
            ACTIVATION_FIXTURE_PACKAGE_CLOSURE.closure_manifest_digest
        })
      });
      await expect(session.acquireAndActivate()).rejects.toThrowError(
        /different package generations/u
      );
    } finally {
      fixture.db.close();
    }
  });
});
