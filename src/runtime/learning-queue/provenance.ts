import type { DatabaseSync } from "node:sqlite";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import {
  MAX_EXACT_NODE_PROVENANCE_KEYS,
  SEMANTIC_ORIGIN_ASSURANCE_ORDER,
  SEMANTIC_ORIGIN_COMPACTION_SCHEMA_VERSION,
  SEMANTIC_ORIGIN_PROVENANCE_SCHEMA_VERSION
} from "./constants.js";
import { LearningQueueError } from "./errors.js";
import type {
  SemanticOriginReference,
  SemanticOriginStageRoute,
  SemanticOriginSummary
} from "./types.js";

type SemanticOriginReferenceInput = Omit<
  SemanticOriginReference,
  | "provenance_schema_version"
  | "provenance_key"
  | "assurance_floor"
  | "origin_record_count"
  | "first_origin_at"
  | "last_origin_at"
> & {
  createdAt: string;
};

type ExactOriginRow = {
  node_id: string;
  provenance_key: string;
  provenance_schema_version: string;
  configuration_generation_id: string;
  package_generation_id: string;
  generation_profile_id: string;
  generation_profile_version: string;
  generation_profile_status: SemanticOriginReference["generation_profile_status"];
  quality_profile: SemanticOriginReference["quality_profile"];
  stage_routes_json: string;
  assurance_floor: SemanticOriginReference["assurance_floor"];
  origin_record_count: number;
  first_origin_at: string;
  last_origin_at: string;
};

type CompactedOriginRow = {
  node_id: string;
  bucket_key: string;
  compaction_schema_version: string;
  generation_profile_id: string;
  generation_profile_version: string;
  assurance_floor: SemanticOriginReference["assurance_floor"];
  contract_versions_json: string;
  origin_record_count: number;
  first_origin_at: string;
  last_origin_at: string;
  worst_assurance: SemanticOriginReference["assurance_floor"];
  rolling_digest: string;
  contains_unbenchmarked_origin: number;
  contains_revoked_profile_origin: number;
};

const assertCanonicalIsoTimestamp = (value: string, field: string): void => {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      `${field} must be a canonical ISO timestamp.`
    );
  }
};

const assertNonEmpty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      `${field} must not be empty.`
    );
  }
};

const minimumAssurance = (
  values: SemanticOriginReference["assurance_floor"][]
): SemanticOriginReference["assurance_floor"] => values.reduce(
  (worst, current) =>
    SEMANTIC_ORIGIN_ASSURANCE_ORDER[current] <
      SEMANTIC_ORIGIN_ASSURANCE_ORDER[worst]
      ? current
      : worst,
  "recommended"
);

const normalizedProvenanceIdentity = (input: SemanticOriginReferenceInput) => ({
  configuration_generation_id: input.configuration_generation_id,
  package_generation_id: input.package_generation_id,
  generation_profile_id: input.generation_profile_id,
  generation_profile_version: input.generation_profile_version,
  generation_profile_status: input.generation_profile_status,
  quality_profile: input.quality_profile,
  stage_routes: input.stage_routes
});

const provenanceIdentityFromReference = (
  reference: SemanticOriginReference
) => ({
  configuration_generation_id: reference.configuration_generation_id,
  package_generation_id: reference.package_generation_id,
  generation_profile_id: reference.generation_profile_id,
  generation_profile_version: reference.generation_profile_version,
  generation_profile_status: reference.generation_profile_status,
  quality_profile: reference.quality_profile,
  stage_routes: reference.stage_routes
});

const validateStageRoute = (
  route: SemanticOriginStageRoute,
  field: string
): void => {
  assertNonEmpty(route.route_fingerprint, `${field}.route_fingerprint`);
  assertNonEmpty(route.validation_record_id, `${field}.validation_record_id`);
  assertNonEmpty(route.contract_version, `${field}.contract_version`);
};

export const createSemanticOriginReference = (
  input: SemanticOriginReferenceInput
): SemanticOriginReference => {
  assertCanonicalIsoTimestamp(input.createdAt, "createdAt");
  for (const [field, value] of Object.entries({
    configuration_generation_id: input.configuration_generation_id,
    package_generation_id: input.package_generation_id,
    generation_profile_id: input.generation_profile_id,
    generation_profile_version: input.generation_profile_version
  })) {
    assertNonEmpty(value, field);
  }
  validateStageRoute(input.stage_routes.learning_gate, "stage_routes.learning_gate");
  validateStageRoute(input.stage_routes.distillation, "stage_routes.distillation");
  validateStageRoute(input.stage_routes.merge_decision, "stage_routes.merge_decision");
  const assuranceFloor = minimumAssurance([
    input.stage_routes.learning_gate.benchmark_assurance,
    input.stage_routes.distillation.benchmark_assurance,
    input.stage_routes.merge_decision.benchmark_assurance
  ]);
  if (
    input.quality_profile === "custom" &&
    assuranceFloor !== "unbenchmarked"
  ) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Custom semantic origins must remain unbenchmarked."
    );
  }
  return {
    provenance_schema_version: SEMANTIC_ORIGIN_PROVENANCE_SCHEMA_VERSION,
    provenance_key: sha256Text(canonicalJson(normalizedProvenanceIdentity(input))),
    configuration_generation_id: input.configuration_generation_id,
    package_generation_id: input.package_generation_id,
    generation_profile_id: input.generation_profile_id,
    generation_profile_version: input.generation_profile_version,
    generation_profile_status: input.generation_profile_status,
    quality_profile: input.quality_profile,
    stage_routes: input.stage_routes,
    assurance_floor: assuranceFloor,
    origin_record_count: 1,
    first_origin_at: input.createdAt,
    last_origin_at: input.createdAt
  };
};

export const assertSemanticOriginReference = (
  reference: SemanticOriginReference
): void => {
  if (
    reference.provenance_schema_version !==
      SEMANTIC_ORIGIN_PROVENANCE_SCHEMA_VERSION
  ) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Semantic-origin provenance schema version is invalid."
    );
  }
  for (const [field, value] of Object.entries({
    provenance_key: reference.provenance_key,
    configuration_generation_id: reference.configuration_generation_id,
    package_generation_id: reference.package_generation_id,
    generation_profile_id: reference.generation_profile_id,
    generation_profile_version: reference.generation_profile_version
  })) {
    assertNonEmpty(value, field);
  }
  if (!/^[a-f0-9]{64}$/u.test(reference.provenance_key)) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Semantic-origin provenance key must be a SHA-256 digest."
    );
  }
  validateStageRoute(reference.stage_routes.learning_gate, "stage_routes.learning_gate");
  validateStageRoute(reference.stage_routes.distillation, "stage_routes.distillation");
  validateStageRoute(reference.stage_routes.merge_decision, "stage_routes.merge_decision");
  assertCanonicalIsoTimestamp(reference.first_origin_at, "first_origin_at");
  assertCanonicalIsoTimestamp(reference.last_origin_at, "last_origin_at");
  if (reference.first_origin_at > reference.last_origin_at) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Semantic-origin first timestamp cannot be later than its last timestamp."
    );
  }
  if (!Number.isSafeInteger(reference.origin_record_count) || reference.origin_record_count < 1) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Semantic-origin record count must be a positive safe integer."
    );
  }
  const expectedAssuranceFloor = minimumAssurance([
    reference.stage_routes.learning_gate.benchmark_assurance,
    reference.stage_routes.distillation.benchmark_assurance,
    reference.stage_routes.merge_decision.benchmark_assurance
  ]);
  if (reference.assurance_floor !== expectedAssuranceFloor) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Semantic-origin assurance floor does not match its stage assurances."
    );
  }
  if (
    reference.quality_profile === "custom" &&
    reference.assurance_floor !== "unbenchmarked"
  ) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Custom semantic origins must remain unbenchmarked."
    );
  }
  const expectedKey = sha256Text(canonicalJson(provenanceIdentityFromReference(reference)));
  if (reference.provenance_key !== expectedKey) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Semantic-origin provenance key does not match its immutable identity."
    );
  }
};

const assertInTransaction = (db: DatabaseSync): void => {
  if (!db.isTransaction) {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Semantic-origin writes must occur inside the governing transaction."
    );
  }
};

const parseStageRoutes = (
  value: string
): SemanticOriginReference["stage_routes"] => {
  try {
    return JSON.parse(value) as SemanticOriginReference["stage_routes"];
  } catch {
    throw new LearningQueueError(
      "EE_SEMANTIC_ORIGIN_INVALID",
      "Stored semantic-origin stage routes are malformed."
    );
  }
};

const referenceFromExactRow = (row: ExactOriginRow): SemanticOriginReference => ({
  provenance_schema_version: row.provenance_schema_version as
    SemanticOriginReference["provenance_schema_version"],
  provenance_key: row.provenance_key,
  configuration_generation_id: row.configuration_generation_id,
  package_generation_id: row.package_generation_id,
  generation_profile_id: row.generation_profile_id,
  generation_profile_version: row.generation_profile_version,
  generation_profile_status: row.generation_profile_status,
  quality_profile: row.quality_profile,
  stage_routes: parseStageRoutes(row.stage_routes_json),
  assurance_floor: row.assurance_floor,
  origin_record_count: row.origin_record_count,
  first_origin_at: row.first_origin_at,
  last_origin_at: row.last_origin_at
});

const contractVersionTuple = (
  reference: SemanticOriginReference
): string[] => [
  reference.stage_routes.learning_gate.contract_version,
  reference.stage_routes.distillation.contract_version,
  reference.stage_routes.merge_decision.contract_version
];

const compactionBucketIdentity = (reference: SemanticOriginReference) => ({
  generation_profile_id: reference.generation_profile_id,
  generation_profile_version: reference.generation_profile_version,
  assurance_floor: reference.assurance_floor,
  contract_versions: contractVersionTuple(reference)
});

export class SemanticOriginProvenanceRepository {
  constructor(private readonly db: DatabaseSync) {}

  attachCandidateOriginInTransaction(options: {
    candidateId: string;
    reference: SemanticOriginReference;
  }): void {
    assertInTransaction(this.db);
    assertSemanticOriginReference(options.reference);
    const existing = this.db.prepare(
      `SELECT provenance_key
       FROM candidate_semantic_origin_provenance
       WHERE candidate_id = ?`
    ).get(options.candidateId) as { provenance_key: string } | undefined;
    if (existing && existing.provenance_key !== options.reference.provenance_key) {
      throw new LearningQueueError(
        "EE_SEMANTIC_ORIGIN_INVALID",
        "Candidate semantic-origin provenance is immutable and cannot be replaced."
      );
    }
    if (!existing) {
      this.db.prepare(
        `INSERT INTO candidate_semantic_origin_provenance (
          candidate_id,
          provenance_key,
          provenance_schema_version,
          configuration_generation_id,
          package_generation_id,
          generation_profile_id,
          generation_profile_version,
          generation_profile_status,
          quality_profile,
          stage_routes_json,
          assurance_floor,
          origin_record_count,
          first_origin_at,
          last_origin_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        options.candidateId,
        options.reference.provenance_key,
        options.reference.provenance_schema_version,
        options.reference.configuration_generation_id,
        options.reference.package_generation_id,
        options.reference.generation_profile_id,
        options.reference.generation_profile_version,
        options.reference.generation_profile_status,
        options.reference.quality_profile,
        canonicalJson(options.reference.stage_routes),
        options.reference.assurance_floor,
        options.reference.origin_record_count,
        options.reference.first_origin_at,
        options.reference.last_origin_at
      );
    }
    const result = this.db.prepare(
      `UPDATE experience_candidates
       SET semantic_origin_provenance_key = ?
       WHERE id = ?`
    ).run(options.reference.provenance_key, options.candidateId);
    if (Number(result.changes) !== 1) {
      throw new LearningQueueError(
        "EE_CANDIDATE_MISSING",
        `Candidate ${options.candidateId} does not exist.`
      );
    }
  }

  private compactOneExactOriginInTransaction(nodeId: string): void {
    const selected = this.db.prepare(
      `SELECT *
       FROM node_semantic_origin_provenance
       WHERE node_id = ?
       ORDER BY origin_record_count ASC, last_origin_at ASC, provenance_key ASC
       LIMIT 1`
    ).get(nodeId) as ExactOriginRow | undefined;
    if (!selected) {
      return;
    }
    const reference = referenceFromExactRow(selected);
    const identity = compactionBucketIdentity(reference);
    const bucketKey = sha256Text(canonicalJson(identity));
    const existing = this.db.prepare(
      `SELECT * FROM node_semantic_origin_buckets
       WHERE node_id = ? AND bucket_key = ?`
    ).get(nodeId, bucketKey) as CompactedOriginRow | undefined;
    const rollingDigest = sha256Text(canonicalJson([
      existing?.rolling_digest ?? null,
      selected.provenance_key
    ]));
    const worstAssurance = existing
      ? minimumAssurance([existing.worst_assurance, reference.assurance_floor])
      : reference.assurance_floor;
    this.db.prepare(
      `INSERT INTO node_semantic_origin_buckets (
        node_id,
        bucket_key,
        compaction_schema_version,
        generation_profile_id,
        generation_profile_version,
        assurance_floor,
        contract_versions_json,
        origin_record_count,
        first_origin_at,
        last_origin_at,
        worst_assurance,
        rolling_digest,
        contains_unbenchmarked_origin,
        contains_revoked_profile_origin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_id, bucket_key) DO UPDATE SET
        origin_record_count = node_semantic_origin_buckets.origin_record_count + excluded.origin_record_count,
        first_origin_at = MIN(node_semantic_origin_buckets.first_origin_at, excluded.first_origin_at),
        last_origin_at = MAX(node_semantic_origin_buckets.last_origin_at, excluded.last_origin_at),
        worst_assurance = excluded.worst_assurance,
        rolling_digest = excluded.rolling_digest,
        contains_unbenchmarked_origin = MAX(
          node_semantic_origin_buckets.contains_unbenchmarked_origin,
          excluded.contains_unbenchmarked_origin
        ),
        contains_revoked_profile_origin = MAX(
          node_semantic_origin_buckets.contains_revoked_profile_origin,
          excluded.contains_revoked_profile_origin
        )`
    ).run(
      nodeId,
      bucketKey,
      SEMANTIC_ORIGIN_COMPACTION_SCHEMA_VERSION,
      reference.generation_profile_id,
      reference.generation_profile_version,
      reference.assurance_floor,
      canonicalJson(contractVersionTuple(reference)),
      reference.origin_record_count,
      reference.first_origin_at,
      reference.last_origin_at,
      worstAssurance,
      rollingDigest,
      reference.assurance_floor === "unbenchmarked" ? 1 : 0,
      reference.generation_profile_status === "revoked" ? 1 : 0
    );
    this.db.prepare(
      `DELETE FROM node_semantic_origin_provenance
       WHERE node_id = ? AND provenance_key = ?`
    ).run(nodeId, reference.provenance_key);
  }

  aggregateNodeOriginInTransaction(options: {
    nodeId: string;
    reference: SemanticOriginReference;
  }): SemanticOriginSummary {
    assertInTransaction(this.db);
    assertSemanticOriginReference(options.reference);
    const node = this.db.prepare(
      "SELECT id FROM experience_nodes WHERE id = ?"
    ).get(options.nodeId) as { id: string } | undefined;
    if (!node) {
      throw new LearningQueueError(
        "EE_SEMANTIC_COMPLETION_INVALID",
        `Node ${options.nodeId} must exist before provenance aggregation.`
      );
    }
    const existing = this.db.prepare(
      `SELECT provenance_key
       FROM node_semantic_origin_provenance
       WHERE node_id = ? AND provenance_key = ?`
    ).get(options.nodeId, options.reference.provenance_key) as
      { provenance_key: string } | undefined;
    if (existing) {
      this.db.prepare(
        `UPDATE node_semantic_origin_provenance
         SET origin_record_count = origin_record_count + ?,
             last_origin_at = MAX(last_origin_at, ?)
         WHERE node_id = ? AND provenance_key = ?`
      ).run(
        options.reference.origin_record_count,
        options.reference.last_origin_at,
        options.nodeId,
        options.reference.provenance_key
      );
    } else {
      const count = this.db.prepare(
        `SELECT COUNT(*) AS count
         FROM node_semantic_origin_provenance
         WHERE node_id = ?`
      ).get(options.nodeId) as { count: number };
      if (Number(count.count) >= MAX_EXACT_NODE_PROVENANCE_KEYS) {
        this.compactOneExactOriginInTransaction(options.nodeId);
      }
      this.db.prepare(
        `INSERT INTO node_semantic_origin_provenance (
          node_id,
          provenance_key,
          provenance_schema_version,
          configuration_generation_id,
          package_generation_id,
          generation_profile_id,
          generation_profile_version,
          generation_profile_status,
          quality_profile,
          stage_routes_json,
          assurance_floor,
          origin_record_count,
          first_origin_at,
          last_origin_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        options.nodeId,
        options.reference.provenance_key,
        options.reference.provenance_schema_version,
        options.reference.configuration_generation_id,
        options.reference.package_generation_id,
        options.reference.generation_profile_id,
        options.reference.generation_profile_version,
        options.reference.generation_profile_status,
        options.reference.quality_profile,
        canonicalJson(options.reference.stage_routes),
        options.reference.assurance_floor,
        options.reference.origin_record_count,
        options.reference.first_origin_at,
        options.reference.last_origin_at
      );
    }
    return this.refreshNodeSummaryInTransaction(options.nodeId);
  }

  refreshNodeSummaryInTransaction(nodeId: string): SemanticOriginSummary {
    assertInTransaction(this.db);
    const exact = this.db.prepare(
      `SELECT assurance_floor, generation_profile_status, origin_record_count
       FROM node_semantic_origin_provenance
       WHERE node_id = ?`
    ).all(nodeId) as Array<{
      assurance_floor: SemanticOriginReference["assurance_floor"];
      generation_profile_status: SemanticOriginReference["generation_profile_status"];
      origin_record_count: number;
    }>;
    const buckets = this.db.prepare(
      `SELECT worst_assurance, origin_record_count,
              contains_unbenchmarked_origin,
              contains_revoked_profile_origin
       FROM node_semantic_origin_buckets
       WHERE node_id = ?`
    ).all(nodeId) as Array<{
      worst_assurance: SemanticOriginReference["assurance_floor"];
      origin_record_count: number;
      contains_unbenchmarked_origin: number;
      contains_revoked_profile_origin: number;
    }>;
    const assurances = [
      ...exact.map((row) => row.assurance_floor),
      ...buckets.map((row) => row.worst_assurance)
    ];
    const summary: SemanticOriginSummary = {
      contains_unbenchmarked_origin:
        exact.some((row) => row.assurance_floor === "unbenchmarked") ||
        buckets.some((row) => Boolean(row.contains_unbenchmarked_origin)),
      contains_revoked_profile_origin:
        exact.some((row) => row.generation_profile_status === "revoked") ||
        buckets.some((row) => Boolean(row.contains_revoked_profile_origin)),
      semantic_origin_count: [
        ...exact.map((row) => row.origin_record_count),
        ...buckets.map((row) => row.origin_record_count)
      ].reduce((sum, value) => sum + Number(value), 0),
      exact_provenance_key_count: exact.length,
      compacted_provenance_origin_count: buckets.reduce(
        (sum, row) => sum + Number(row.origin_record_count),
        0
      ),
      effective_generation_assurance_floor:
        assurances.length > 0 ? minimumAssurance(assurances) : null
    };
    const result = this.db.prepare(
      `UPDATE experience_nodes
       SET contains_unbenchmarked_origin = ?,
           contains_revoked_profile_origin = ?,
           semantic_origin_count = ?,
           exact_provenance_key_count = ?,
           compacted_provenance_origin_count = ?,
           effective_generation_assurance_floor = ?,
           delivery_state = CASE
             WHEN ? = 1 THEN 'quarantined'
             WHEN ? = 1 THEN 'shadow_only'
             ELSE delivery_state
           END
       WHERE id = ?`
    ).run(
      summary.contains_unbenchmarked_origin ? 1 : 0,
      summary.contains_revoked_profile_origin ? 1 : 0,
      summary.semantic_origin_count,
      summary.exact_provenance_key_count,
      summary.compacted_provenance_origin_count,
      summary.effective_generation_assurance_floor,
      summary.contains_revoked_profile_origin ? 1 : 0,
      summary.contains_unbenchmarked_origin ? 1 : 0,
      nodeId
    );
    if (Number(result.changes) !== 1) {
      throw new LearningQueueError(
        "EE_SEMANTIC_COMPLETION_INVALID",
        `Node ${nodeId} disappeared during provenance aggregation.`
      );
    }
    return summary;
  }

  listExactNodeOrigins(nodeId: string): SemanticOriginReference[] {
    return (this.db.prepare(
      `SELECT * FROM node_semantic_origin_provenance
       WHERE node_id = ?
       ORDER BY last_origin_at DESC, provenance_key ASC`
    ).all(nodeId) as ExactOriginRow[]).map(referenceFromExactRow);
  }

  readCandidateOrigin(candidateId: string): SemanticOriginReference | undefined {
    const row = this.db.prepare(
      `SELECT
        candidate_id AS node_id,
        provenance_key,
        provenance_schema_version,
        configuration_generation_id,
        package_generation_id,
        generation_profile_id,
        generation_profile_version,
        generation_profile_status,
        quality_profile,
        stage_routes_json,
        assurance_floor,
        origin_record_count,
        first_origin_at,
        last_origin_at
       FROM candidate_semantic_origin_provenance
       WHERE candidate_id = ?`
    ).get(candidateId) as ExactOriginRow | undefined;
    if (!row) {
      return undefined;
    }
    const reference = referenceFromExactRow(row);
    assertSemanticOriginReference(reference);
    return reference;
  }

  readNodeSummary(nodeId: string): SemanticOriginSummary | undefined {
    const row = this.db.prepare(
      `SELECT contains_unbenchmarked_origin,
              contains_revoked_profile_origin,
              semantic_origin_count,
              exact_provenance_key_count,
              compacted_provenance_origin_count,
              effective_generation_assurance_floor
       FROM experience_nodes WHERE id = ?`
    ).get(nodeId) as {
      contains_unbenchmarked_origin: number;
      contains_revoked_profile_origin: number;
      semantic_origin_count: number;
      exact_provenance_key_count: number;
      compacted_provenance_origin_count: number;
      effective_generation_assurance_floor:
        SemanticOriginReference["assurance_floor"] | null;
    } | undefined;
    return row ? {
      contains_unbenchmarked_origin: Boolean(row.contains_unbenchmarked_origin),
      contains_revoked_profile_origin: Boolean(row.contains_revoked_profile_origin),
      semantic_origin_count: row.semantic_origin_count,
      exact_provenance_key_count: row.exact_provenance_key_count,
      compacted_provenance_origin_count: row.compacted_provenance_origin_count,
      effective_generation_assurance_floor:
        row.effective_generation_assurance_floor
    } : undefined;
  }
}

