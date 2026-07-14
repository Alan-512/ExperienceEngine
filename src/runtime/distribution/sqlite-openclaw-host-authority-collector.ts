import { DatabaseSync } from "node:sqlite";
import {
  readActivationHandshake,
  readConfigurationPointer,
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "../activation/database.js";
import type {
  ActivationHandshakeRow
} from "../activation/types.js";
import type {
  OpenClawHostActiveEvidence,
  OpenClawHostAuthorityCollector
} from "./openclaw-host-validation-runner.js";
import type {
  PublishedProtectedQueueEvidence,
  PublishedShutdownEvidence
} from "./types.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";

type ProcessingClaimSnapshot = {
  job_id: string;
  candidate_id: string;
  claim_id: string;
  claim_owner_id: string;
  claim_fencing_token: number;
};

type FixtureIds = {
  completionJobId?: string;
  staleOutputJobId?: string;
};

export type OpenClawHostValidationFixtureStarter = (options: {
  sqlitePath: string;
  runtimeHome: string;
  homeId: string;
}) => Promise<FixtureIds | void>;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const tableExists = (db: DatabaseSync, table: string): boolean => Boolean(
  db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table)
);

const readHomeId = (db: DatabaseSync): string | null => {
  if (!tableExists(db, "runtime_control_meta")) {
    return null;
  }
  const row = db.prepare(
    "SELECT home_id FROM runtime_control_meta ORDER BY created_at, home_id LIMIT 1"
  ).get() as { home_id?: string } | undefined;
  return typeof row?.home_id === "string" ? row.home_id : null;
};

const readProcessingClaim = (
  db: DatabaseSync,
  expectedJobId?: string
): ProcessingClaimSnapshot | null => {
  if (!tableExists(db, "distillation_jobs")) {
    return null;
  }
  const row = db.prepare(
    `SELECT id AS job_id, candidate_id, claim_id, claim_owner_id,
            claim_fencing_token
       FROM distillation_jobs
      WHERE status = 'processing'
        AND claim_id IS NOT NULL
        AND claim_owner_id IS NOT NULL
        AND claim_fencing_token IS NOT NULL
        AND (? IS NULL OR id = ?)
      ORDER BY claimed_at DESC, updated_at DESC
      LIMIT 1`
  ).get(expectedJobId ?? null, expectedJobId ?? null) as ProcessingClaimSnapshot | undefined;
  return row ?? null;
};

const readCompletedQueueEvidence = (options: {
  db: DatabaseSync;
  claim: ProcessingClaimSnapshot;
  staleOutputJobId?: string;
}): PublishedProtectedQueueEvidence | null => {
  const completed = options.db.prepare(
    `SELECT j.id AS job_id, j.candidate_id, c.distilled_node_id
       FROM distillation_jobs j
       JOIN experience_candidates c ON c.id = j.candidate_id
      WHERE j.id = ?
        AND j.status = 'succeeded'
        AND c.lifecycle_state = 'distilled'
        AND c.distilled_node_id IS NOT NULL
      LIMIT 1`
  ).get(options.claim.job_id) as {
    job_id: string;
    candidate_id: string;
    distilled_node_id: string;
  } | undefined;
  if (!completed) {
    return null;
  }
  const stale = options.db.prepare(
    `SELECT id, interruption_count, content_retry_count, failure_code
       FROM distillation_jobs
      WHERE status = 'pending'
        AND interruption_count >= 1
        AND content_retry_count = 0
        AND failure_code = 'EE_ACTIVATION_FENCING_REJECTED'
        AND (? IS NULL OR id = ?)
      ORDER BY updated_at DESC
      LIMIT 1`
  ).get(
    options.staleOutputJobId ?? null,
    options.staleOutputJobId ?? null
  ) as {
    id: string;
    interruption_count: number;
    content_retry_count: number;
    failure_code: string;
  } | undefined;
  if (!stale) {
    return null;
  }
  return {
    fixture_id: "real-openclaw-deterministic-semantic-queue-v1",
    job_id: completed.job_id,
    candidate_id: completed.candidate_id,
    claim_owner_id: options.claim.claim_owner_id,
    claim_fencing_token: options.claim.claim_fencing_token,
    completion_node_id: completed.distilled_node_id,
    semantic_completion_committed: true,
    authority_loss_completion_rejected: true,
    interruption_recovery_recorded: stale.interruption_count >= 1,
    content_retry_consumed: stale.content_retry_count > 0
  };
};

const readCompleteProductionHandshake = (options: {
  db: DatabaseSync;
  homeId: string;
  handshakeId: string | null;
}): ActivationHandshakeRow | null => {
  if (!options.handshakeId) {
    return null;
  }
  const handshake = readActivationHandshake(
    options.db,
    options.homeId,
    options.handshakeId
  );
  return handshake?.status === "complete" &&
    handshake.handshake_purpose === "production_activation"
    ? handshake
    : null;
};

const readActiveEvidence = (options: {
  db: DatabaseSync;
  homeId: string;
  claim: ProcessingClaimSnapshot;
  staleOutputJobId?: string;
}): OpenClawHostActiveEvidence | null => {
  const activation = readPackageActivationAuthority(options.db, options.homeId);
  const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
  const worker = readWorkerLeaseByHome(options.db, options.homeId);
  const pointer = readConfigurationPointer(options.db, options.homeId);
  const handshake = readCompleteProductionHandshake({
    db: options.db,
    homeId: options.homeId,
    handshakeId: activation?.production_activation_handshake_id ?? null
  });
  const queue = readCompletedQueueEvidence({
    db: options.db,
    claim: options.claim,
    staleOutputJobId: options.staleOutputJobId
  });
  if (
    activation?.activation_state !== "active" ||
    !activation.active_package_generation_id ||
    !supervisor ||
    !worker ||
    worker.worker_mode !== "production" ||
    !pointer ||
    !handshake ||
    !queue
  ) {
    return null;
  }
  return {
    activation: {
      home_id: options.homeId,
      gateway_instance_id: handshake.gateway_instance_id,
      active_package_generation_id: activation.active_package_generation_id,
      package_activation_revision: activation.activation_revision,
      production_activation_id: handshake.activation_id,
      supervisor_owner_id: supervisor.owner_id,
      supervisor_lease_epoch: supervisor.lease_epoch,
      worker_owner_id: worker.owner_id,
      worker_fencing_token: worker.fencing_token,
      worker_mode: "production",
      schema_version: worker.schema_version,
      configuration_generation_id: handshake.configuration_generation_id,
      effective_route_set_id: handshake.effective_route_set_id
    },
    queue,
    interaction_active: true,
    learning_runtime_active: true,
    production_learning_ready: false
  };
};

export const createSqliteOpenClawHostAuthorityCollector = (options: {
  startFixture?: OpenClawHostValidationFixtureStarter;
  pollIntervalMs?: number;
} = {}): OpenClawHostAuthorityCollector => {
  let fixtureIds: FixtureIds = {};
  let capturedClaim: ProcessingClaimSnapshot | null = null;
  return {
    async captureActiveEvidence(input) {
      const deadline = Date.now() + input.timeoutMs;
      const db = new DatabaseSync(input.sqlitePath, { readOnly: false });
      try {
        let fixtureStarted = false;
        while (Date.now() < deadline) {
          try {
            const homeId = readHomeId(db);
            if (!homeId) {
              await sleep(options.pollIntervalMs ?? 25);
              continue;
            }
            if (!fixtureStarted && options.startFixture) {
              fixtureIds = await options.startFixture({
                sqlitePath: input.sqlitePath,
                runtimeHome: input.runtimeHome,
                homeId
              }) ?? {};
              fixtureStarted = true;
            }
            capturedClaim ??= readProcessingClaim(db, fixtureIds.completionJobId);
            if (capturedClaim) {
              const active = readActiveEvidence({
                db,
                homeId,
                claim: capturedClaim,
                staleOutputJobId: fixtureIds.staleOutputJobId
              });
              if (active) {
                if (active.queue.content_retry_consumed) {
                  throw new PublishedRuntimeClosureError(
                    "EE_OPENCLAW_LIVE_HOST_QUEUE_EVIDENCE_INVALID",
                    "Authority-loss recovery consumed content retry in real-host validation."
                  );
                }
                return active;
              }
            }
          } catch (error) {
            if (error instanceof PublishedRuntimeClosureError) {
              throw error;
            }
          }
          await sleep(options.pollIntervalMs ?? 25);
        }
      } finally {
        db.close();
      }
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_AUTHORITY_TIMEOUT",
        "Timed out waiting for real-host activation, fenced claim/completion, and stale-output recovery evidence."
      );
    },

    async verifyRestartRecovery(input) {
      const deadline = Date.now() + input.timeoutMs;
      const db = new DatabaseSync(input.sqlitePath, { readOnly: true });
      try {
        while (Date.now() < deadline) {
          try {
            const homeId = readHomeId(db);
            if (!homeId) {
              await sleep(options.pollIntervalMs ?? 50);
              continue;
            }
            const activation = readPackageActivationAuthority(db, homeId);
            const supervisor = readSupervisorLeaseByHome(db, homeId);
            const worker = readWorkerLeaseByHome(db, homeId);
            const handshake = readCompleteProductionHandshake({
              db,
              homeId,
              handshakeId: activation?.production_activation_handshake_id ?? null
            });
            if (
              activation?.activation_state === "active" &&
              activation.active_package_generation_id ===
                input.prior.activation.active_package_generation_id &&
              supervisor &&
              worker?.worker_mode === "production" &&
              handshake &&
              (
                supervisor.owner_id !== input.prior.activation.supervisor_owner_id ||
                supervisor.lease_epoch > input.prior.activation.supervisor_lease_epoch ||
                worker.fencing_token > input.prior.activation.worker_fencing_token
              )
            ) {
              return;
            }
          } catch {
            // The restarted Gateway may still be migrating from terminal to current authority.
          }
          await sleep(options.pollIntervalMs ?? 50);
        }
      } finally {
        db.close();
      }
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_RESTART_RECOVERY_TIMEOUT",
        "Timed out waiting for a fresh supervisor/worker authority after real Gateway restart."
      );
    },

    async captureShutdownEvidence(input): Promise<PublishedShutdownEvidence> {
      const deadline = Date.now() + input.timeoutMs;
      const db = new DatabaseSync(input.sqlitePath, { readOnly: true });
      try {
        while (Date.now() < deadline) {
          try {
            const homeId = readHomeId(db);
            if (!homeId) {
              await sleep(options.pollIntervalMs ?? 50);
              continue;
            }
            const supervisor = readSupervisorLeaseByHome(db, homeId);
            const worker = readWorkerLeaseByHome(db, homeId);
            if (
              supervisor?.lease_terminal_at &&
              supervisor.lease_terminal_reason &&
              worker?.state === "stopped"
            ) {
              const attempt = db.prepare(
                `SELECT terminal_code
                   FROM supervisor_launch_attempts
                  WHERE home_id = ? AND launch_attempt_id = ?
                  LIMIT 1`
              ).get(homeId, supervisor.launch_attempt_id) as {
                terminal_code?: string | null;
              } | undefined;
              return {
                gateway_stop_observed: true,
                worker_terminal_state: "stopped",
                supervisor_terminal_state: "stopped",
                supervisor_terminal_reason: supervisor.lease_terminal_reason,
                launch_attempt_terminal_code:
                  attempt?.terminal_code ?? "supervisor_terminalized"
              };
            }
          } catch {
            // Shutdown rows may be in a transient transaction.
          }
          await sleep(options.pollIntervalMs ?? 50);
        }
      } finally {
        db.close();
      }
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_SHUTDOWN_EVIDENCE_TIMEOUT",
        "Timed out waiting for real Gateway worker/supervisor terminal evidence."
      );
    }
  };
};

export const SQLITE_OPENCLAW_HOST_AUTHORITY_COLLECTOR_CONTRACT = Object.freeze({
  process_presence_is_authority: false,
  plugin_load_is_authority: false,
  processing_claim_observed_before_completion: true,
  stale_output_rejection_required: true,
  restart_requires_fresh_epoch_or_fence: true,
  terminal_database_evidence_required: true
});
