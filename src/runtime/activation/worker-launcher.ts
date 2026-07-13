import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  GatewayRuntimeIdentityEnvelope,
  RuntimePackageGenerationIdentity
} from "../identity/types.js";
import type {
  ExpectedSupervisorAuthority
} from "../process/types.js";
import type {
  LaunchAuthorizationRole,
  WorkerMode
} from "../process/constants.js";
import type {
  VerifiedPackageClosureEvidence
} from "./types.js";
import type {
  ActivationWorkerAcknowledgement
} from "./types.js";
import { RuntimeActivationError } from "./errors.js";

export type SpawnedWorkerProcess = Pick<
  ChildProcess,
  "pid" | "kill" | "once" | "on" | "unref"
> & {
  connected?: boolean;
  send?: ChildProcess["send"];
};

export type WorkerProcessSpawner = (options: {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}) => SpawnedWorkerProcess;

export const PACKAGE_LOCAL_WORKER_SHUTDOWN_MESSAGE = Object.freeze({
  type: "experienceengine.runtime.worker.shutdown"
} as const);

export const PACKAGE_LOCAL_WORKER_READY_MESSAGE_TYPE =
  "experienceengine.runtime.worker.ready" as const;

export const PACKAGE_LOCAL_WORKER_HANDSHAKE_CHALLENGE_MESSAGE_TYPE =
  "experienceengine.runtime.worker.handshake_challenge" as const;

export const PACKAGE_LOCAL_WORKER_HANDSHAKE_ACK_MESSAGE_TYPE =
  "experienceengine.runtime.worker.handshake_ack" as const;

export type PackageLocalWorkerHandshakeChallenge = {
  type: typeof PACKAGE_LOCAL_WORKER_HANDSHAKE_CHALLENGE_MESSAGE_TYPE;
  activation_id: string;
};

export type PackageLocalWorkerHandshakeAcknowledgementMessage = {
  type: typeof PACKAGE_LOCAL_WORKER_HANDSHAKE_ACK_MESSAGE_TYPE;
  acknowledgement: ActivationWorkerAcknowledgement;
};

export const NODE_WORKER_PROCESS_SPAWNER: WorkerProcessSpawner =
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
      "Worker entrypoint must resolve inside the verified package root."
    );
  }
  return entrypoint;
};

const assertPositivePid = (pid: number | undefined): number => {
  if (!Number.isSafeInteger(pid) || (pid ?? 0) <= 0) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Worker spawn did not expose a positive child process id."
    );
  }
  return pid!;
};

export type PackageLocalWorkerLaunchContext = {
  context_schema_version: "package-local-worker-context-v1";
  identityEnvelope: GatewayRuntimeIdentityEnvelope;
  packageClosure: VerifiedPackageClosureEvidence;
  workerOwnerId: string;
  expectedSupervisor: Pick<
    ExpectedSupervisorAuthority,
    "owner_id" | "owner_process_id" | "owner_process_start_token" | "lease_epoch"
  >;
  workerMode: WorkerMode;
  transitionRole: LaunchAuthorizationRole;
  schemaVersion: string;
};

export class RuntimePackageWorkerLauncher {
  constructor(
    private readonly packageRoot: string,
    private readonly spawner: WorkerProcessSpawner = NODE_WORKER_PROCESS_SPAWNER
  ) {}

  launch(options: {
    packageIdentity: RuntimePackageGenerationIdentity;
    runtimeIdentityEnvelope: GatewayRuntimeIdentityEnvelope;
    packageClosure: VerifiedPackageClosureEvidence;
    workerOwnerId: string;
    expectedSupervisor: PackageLocalWorkerLaunchContext["expectedSupervisor"];
    workerMode: WorkerMode;
    transitionRole: LaunchAuthorizationRole;
    schemaVersion: string;
    environment?: NodeJS.ProcessEnv;
  }): {
    child: SpawnedWorkerProcess;
    workerOwnerId: string;
    childProcessId: number;
  } {
    if (!options.workerOwnerId.trim()) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Worker launch requires a non-empty supervisor-selected owner id."
      );
    }
    const entrypoint = resolvePackageEntrypoint({
      packageRoot: this.packageRoot,
      entrypoint: options.packageIdentity.worker_entrypoint
    });
    const context: PackageLocalWorkerLaunchContext = {
      context_schema_version: "package-local-worker-context-v1",
      identityEnvelope: options.runtimeIdentityEnvelope,
      packageClosure: options.packageClosure,
      workerOwnerId: options.workerOwnerId,
      expectedSupervisor: options.expectedSupervisor,
      workerMode: options.workerMode,
      transitionRole: options.transitionRole,
      schemaVersion: options.schemaVersion
    };
    let child: SpawnedWorkerProcess | undefined;
    try {
      child = this.spawner({
        executable: process.execPath,
        args: [entrypoint],
        cwd: this.packageRoot,
        env: {
          ...process.env,
          ...options.environment,
          EXPERIENCE_ENGINE_WORKER_CONTEXT_JSON: JSON.stringify(context),
          EXPERIENCE_ENGINE_RUNTIME_HOME_ID:
            options.runtimeIdentityEnvelope.home.home_id,
          EXPERIENCE_ENGINE_PACKAGE_GENERATION_ID:
            options.packageIdentity.package_generation_id,
          EXPERIENCE_ENGINE_WORKER_OWNER_ID: options.workerOwnerId
        }
      });
      const childProcessId = assertPositivePid(child.pid);
      child.unref();
      return {
        child,
        workerOwnerId: options.workerOwnerId,
        childProcessId
      };
    } catch (error) {
      if (child) {
        try {
          child.kill();
        } catch {
          // No worker authority exists yet; best-effort process teardown is sufficient.
        }
      }
      throw error;
    }
  }
}

export const WORKER_LAUNCHER_CONTRACT = Object.freeze({
  lifecycle_owner: "package_local_supervisor",
  entrypoint_inside_verified_package_root: true,
  gateway_spawns_worker_directly: false,
  graceful_shutdown_transport: "node_ipc",
  semantic_execution_enabled_by_launcher: false
});
