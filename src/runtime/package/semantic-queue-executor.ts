import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  classifyDistillationFailure,
  DistillationExecutionError
} from "../../distillation/errors.js";
import {
  SemanticDistillationProcessor,
  type SemanticProcessingResult
} from "../../distillation/semantic-processor.js";
import { CandidateRepository } from "../../store/sqlite/repositories/candidate-repo.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";
import type { RuntimePackageGenerationIdentity } from "../identity/types.js";
import {
  createS6LearningQueueMaintenanceAuthorityProvider,
  createS6LearningQueueProductionWriteAuthorityProvider
} from "../activation/authority.js";
import {
  recoverCurrentRuntimeConfigurationRouteAuthority
} from "../activation/configuration-route-authority.js";
import { LearningQueueError } from "../learning-queue/errors.js";
import {
  SemanticOriginProvenanceRepository
} from "../learning-queue/provenance.js";
import {
  FencedLearningQueueRepository
} from "../learning-queue/repository.js";
import type {
  ClaimIdentityExpectation,
  FencedLearningJob,
  SemanticOriginReference
} from "../learning-queue/types.js";
import {
  readMachineIntegrityKey
} from "../identity/integrity-key.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import {
  createPackageWorkerSemanticRouteBinding,
  type PackageWorkerSemanticRouteBinding
} from "./semantic-route-adapter.js";

export const PACKAGE_WORKER_SEMANTIC_QUEUE_POLICY = Object.freeze({
  poll_interval_ms: 500,
  claim_ttl_ms: 10_000,
  claim_renew_interval_ms: 3_000,
  failure_backoff_ms: 30_000
} as const);

export type PackageWorkerSemanticDrainResult =
  | { status: "idle" }
  | { status: "authority_unavailable"; code: string }
  | { status: "completed"; jobId: string; nodeId: string }
  | { status: "failed"; jobId: string; code: string }
  | { status: "interrupted"; jobId: string; recovered: boolean; code: string };

const claimExpectation = (
  job: FencedLearningJob
): ClaimIdentityExpectation => {
  if (
    !job.claim_id ||
    !job.claim_owner_id ||
    job.claim_fencing_token === null
  ) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_STATE_INVALID",
      `Processing job ${job.id} is missing exact claim identity.`
    );
  }
  return {
    jobId: job.id,
    claimId: job.claim_id,
    claimOwnerId: job.claim_owner_id,
    claimFencingToken: job.claim_fencing_token,
    expectedStateRevision: job.state_revision
  };
};

const addMilliseconds = (timestamp: string, milliseconds: number): string =>
  new Date(Date.parse(timestamp) + milliseconds).toISOString();

const isAuthorityOrClaimLoss = (error: unknown): boolean =>
  error instanceof LearningQueueError &&
  [
    "EE_FENCING_REJECTED",
    "EE_ACTIVATION_FENCING_REJECTED",
    "EE_PRODUCTION_WRITE_AUTHORITY_UNAVAILABLE",
    "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH",
    "EE_LEARNING_QUEUE_CAS_CONFLICT"
  ].includes(error.code);

const interruptionCode = (error: unknown):
  | "EE_FENCING_REJECTED"
  | "EE_ACTIVATION_FENCING_REJECTED"
  | "EE_WORKER_INTERRUPTED" => {
  if (
    error instanceof LearningQueueError &&
    error.code === "EE_FENCING_REJECTED"
  ) {
    return "EE_FENCING_REJECTED";
  }
  if (
    error instanceof LearningQueueError &&
    (
      error.code === "EE_ACTIVATION_FENCING_REJECTED" ||
      error.code === "EE_PRODUCTION_WRITE_AUTHORITY_UNAVAILABLE" ||
      error.code === "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH"
    )
  ) {
    return "EE_ACTIVATION_FENCING_REJECTED";
  }
  return "EE_WORKER_INTERRUPTED";
};

export class PackageWorkerSemanticQueueExecutor {
  private readonly candidateRepository: CandidateRepository;
  private readonly nodeRepository: NodeRepository;
  private readonly provenanceRepository: SemanticOriginProvenanceRepository;

  constructor(private readonly options: {
    db: DatabaseSync;
    queueRepository: FencedLearningQueueRepository;
    routeBinding: PackageWorkerSemanticRouteBinding;
    now?: () => string;
    idFactory?: () => string;
    processorFactory?: (input: {
      candidateOrigin: SemanticOriginReference;
      nodeRepository: NodeRepository;
      routeBinding: PackageWorkerSemanticRouteBinding;
    }) => {
      process(candidate: Parameters<SemanticDistillationProcessor["process"]>[0]):
        Promise<SemanticProcessingResult>;
    };
    claimTtlMs?: number;
    claimRenewIntervalMs?: number;
    failureBackoffMs?: number;
  }) {
    this.candidateRepository = new CandidateRepository(options.db);
    this.nodeRepository = new NodeRepository(options.db);
    this.provenanceRepository = new SemanticOriginProvenanceRepository(
      options.db
    );
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  private processor(
    candidateOrigin: SemanticOriginReference
  ): {
    process(candidate: Parameters<SemanticDistillationProcessor["process"]>[0]):
      Promise<SemanticProcessingResult>;
  } {
    if (candidateOrigin.stage_routes.merge_decision.route_kind !== "deterministic") {
      throw new DistillationExecutionError(
        "provider_configuration_invalid",
        "Production model-backed merge decisions do not have a mechanically mapped S4 adapter.",
        "EE_PROVIDER_CONFIGURATION_INVALID",
        "setup"
      );
    }
    return this.options.processorFactory?.({
      candidateOrigin,
      nodeRepository: this.nodeRepository,
      routeBinding: this.options.routeBinding
    }) ?? new SemanticDistillationProcessor(
      this.options.routeBinding.config,
      this.nodeRepository,
      this.options.routeBinding.processorOptions
    );
  }

  private recoverInterruption(
    claim: ClaimIdentityExpectation,
    error: unknown
  ): PackageWorkerSemanticDrainResult {
    const code = interruptionCode(error);
    try {
      this.options.queueRepository.recoverInterruptedClaim({
        claim,
        mode: "current_authority",
        now: this.now(),
        code
      });
      return {
        status: "interrupted",
        jobId: claim.jobId,
        recovered: true,
        code
      };
    } catch {
      return {
        status: "interrupted",
        jobId: claim.jobId,
        recovered: false,
        code
      };
    }
  }

  async drainOne(): Promise<PackageWorkerSemanticDrainResult> {
    const claimedAt = this.now();
    let claimed: FencedLearningJob | undefined;
    try {
      claimed = this.options.queueRepository.claimNext({
        claimId: (this.options.idFactory ?? randomUUID)(),
        now: claimedAt,
        claimExpiresAt: addMilliseconds(
          claimedAt,
          this.options.claimTtlMs ??
            PACKAGE_WORKER_SEMANTIC_QUEUE_POLICY.claim_ttl_ms
        )
      });
    } catch (error) {
      if (isAuthorityOrClaimLoss(error)) {
        return {
          status: "authority_unavailable",
          code: error instanceof LearningQueueError ? error.code : "unknown"
        };
      }
      throw error;
    }
    if (!claimed) {
      return { status: "idle" };
    }

    let currentClaim = claimExpectation(claimed);
    let renewalFailure: unknown;
    const renewalTimer = setInterval(() => {
      if (renewalFailure) {
        return;
      }
      const now = this.now();
      try {
        const renewed = this.options.queueRepository.renewClaim({
          claim: currentClaim,
          now,
          claimExpiresAt: addMilliseconds(
            now,
            this.options.claimTtlMs ??
              PACKAGE_WORKER_SEMANTIC_QUEUE_POLICY.claim_ttl_ms
          )
        });
        currentClaim = claimExpectation(renewed);
      } catch (error) {
        renewalFailure = error;
      }
    }, this.options.claimRenewIntervalMs ??
      PACKAGE_WORKER_SEMANTIC_QUEUE_POLICY.claim_renew_interval_ms);
    renewalTimer.unref?.();

    try {
      const candidate = this.candidateRepository.getById(claimed.candidate_id);
      if (!candidate) {
        clearInterval(renewalTimer);
        this.options.queueRepository.discardMissingCandidate({
          claim: currentClaim,
          now: this.now()
        });
        return {
          status: "failed",
          jobId: claimed.id,
          code: "EE_CANDIDATE_MISSING"
        };
      }
      const candidateOrigin = this.provenanceRepository.readCandidateOrigin(
        candidate.id
      );
      if (!candidateOrigin) {
        throw new DistillationExecutionError(
          "provider_contract_invalid",
          "Claimed candidate is missing semantic-origin provenance.",
          "EE_PROVIDER_CONTRACT_INVALID",
          "setup"
        );
      }
      if (
        candidateOrigin.stage_routes.distillation.route_fingerprint !==
          this.options.routeBinding.distillationRouteFingerprint
      ) {
        throw new DistillationExecutionError(
          "provider_configuration_invalid",
          "Candidate semantic origin does not match the recovered S4 distillation route.",
          "EE_PROVIDER_CONFIGURATION_INVALID",
          "setup"
        );
      }

      const semanticResult = await this.processor(candidateOrigin).process(
        candidate
      );
      clearInterval(renewalTimer);
      if (renewalFailure) {
        return this.recoverInterruption(currentClaim, renewalFailure);
      }
      const distillationSource =
        semanticResult.node.distillation_source?.trim();
      if (!distillationSource) {
        throw new DistillationExecutionError(
          "provider_contract_invalid",
          "Semantic processor returned no stable distillation source.",
          "EE_PROVIDER_CONTRACT_INVALID",
          "provider_execution"
        );
      }
      try {
        this.options.queueRepository.completeSemantic({
          claim: currentClaim,
          now: this.now(),
          nodeId: semanticResult.node.id,
          distillationSource,
          semanticOrigin: candidateOrigin,
          applySemanticWrites: ({ db }) =>
            new NodeRepository(db).upsert(semanticResult.node)
        });
      } catch (error) {
        if (isAuthorityOrClaimLoss(error)) {
          return this.recoverInterruption(currentClaim, error);
        }
        throw error;
      }
      return {
        status: "completed",
        jobId: claimed.id,
        nodeId: semanticResult.node.id
      };
    } catch (error) {
      clearInterval(renewalTimer);
      if (renewalFailure || isAuthorityOrClaimLoss(error)) {
        return this.recoverInterruption(
          currentClaim,
          renewalFailure ?? error
        );
      }
      const classification = classifyDistillationFailure(error);
      try {
        this.options.queueRepository.recordWorkerFailure({
          claim: currentClaim,
          code: classification.code,
          source: classification.source,
          now: this.now(),
          nextAttemptAt: addMilliseconds(
            this.now(),
            this.options.failureBackoffMs ??
              PACKAGE_WORKER_SEMANTIC_QUEUE_POLICY.failure_backoff_ms
          ),
          maxContentRetries:
            this.options.routeBinding.config.distillationMaxRetries
        });
        return {
          status: "failed",
          jobId: claimed.id,
          code: classification.code
        };
      } catch (failureCommitError) {
        if (isAuthorityOrClaimLoss(failureCommitError)) {
          return this.recoverInterruption(currentClaim, failureCommitError);
        }
        throw failureCommitError;
      }
    }
  }
}

export const createCurrentPackageWorkerSemanticQueueExecutor = async (options: {
  db: DatabaseSync;
  canonicalHome: string;
  homeId: string;
  packageRoot: string;
  packageBuildId: string;
  packageIdentity: RuntimePackageGenerationIdentity;
  clock?: RuntimeProcessAuthorityClock;
  fetchImpl?: typeof fetch;
  now?: () => string;
  idFactory?: () => string;
}): Promise<PackageWorkerSemanticQueueExecutor | undefined> => {
  const integrityKey = await readMachineIntegrityKey(options.canonicalHome);
  const clock = options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
  const recovered = await recoverCurrentRuntimeConfigurationRouteAuthority({
    db: options.db,
    canonicalHome: options.canonicalHome,
    homeId: options.homeId,
    packageRoot: options.packageRoot,
    packageBuildId: options.packageBuildId,
    packageIdentity: options.packageIdentity,
    integrityKey,
    clock
  });
  if (!recovered) {
    return undefined;
  }
  const routeBinding = createPackageWorkerSemanticRouteBinding({
    generation: recovered.verifiedGeneration,
    routeAuthorities: recovered.snapshotRouteAuthorities(),
    fetchImpl: options.fetchImpl
  });
  const queueRepository = new FencedLearningQueueRepository(
    options.db,
    options.homeId,
    createS6LearningQueueProductionWriteAuthorityProvider({
      routeAuthorityProvider: recovered.routeAuthorityProvider,
      clock
    }),
    createS6LearningQueueMaintenanceAuthorityProvider({
      routeAuthorityProvider: recovered.routeAuthorityProvider,
      clock
    })
  );
  return new PackageWorkerSemanticQueueExecutor({
    db: options.db,
    queueRepository,
    routeBinding,
    now: options.now,
    idFactory: options.idFactory
  });
};

export const PACKAGE_WORKER_SEMANTIC_QUEUE_EXECUTOR_CONTRACT = Object.freeze({
  claim_repository: "FencedLearningQueueRepository.claimNext",
  renewal_repository: "FencedLearningQueueRepository.renewClaim",
  completion_repository: "FencedLearningQueueRepository.completeSemantic",
  failure_repository: "FencedLearningQueueRepository.recordWorkerFailure",
  provider_work_inside_sqlite_authority_transaction: false,
  stale_output_committed: false,
  authority_loss_transition: "interruption_only",
  authority_loss_consumes_content_retry: false
});
