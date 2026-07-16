import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import {
  MATCHED_BLOCK_ARMS,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "./constants.js";
import {
  computeMatchedBlockArmControlDigest,
  deriveMatchedBlockArmOrder
} from "./arm-control.js";
import { computeBenchmarkRecordDigest } from "./contract.js";
import { MatchedBlockBenchmarkStore } from "./store.js";
import type {
  BenchmarkBlockDisposition,
  BenchmarkBlockDispositionRecord,
  BenchmarkFailureClassification,
  BenchmarkFormalAttempt,
  BenchmarkReplacementLineageRecord,
  MatchedBlockArm,
  MatchedBlockArmPlan,
  MatchedBlockManifest
} from "./types.js";

export type BenchmarkAttemptAssessment = {
  arm: MatchedBlockArm;
  classification: BenchmarkFailureClassification;
  efficacy_eligible: boolean;
  reason_code: string;
};

export type BenchmarkBlockAssessment = {
  block_id: string;
  disposition: Exclude<BenchmarkBlockDisposition, "superseded_by_replacement">;
  reason_code: string;
  affected_arms: MatchedBlockArm[];
  attempts: BenchmarkAttemptAssessment[];
  efficacy_eligible: boolean;
  evidence_digest: string;
};

export type CreateReplacementBlockOptions = {
  store: MatchedBlockBenchmarkStore;
  originalBlockId: string;
  replacementBlockId: string;
  randomizationSeed: string;
  reasonCode: string;
  approvedBy: string;
  createdAt: string;
};

export class MatchedBlockFailureProtocolError extends Error {
  constructor(
    readonly code:
      | "BENCHMARK_BLOCK_INCOMPLETE"
      | "BENCHMARK_REPLACEMENT_NOT_ALLOWED"
      | "BENCHMARK_REPLACEMENT_IDENTITY_INVALID",
    message: string
  ) {
    super(message);
    this.name = "MatchedBlockFailureProtocolError";
  }
}

const fail = (
  code: MatchedBlockFailureProtocolError["code"],
  message: string
): never => {
  throw new MatchedBlockFailureProtocolError(code, message);
};

const requireTerminalAttempts = (
  store: MatchedBlockBenchmarkStore,
  blockId: string
): BenchmarkFormalAttempt[] => {
  const attempts = MATCHED_BLOCK_ARMS.map((arm) => store.getFormalAttempt(blockId, arm));
  if (attempts.some((attempt) => !attempt || attempt.execution_status === "running")) {
    fail(
      "BENCHMARK_BLOCK_INCOMPLETE",
      "Every required arm must have one terminal formal attempt before block disposition."
    );
  }
  return attempts as BenchmarkFormalAttempt[];
};

export const assessBenchmarkFormalAttempt = (
  attempt: BenchmarkFormalAttempt
): BenchmarkAttemptAssessment => {
  if (attempt.execution_status === "running") {
    return fail(
      "BENCHMARK_BLOCK_INCOMPLETE",
      `Formal attempt ${attempt.block_id}/${attempt.arm} is still running.`
    );
  }
  if (attempt.execution_status === "completed") {
    const productFailure =
      attempt.task_outcome !== "success" ||
      attempt.task_timeout ||
      attempt.product_runtime_failure_codes.length > 0;
    return {
      arm: attempt.arm,
      classification: productFailure ? "product_failure" : "completion",
      efficacy_eligible: true,
      reason_code: productFailure
        ? attempt.task_timeout
          ? "BENCH_PRODUCT_TASK_TIMEOUT"
          : attempt.product_runtime_failure_codes[0] ?? "BENCH_PRODUCT_TASK_OUTCOME"
        : "BENCH_VALID_COMPLETION"
    };
  }
  if (attempt.execution_status === "cancelled") {
    return {
      arm: attempt.arm,
      classification: "abort",
      efficacy_eligible: false,
      reason_code: attempt.infrastructure_failure_code ?? "BENCH_OPERATOR_CANCELLED"
    };
  }
  if (attempt.execution_status === "invalid") {
    return {
      arm: attempt.arm,
      classification: "exclusion",
      efficacy_eligible: false,
      reason_code: attempt.infrastructure_failure_code ?? "BENCH_HARNESS_DEFECT"
    };
  }
  return {
    arm: attempt.arm,
    classification: "infrastructure_failure",
    efficacy_eligible: false,
    reason_code: attempt.infrastructure_failure_code ?? "BENCH_HARNESS_DEFECT"
  };
};

export const assessMatchedBlock = (
  store: MatchedBlockBenchmarkStore,
  blockId: string
): BenchmarkBlockAssessment => {
  const block = store.getBlockManifest(blockId) ?? fail(
    "BENCHMARK_BLOCK_INCOMPLETE",
    `Matched block ${blockId} does not exist.`
  );
  const attempts = requireTerminalAttempts(store, blockId);
  const assessments = attempts.map(assessBenchmarkFormalAttempt);
  let disposition: BenchmarkBlockAssessment["disposition"] = "complete";
  let reasonCode = "BENCH_COMPLETE_MATCHED_BLOCK";
  const contamination = assessments.filter(
    (assessment) => assessment.reason_code === "BENCH_ARM_CONTAMINATION_DETECTED"
  );
  const protocolDefects = assessments.filter(
    (assessment) => assessment.classification === "exclusion" &&
      assessment.reason_code !== "BENCH_ARM_CONTAMINATION_DETECTED"
  );
  const aborts = assessments.filter((assessment) => assessment.classification === "abort");
  const infrastructure = assessments.filter(
    (assessment) => assessment.classification === "infrastructure_failure"
  );
  if (contamination.length > 0) {
    disposition = "invalid_contamination";
    reasonCode = "BENCH_ARM_CONTAMINATION_DETECTED";
  } else if (protocolDefects.length > 0) {
    disposition = "invalid_protocol_defect";
    reasonCode = protocolDefects[0]!.reason_code;
  } else if (aborts.length > 0) {
    disposition = "aborted_operator";
    reasonCode = aborts[0]!.reason_code;
  } else if (infrastructure.length > 0) {
    disposition = "incomplete_infrastructure";
    reasonCode = infrastructure[0]!.reason_code;
  }
  const affectedArms = assessments
    .filter((assessment) => !assessment.efficacy_eligible)
    .map((assessment) => assessment.arm);
  return {
    block_id: block.block_id,
    disposition,
    reason_code: reasonCode,
    affected_arms: affectedArms,
    attempts: assessments,
    efficacy_eligible: disposition === "complete",
    evidence_digest: sha256Text(canonicalJson({
      manifest_digest: block.manifest_digest,
      attempts,
      assessments,
      disposition,
      reason_code: reasonCode
    }))
  };
};

export const appendMatchedBlockDisposition = (
  store: MatchedBlockBenchmarkStore,
  blockId: string,
  detectedAt: string,
  detectedBy: string
): BenchmarkBlockDispositionRecord => {
  const block = store.getBlockManifest(blockId) ?? fail(
    "BENCHMARK_BLOCK_INCOMPLETE",
    `Matched block ${blockId} does not exist.`
  );
  const assessment = assessMatchedBlock(store, blockId);
  const record: BenchmarkBlockDispositionRecord = {
    block_disposition_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.disposition,
    benchmark_campaign_id: block.benchmark_campaign_id,
    block_id: block.block_id,
    manifest_digest: block.manifest_digest,
    disposition: assessment.disposition,
    reason_code: assessment.reason_code,
    affected_arms: assessment.affected_arms,
    detected_at: detectedAt,
    detected_by: detectedBy,
    evidence_digest: assessment.evidence_digest,
    replacement_block_id: null
  };
  store.appendBlockDisposition(record);
  return record;
};

const buildReplacementManifest = (
  original: MatchedBlockManifest,
  replacementBlockId: string,
  randomizationSeed: string,
  createdAt: string
): MatchedBlockManifest => {
  const value: MatchedBlockManifest = {
    ...original,
    block_id: replacementBlockId,
    replacement_for_block_id: original.block_id,
    replacement_generation: original.replacement_generation + 1,
    randomization_seed: randomizationSeed,
    planned_arm_order: deriveMatchedBlockArmOrder(randomizationSeed),
    created_at: createdAt,
    sealed_at: createdAt,
    manifest_digest: ""
  };
  return {
    ...value,
    manifest_digest: computeBenchmarkRecordDigest(value, "manifest_digest")
  };
};

const buildReplacementArmPlans = (
  replacement: MatchedBlockManifest
): MatchedBlockArmPlan[] => replacement.planned_arm_order.map((arm, index) => ({
  arm_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.armPlan,
  benchmark_campaign_id: replacement.benchmark_campaign_id,
  block_id: replacement.block_id,
  manifest_digest: replacement.manifest_digest,
  arm,
  planned_ordinal: index + 1,
  workspace_isolation_id: `${replacement.block_id}-${arm}-workspace`,
  ee_home_isolation_id: `${replacement.block_id}-${arm}-ee-home`,
  host_session_isolation_id: `${replacement.block_id}-${arm}-session`,
  arm_control_digest: computeMatchedBlockArmControlDigest(arm)
}));

export const createWholeBlockReplacement = (
  options: CreateReplacementBlockOptions
): {
  manifest: MatchedBlockManifest;
  armPlans: MatchedBlockArmPlan[];
  disposition: BenchmarkBlockDispositionRecord;
  lineage: BenchmarkReplacementLineageRecord;
} => {
  const original = options.store.getBlockManifest(options.originalBlockId) ?? fail(
    "BENCHMARK_REPLACEMENT_IDENTITY_INVALID",
    `Original block ${options.originalBlockId} does not exist.`
  );
  const assessment = assessMatchedBlock(options.store, original.block_id);
  if (assessment.disposition === "complete") {
    fail(
      "BENCHMARK_REPLACEMENT_NOT_ALLOWED",
      "A complete matched block cannot be rerun solely because its outcome is unfavorable or noisy."
    );
  }
  if (
    options.replacementBlockId === original.block_id ||
    options.randomizationSeed === original.randomization_seed ||
    options.replacementBlockId.trim().length === 0 ||
    options.randomizationSeed.trim().length === 0
  ) {
    fail(
      "BENCHMARK_REPLACEMENT_IDENTITY_INVALID",
      "Replacement requires a new block id and new non-empty randomization seed."
    );
  }
  if (options.store.getBlockDisposition(original.block_id)) {
    fail(
      "BENCHMARK_REPLACEMENT_NOT_ALLOWED",
      "Original block already has an immutable terminal disposition."
    );
  }
  const manifest = buildReplacementManifest(
    original,
    options.replacementBlockId,
    options.randomizationSeed,
    options.createdAt
  );
  const armPlans = buildReplacementArmPlans(manifest);
  const dispositionEvidence = sha256Text(canonicalJson({
    original_manifest_digest: original.manifest_digest,
    assessment,
    replacement_manifest_digest: manifest.manifest_digest,
    reason_code: options.reasonCode
  }));
  const disposition: BenchmarkBlockDispositionRecord = {
    block_disposition_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.disposition,
    benchmark_campaign_id: original.benchmark_campaign_id,
    block_id: original.block_id,
    manifest_digest: original.manifest_digest,
    disposition: "superseded_by_replacement",
    reason_code: options.reasonCode,
    affected_arms: assessment.affected_arms.length > 0
      ? assessment.affected_arms
      : [...MATCHED_BLOCK_ARMS],
    detected_at: options.createdAt,
    detected_by: options.approvedBy,
    evidence_digest: dispositionEvidence,
    replacement_block_id: manifest.block_id
  };
  const lineage: BenchmarkReplacementLineageRecord = {
    replacement_record_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.replacement,
    benchmark_campaign_id: original.benchmark_campaign_id,
    original_block_id: original.block_id,
    original_manifest_digest: original.manifest_digest,
    replacement_block_id: manifest.block_id,
    replacement_manifest_digest: manifest.manifest_digest,
    replacement_generation: manifest.replacement_generation,
    reason_code: options.reasonCode,
    approved_at: options.createdAt,
    approved_by: options.approvedBy,
    evidence_digest: sha256Text(canonicalJson({
      original_block_id: original.block_id,
      replacement_block_id: manifest.block_id,
      replacement_generation: manifest.replacement_generation,
      reason_code: options.reasonCode,
      disposition_evidence_digest: dispositionEvidence
    }))
  };
  options.store.insertReplacementBlock(manifest, armPlans, disposition, lineage);
  return { manifest, armPlans, disposition, lineage };
};
