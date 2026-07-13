import { describe, expect, it, vi } from "vitest";
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
import {
  createRuntimeProductionLifecycleFixture,
  PROCESS_FIXTURE_PACKAGE_CLOSURE
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const fakeChild = (pid: number): SpawnedSupervisorProcess => ({
  pid,
  kill: vi.fn(() => true),
  once: vi.fn() as unknown as SpawnedSupervisorProcess["once"],
  unref: vi.fn()
});

describe("package-local OpenClaw runtime service controller", () => {
  it("publishes gateway identity, initializes an empty activation, and launches the package-local supervisor", () => {
    const db = createRuntimeProductionActivationDatabase();
    try {
      const ids = ["authorization-controller-cold-start", "attempt-controller-cold-start"];
      const spawner = vi.fn(() => fakeChild(7811));
      const controller = new RuntimePackageLocalServiceController({
        db,
        homeId: ACTIVATION_FIXTURE_HOME_ID,
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        currentPluginPackageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
        resolvePackageGeneration: (generationId) => generationId ===
          ACTIVATION_FIXTURE_PACKAGE_ID
          ? {
            packageRoot: process.cwd(),
            packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE
          }
          : undefined,
        processStartTokenResolver: (pid) => `os-controller-start-${pid}`,
        spawner,
        idFactory: () => ids.shift()!,
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      });
      expect(controller.start()).toEqual({
        ok: true,
        code: "supervisor_launch_reserved_and_bound",
        detail: {
          launch_attempt_id: "attempt-controller-cold-start",
          package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
          child_process_id: 7811
        }
      });
      expect(spawner).toHaveBeenCalledOnce();
      const launchedChild = spawner.mock.results[0].value as SpawnedSupervisorProcess;
      expect(launchedChild.once).toHaveBeenCalledWith("exit", expect.any(Function));
      const activation = db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toMatchObject({
        activation_revision: 1,
        activation_state: "preparing",
        pending_package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
        launch_authorization_id: "authorization-controller-cold-start",
        launch_authorization_state: "consumed",
        launch_authorization_consumed_by_attempt_id:
          "attempt-controller-cold-start"
      });
      const heartbeat = db.prepare(
        "SELECT * FROM gateway_heartbeats WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(heartbeat).toMatchObject({
        gateway_instance_id: ACTIVATION_FIXTURE_GATEWAY_ID,
        gateway_process_start_token: ACTIVATION_FIXTURE_GATEWAY_START,
        package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID
      });
    } finally {
      db.close();
    }
  });

  it("returns already-current instead of launching a competing supervisor", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const spawner = vi.fn(() => fakeChild(7911));
      const controller = new RuntimePackageLocalServiceController({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessId: 4001,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        currentPluginPackageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(
          PROCESS_FIXTURE_PACKAGE_CLOSURE.package_identity,
          {
            homeId: PROCESS_FIXTURE_HOME_ID,
            normalizedPathFingerprint: "home-fingerprint-test",
            integrityKeyId: "integrity-key-test",
            createdAt: PROCESS_FIXTURE_START
          }
        ),
        resolvePackageGeneration: () => ({
          packageRoot: process.cwd(),
          packageClosure: PROCESS_FIXTURE_PACKAGE_CLOSURE
        }),
        processStartTokenResolver: () => "not-used",
        spawner,
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(controller.start()).toMatchObject({
        ok: true,
        code: "supervisor_already_current",
        detail: {
          supervisor_owner_id: fixture.supervisorLease.owner_id,
          supervisor_lease_epoch: fixture.supervisorLease.lease_epoch
        }
      });
      expect(spawner).not.toHaveBeenCalled();
    } finally {
      fixture.db.close();
    }
  });

  it("requests a deliberate active-runtime drain on service stop", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const retainedChild = fakeChild(7991);
      const controller = new RuntimePackageLocalServiceController({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
        currentPluginPackageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(
          PROCESS_FIXTURE_PACKAGE_CLOSURE.package_identity,
          {
            homeId: PROCESS_FIXTURE_HOME_ID,
            normalizedPathFingerprint: "home-fingerprint-test",
            integrityKeyId: "integrity-key-test",
            createdAt: PROCESS_FIXTURE_START
          }
        ),
        resolvePackageGeneration: () => undefined,
        idFactory: () => "control-service-stop-test",
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      (controller as unknown as { child: SpawnedSupervisorProcess | null }).child =
        retainedChild;
      expect(controller.stop()).toMatchObject({
        ok: true,
        code: "deliberate_runtime_drain_requested",
        detail: {
          projection_revision: fixture.activation.activation_revision,
          child_spawned_by_service: true,
          supervisor_signal_sent: true
        }
      });
      expect(retainedChild.kill).toHaveBeenCalledWith("SIGTERM");
      const worker = fixture.db.prepare(
        "SELECT state, shutdown_requested_at, drain_deadline_at FROM worker_leases WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(worker).toMatchObject({
        state: "draining",
        shutdown_requested_at: PROCESS_FIXTURE_START
      });
      expect(worker.drain_deadline_at).not.toBeNull();
    } finally {
      fixture.db.close();
    }
  });

  it("signals a retained supervisor even when no worker lease exists yet", () => {
    const db = createRuntimeProductionActivationDatabase();
    try {
      const child = fakeChild(8011);
      const ids = ["authorization-stop-signal-test", "attempt-stop-signal-test"];
      const controller = new RuntimePackageLocalServiceController({
        db,
        homeId: ACTIVATION_FIXTURE_HOME_ID,
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        currentPluginPackageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
        resolvePackageGeneration: () => ({
          packageRoot: process.cwd(),
          packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE
        }),
        processStartTokenResolver: (pid) => `os-controller-start-${pid}`,
        spawner: () => child,
        idFactory: () => ids.shift()!,
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      });
      expect(controller.start()).toMatchObject({
        ok: true,
        code: "supervisor_launch_reserved_and_bound"
      });
      expect(controller.stop()).toEqual({
        ok: true,
        code: "supervisor_stop_signalled",
        detail: {
          supervisor_signal_sent: true
        }
      });
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    } finally {
      db.close();
    }
  });

  it("keeps the gateway heartbeat loop active until service stop", () => {
    vi.useFakeTimers();
    const db = createRuntimeProductionActivationDatabase();
    try {
      const child = fakeChild(8012);
      const ids = ["authorization-heartbeat-test", "attempt-heartbeat-test"];
      const controller = new RuntimePackageLocalServiceController({
        db,
        homeId: ACTIVATION_FIXTURE_HOME_ID,
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        currentPluginPackageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
        resolvePackageGeneration: () => ({
          packageRoot: process.cwd(),
          packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE
        }),
        processStartTokenResolver: (pid) => `os-controller-heartbeat-${pid}`,
        spawner: () => child,
        idFactory: () => ids.shift()!,
        gatewayHeartbeatDurationMs: 10_000,
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      });
      expect(controller.start()).toMatchObject({
        ok: true,
        code: "supervisor_launch_reserved_and_bound"
      });
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(5_000);
      const heartbeat = db.prepare(
        "SELECT package_generation_id FROM gateway_heartbeats WHERE home_id = ? AND gateway_instance_id = ?"
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        ACTIVATION_FIXTURE_GATEWAY_ID
      ) as { package_generation_id: string };
      expect(heartbeat.package_generation_id).toBe(ACTIVATION_FIXTURE_PACKAGE_ID);
      expect(controller.stop()).toMatchObject({
        ok: true,
        code: "supervisor_stop_signalled"
      });
      expect(vi.getTimerCount()).toBe(0);
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    } finally {
      db.close();
      vi.useRealTimers();
    }
  });

  it("retries an injected gateway handshake requester without making heartbeat authority depend on it", () => {
    vi.useFakeTimers();
    const db = createRuntimeProductionActivationDatabase();
    try {
      const child = fakeChild(8013);
      const ids = ["authorization-handshake-requester", "attempt-handshake-requester"];
      const requestIfReady = vi.fn(() => {
        throw new Error("route authority still warming");
      });
      const controller = new RuntimePackageLocalServiceController({
        db,
        homeId: ACTIVATION_FIXTURE_HOME_ID,
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        currentPluginPackageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
        resolvePackageGeneration: () => ({
          packageRoot: process.cwd(),
          packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE
        }),
        processStartTokenResolver: (pid) => `os-controller-handshake-${pid}`,
        spawner: () => child,
        idFactory: () => ids.shift()!,
        gatewayHeartbeatDurationMs: 10_000,
        activationHandshakeCoordinator: { requestIfReady },
        clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      });
      expect(controller.start()).toMatchObject({
        ok: true,
        code: "supervisor_launch_reserved_and_bound"
      });
      expect(requestIfReady).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(5_000);
      expect(requestIfReady).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(1);
      expect(controller.stop()).toMatchObject({
        ok: true,
        code: "supervisor_stop_signalled"
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      db.close();
      vi.useRealTimers();
    }
  });
});
