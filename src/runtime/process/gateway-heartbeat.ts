import type { DatabaseSync } from "node:sqlite";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "./clock.js";
import { assertCanonicalHomeExists, readGatewayHeartbeat } from "./database.js";
import { RuntimeProcessAuthorityError } from "./errors.js";
import type {
  GatewayHeartbeatRow,
  RuntimeProcessAuthorityClock
} from "./types.js";

export class GatewayHeartbeatRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  publish(options: {
    gatewayInstanceId: string;
    gatewayProcessId: number;
    gatewayProcessStartToken: string;
    packageGenerationId: string;
    heartbeatDurationMs: number;
  }): GatewayHeartbeatRow {
    if (
      !Number.isSafeInteger(options.gatewayProcessId) ||
      options.gatewayProcessId <= 0 ||
      !Number.isSafeInteger(options.heartbeatDurationMs) ||
      options.heartbeatDurationMs <= 0 ||
      !options.gatewayInstanceId ||
      !options.gatewayProcessStartToken ||
      !options.packageGenerationId
    ) {
      throw new RuntimeProcessAuthorityError(
        "EE_PROCESS_AUTHORITY_INVALID",
        "Gateway heartbeat identity and duration must be complete and positive."
      );
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "lease",
      operation: () => {
        assertCanonicalHomeExists(this.db, this.homeId);
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const expiresAt = new Date(
          toProcessAuthorityEpochMs(observedAt) + options.heartbeatDurationMs
        ).toISOString();
        const existing = readGatewayHeartbeat(
          this.db,
          this.homeId,
          options.gatewayInstanceId
        );
        if (
          existing &&
          (
            existing.gateway_process_id !== options.gatewayProcessId ||
            existing.gateway_process_start_token !== options.gatewayProcessStartToken
          )
        ) {
          throw new RuntimeProcessAuthorityError(
            "EE_PROCESS_IDENTITY_MISMATCH",
            "A gateway instance id cannot be rebound to a different process identity."
          );
        }
        this.db.prepare(
          `INSERT INTO gateway_heartbeats (
            home_id,
            gateway_instance_id,
            gateway_process_id,
            gateway_process_start_token,
            package_generation_id,
            heartbeat_at,
            expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(home_id, gateway_instance_id) DO UPDATE SET
            package_generation_id = excluded.package_generation_id,
            heartbeat_at = excluded.heartbeat_at,
            expires_at = excluded.expires_at`
        ).run(
          this.homeId,
          options.gatewayInstanceId,
          options.gatewayProcessId,
          options.gatewayProcessStartToken,
          options.packageGenerationId,
          observedAt,
          expiresAt
        );
        return readGatewayHeartbeat(
          this.db,
          this.homeId,
          options.gatewayInstanceId
        )!;
      }
    });
  }

  read(gatewayInstanceId: string): GatewayHeartbeatRow | undefined {
    return readGatewayHeartbeat(this.db, this.homeId, gatewayInstanceId);
  }
}
