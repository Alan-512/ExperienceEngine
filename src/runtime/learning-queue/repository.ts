import type { DatabaseSync } from "node:sqlite";
import {
  runRuntimeImmediateTransaction
} from "../schema/sqlite-policy.js";
import {
  authorityBindingFromEvidence,
  requireLearningQueueMaintenanceAuthorityInTransaction,
  requireProductionWriteAuthorityInTransaction,
  UNAVAILABLE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_PROVIDER,
  UNAVAILABLE_PRODUCTION_WRITE_AUTHORITY_PROVIDER
} from "./authority.js";
import type {
  LearningFailureCode,
  LearningJobState
} from "./constants.js";
import {
  LEARNING_FAILURE_POLICIES
} from "./constants.js";
import { LearningQueueError } from "./errors.js";
import {
  resolveLearningFailurePolicy,
  type LearningFailureObservationSource
} from "./failure-policy.js";
import {
  SemanticOriginProvenanceRepository
} from "./provenance.js";
import type {
  ClaimIdentityExpectation,
  FencedLearningCandidateState,
  FencedLearningJob,
  LearningQueueAuthorityBinding,
  LearningQueueMaintenanceAuthorityProvider,
  ProductionWriteAuthorityEvidence,
  ProductionWriteAuthorityProvider,
  SemanticOriginReference,
  SemanticOriginSummary
} from "./types.js";

type FencedLearningJobRow = {
  id: string;
  candidate_id: string;
  home_id: string | null;
  status: FencedLearningJob["status"];
  state_revision: number;
  extractor_profile: string;
  distillation_source: string | null;
  claim_id: string | null;
  claim_owner_id: string | null;
  claim_fencing_token: number | null;
  claimed_supervisor_owner_id: string | null;
  claimed_supervisor_lease_epoch: number | null;
  claimed_package_generation_id: string | null;
  claimed_activation_revision: number | null;
  claimed_production_activation_handshake_id: string | null;
  claimed_configuration_generation_id: string | null;
  claimed_effective_route_set_id: string | null;
  claimed_effective_route_revision: number | null;
  claimed_capability: FencedLearningJob["claimed_capability"];
  claimed_route_fingerprint: string | null;
  claimed_schema_version: string | null;
  claimed_job_schema_version: string | null;
  claimed_candidate_schema_version: string | null;
  claimed_node_schema_version: string | null;
  claimed_at: string | null;
  claim_heartbeat_at: string | null;
  claim_expires_at: string | null;
  failure_code: FencedLearningJob["failure_code"];
  failure_class: FencedLearningJob["failure_class"];
  failure_scope: FencedLearningJob["failure_scope"];
  system_attempt_count: number;
  interruption_count: number;
  content_retry_count: number;
  next_attempt_at: string;
  blocked_at: string | null;
  route_fingerprint: string;
  terminal_reason_code: FencedLearningJob["terminal_reason_code"];
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  discarded_at: string | null;
};

type FencedCandidateRow = {
  id: string;
  lifecycle_state: FencedLearningCandidateState["lifecycle_state"];
  state_revision: number;
  content_retry_count: number;
  failure_code: FencedLearningCandidateState["failure_code"];
  failure_class: FencedLearningCandidateState["failure_class"];
  failure_scope: FencedLearningCandidateState["failure_scope"];
  blocked_at: string | null;
  terminal_reason_code: FencedLearningCandidateState["terminal_reason_code"];
  semantic_origin_provenance_key: string | null;
  updated_at: string;
};

const CLAIM_COLUMNS = [
  "claim_id",
  "claim_owner_id",
  "claim_fencing_token",
  "claimed_supervisor_owner_id",
  "claimed_supervisor_lease_epoch",
  "claimed_package_generation_id",
  "claimed_activation_revision",
  "claimed_production_activation_handshake_id",
  "claimed_configuration_generation_id",
  "claimed_effective_route_set_id",
  "claimed_effective_route_revision",
  "claimed_capability",
  "claimed_route_fingerprint",
  "claimed_schema_version",
  "claimed_job_schema_version",
  "claimed_candidate_schema_version",
  "claimed_node_schema_version",
  "claimed_at",
  "claim_heartbeat_at",
  "claim_expires_at"
] as const;

const CLEAR_CLAIM_SQL = CLAIM_COLUMNS.map((column) => `${column} = NULL`).join(",\n");

const canonicalEpoch = (value: string, field: string): number => {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_CONTRACT_INVALID",
      `${field} must be a canonical ISO timestamp.`
    );
  }
  return epoch;
};

const assertNonEmpty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_CONTRACT_INVALID",
      `${field} must not be empty.`
    );
  }
};

const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_CONTRACT_INVALID",
      `${field} must be a positive safe integer.`
    );
  }
};

const jobFromRow = (row: FencedLearningJobRow): FencedLearningJob => {
  if (!row.home_id) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_STATE_INVALID",
      `Job ${row.id} is a legacy unfenced row, not S5 authority.`
    );
  }
  return {
    ...row,
    home_id: row.home_id
  };
};

const candidateFromRow = (
  row: FencedCandidateRow
): FencedLearningCandidateState => ({ ...row });

const readJob = (
  db: DatabaseSync,
  jobId: string
): FencedLearningJob | undefined => {
  const row = db.prepare(
    "SELECT * FROM distillation_jobs WHERE id = ? AND home_id IS NOT NULL LIMIT 1"
  ).get(jobId) as FencedLearningJobRow | undefined;
  return row ? jobFromRow(row) : undefined;
};

const readCandidate = (
  db: DatabaseSync,
  candidateId: string
): FencedLearningCandidateState | undefined => {
  const row = db.prepare(
    `SELECT id, lifecycle_state, state_revision, content_retry_count,
            failure_code, failure_class, failure_scope, blocked_at,
            terminal_reason_code, semantic_origin_provenance_key, updated_at
     FROM experience_candidates WHERE id = ? LIMIT 1`
  ).get(candidateId) as FencedCandidateRow | undefined;
  return row ? candidateFromRow(row) : undefined;
};

const assertClaimExpectation = (
  job: FencedLearningJob,
  expectation: ClaimIdentityExpectation
): void => {
  if (
    job.id !== expectation.jobId ||
    job.status !== "processing" ||
    job.claim_id !== expectation.claimId ||
    job.claim_owner_id !== expectation.claimOwnerId ||
    job.claim_fencing_token !== expectation.claimFencingToken ||
    job.state_revision !== expectation.expectedStateRevision
  ) {
    throw new LearningQueueError(
      "EE_FENCING_REJECTED",
      "Learning queue claim identity or state revision is stale."
    );
  }
};

const assertClaimBindingMatchesAuthority = (
  job: FencedLearningJob,
  evidence: ProductionWriteAuthorityEvidence
): void => {
  const binding = authorityBindingFromEvidence(evidence);
  const matches =
    job.home_id === binding.home_id &&
    job.claim_owner_id === binding.worker_owner_id &&
    job.claim_fencing_token === binding.worker_fencing_token &&
    job.claimed_supervisor_owner_id === binding.supervisor_owner_id &&
    job.claimed_supervisor_lease_epoch === binding.supervisor_lease_epoch &&
    job.claimed_package_generation_id === binding.package_generation_id &&
    job.claimed_activation_revision === binding.activation_revision &&
    job.claimed_production_activation_handshake_id ===
      binding.production_activation_handshake_id &&
    job.claimed_configuration_generation_id ===
      binding.configuration_generation_id &&
    job.claimed_effective_route_set_id === binding.effective_route_set_id &&
    job.claimed_effective_route_revision ===
      binding.effective_route_revision &&
    job.claimed_capability === binding.capability &&
    job.claimed_route_fingerprint === binding.route_fingerprint &&
    job.claimed_schema_version === binding.schema_version &&
    job.claimed_job_schema_version === binding.job_schema_version &&
    job.claimed_candidate_schema_version === binding.candidate_schema_version &&
    job.claimed_node_schema_version === binding.node_schema_version;
  if (!matches) {
    throw new LearningQueueError(
      "EE_ACTIVATION_FENCING_REJECTED",
      "Current production authority does not match the complete claim-time authority snapshot."
    );
  }
};

const assertSynchronousResult = (value: unknown): void => {
  if (
    value &&
    typeof value === "object" &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  ) {
    throw new LearningQueueError(
      "EE_SEMANTIC_COMPLETION_INVALID",
      "Semantic completion callbacks must be synchronous and cannot perform provider work."
    );
  }
};

const updateCandidateTransition = (options: {
  db: DatabaseSync;
  candidate: FencedLearningCandidateState;
  nextState: FencedLearningCandidateState["lifecycle_state"];
  failureCode: LearningFailureCode | null;
  failureClass: FencedLearningCandidateState["failure_class"];
  failureScope: FencedLearningCandidateState["failure_scope"];
  contentRetryCount: number;
  blockedAt: string | null;
  terminalReasonCode: LearningFailureCode | null;
  updatedAt: string;
  distilledNodeId?: string | null;
}): FencedLearningCandidateState => {
  const result = options.db.prepare(
    `UPDATE experience_candidates
     SET lifecycle_state = ?,
         state_revision = state_revision + 1,
         content_retry_count = ?,
         retry_count = ?,
         failure_code = ?,
         failure_class = ?,
         failure_scope = ?,
         blocked_at = ?,
         terminal_reason_code = ?,
         distilled_node_id = CASE
           WHEN ? IS NULL THEN distilled_node_id ELSE ?
         END,
         last_error = ?,
         last_failed_at = CASE
           WHEN ? IN ('failed', 'blocked') THEN ? ELSE last_failed_at
         END,
         distilled_at = CASE WHEN ? = 'distilled' THEN ? ELSE distilled_at END,
         discarded_at = CASE WHEN ? = 'discarded' THEN ? ELSE discarded_at END,
         updated_at = ?
     WHERE id = ? AND state_revision = ?`
  ).run(
    options.nextState,
    options.contentRetryCount,
    options.contentRetryCount,
    options.failureCode,
    options.failureClass,
    options.failureScope,
    options.blockedAt,
    options.terminalReasonCode,
    options.distilledNodeId ?? null,
    options.distilledNodeId ?? null,
    options.failureCode,
    options.nextState,
    options.updatedAt,
    options.nextState,
    options.updatedAt,
    options.nextState,
    options.updatedAt,
    options.updatedAt,
    options.candidate.id,
    options.candidate.state_revision
  );
  if (Number(result.changes) !== 1) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_CAS_CONFLICT",
      `Candidate ${options.candidate.id} changed during queue transition.`
    );
  }
  return readCandidate(options.db, options.candidate.id)!;
};

export class FencedLearningQueueRepository {
  private readonly provenance: SemanticOriginProvenanceRepository;

  constructor(
    private readonly db: DatabaseSync,
    private readonly homeId: string,
    private readonly productionAuthorityProvider:
      ProductionWriteAuthorityProvider =
        UNAVAILABLE_PRODUCTION_WRITE_AUTHORITY_PROVIDER,
    private readonly maintenanceAuthorityProvider:
      LearningQueueMaintenanceAuthorityProvider =
        UNAVAILABLE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_PROVIDER
  ) {
    assertNonEmpty(homeId, "homeId");
    this.provenance = new SemanticOriginProvenanceRepository(db);
  }

  getById(jobId: string): FencedLearningJob | undefined {
    return readJob(this.db, jobId);
  }

  registerPendingJob(options: {
    jobId: string;
    candidateId: string;
    extractorProfile: string;
    routeFingerprint: string;
    semanticOrigin: SemanticOriginReference;
    createdAt: string;
    nextAttemptAt?: string;
  }): FencedLearningJob {
    for (const [field, value] of Object.entries({
      jobId: options.jobId,
      candidateId: options.candidateId,
      extractorProfile: options.extractorProfile,
      routeFingerprint: options.routeFingerprint
    })) {
      assertNonEmpty(value, field);
    }
    canonicalEpoch(options.createdAt, "createdAt");
    canonicalEpoch(options.nextAttemptAt ?? options.createdAt, "nextAttemptAt");
    if (
      options.semanticOrigin.stage_routes.distillation.route_fingerprint !==
        options.routeFingerprint ||
      options.semanticOrigin.first_origin_at !== options.createdAt ||
      options.semanticOrigin.last_origin_at !== options.createdAt
    ) {
      throw new LearningQueueError(
        "EE_SEMANTIC_ORIGIN_INVALID",
        "Pending job route and creation time must match its immutable candidate semantic origin."
      );
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "claim",
      operation: () => {
        const candidate = readCandidate(this.db, options.candidateId);
        if (!candidate) {
          throw new LearningQueueError(
            "EE_CANDIDATE_MISSING",
            `Candidate ${options.candidateId} does not exist.`
          );
        }
        const existing = readJob(this.db, options.jobId);
        if (existing) {
          if (
            existing.candidate_id !== options.candidateId ||
            existing.route_fingerprint !== options.routeFingerprint
          ) {
            throw new LearningQueueError(
              "EE_LEARNING_QUEUE_CAS_CONFLICT",
              `Job ${options.jobId} already exists with different immutable identity.`
            );
          }
          if (
            candidate.semantic_origin_provenance_key !==
              options.semanticOrigin.provenance_key
          ) {
            throw new LearningQueueError(
              "EE_SEMANTIC_ORIGIN_INVALID",
              `Job ${options.jobId} replay does not match candidate provenance.`
            );
          }
          return existing;
        }
        this.provenance.attachCandidateOriginInTransaction({
          candidateId: candidate.id,
          reference: options.semanticOrigin
        });
        this.db.prepare(
          `INSERT INTO distillation_jobs (
            id, candidate_id, home_id, status, state_revision,
            extractor_profile, retry_count, system_attempt_count,
            interruption_count, content_retry_count, next_attempt_at,
            route_fingerprint, created_at, updated_at
          ) VALUES (?, ?, ?, 'pending', 1, ?, 0, 0, 0, ?, ?, ?, ?, ?)`
        ).run(
          options.jobId,
          options.candidateId,
          this.homeId,
          options.extractorProfile,
          candidate.content_retry_count,
          options.nextAttemptAt ?? options.createdAt,
          options.routeFingerprint,
          options.createdAt,
          options.createdAt
        );
        return readJob(this.db, options.jobId)!;
      }
    });
  }

  claimNext(options: {
    claimId: string;
    now: string;
    claimExpiresAt: string;
  }): FencedLearningJob | undefined {
    assertNonEmpty(options.claimId, "claimId");
    const nowEpoch = canonicalEpoch(options.now, "now");
    const expiryEpoch = canonicalEpoch(options.claimExpiresAt, "claimExpiresAt");
    if (expiryEpoch <= nowEpoch) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_CONTRACT_INVALID",
        "Claim expiry must be later than claim time."
      );
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "claim",
      operation: () => {
        const authority = requireProductionWriteAuthorityInTransaction({
          db: this.db,
          provider: this.productionAuthorityProvider,
          operation: "new_claim",
          homeId: this.homeId,
          now: options.now
        });
        if (expiryEpoch > canonicalEpoch(authority.expires_at, "authority.expires_at")) {
          throw new LearningQueueError(
            "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
            "Claim expiry cannot exceed current production authority expiry."
          );
        }
        const selected = this.db.prepare(
          `SELECT id, candidate_id, state_revision, status, route_fingerprint
           FROM distillation_jobs
           WHERE home_id = ?
             AND status IN ('pending', 'failed')
             AND next_attempt_at <= ?
           ORDER BY next_attempt_at ASC, updated_at ASC, id ASC
           LIMIT 1`
        ).get(this.homeId, options.now) as {
          id: string;
          candidate_id: string;
          state_revision: number;
          status: "pending" | "failed";
          route_fingerprint: string;
        } | undefined;
        if (!selected) {
          return undefined;
        }
        const candidateOrigin = this.provenance.readCandidateOrigin(
          selected.candidate_id
        );
        if (
          !candidateOrigin ||
          selected.route_fingerprint !== authority.route_fingerprint
        ) {
          throw new LearningQueueError(
            "EE_ACTIVATION_FENCING_REJECTED",
            "Runnable job route does not match current production authority or candidate provenance is missing."
          );
        }
        const binding = authorityBindingFromEvidence(authority);
        const result = this.db.prepare(
          `UPDATE distillation_jobs
           SET status = 'processing',
               state_revision = state_revision + 1,
               claim_id = ?,
               claim_owner_id = ?,
               claim_fencing_token = ?,
               claimed_supervisor_owner_id = ?,
               claimed_supervisor_lease_epoch = ?,
               claimed_package_generation_id = ?,
               claimed_activation_revision = ?,
               claimed_production_activation_handshake_id = ?,
               claimed_configuration_generation_id = ?,
               claimed_effective_route_set_id = ?,
               claimed_effective_route_revision = ?,
               claimed_capability = ?,
               claimed_route_fingerprint = ?,
               claimed_schema_version = ?,
               claimed_job_schema_version = ?,
               claimed_candidate_schema_version = ?,
               claimed_node_schema_version = ?,
               claimed_at = ?,
               claim_heartbeat_at = ?,
               claim_expires_at = ?,
               system_attempt_count = system_attempt_count + 1,
               failure_code = NULL,
               failure_class = NULL,
               failure_scope = NULL,
               blocked_at = NULL,
               terminal_reason_code = NULL,
               started_at = COALESCE(started_at, ?),
               updated_at = ?
           WHERE id = ? AND home_id = ? AND status = ? AND state_revision = ?`
        ).run(
          options.claimId,
          binding.worker_owner_id,
          binding.worker_fencing_token,
          binding.supervisor_owner_id,
          binding.supervisor_lease_epoch,
          binding.package_generation_id,
          binding.activation_revision,
          binding.production_activation_handshake_id,
          binding.configuration_generation_id,
          binding.effective_route_set_id,
          binding.effective_route_revision,
          binding.capability,
          binding.route_fingerprint,
          binding.schema_version,
          binding.job_schema_version,
          binding.candidate_schema_version,
          binding.node_schema_version,
          options.now,
          options.now,
          options.claimExpiresAt,
          options.now,
          options.now,
          selected.id,
          this.homeId,
          selected.status,
          selected.state_revision
        );
        if (Number(result.changes) !== 1) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_CAS_CONFLICT",
            "Runnable learning job changed before atomic claim committed."
          );
        }
        return readJob(this.db, selected.id)!;
      }
    });
  }

  renewClaim(options: {
    claim: ClaimIdentityExpectation;
    now: string;
    claimExpiresAt: string;
  }): FencedLearningJob {
    const nowEpoch = canonicalEpoch(options.now, "now");
    const expiryEpoch = canonicalEpoch(options.claimExpiresAt, "claimExpiresAt");
    if (expiryEpoch <= nowEpoch) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_CONTRACT_INVALID",
        "Renewed claim expiry must be later than renewal time."
      );
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "claim",
      operation: () => {
        const authority = requireProductionWriteAuthorityInTransaction({
          db: this.db,
          provider: this.productionAuthorityProvider,
          operation: "claim_renewal",
          homeId: this.homeId,
          jobId: options.claim.jobId,
          claimId: options.claim.claimId,
          now: options.now
        });
        const job = readJob(this.db, options.claim.jobId);
        if (!job) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_STATE_INVALID",
            `Job ${options.claim.jobId} does not exist.`
          );
        }
        assertClaimExpectation(job, options.claim);
        assertClaimBindingMatchesAuthority(job, authority);
        const upperBound = Math.min(
          canonicalEpoch(authority.expires_at, "authority.expires_at"),
          authority.worker_drain_deadline_at
            ? canonicalEpoch(
              authority.worker_drain_deadline_at,
              "worker_drain_deadline_at"
            )
            : Number.POSITIVE_INFINITY
        );
        if (expiryEpoch > upperBound) {
          throw new LearningQueueError(
            "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
            "Renewed claim expiry exceeds the current authority or drain deadline."
          );
        }
        const result = this.db.prepare(
          `UPDATE distillation_jobs
           SET state_revision = state_revision + 1,
               claim_heartbeat_at = ?,
               claim_expires_at = ?,
               updated_at = ?
           WHERE id = ?
             AND home_id = ?
             AND status = 'processing'
             AND claim_id = ?
             AND claim_owner_id = ?
             AND claim_fencing_token = ?
             AND state_revision = ?`
        ).run(
          options.now,
          options.claimExpiresAt,
          options.now,
          job.id,
          this.homeId,
          options.claim.claimId,
          options.claim.claimOwnerId,
          options.claim.claimFencingToken,
          options.claim.expectedStateRevision
        );
        if (Number(result.changes) !== 1) {
          throw new LearningQueueError(
            "EE_FENCING_REJECTED",
            "Claim renewal lost its exact claim CAS."
          );
        }
        return readJob(this.db, job.id)!;
      }
    });
  }

  recordWorkerFailure(options: {
    claim: ClaimIdentityExpectation;
    code: LearningFailureCode;
    source: LearningFailureObservationSource;
    now: string;
    nextAttemptAt: string;
    maxContentRetries: number;
  }): { job: FencedLearningJob; candidate: FencedLearningCandidateState } {
    canonicalEpoch(options.now, "now");
    canonicalEpoch(options.nextAttemptAt, "nextAttemptAt");
    assertPositiveInteger(options.maxContentRetries, "maxContentRetries");
    const policy = resolveLearningFailurePolicy({
      code: options.code,
      source: options.source
    });
    const operation = policy.transition === "blocked"
      ? "worker_block"
      : policy.transition === "candidate_failed"
        ? "worker_failure"
        : policy.transition === "terminal_discard"
          ? "worker_discard"
          : null;
    if (!operation) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_CONTRACT_INVALID",
        `${options.code} cannot be selected by a current worker semantic transition.`
      );
    }
    return runRuntimeImmediateTransaction(this.db, {
      category: "protected_result_commit",
      operation: () => {
        const authority = requireProductionWriteAuthorityInTransaction({
          db: this.db,
          provider: this.productionAuthorityProvider,
          operation,
          homeId: this.homeId,
          jobId: options.claim.jobId,
          claimId: options.claim.claimId,
          now: options.now
        });
        const job = readJob(this.db, options.claim.jobId);
        if (!job) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_STATE_INVALID",
            `Job ${options.claim.jobId} does not exist.`
          );
        }
        assertClaimExpectation(job, options.claim);
        assertClaimBindingMatchesAuthority(job, authority);
        const candidate = readCandidate(this.db, job.candidate_id);
        if (!candidate) {
          throw new LearningQueueError(
            "EE_CANDIDATE_MISSING",
            `Candidate ${job.candidate_id} does not exist.`
          );
        }
        const nextContentRetryCount = policy.counter_effect === "content_retry"
          ? candidate.content_retry_count + 1
          : candidate.content_retry_count;
        const contentExhausted =
          policy.counter_effect === "content_retry" &&
          nextContentRetryCount >= options.maxContentRetries;
        const nextJobState: LearningJobState = contentExhausted
          ? "discarded"
          : policy.job_next_state ?? "blocked";
        const nextCandidateState = contentExhausted
          ? "discarded"
          : policy.candidate_next_state ?? "blocked";
        const terminalReason = contentExhausted ? options.code : null;
        const jobResult = this.db.prepare(
          `UPDATE distillation_jobs
           SET status = ?,
               state_revision = state_revision + 1,
               ${CLEAR_CLAIM_SQL},
               failure_code = ?,
               failure_class = ?,
               failure_scope = ?,
               content_retry_count = ?,
               retry_count = ?,
               next_attempt_at = ?,
               blocked_at = ?,
               terminal_reason_code = ?,
               finished_at = ?,
               discarded_at = CASE WHEN ? = 'discarded' THEN ? ELSE discarded_at END,
               updated_at = ?
           WHERE id = ?
             AND home_id = ?
             AND status = 'processing'
             AND claim_id = ?
             AND claim_owner_id = ?
             AND claim_fencing_token = ?
             AND state_revision = ?`
        ).run(
          nextJobState,
          options.code,
          policy.failure_class,
          policy.failure_scope,
          nextContentRetryCount,
          nextContentRetryCount,
          options.nextAttemptAt,
          nextJobState === "blocked" ? options.now : null,
          terminalReason,
          options.now,
          nextJobState,
          options.now,
          options.now,
          job.id,
          this.homeId,
          options.claim.claimId,
          options.claim.claimOwnerId,
          options.claim.claimFencingToken,
          options.claim.expectedStateRevision
        );
        if (Number(jobResult.changes) !== 1) {
          throw new LearningQueueError(
            "EE_FENCING_REJECTED",
            "Worker failure transition lost its exact claim CAS."
          );
        }
        const updatedCandidate = updateCandidateTransition({
          db: this.db,
          candidate,
          nextState: nextCandidateState,
          failureCode: options.code,
          failureClass: policy.failure_class,
          failureScope: policy.failure_scope,
          contentRetryCount: nextContentRetryCount,
          blockedAt: nextCandidateState === "blocked" ? options.now : null,
          terminalReasonCode: terminalReason,
          updatedAt: options.now
        });
        return {
          job: readJob(this.db, job.id)!,
          candidate: updatedCandidate
        };
      }
    });
  }

  discardMissingCandidate(options: {
    claim: ClaimIdentityExpectation;
    now: string;
  }): FencedLearningJob {
    canonicalEpoch(options.now, "now");
    return runRuntimeImmediateTransaction(this.db, {
      category: "protected_result_commit",
      operation: () => {
        const authority = requireProductionWriteAuthorityInTransaction({
          db: this.db,
          provider: this.productionAuthorityProvider,
          operation: "worker_discard",
          homeId: this.homeId,
          jobId: options.claim.jobId,
          claimId: options.claim.claimId,
          now: options.now
        });
        const job = readJob(this.db, options.claim.jobId);
        if (!job) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_STATE_INVALID",
            `Job ${options.claim.jobId} does not exist.`
          );
        }
        assertClaimExpectation(job, options.claim);
        assertClaimBindingMatchesAuthority(job, authority);
        if (readCandidate(this.db, job.candidate_id)) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_STATE_INVALID",
            `Candidate ${job.candidate_id} still exists and cannot use missing-candidate discard.`
          );
        }
        const result = this.db.prepare(
          `UPDATE distillation_jobs
           SET status = 'discarded',
               state_revision = state_revision + 1,
               ${CLEAR_CLAIM_SQL},
               failure_code = 'EE_CANDIDATE_MISSING',
               failure_class = 'terminal',
               failure_scope = 'candidate',
               terminal_reason_code = 'EE_CANDIDATE_MISSING',
               blocked_at = NULL,
               finished_at = ?,
               discarded_at = ?,
               updated_at = ?
           WHERE id = ?
             AND home_id = ?
             AND status = 'processing'
             AND claim_id = ?
             AND claim_owner_id = ?
             AND claim_fencing_token = ?
             AND state_revision = ?`
        ).run(
          options.now,
          options.now,
          options.now,
          job.id,
          this.homeId,
          options.claim.claimId,
          options.claim.claimOwnerId,
          options.claim.claimFencingToken,
          options.claim.expectedStateRevision
        );
        if (Number(result.changes) !== 1) {
          throw new LearningQueueError(
            "EE_FENCING_REJECTED",
            "Missing-candidate discard lost its exact claim CAS."
          );
        }
        return readJob(this.db, job.id)!;
      }
    });
  }

  recoverInterruptedClaim(options: {
    claim: ClaimIdentityExpectation;
    mode: "current_authority" | "claim_expiry";
    now: string;
    code?: Extract<
      LearningFailureCode,
      | "EE_WORKER_INTERRUPTED"
      | "EE_CLAIM_EXPIRED"
      | "EE_FENCING_REJECTED"
      | "EE_ACTIVATION_FENCING_REJECTED"
      | "EE_SQLITE_COMMIT_INTERRUPTED"
      | "EE_SUPERVISOR_UNAVAILABLE"
    >;
  }): { job: FencedLearningJob; candidate: FencedLearningCandidateState } {
    const nowEpoch = canonicalEpoch(options.now, "now");
    return runRuntimeImmediateTransaction(this.db, {
      category: "claim",
      operation: () => {
        const job = readJob(this.db, options.claim.jobId);
        if (!job) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_STATE_INVALID",
            `Job ${options.claim.jobId} does not exist.`
          );
        }
        assertClaimExpectation(job, options.claim);
        if (options.mode === "current_authority") {
          requireLearningQueueMaintenanceAuthorityInTransaction({
            db: this.db,
            provider: this.maintenanceAuthorityProvider,
            operation: "recover_authority_loss",
            homeId: this.homeId,
            jobId: job.id,
            claimId: options.claim.claimId,
            now: options.now
          });
        } else {
          if (!job.claim_expires_at) {
            throw new LearningQueueError(
              "EE_LEARNING_QUEUE_STATE_INVALID",
              "Processing claim is missing expiry authority."
            );
          }
          const expiryEpoch = canonicalEpoch(job.claim_expires_at, "claim_expires_at");
          if (nowEpoch < expiryEpoch) {
            throw new LearningQueueError(
              "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE",
              "Claim-expiry recovery cannot run before the exact claim deadline."
            );
          }
        }
        const code = options.code ?? (
          options.mode === "claim_expiry" ? "EE_CLAIM_EXPIRED" : "EE_WORKER_INTERRUPTED"
        );
        const policy = LEARNING_FAILURE_POLICIES[code];
        if (policy.failure_class !== "interruption") {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_CONTRACT_INVALID",
            `${code} is not interruption recovery evidence.`
          );
        }
        const candidate = readCandidate(this.db, job.candidate_id);
        if (!candidate) {
          throw new LearningQueueError(
            "EE_CANDIDATE_MISSING",
            `Candidate ${job.candidate_id} does not exist.`
          );
        }
        const jobResult = this.db.prepare(
          `UPDATE distillation_jobs
           SET status = 'pending',
               state_revision = state_revision + 1,
               ${CLEAR_CLAIM_SQL},
               failure_code = ?,
               failure_class = 'interruption',
               failure_scope = ?,
               interruption_count = interruption_count + 1,
               next_attempt_at = ?,
               blocked_at = NULL,
               terminal_reason_code = NULL,
               finished_at = NULL,
               updated_at = ?
           WHERE id = ?
             AND home_id = ?
             AND status = 'processing'
             AND claim_id = ?
             AND claim_owner_id = ?
             AND claim_fencing_token = ?
             AND claim_expires_at = ?
             AND state_revision = ?`
        ).run(
          code,
          policy.failure_scope,
          options.now,
          options.now,
          job.id,
          this.homeId,
          options.claim.claimId,
          options.claim.claimOwnerId,
          options.claim.claimFencingToken,
          job.claim_expires_at,
          options.claim.expectedStateRevision
        );
        if (Number(jobResult.changes) !== 1) {
          throw new LearningQueueError(
            "EE_FENCING_REJECTED",
            "Interruption recovery lost its exact stale-claim CAS."
          );
        }
        const updatedCandidate = updateCandidateTransition({
          db: this.db,
          candidate,
          nextState: "pending",
          failureCode: code,
          failureClass: "interruption",
          failureScope: policy.failure_scope,
          contentRetryCount: candidate.content_retry_count,
          blockedAt: null,
          terminalReasonCode: null,
          updatedAt: options.now
        });
        return {
          job: readJob(this.db, job.id)!,
          candidate: updatedCandidate
        };
      }
    });
  }

  resumeBlocked(options: {
    jobId: string;
    expectedJobStateRevision: number;
    expectedCandidateStateRevision: number;
    expectedFailureCode: LearningFailureCode;
    routeFingerprint: string;
    now: string;
  }): { job: FencedLearningJob; candidate: FencedLearningCandidateState } {
    return runRuntimeImmediateTransaction(this.db, {
      category: "claim",
      operation: () => this.resumeBlockedInTransaction(options)
    });
  }

  resumeBlockedInTransaction(options: {
    jobId: string;
    expectedJobStateRevision: number;
    expectedCandidateStateRevision: number;
    expectedFailureCode: LearningFailureCode;
    routeFingerprint: string;
    now: string;
  }): { job: FencedLearningJob; candidate: FencedLearningCandidateState } {
    assertPositiveInteger(options.expectedJobStateRevision, "expectedJobStateRevision");
    assertPositiveInteger(
      options.expectedCandidateStateRevision,
      "expectedCandidateStateRevision"
    );
    assertNonEmpty(options.routeFingerprint, "routeFingerprint");
    canonicalEpoch(options.now, "now");
    if (!this.db.isTransaction) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_CONTRACT_INVALID",
        "In-transaction blocked resume requires an active SQLite authority transaction."
      );
    }
    const resumeAuthority =
      requireLearningQueueMaintenanceAuthorityInTransaction({
      db: this.db,
      provider: this.maintenanceAuthorityProvider,
      operation: "resume_blocked",
      homeId: this.homeId,
      jobId: options.jobId,
      now: options.now
    });
    if (resumeAuthority.route_fingerprint !== options.routeFingerprint) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE",
        "Blocked resume route fingerprint does not match current validated route authority."
      );
    }
    const job = readJob(this.db, options.jobId);
    if (
      !job ||
      job.status !== "blocked" ||
      job.state_revision !== options.expectedJobStateRevision ||
      job.failure_code !== options.expectedFailureCode
    ) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_CAS_CONFLICT",
        "Blocked job no longer matches the expected resumable state."
      );
    }
    const candidate = readCandidate(this.db, job.candidate_id);
    if (
      !candidate ||
      candidate.lifecycle_state !== "blocked" ||
      candidate.state_revision !== options.expectedCandidateStateRevision
    ) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_CAS_CONFLICT",
        "Blocked candidate no longer matches the expected resumable state."
      );
    }
    const jobResult = this.db.prepare(
      `UPDATE distillation_jobs
       SET status = 'pending',
           state_revision = state_revision + 1,
           failure_code = NULL,
           failure_class = NULL,
           failure_scope = NULL,
           blocked_at = NULL,
           next_attempt_at = ?,
           route_fingerprint = ?,
           updated_at = ?
       WHERE id = ? AND home_id = ? AND status = 'blocked'
         AND state_revision = ? AND failure_code = ?`
    ).run(
      options.now,
      resumeAuthority.route_fingerprint,
      options.now,
      job.id,
      this.homeId,
      options.expectedJobStateRevision,
      options.expectedFailureCode
    );
    if (Number(jobResult.changes) !== 1) {
      throw new LearningQueueError(
        "EE_LEARNING_QUEUE_CAS_CONFLICT",
        "Blocked job resume lost its exact CAS."
      );
    }
    const updatedCandidate = updateCandidateTransition({
      db: this.db,
      candidate,
      nextState: "pending",
      failureCode: null,
      failureClass: null,
      failureScope: null,
      contentRetryCount: candidate.content_retry_count,
      blockedAt: null,
      terminalReasonCode: null,
      updatedAt: options.now
    });
    return {
      job: readJob(this.db, job.id)!,
      candidate: updatedCandidate
    };
  }

  cancel(options: {
    jobId: string;
    expectedJobStateRevision: number;
    expectedCandidateStateRevision: number;
    now: string;
    claim?: Omit<ClaimIdentityExpectation, "jobId" | "expectedStateRevision">;
  }): { job: FencedLearningJob; candidate: FencedLearningCandidateState } {
    canonicalEpoch(options.now, "now");
    return runRuntimeImmediateTransaction(this.db, {
      category: "claim",
      operation: () => {
        const job = readJob(this.db, options.jobId);
        if (!job || job.state_revision !== options.expectedJobStateRevision) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_CAS_CONFLICT",
            "Cancellation target changed before maintenance authority was applied."
          );
        }
        requireLearningQueueMaintenanceAuthorityInTransaction({
          db: this.db,
          provider: this.maintenanceAuthorityProvider,
          operation: "operator_cancel",
          homeId: this.homeId,
          jobId: job.id,
          claimId: job.claim_id ?? undefined,
          now: options.now
        });
        if (job.status === "processing") {
          if (
            !options.claim ||
            job.claim_id !== options.claim.claimId ||
            job.claim_owner_id !== options.claim.claimOwnerId ||
            job.claim_fencing_token !== options.claim.claimFencingToken
          ) {
            throw new LearningQueueError(
              "EE_FENCING_REJECTED",
              "Processing cancellation requires the exact current claim identity."
            );
          }
        }
        const candidate = readCandidate(this.db, job.candidate_id);
        if (
          !candidate ||
          candidate.state_revision !== options.expectedCandidateStateRevision
        ) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_CAS_CONFLICT",
            "Cancellation candidate changed before maintenance authority was applied."
          );
        }
        const jobResult = this.db.prepare(
          `UPDATE distillation_jobs
           SET status = 'discarded',
               state_revision = state_revision + 1,
               ${CLEAR_CLAIM_SQL},
               failure_code = 'EE_OPERATOR_CANCELLED',
               failure_class = 'terminal',
               failure_scope = 'candidate',
               terminal_reason_code = 'EE_OPERATOR_CANCELLED',
               blocked_at = NULL,
               finished_at = ?,
               discarded_at = ?,
               updated_at = ?
           WHERE id = ? AND home_id = ? AND state_revision = ?`
        ).run(
          options.now,
          options.now,
          options.now,
          job.id,
          this.homeId,
          options.expectedJobStateRevision
        );
        if (Number(jobResult.changes) !== 1) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_CAS_CONFLICT",
            "Cancellation job CAS failed."
          );
        }
        const updatedCandidate = updateCandidateTransition({
          db: this.db,
          candidate,
          nextState: "discarded",
          failureCode: "EE_OPERATOR_CANCELLED",
          failureClass: "terminal",
          failureScope: "candidate",
          contentRetryCount: candidate.content_retry_count,
          blockedAt: null,
          terminalReasonCode: "EE_OPERATOR_CANCELLED",
          updatedAt: options.now
        });
        return {
          job: readJob(this.db, job.id)!,
          candidate: updatedCandidate
        };
      }
    });
  }

  completeSemantic<T>(options: {
    claim: ClaimIdentityExpectation;
    now: string;
    nodeId: string;
    distillationSource: string;
    semanticOrigin: SemanticOriginReference;
    applySemanticWrites: (input: {
      db: DatabaseSync;
      job: FencedLearningJob;
      candidate: FencedLearningCandidateState;
    }) => T;
  }): {
    job: FencedLearningJob;
    candidate: FencedLearningCandidateState;
    provenance: SemanticOriginSummary;
    result: T;
  } {
    canonicalEpoch(options.now, "now");
    assertNonEmpty(options.nodeId, "nodeId");
    assertNonEmpty(options.distillationSource, "distillationSource");
    return runRuntimeImmediateTransaction(this.db, {
      category: "protected_result_commit",
      operation: () => {
        const authority = requireProductionWriteAuthorityInTransaction({
          db: this.db,
          provider: this.productionAuthorityProvider,
          operation: "semantic_completion",
          homeId: this.homeId,
          jobId: options.claim.jobId,
          claimId: options.claim.claimId,
          now: options.now
        });
        const job = readJob(this.db, options.claim.jobId);
        if (!job) {
          throw new LearningQueueError(
            "EE_LEARNING_QUEUE_STATE_INVALID",
            `Job ${options.claim.jobId} does not exist.`
          );
        }
        assertClaimExpectation(job, options.claim);
        assertClaimBindingMatchesAuthority(job, authority);
        const candidate = readCandidate(this.db, job.candidate_id);
        if (!candidate) {
          throw new LearningQueueError(
            "EE_CANDIDATE_MISSING",
            `Candidate ${job.candidate_id} does not exist.`
          );
        }
        const candidateOrigin = this.provenance.readCandidateOrigin(candidate.id);
        if (
          !candidateOrigin ||
          candidate.semantic_origin_provenance_key !==
            candidateOrigin.provenance_key
        ) {
          throw new LearningQueueError(
            "EE_SEMANTIC_ORIGIN_INVALID",
            "Candidate semantic-origin provenance is missing or internally inconsistent."
          );
        }
        if (
          options.semanticOrigin.configuration_generation_id !==
            authority.configuration_generation_id ||
          options.semanticOrigin.package_generation_id !==
            authority.package_generation_id ||
          options.semanticOrigin.stage_routes.distillation.route_fingerprint !==
            authority.route_fingerprint
        ) {
          throw new LearningQueueError(
            "EE_SEMANTIC_ORIGIN_INVALID",
            "Completion semantic origin does not match current claim authority."
          );
        }
        const semanticResult = options.applySemanticWrites({
          db: this.db,
          job,
          candidate
        });
        assertSynchronousResult(semanticResult);
        let provenanceSummary = this.provenance.aggregateNodeOriginInTransaction({
          nodeId: options.nodeId,
          reference: candidateOrigin
        });
        if (options.semanticOrigin.provenance_key !== candidateOrigin.provenance_key) {
          provenanceSummary = this.provenance.aggregateNodeOriginInTransaction({
            nodeId: options.nodeId,
            reference: options.semanticOrigin
          });
        }
        const jobResult = this.db.prepare(
          `UPDATE distillation_jobs
           SET status = 'succeeded',
               state_revision = state_revision + 1,
               ${CLEAR_CLAIM_SQL},
               distillation_source = ?,
               failure_code = NULL,
               failure_class = NULL,
               failure_scope = NULL,
               blocked_at = NULL,
               terminal_reason_code = NULL,
               finished_at = ?,
               updated_at = ?
           WHERE id = ?
             AND home_id = ?
             AND status = 'processing'
             AND claim_id = ?
             AND claim_owner_id = ?
             AND claim_fencing_token = ?
             AND state_revision = ?`
        ).run(
          options.distillationSource,
          options.now,
          options.now,
          job.id,
          this.homeId,
          options.claim.claimId,
          options.claim.claimOwnerId,
          options.claim.claimFencingToken,
          options.claim.expectedStateRevision
        );
        if (Number(jobResult.changes) !== 1) {
          throw new LearningQueueError(
            "EE_FENCING_REJECTED",
            "Semantic completion lost its exact claim CAS."
          );
        }
        const updatedCandidate = updateCandidateTransition({
          db: this.db,
          candidate: readCandidate(this.db, candidate.id)!,
          nextState: "distilled",
          failureCode: null,
          failureClass: null,
          failureScope: null,
          contentRetryCount: candidate.content_retry_count,
          blockedAt: null,
          terminalReasonCode: null,
          updatedAt: options.now,
          distilledNodeId: options.nodeId
        });
        return {
          job: readJob(this.db, job.id)!,
          candidate: updatedCandidate,
          provenance: provenanceSummary,
          result: semanticResult
        };
      }
    });
  }
}

