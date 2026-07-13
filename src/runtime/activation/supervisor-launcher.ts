import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { RuntimePackageGenerationIdentity } from "../identity/types.js";
import type { GatewayRuntimeIdentityEnvelope } from "../identity/types.js";
import type { VerifiedPackageClosureEvidence } from "./types.js";
import {
  serializePackageLocalSupervisorEnvironment
} from "../package/supervisor-runtime.js";
import {
  RuntimeLaunchAttemptRepository
} from "../process/launch-authority.js";
import type {
  LaunchAuthorizationRole
} from "../process/constants.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import type {
  RuntimeProcessAuthorityClock,
  SupervisorLaunchAttemptRow
} from "../process/types.js";
import { RuntimeActivationError } from "./errors.js";

export type SpawnedSupervisorProcess = Pick<
  ChildProcess,
  "pid" | "kill" | "once" | "unref"
> & {
  connected?: boolean;
  send?: ChildProcess["send"];
};

export const PACKAGE_LOCAL_SUPERVISOR_SHUTDOWN_MESSAGE = Object.freeze({
  type: "experienceengine.runtime.supervisor.shutdown"
} as const);

export type SupervisorProcessSpawner = (options: {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}) => SpawnedSupervisorProcess;

export type ProcessStartTokenResolver = (processId: number) => string;

export const NODE_SUPERVISOR_PROCESS_SPAWNER: SupervisorProcessSpawner =
  (options) => spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    windowsHide: true,
    detached: false
  });

const resolvePackageEntrypoint = (options: {
  packageRoot: string;
  entrypoint: string;
}): string => {
  const packageRoot = resolve(options.packageRoot);
  const entrypoint = resolve(packageRoot, options.entrypoint);
  const relativePath = relative(packageRoot, entrypoint);
  if (
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_CLOSURE_REQUIRED",
      "Supervisor entrypoint must resolve inside the verified package root."
    );
  }
  return entrypoint;
};

const assertPositivePid = (pid: number | undefined): number => {
  if (!Number.isSafeInteger(pid) || (pid ?? 0) <= 0) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Supervisor spawn did not expose a positive child process id."
    );
  }
  return pid!;
};

export class RuntimePackageSupervisorLauncher {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly packageRoot: string,
    private readonly processStartTokenResolver: ProcessStartTokenResolver,
    private readonly spawner: SupervisorProcessSpawner =
      NODE_SUPERVISOR_PROCESS_SPAWNER,
    private readonly clock: RuntimeProcessAuthorityClock =
      SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  launch(options: {
    packageIdentity: RuntimePackageGenerationIdentity;
    runtimeIdentityEnvelope: GatewayRuntimeIdentityEnvelope;
    packageClosure: VerifiedPackageClosureEvidence;
    authorizationId: string;
    expectedAuthorizationRevision: number;
    expectedAuthorizationStateRevision: number;
    authorizationRole: LaunchAuthorizationRole;
    attemptId: string;
    gatewayInstanceId: string;
    gatewayProcessStartToken: string;
    expectedLaunchRevision: number;
    environment?: NodeJS.ProcessEnv;
    arguments?: string[];
  }): {
    child: SpawnedSupervisorProcess;
    attempt: SupervisorLaunchAttemptRow;
  } {
    const entrypoint = resolvePackageEntrypoint({
      packageRoot: this.packageRoot,
      entrypoint: options.packageIdentity.supervisor_entrypoint
    });
    const attempts = new RuntimeLaunchAttemptRepository(
      this.db,
      this.homeId,
      this.clock
    );
    const reserved = attempts.reserveByConsumingAuthorization({
      authorizationId: options.authorizationId,
      expectedAuthorizationRevision: options.expectedAuthorizationRevision,
      expectedAuthorizationStateRevision:
        options.expectedAuthorizationStateRevision,
      attemptId: options.attemptId,
      packageGenerationId: options.packageIdentity.package_generation_id,
      authorizationRole: options.authorizationRole,
      gatewayInstanceId: options.gatewayInstanceId,
      gatewayProcessStartToken: options.gatewayProcessStartToken,
      expectedLaunchRevision: options.expectedLaunchRevision
    });
    let child: SpawnedSupervisorProcess | undefined;
    try {
      child = this.spawner({
        executable: process.execPath,
        args: [entrypoint, ...(options.arguments ?? [])],
        cwd: this.packageRoot,
        env: {
          ...process.env,
          ...options.environment,
          ...serializePackageLocalSupervisorEnvironment({
            packageRoot: this.packageRoot,
            identityEnvelope: options.runtimeIdentityEnvelope,
            packageClosure: options.packageClosure,
            launchAttemptId: options.attemptId,
            launchAuthorizationId: options.authorizationId
          }),
          EXPERIENCE_ENGINE_RUNTIME_HOME_ID: this.homeId,
          EXPERIENCE_ENGINE_PACKAGE_GENERATION_ID:
            options.packageIdentity.package_generation_id,
          EXPERIENCE_ENGINE_LAUNCH_ATTEMPT_ID: options.attemptId,
          EXPERIENCE_ENGINE_LAUNCH_AUTHORIZATION_ID:
            options.authorizationId
        }
      });
      const childProcessId = assertPositivePid(child.pid);
      const childProcessStartToken = this.processStartTokenResolver(childProcessId);
      if (childProcessStartToken.trim().length === 0) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          "Supervisor process-start token resolver returned an empty identity."
        );
      }
      const bound = attempts.bindChildIdentity({
        attemptId: options.attemptId,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: options.gatewayInstanceId,
        gatewayProcessStartToken: options.gatewayProcessStartToken,
        packageGenerationId: options.packageIdentity.package_generation_id,
        childProcessId,
        childProcessStartToken
      });
      child.unref();
      return { child, attempt: bound };
    } catch (error) {
      if (child) {
        try {
          child.kill();
        } catch {
          // Best-effort process teardown; authority terminalization is mandatory below.
        }
      }
      attempts.terminalizePreLeaseAttempt({
        attemptId: options.attemptId,
        expectedAttemptStateRevision: reserved.attempt.attempt_state_revision,
        expectedLaunchRevision: reserved.launchState.launch_revision,
        gatewayInstanceId: options.gatewayInstanceId,
        gatewayProcessStartToken: options.gatewayProcessStartToken,
        packageGenerationId: options.packageIdentity.package_generation_id,
        terminalState: "spawn_failed",
        terminalCode: "EE_SUPERVISOR_SPAWN_FAILED"
      });
      throw error;
    }
  }
}

export const SUPERVISOR_LAUNCHER_CONTRACT = Object.freeze({
  order: Object.freeze([
    "reserve_and_consume_single_use_authorization",
    "spawn_package_local_supervisor_entrypoint",
    "resolve_operating_system_process_start_token",
    "bind_child_identity_before_supervisor_lease"
  ] as const),
  path_visible_global_cli_used: false,
  synthetic_process_start_token_allowed: false,
  unbound_spawn_failure_terminalized: true,
  graceful_shutdown_transport: "node_ipc"
});
