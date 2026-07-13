import type { DatabaseSync } from "node:sqlite";
import type {
  RuntimeConfigurationPointerRow
} from "../configuration/types.js";
import type {
  PackageLaunchAuthorizationRow,
  SupervisorLaunchAttemptRow,
  SupervisorLeaseRow,
  WorkerLeaseRow
} from "../process/types.js";
import type {
  RuntimeMigrationStateRecord
} from "../schema/types.js";
import type {
  ActivationHandshakeRow,
  ControlRequestIdempotencyRow,
  PackageActivationAuthorityRow
} from "./types.js";

export const readPackageActivationAuthority = (
  db: DatabaseSync,
  homeId: string
): PackageActivationAuthorityRow | undefined => db.prepare(
  "SELECT * FROM package_activation_state WHERE home_id = ? LIMIT 1"
).get(homeId) as PackageActivationAuthorityRow | undefined;

export const readActivationHandshake = (
  db: DatabaseSync,
  homeId: string,
  activationId: string
): ActivationHandshakeRow | undefined => db.prepare(
  "SELECT * FROM activation_handshakes WHERE home_id = ? AND activation_id = ? LIMIT 1"
).get(homeId, activationId) as ActivationHandshakeRow | undefined;

export const readControlIdempotency = (
  db: DatabaseSync,
  homeId: string,
  controlRequestId: string
): ControlRequestIdempotencyRow | undefined => db.prepare(
  "SELECT * FROM control_request_idempotency WHERE home_id = ? AND control_request_id = ? LIMIT 1"
).get(homeId, controlRequestId) as ControlRequestIdempotencyRow | undefined;

export const readConfigurationPointer = (
  db: DatabaseSync,
  homeId: string
): RuntimeConfigurationPointerRow | undefined => db.prepare(
  "SELECT * FROM configuration_pointer WHERE home_id = ? LIMIT 1"
).get(homeId) as RuntimeConfigurationPointerRow | undefined;

export const readMigrationState = (
  db: DatabaseSync,
  homeId: string
): RuntimeMigrationStateRecord | undefined => db.prepare(
  "SELECT * FROM migration_state WHERE home_id = ? LIMIT 1"
).get(homeId) as RuntimeMigrationStateRecord | undefined;

export const readSupervisorLeaseByHome = (
  db: DatabaseSync,
  homeId: string
): SupervisorLeaseRow | undefined => db.prepare(
  "SELECT * FROM supervisor_leases WHERE home_id = ? LIMIT 1"
).get(homeId) as SupervisorLeaseRow | undefined;

export const readWorkerLeaseByHome = (
  db: DatabaseSync,
  homeId: string
): WorkerLeaseRow | undefined => db.prepare(
  "SELECT * FROM worker_leases WHERE home_id = ? LIMIT 1"
).get(homeId) as WorkerLeaseRow | undefined;

export const readLaunchAttemptById = (
  db: DatabaseSync,
  homeId: string,
  launchAttemptId: string
): SupervisorLaunchAttemptRow | undefined => db.prepare(
  "SELECT * FROM supervisor_launch_attempts WHERE home_id = ? AND launch_attempt_id = ? LIMIT 1"
).get(homeId, launchAttemptId) as SupervisorLaunchAttemptRow | undefined;

export const readLaunchAuthorizationById = (
  db: DatabaseSync,
  homeId: string,
  authorizationId: string
): PackageLaunchAuthorizationRow | undefined => db.prepare(
  "SELECT * FROM package_launch_authorizations WHERE home_id = ? AND launch_authorization_id = ? LIMIT 1"
).get(homeId, authorizationId) as PackageLaunchAuthorizationRow | undefined;
