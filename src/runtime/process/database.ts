import type { DatabaseSync } from "node:sqlite";
import { toProcessAuthorityEpochMs } from "./clock.js";
import { RuntimeProcessAuthorityError } from "./errors.js";
import type {
  GatewayHeartbeatRow,
  PackageLaunchAuthorizationRow,
  SupervisorLaunchAttemptRow,
  SupervisorLaunchStateRow,
  SupervisorLeaseRow,
  WorkerLeaseRow
} from "./types.js";

export const changedOneRow = (result: { changes: number | bigint }): boolean =>
  Number(result.changes) === 1;

export const readGatewayHeartbeat = (
  db: DatabaseSync,
  homeId: string,
  gatewayInstanceId: string
): GatewayHeartbeatRow | undefined => db.prepare(
  "SELECT * FROM gateway_heartbeats WHERE home_id = ? AND gateway_instance_id = ? LIMIT 1"
).get(homeId, gatewayInstanceId) as GatewayHeartbeatRow | undefined;

export const readLaunchAuthorization = (
  db: DatabaseSync,
  homeId: string,
  authorizationId: string
): PackageLaunchAuthorizationRow | undefined => db.prepare(
  "SELECT * FROM package_launch_authorizations WHERE home_id = ? AND launch_authorization_id = ? LIMIT 1"
).get(homeId, authorizationId) as PackageLaunchAuthorizationRow | undefined;

export const readLaunchAttempt = (
  db: DatabaseSync,
  homeId: string,
  attemptId: string
): SupervisorLaunchAttemptRow | undefined => db.prepare(
  "SELECT * FROM supervisor_launch_attempts WHERE home_id = ? AND launch_attempt_id = ? LIMIT 1"
).get(homeId, attemptId) as SupervisorLaunchAttemptRow | undefined;

export const readSupervisorLaunchState = (
  db: DatabaseSync,
  homeId: string
): SupervisorLaunchStateRow | undefined => db.prepare(
  "SELECT * FROM supervisor_launch_state WHERE home_id = ? LIMIT 1"
).get(homeId) as SupervisorLaunchStateRow | undefined;

export const readSupervisorLease = (
  db: DatabaseSync,
  homeId: string
): SupervisorLeaseRow | undefined => db.prepare(
  "SELECT * FROM supervisor_leases WHERE home_id = ? LIMIT 1"
).get(homeId) as SupervisorLeaseRow | undefined;

export const readWorkerLease = (
  db: DatabaseSync,
  homeId: string
): WorkerLeaseRow | undefined => db.prepare(
  "SELECT * FROM worker_leases WHERE home_id = ? LIMIT 1"
).get(homeId) as WorkerLeaseRow | undefined;

export const assertCanonicalHomeExists = (
  db: DatabaseSync,
  homeId: string
): void => {
  const row = db.prepare(
    "SELECT home_id FROM runtime_control_meta WHERE home_id = ? LIMIT 1"
  ).get(homeId) as { home_id: string } | undefined;
  if (!row) {
    throw new RuntimeProcessAuthorityError(
      "EE_PROCESS_AUTHORITY_INVALID",
      `Process authority cannot bind to unknown home ${homeId}.`
    );
  }
};

export const assertCurrentGatewayHeartbeat = (options: {
  db: DatabaseSync;
  homeId: string;
  gatewayInstanceId: string;
  gatewayProcessStartToken: string;
  packageGenerationId: string;
  observedAt: string;
}): GatewayHeartbeatRow => {
  const observedAtMs = toProcessAuthorityEpochMs(options.observedAt);
  const row = readGatewayHeartbeat(
    options.db,
    options.homeId,
    options.gatewayInstanceId
  );
  if (
    !row ||
    row.gateway_process_start_token !== options.gatewayProcessStartToken ||
    row.package_generation_id !== options.packageGenerationId ||
    toProcessAuthorityEpochMs(row.expires_at) <= observedAtMs
  ) {
    throw new RuntimeProcessAuthorityError(
      "EE_PROCESS_AUTHORITY_NOT_CURRENT",
      "Gateway lifecycle mutation requires the exact current gateway heartbeat identity."
    );
  }
  return row;
};
