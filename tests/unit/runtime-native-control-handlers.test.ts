import { describe, expect, it, vi } from "vitest";
import {
  createRuntimeNativeControlHandlers,
  deriveCurrentRuntimeNativeRevisions
} from "../../src/runtime/activation/native-control-handlers.js";
import {
  OpenClawRuntimeNativeService
} from "../../src/runtime/activation/native-service.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  GatewayHeartbeatRepository
} from "../../src/runtime/process/gateway-heartbeat.js";
import {
  createRuntimeProductionLifecycleFixture
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_IDENTITY,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";
import {
  ACTIVATION_FIXTURE_GATEWAY_ID,
  ACTIVATION_FIXTURE_GATEWAY_START,
  ACTIVATION_FIXTURE_HOME_ID,
  ACTIVATION_FIXTURE_NOW,
  ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
  ACTIVATION_FIXTURE_PACKAGE_ID,
  createRuntimeProductionActivationDatabase,
  seedActivationGatewayHeartbeat
} from "../fixtures/runtime-production-activation-fixture.js";

const UPGRADE_TIME = "2026-07-12T00:00:01.000Z";
const UPGRADE_GATEWAY_ID = "gateway-native-handler-upgrade-test";
const UPGRADE_GATEWAY_START = "gateway-native-handler-start-test";
const UPGRADE_PACKAGE_ID = "pkg-native-handler-upgrade-test";

const UPGRADE_CLOSURE = {
  verified: true as const,
  package_identity: {
    ...PROCESS_FIXTURE_PACKAGE_IDENTITY,
    package_version: "0.4.9-native-handler-test",
    package_generation_id: UPGRADE_PACKAGE_ID,
    artifact_integrity: "artifact-native-handler-upgrade-test",
    install_record_identity: "install-native-handler-upgrade-test"
  },
  closure_manifest_digest: "closure-native-handler-upgrade-test",
  evidence_class: "source_repo" as const,
  verified_at: UPGRADE_TIME
};

describe("runtime native control handlers", () => {
  it("prepares an exact package activation request without mutating authority", async () => {
    const db = createRuntimeProductionActivationDatabase();
    try {
      seedActivationGatewayHeartbeat(db);
      const before = db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID);
      const launchBefore = db.prepare(
        "SELECT * FROM supervisor_launch_state WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID);
      let nextId = 0;
      const service = new OpenClawRuntimeNativeService({
        handlers: createRuntimeNativeControlHandlers({
          db,
          homeId: ACTIVATION_FIXTURE_HOME_ID,
          gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
          gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
          currentPluginPackageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
          resolvePackageGeneration: (generationId) => generationId ===
            ACTIVATION_FIXTURE_PACKAGE_ID
            ? {
                packageRoot: process.cwd(),
                packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE
              }
            : undefined,
          initializeOrResume: () => ({ ok: true, code: "not_used" }),
          idFactory: () => `prepared-id-${++nextId}`,
          clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
        })
      });
      await expect(service.execute({
        operation: "prepare_package_activation"
      })).resolves.toMatchObject({
        ok: true,
        code: "package_activation_request_prepared",
        result: {
          operation: "initialize_package_activation",
          package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
          control_request_id: "prepared-id-1",
          authorization_id: "prepared-id-2",
          mutates_authority: false
        }
      });
      expect(db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID)).toEqual(before);
      expect(db.prepare(
        "SELECT * FROM supervisor_launch_state WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID)).toEqual(launchBefore);
    } finally {
      db.close();
    }
  });

  it("pauses and resumes the exact active worker without changing package identity or fence", async () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const initializeOrResume = vi.fn(() => ({ ok: true, code: "not_needed" }));
      const revisions = deriveCurrentRuntimeNativeRevisions({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID
      });
      const service = new OpenClawRuntimeNativeService({
        handlers: createRuntimeNativeControlHandlers({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
          gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
          currentPluginPackageGenerationId: PROCESS_FIXTURE_PACKAGE_IDENTITY.package_generation_id,
          resolvePackageGeneration: () => undefined,
          initializeOrResume,
          clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
        })
      });
      await expect(service.execute({
        operation: "pause_learning",
        payload: {
          control_request_id: "control-native-pause-learning",
          expected_projection_revision: revisions.projection_revision
        }
      })).resolves.toMatchObject({
        ok: true,
        code: "learning_pause_requested",
        result: {
          replayed: false,
          projection_revision: revisions.projection_revision
        }
      });
      const paused = fixture.db.prepare(
        `SELECT state, fencing_token, shutdown_requested_at, drain_deadline_at
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(paused).toMatchObject({
        state: "draining",
        fencing_token: fixture.productionWorker.fencing_token,
        shutdown_requested_at: PROCESS_FIXTURE_START
      });
      expect(paused.drain_deadline_at).not.toBeNull();

      await expect(service.execute({
        operation: "resume_learning",
        payload: {
          control_request_id: "control-native-resume-learning",
          authorization_id: "unused-resume-authorization",
          expected_projection_revision: revisions.projection_revision,
          expected_launch_revision: revisions.launch_revision
        }
      })).resolves.toMatchObject({
        ok: true,
        code: "learning_resumed_without_restart",
        result: {
          projection_revision: revisions.projection_revision
        }
      });
      expect(initializeOrResume).not.toHaveBeenCalled();
      const resumed = fixture.db.prepare(
        `SELECT state, fencing_token, shutdown_requested_at, drain_deadline_at
         FROM worker_leases WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(resumed).toEqual({
        state: "active",
        fencing_token: fixture.productionWorker.fencing_token,
        shutdown_requested_at: null,
        drain_deadline_at: null
      });
      const activation = fixture.db.prepare(
        `SELECT activation_revision, activation_state,
                active_package_generation_id, production_activation_handshake_id
         FROM package_activation_state WHERE home_id = ?`
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toEqual({
        activation_revision: fixture.activation.activation_revision,
        activation_state: "active",
        active_package_generation_id: PROCESS_FIXTURE_PACKAGE_IDENTITY.package_generation_id,
        production_activation_handshake_id: fixture.productionHandshake.activation_id
      });
    } finally {
      fixture.db.close();
    }
  });

  it("derives the current supervisor writer and replays one idempotent package-generation request", async () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      new GatewayHeartbeatRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      ).publish({
        gatewayInstanceId: UPGRADE_GATEWAY_ID,
        gatewayProcessId: 9801,
        gatewayProcessStartToken: UPGRADE_GATEWAY_START,
        packageGenerationId: UPGRADE_PACKAGE_ID,
        heartbeatDurationMs: 3_600_000
      });
      const revisions = deriveCurrentRuntimeNativeRevisions({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID
      });
      const handlers = createRuntimeNativeControlHandlers({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        gatewayInstanceId: UPGRADE_GATEWAY_ID,
        gatewayProcessStartToken: UPGRADE_GATEWAY_START,
        currentPluginPackageGenerationId: UPGRADE_PACKAGE_ID,
        resolvePackageGeneration: (generationId) => generationId ===
          UPGRADE_PACKAGE_ID
          ? { packageRoot: process.cwd(), packageClosure: UPGRADE_CLOSURE }
          : undefined,
        initializeOrResume: vi.fn(() => ({ ok: true, code: "started" })),
        idFactory: () => "unused-native-handler-id",
        clock: createFixedProcessAuthorityClock(UPGRADE_TIME)
      });
      const service = new OpenClawRuntimeNativeService({ handlers });
      const payload = {
        control_request_id: "control-native-prepare-generation",
        authorization_id: "authorization-native-prepare-generation",
        package_generation_id: UPGRADE_PACKAGE_ID,
        expected_projection_revision: revisions.projection_revision,
        expected_launch_revision: revisions.launch_revision,
        writer: {
          kind: "gateway_service_controller",
          gateway_instance_id: "spoofed-writer"
        }
      };
      const first = await service.execute({
        operation: "prepare_package_generation",
        payload
      });
      expect(first).toMatchObject({
        ok: true,
        operation: "prepare_package_generation",
        code: "package_generation_prepared",
        result: {
          replayed: false,
          projection_revision: 3
        }
      });
      const replay = await service.execute({
        operation: "experienceengine.runtime.prepare_package_generation",
        payload
      });
      expect(replay).toMatchObject({
        ok: true,
        code: "package_generation_prepared",
        result: {
          replayed: true,
          projection_revision: 3
        }
      });
      const activation = fixture.db.prepare(
        "SELECT * FROM package_activation_state WHERE home_id = ?"
      ).get(PROCESS_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toMatchObject({
        activation_revision: 3,
        activation_state: "preparing",
        pending_package_generation_id: UPGRADE_PACKAGE_ID,
        launch_authorization_id: "authorization-native-prepare-generation",
        updated_by_kind: "supervisor",
        updated_by_supervisor_owner_id: fixture.supervisorLease.owner_id,
        updated_by_supervisor_lease_epoch: fixture.supervisorLease.lease_epoch
      });
    } finally {
      fixture.db.close();
    }
  });

  it("returns a stable conflict code when one control request id is reused with different input", async () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      new GatewayHeartbeatRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        createFixedProcessAuthorityClock(UPGRADE_TIME)
      ).publish({
        gatewayInstanceId: UPGRADE_GATEWAY_ID,
        gatewayProcessId: 9802,
        gatewayProcessStartToken: UPGRADE_GATEWAY_START,
        packageGenerationId: UPGRADE_PACKAGE_ID,
        heartbeatDurationMs: 3_600_000
      });
      const revisions = deriveCurrentRuntimeNativeRevisions({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID
      });
      const service = new OpenClawRuntimeNativeService({
        handlers: createRuntimeNativeControlHandlers({
          db: fixture.db,
          homeId: PROCESS_FIXTURE_HOME_ID,
          gatewayInstanceId: UPGRADE_GATEWAY_ID,
          gatewayProcessStartToken: UPGRADE_GATEWAY_START,
          currentPluginPackageGenerationId: UPGRADE_PACKAGE_ID,
          resolvePackageGeneration: () => ({
            packageRoot: process.cwd(),
            packageClosure: UPGRADE_CLOSURE
          }),
          initializeOrResume: () => ({ ok: true, code: "started" }),
          clock: createFixedProcessAuthorityClock(UPGRADE_TIME)
        })
      });
      const base = {
        control_request_id: "control-native-conflict",
        authorization_id: "authorization-native-conflict",
        package_generation_id: UPGRADE_PACKAGE_ID,
        expected_projection_revision: revisions.projection_revision,
        expected_launch_revision: revisions.launch_revision
      };
      await service.execute({
        operation: "prepare_package_generation",
        payload: base
      });
      const conflict = await service.execute({
        operation: "prepare_package_generation",
        payload: {
          ...base,
          authorization_id: "authorization-native-conflict-different"
        }
      });
      expect(conflict).toMatchObject({
        ok: false,
        operation: "prepare_package_generation",
        code: "EE_CONTROL_REQUEST_CONFLICT"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("records and replays cold initialization in the control idempotency ledger", async () => {
    const db = createRuntimeProductionActivationDatabase();
    seedActivationGatewayHeartbeat(db);
    try {
      const initializeOrResume = vi.fn(() => ({
        ok: true,
        code: "supervisor_launch_reserved_and_bound"
      }));
      const service = new OpenClawRuntimeNativeService({
        handlers: createRuntimeNativeControlHandlers({
          db,
          homeId: ACTIVATION_FIXTURE_HOME_ID,
          gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
          gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
          currentPluginPackageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
          resolvePackageGeneration: (generationId) => generationId ===
            ACTIVATION_FIXTURE_PACKAGE_ID
            ? {
              packageRoot: process.cwd(),
              packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE
            }
            : undefined,
          initializeOrResume,
          clock: createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
        })
      });
      const payload = {
        control_request_id: "control-native-initialize",
        authorization_id: "authorization-native-initialize",
        expected_projection_revision: 0,
        expected_launch_revision: 0
      };
      await expect(service.execute({
        operation: "initialize_package_activation",
        payload
      })).resolves.toMatchObject({
        ok: true,
        code: "package_activation_initialized",
        result: {
          replayed: false,
          projection_revision: 1
        }
      });
      await expect(service.execute({
        operation: "initialize_package_activation",
        payload
      })).resolves.toMatchObject({
        ok: true,
        code: "package_activation_initialized",
        result: {
          replayed: true,
          projection_revision: 1
        }
      });
      const activation = db.prepare(
        "SELECT activation_revision, launch_authorization_id FROM package_activation_state WHERE home_id = ?"
      ).get(ACTIVATION_FIXTURE_HOME_ID) as Record<string, unknown>;
      expect(activation).toEqual({
        activation_revision: 1,
        launch_authorization_id: "authorization-native-initialize"
      });
      const requests = db.prepare(
        "SELECT COUNT(*) AS count FROM control_request_idempotency WHERE home_id = ? AND control_request_id = ?"
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        "control-native-initialize"
      ) as { count: number };
      expect(Number(requests.count)).toBe(1);
      expect(initializeOrResume).toHaveBeenCalledOnce();
    } finally {
      db.close();
    }
  });
});
