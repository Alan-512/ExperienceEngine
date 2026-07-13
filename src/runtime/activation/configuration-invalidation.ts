import {
  SUPERVISOR_RUNTIME_POLICY
} from "../process/constants.js";
import {
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import type {
  RuntimeConfigurationActivationInvalidationProvider
} from "../configuration/types.js";
import {
  changedOneRow
} from "../process/database.js";
import {
  readPackageActivationAuthority,
  readWorkerLeaseByHome
} from "./database.js";
import { RuntimeActivationError } from "./errors.js";
import { assertPackageActivationShape } from "./state-contract.js";

export const createS6ConfigurationActivationInvalidationProvider = ():
RuntimeConfigurationActivationInvalidationProvider => ({
  invalidateForConfigurationCommitInTransaction(input) {
    if (!input.db.isTransaction) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_INVALID",
        "Configuration invalidation requires the current SQLite commit transaction."
      );
    }
    if (
      input.currentConfigurationGenerationId ===
        input.nextConfigurationGenerationId
    ) {
      return;
    }
    const activation = readPackageActivationAuthority(input.db, input.homeId);
    if (!activation || activation.activation_state !== "active") {
      return;
    }
    assertPackageActivationShape(activation);
    const worker = readWorkerLeaseByHome(input.db, input.homeId);
    if (
      !worker ||
      worker.state === "stopped" ||
      worker.package_generation_id !== activation.active_package_generation_id
    ) {
      return;
    }
    const drainDeadline = new Date(
      toProcessAuthorityEpochMs(input.committedAt) +
        SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms
    ).toISOString();
    const update = input.db.prepare(
      `UPDATE worker_leases
       SET state = 'blocked',
           shutdown_requested_at = COALESCE(shutdown_requested_at, ?),
           drain_deadline_at = ?,
           heartbeat_at = ?,
           last_failure_code = 'EE_CONFIGURATION_POINTER_CONFLICT'
       WHERE home_id = ?
         AND owner_id = ?
         AND fencing_token = ?
         AND state <> 'stopped'
         AND package_generation_id = ?`
    ).run(
      input.committedAt,
      drainDeadline,
      input.committedAt,
      input.homeId,
      worker.owner_id,
      worker.fencing_token,
      worker.package_generation_id
    );
    if (!changedOneRow(update)) {
      throw new RuntimeActivationError(
        "EE_PACKAGE_ACTIVATION_STALE",
        "Configuration commit lost the exact production worker fence."
      );
    }
  }
});
