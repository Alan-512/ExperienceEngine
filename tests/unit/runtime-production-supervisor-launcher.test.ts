import { describe, expect, it, vi } from "vitest";
import {
  RuntimePackageSupervisorLauncher,
  type SpawnedSupervisorProcess
} from "../../src/runtime/activation/supervisor-launcher.js";
import {
  RuntimePackageActivationRepository
} from "../../src/runtime/activation/repository.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  ACTIVATION_FIXTURE_GATEWAY_ID,
  ACTIVATION_FIXTURE_GATEWAY_START,
  ACTIVATION_FIXTURE_HOME_ID,
  ACTIVATION_FIXTURE_NOW,
  ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
  createActivationFixtureRuntimeIdentityEnvelope,
  activationGatewayWriter,
  createRuntimeProductionActivationDatabase,
  seedActivationGatewayHeartbeat
} from "../fixtures/runtime-production-activation-fixture.js";

const initializeLaunchAuthority = () => {
  const db = createRuntimeProductionActivationDatabase();
  seedActivationGatewayHeartbeat(db);
  const initialized = new RuntimePackageActivationRepository(
    db,
    ACTIVATION_FIXTURE_HOME_ID,
    createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
  ).initializePackageActivation({
    expectedActivationRevision: 0,
    expectedLaunchRevision: 0,
    authorizationId: "authorization-launcher-test",
    packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
    writer: activationGatewayWriter()
  });
  return { db, initialized };
};

const fakeChild = (pid = 7511): SpawnedSupervisorProcess => ({
  pid,
  kill: vi.fn(() => true),
  once: vi.fn() as unknown as SpawnedSupervisorProcess["once"],
  unref: vi.fn()
});

describe("runtime package supervisor launcher", () => {
  it("reserves before spawn and binds the exact operating-system child identity", () => {
    const fixture = initializeLaunchAuthority();
    try {
      const child = fakeChild();
      const spawner = vi.fn(() => {
        const attempt = fixture.db.prepare(
          `SELECT attempt_state
           FROM supervisor_launch_attempts
           WHERE home_id = ? AND launch_attempt_id = ?`
        ).get(
          ACTIVATION_FIXTURE_HOME_ID,
          "attempt-launcher-success"
        ) as { attempt_state: string } | undefined;
        expect(attempt?.attempt_state).toBe("reserved_unbound");
        return child;
      });
      const tokenResolver = vi.fn((pid: number) => `os-start-token-${pid}`);
      const result = new RuntimePackageSupervisorLauncher(
        fixture.db,
        ACTIVATION_FIXTURE_HOME_ID,
        process.cwd(),
        tokenResolver,
        spawner,
        createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      ).launch({
        packageIdentity: ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
        packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
        authorizationId: fixture.initialized.authorization.launch_authorization_id,
        expectedAuthorizationRevision:
          fixture.initialized.authorization.authorization_revision,
        expectedAuthorizationStateRevision:
          fixture.initialized.authorization.authorization_state_revision,
        authorizationRole: "initial_candidate",
        attemptId: "attempt-launcher-success",
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: fixture.initialized.launchState.launch_revision
      });
      expect(result.attempt).toMatchObject({
        attempt_state: "reserved_bound",
        child_process_id: 7511,
        child_process_start_token: "os-start-token-7511"
      });
      expect(spawner).toHaveBeenCalledOnce();
      expect(spawner).toHaveBeenCalledWith(expect.objectContaining({
        env: expect.objectContaining({
          EXPERIENCE_ENGINE_PACKAGE_ROOT: process.cwd(),
          EXPERIENCE_ENGINE_LAUNCH_ATTEMPT_ID: "attempt-launcher-success",
          EXPERIENCE_ENGINE_LAUNCH_AUTHORIZATION_ID:
            fixture.initialized.authorization.launch_authorization_id
        })
      }));
      expect(tokenResolver).toHaveBeenCalledWith(7511);
      expect(child.unref).toHaveBeenCalledOnce();
      expect(child.kill).not.toHaveBeenCalled();
      const authorization = fixture.db.prepare(
        `SELECT authorization_state, consumed_by_launch_attempt_id
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        fixture.initialized.authorization.launch_authorization_id
      ) as Record<string, unknown>;
      expect(authorization).toEqual({
        authorization_state: "consumed",
        consumed_by_launch_attempt_id: "attempt-launcher-success"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("terminalizes the reserved attempt when spawning fails", () => {
    const fixture = initializeLaunchAuthority();
    try {
      const launcher = new RuntimePackageSupervisorLauncher(
        fixture.db,
        ACTIVATION_FIXTURE_HOME_ID,
        process.cwd(),
        () => "never-used",
        () => {
          throw new Error("spawn exploded");
        },
        createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      );
      expect(() => launcher.launch({
        packageIdentity: ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
        packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
        authorizationId: fixture.initialized.authorization.launch_authorization_id,
        expectedAuthorizationRevision:
          fixture.initialized.authorization.authorization_revision,
        expectedAuthorizationStateRevision:
          fixture.initialized.authorization.authorization_state_revision,
        authorizationRole: "initial_candidate",
        attemptId: "attempt-launcher-spawn-failed",
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: fixture.initialized.launchState.launch_revision
      })).toThrowError("spawn exploded");
      const attempt = fixture.db.prepare(
        `SELECT attempt_state, terminal_code
         FROM supervisor_launch_attempts
         WHERE home_id = ? AND launch_attempt_id = ?`
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        "attempt-launcher-spawn-failed"
      ) as Record<string, unknown>;
      expect(attempt).toEqual({
        attempt_state: "spawn_failed",
        terminal_code: "EE_SUPERVISOR_SPAWN_FAILED"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("kills and terminalizes a spawned child when process-start identity cannot be resolved", () => {
    const fixture = initializeLaunchAuthority();
    try {
      const child = fakeChild(7611);
      const launcher = new RuntimePackageSupervisorLauncher(
        fixture.db,
        ACTIVATION_FIXTURE_HOME_ID,
        process.cwd(),
        () => {
          throw new Error("start token unavailable");
        },
        () => child,
        createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      );
      expect(() => launcher.launch({
        packageIdentity: ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope(),
        packageClosure: ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
        authorizationId: fixture.initialized.authorization.launch_authorization_id,
        expectedAuthorizationRevision:
          fixture.initialized.authorization.authorization_revision,
        expectedAuthorizationStateRevision:
          fixture.initialized.authorization.authorization_state_revision,
        authorizationRole: "initial_candidate",
        attemptId: "attempt-launcher-token-failed",
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: fixture.initialized.launchState.launch_revision
      })).toThrowError("start token unavailable");
      expect(child.kill).toHaveBeenCalledOnce();
      const attempt = fixture.db.prepare(
        `SELECT attempt_state, child_process_id, child_process_start_token
         FROM supervisor_launch_attempts
         WHERE home_id = ? AND launch_attempt_id = ?`
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        "attempt-launcher-token-failed"
      ) as Record<string, unknown>;
      expect(attempt).toEqual({
        attempt_state: "spawn_failed",
        child_process_id: null,
        child_process_start_token: null
      });
    } finally {
      fixture.db.close();
    }
  });

  it("rejects package entrypoint escape before consuming authorization", () => {
    const fixture = initializeLaunchAuthority();
    try {
      const spawner = vi.fn(() => fakeChild());
      const launcher = new RuntimePackageSupervisorLauncher(
        fixture.db,
        ACTIVATION_FIXTURE_HOME_ID,
        process.cwd(),
        () => "start-token",
        spawner,
        createFixedProcessAuthorityClock(ACTIVATION_FIXTURE_NOW)
      );
      expect(() => launcher.launch({
        packageIdentity: {
          ...ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
          supervisor_entrypoint: "../outside-supervisor.js"
        },
        runtimeIdentityEnvelope: createActivationFixtureRuntimeIdentityEnvelope({
          ...ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
          supervisor_entrypoint: "../outside-supervisor.js"
        }),
        packageClosure: {
          ...ACTIVATION_FIXTURE_PACKAGE_CLOSURE,
          package_identity: {
            ...ACTIVATION_FIXTURE_PACKAGE_CLOSURE.package_identity,
            supervisor_entrypoint: "../outside-supervisor.js"
          }
        },
        authorizationId: fixture.initialized.authorization.launch_authorization_id,
        expectedAuthorizationRevision:
          fixture.initialized.authorization.authorization_revision,
        expectedAuthorizationStateRevision:
          fixture.initialized.authorization.authorization_state_revision,
        authorizationRole: "initial_candidate",
        attemptId: "attempt-launcher-path-escape",
        gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
        gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
        expectedLaunchRevision: fixture.initialized.launchState.launch_revision
      })).toThrowError(/inside the verified package root/u);
      expect(spawner).not.toHaveBeenCalled();
      const authorization = fixture.db.prepare(
        `SELECT authorization_state
         FROM package_launch_authorizations
         WHERE home_id = ? AND launch_authorization_id = ?`
      ).get(
        ACTIVATION_FIXTURE_HOME_ID,
        fixture.initialized.authorization.launch_authorization_id
      ) as { authorization_state: string };
      expect(authorization.authorization_state).toBe("issued");
    } finally {
      fixture.db.close();
    }
  });
});
