import { DatabaseSync } from "node:sqlite";
import {
  LEARNING_QUEUE_MAINTENANCE_AUTHORITY_CONTRACT_VERSION,
  PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION
} from "../../src/runtime/learning-queue/constants.js";
import {
  FencedLearningQueueRepository
} from "../../src/runtime/learning-queue/repository.js";
import {
  createSemanticOriginReference
} from "../../src/runtime/learning-queue/provenance.js";
import type {
  LearningQueueMaintenanceAuthorityProvider,
  ProductionWriteAuthorityEvidence,
  ProductionWriteAuthorityProvider
} from "../../src/runtime/learning-queue/types.js";
import {
  bootstrapDatabase
} from "../../src/store/sqlite/db.js";
import {
  CandidateRepository
} from "../../src/store/sqlite/repositories/candidate-repo.js";
import type {
  ExperienceCandidate,
  ExperienceNode
} from "../../src/types/domain.js";

export const QUEUE_FIXTURE_HOME_ID = "home-fenced-queue";
export const QUEUE_FIXTURE_NOW = "2026-07-12T16:00:00.000Z";
export const QUEUE_FIXTURE_CLAIM_EXPIRY = "2026-07-12T16:05:00.000Z";
export const QUEUE_FIXTURE_AUTHORITY_EXPIRY = "2026-07-12T16:10:00.000Z";

export const createQueueCandidate = (
  overrides: Partial<ExperienceCandidate> = {}
): ExperienceCandidate => ({
  id: "candidate-fenced-queue",
  task_run_id: "taskrun-fenced-queue",
  candidate_kind: "successful_fix",
  source_record_id: "input-fenced-queue",
  scope_id: "scope-fenced-queue",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Repeat a deterministic queue fixture",
  compact_hint: "Use the fenced queue fixture.",
  success_signal: "fenced queue fixture passes",
  evidence_summary: "A deterministic fixture generated this candidate.",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_signal: {
    task_summary: "Implement fenced queue semantics",
    outcome_signal: "success",
    tool_events: [],
    evidence: ["fixture"],
    retry_count: 0,
    correction_signals: [],
    tool_event_summary: []
  },
  lifecycle_state: "pending",
  retry_count: 0,
  created_at: QUEUE_FIXTURE_NOW,
  updated_at: QUEUE_FIXTURE_NOW,
  ...overrides
});

export const createQueueNode = (
  overrides: Partial<ExperienceNode> = {}
): ExperienceNode => ({
  id: "node-fenced-queue",
  node_type: "strategy",
  scope_id: "scope-fenced-queue",
  task_type: "test_debug",
  trigger_pattern: "Repeat a deterministic queue fixture",
  compact_hint: "Use the fenced queue fixture.",
  success_signal: "fenced queue fixture passes",
  evidence_summary: "A deterministic fixture generated this node.",
  source_kind: "system_derived",
  origin_record_ids: ["input-fenced-queue"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: QUEUE_FIXTURE_NOW,
  updated_at: QUEUE_FIXTURE_NOW,
  ...overrides
});

export const createProductionAuthorityEvidence = (
  operation: ProductionWriteAuthorityEvidence["operation"],
  overrides: Partial<ProductionWriteAuthorityEvidence> = {}
): ProductionWriteAuthorityEvidence => ({
  available: true,
  authorized: true,
  fresh: true,
  authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
  operation,
  home_id: QUEUE_FIXTURE_HOME_ID,
  worker_owner_id: "worker-fenced-queue",
  worker_fencing_token: 7,
  worker_mode: "production",
  worker_lease_state: "active",
  worker_shutdown_requested_at: null,
  worker_drain_deadline_at: null,
  supervisor_owner_id: "supervisor-fenced-queue",
  supervisor_lease_epoch: 11,
  package_generation_id: "package-fenced-queue",
  package_generation_role: "active",
  activation_revision: 13,
  production_activation_handshake_id: "handshake-fenced-queue",
  configuration_generation_id: "configuration-fenced-queue",
  effective_route_set_id: "route-set-fenced-queue",
  effective_route_revision: 17,
  capability: "distillation",
  route_fingerprint: "route-fingerprint-fenced-queue",
  schema_version: "legacy-learning-v0",
  job_schema_version: "fenced-learning-job-v1",
  candidate_schema_version: "fenced-learning-candidate-v1",
  node_schema_version: "semantic-origin-node-v1",
  observed_at: QUEUE_FIXTURE_NOW,
  expires_at: QUEUE_FIXTURE_AUTHORITY_EXPIRY,
  ...overrides
});

export const createQueueSemanticOrigin = (
  createdAt = QUEUE_FIXTURE_NOW
) => createSemanticOriginReference({
  configuration_generation_id: "configuration-fenced-queue",
  package_generation_id: "package-fenced-queue",
  generation_profile_id: "custom-contract-v1",
  generation_profile_version: "1.0.0",
  generation_profile_status: "active",
  quality_profile: "custom",
  stage_routes: {
    learning_gate: {
      route_fingerprint: "learning-gate-route",
      validation_record_id: "validation-learning-gate",
      benchmark_assurance: "unbenchmarked",
      contract_version: "learning-gate-contract-v1"
    },
    distillation: {
      route_fingerprint: "route-fingerprint-fenced-queue",
      validation_record_id: "validation-distillation",
      benchmark_assurance: "unbenchmarked",
      contract_version: "distillation-contract-v1"
    },
    merge_decision: {
      route_kind: "deterministic",
      route_fingerprint: "deterministic-merge-v1",
      validation_record_id: "validation-deterministic-merge",
      benchmark_assurance: "unbenchmarked",
      contract_version: "merge-contract-v1"
    }
  },
  createdAt
});

export const createProductionAuthorityProvider = (options: {
  overrides?: Partial<ProductionWriteAuthorityEvidence>;
  unavailable?: boolean;
} = {}): ProductionWriteAuthorityProvider => ({
  getProductionWriteAuthorityInTransaction(input) {
    if (options.unavailable) {
      return {
        available: false,
        authorized: false,
        fresh: false,
        authority_contract_version: PRODUCTION_WRITE_AUTHORITY_CONTRACT_VERSION,
        operation: input.operation,
        reason: "production_activation_not_current"
      };
    }
    return createProductionAuthorityEvidence(input.operation, options.overrides);
  }
});

export const createMaintenanceAuthorityProvider = (options: {
  unavailable?: boolean;
  overrides?: Partial<
    Exclude<
      ReturnType<
        LearningQueueMaintenanceAuthorityProvider["getLearningQueueMaintenanceAuthorityInTransaction"]
      >,
      { available: false }
    >
  >;
} = {}): LearningQueueMaintenanceAuthorityProvider => ({
  getLearningQueueMaintenanceAuthorityInTransaction(input) {
    if (options.unavailable) {
      return {
        available: false,
        fresh: false,
        authority_contract_version:
          LEARNING_QUEUE_MAINTENANCE_AUTHORITY_CONTRACT_VERSION,
        operation: input.operation,
        reason: "recovery_authority_not_current"
      };
    }
    return {
      available: true,
      fresh: true,
      authority_contract_version:
        LEARNING_QUEUE_MAINTENANCE_AUTHORITY_CONTRACT_VERSION,
      operation: input.operation,
      home_id: QUEUE_FIXTURE_HOME_ID,
      owner_kind: "supervisor",
      owner_id: "supervisor-fenced-queue",
      supervisor_lease_epoch: 11,
      configuration_generation_id: "configuration-fenced-queue",
      effective_route_set_id: "route-set-fenced-queue",
      effective_route_revision: 17,
      capability: "distillation",
      route_fingerprint: "route-fingerprint-fenced-queue",
      validation_current: true,
      observed_at: QUEUE_FIXTURE_NOW,
      expires_at: QUEUE_FIXTURE_AUTHORITY_EXPIRY,
      ...options.overrides
    };
  }
});

export const createFencedLearningQueueFixture = (options: {
  productionAuthorityProvider?: ProductionWriteAuthorityProvider;
  maintenanceAuthorityProvider?: LearningQueueMaintenanceAuthorityProvider;
  candidate?: ExperienceCandidate;
} = {}) => {
  const db = new DatabaseSync(":memory:");
  bootstrapDatabase(db);
  const candidateRepository = new CandidateRepository(db);
  const candidate = options.candidate ?? createQueueCandidate();
  candidateRepository.upsert(candidate);
  const repository = new FencedLearningQueueRepository(
    db,
    QUEUE_FIXTURE_HOME_ID,
    options.productionAuthorityProvider ?? createProductionAuthorityProvider(),
    options.maintenanceAuthorityProvider ?? createMaintenanceAuthorityProvider()
  );
  const job = repository.registerPendingJob({
    jobId: "job-fenced-queue",
    candidateId: candidate.id,
    extractorProfile: "balanced",
    routeFingerprint: "route-fingerprint-fenced-queue",
    semanticOrigin: createQueueSemanticOrigin(),
    createdAt: QUEUE_FIXTURE_NOW
  });
  return {
    db,
    candidate,
    candidateRepository,
    repository,
    job
  };
};

