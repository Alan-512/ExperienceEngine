import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";
import {
  createSemanticOriginReference,
  SemanticOriginProvenanceRepository
} from "../../src/runtime/learning-queue/provenance.js";
import {
  MAX_EXACT_NODE_PROVENANCE_KEYS
} from "../../src/runtime/learning-queue/constants.js";
import {
  bootstrapDatabase
} from "../../src/store/sqlite/db.js";
import {
  NodeRepository
} from "../../src/store/sqlite/repositories/node-repo.js";
import {
  createQueueNode
} from "../fixtures/fenced-learning-queue-fixture.js";

const evaluatedOrigin = (index: number, options: {
  assurance?: "supported" | "recommended";
  status?: "active" | "deprecated" | "revoked";
} = {}) => {
  const createdAt = new Date(
    Date.parse("2026-07-12T17:00:00.000Z") + index * 1000
  ).toISOString();
  const assurance = options.assurance ?? "recommended";
  return createSemanticOriginReference({
    configuration_generation_id: `configuration-${index}`,
    package_generation_id: "package-evaluated",
    generation_profile_id: "evaluated-profile-v1",
    generation_profile_version: "1.0.0",
    generation_profile_status: options.status ?? "active",
    quality_profile: "evaluated_recommended",
    stage_routes: {
      learning_gate: {
        route_fingerprint: `learning-gate-${index}`,
        validation_record_id: `validation-learning-gate-${index}`,
        benchmark_assurance: assurance,
        contract_version: "learning-gate-contract-v1"
      },
      distillation: {
        route_fingerprint: `distillation-${index}`,
        validation_record_id: `validation-distillation-${index}`,
        benchmark_assurance: assurance,
        contract_version: "distillation-contract-v1"
      },
      merge_decision: {
        route_kind: "deterministic",
        route_fingerprint: `merge-${index}`,
        validation_record_id: `validation-merge-${index}`,
        benchmark_assurance: assurance,
        contract_version: "merge-contract-v1"
      }
    },
    createdAt
  });
};

const customOrigin = () => createSemanticOriginReference({
  configuration_generation_id: "configuration-custom",
  package_generation_id: "package-custom",
  generation_profile_id: "custom-contract-v1",
  generation_profile_version: "1.0.0",
  generation_profile_status: "active",
  quality_profile: "custom",
  stage_routes: {
    learning_gate: {
      route_fingerprint: "learning-gate-custom",
      validation_record_id: "validation-learning-gate-custom",
      benchmark_assurance: "unbenchmarked",
      contract_version: "learning-gate-contract-v1"
    },
    distillation: {
      route_fingerprint: "distillation-custom",
      validation_record_id: "validation-distillation-custom",
      benchmark_assurance: "unbenchmarked",
      contract_version: "distillation-contract-v1"
    },
    merge_decision: {
      route_kind: "model",
      route_fingerprint: "merge-custom",
      validation_record_id: "validation-merge-custom",
      benchmark_assurance: "unbenchmarked",
      contract_version: "merge-contract-v1"
    }
  },
  createdAt: "2026-07-12T16:59:00.000Z"
});

describe("semantic origin provenance", () => {
  it("deduplicates exact keys, compacts beyond 64, and never erases unbenchmarked or revoked facts", () => {
    const db = new DatabaseSync(":memory:");
    bootstrapDatabase(db);
    const nodeRepository = new NodeRepository(db);
    const provenanceRepository = new SemanticOriginProvenanceRepository(db);
    nodeRepository.upsert(createQueueNode({
      id: "node-provenance-bound",
      state: "active",
      delivery_state: "eligible"
    }));
    try {
      runRuntimeImmediateTransaction(db, {
        category: "protected_result_commit",
        operation: () => {
          provenanceRepository.aggregateNodeOriginInTransaction({
            nodeId: "node-provenance-bound",
            reference: customOrigin()
          });
          for (let index = 0; index < MAX_EXACT_NODE_PROVENANCE_KEYS; index += 1) {
            provenanceRepository.aggregateNodeOriginInTransaction({
              nodeId: "node-provenance-bound",
              reference: evaluatedOrigin(index, {
                status: index === MAX_EXACT_NODE_PROVENANCE_KEYS - 1
                  ? "revoked"
                  : "active"
              })
            });
          }
        }
      });

      const summary = provenanceRepository.readNodeSummary("node-provenance-bound");
      expect(summary).toEqual({
        contains_unbenchmarked_origin: true,
        contains_revoked_profile_origin: true,
        semantic_origin_count: MAX_EXACT_NODE_PROVENANCE_KEYS + 1,
        exact_provenance_key_count: MAX_EXACT_NODE_PROVENANCE_KEYS,
        compacted_provenance_origin_count: 1,
        effective_generation_assurance_floor: "unbenchmarked"
      });
      expect(provenanceRepository.listExactNodeOrigins("node-provenance-bound")).toHaveLength(
        MAX_EXACT_NODE_PROVENANCE_KEYS
      );
      expect(nodeRepository.getById("node-provenance-bound")).toMatchObject({
        contains_unbenchmarked_origin: true,
        contains_revoked_profile_origin: true,
        delivery_state: "quarantined"
      });
      expect(nodeRepository.listLiveInjectableByExactScope("scope-fenced-queue")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("keeps evaluated-only provenance on the requested governance path", () => {
    const db = new DatabaseSync(":memory:");
    bootstrapDatabase(db);
    const nodeRepository = new NodeRepository(db);
    const provenanceRepository = new SemanticOriginProvenanceRepository(db);
    nodeRepository.upsert(createQueueNode({
      id: "node-evaluated-only",
      state: "active",
      delivery_state: "eligible"
    }));
    try {
      runRuntimeImmediateTransaction(db, {
        category: "protected_result_commit",
        operation: () => {
          provenanceRepository.aggregateNodeOriginInTransaction({
            nodeId: "node-evaluated-only",
            reference: evaluatedOrigin(1, { assurance: "supported" })
          });
        }
      });
      expect(nodeRepository.getById("node-evaluated-only")).toMatchObject({
        contains_unbenchmarked_origin: false,
        contains_revoked_profile_origin: false,
        effective_generation_assurance_floor: "supported",
        delivery_state: "eligible"
      });
      expect(nodeRepository.listLiveInjectableByExactScope("scope-fenced-queue")).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("rejects caller-forged provenance keys and assurance floors before persistence", () => {
    const db = new DatabaseSync(":memory:");
    bootstrapDatabase(db);
    const nodeRepository = new NodeRepository(db);
    const provenanceRepository = new SemanticOriginProvenanceRepository(db);
    nodeRepository.upsert(createQueueNode({ id: "node-forged-origin" }));
    const valid = evaluatedOrigin(2);
    try {
      expect(() => runRuntimeImmediateTransaction(db, {
        category: "protected_result_commit",
        operation: () => provenanceRepository.aggregateNodeOriginInTransaction({
          nodeId: "node-forged-origin",
          reference: {
            ...valid,
            provenance_key: "0".repeat(64)
          }
        })
      })).toThrowError(/does not match its immutable identity/iu);
      expect(() => runRuntimeImmediateTransaction(db, {
        category: "protected_result_commit",
        operation: () => provenanceRepository.aggregateNodeOriginInTransaction({
          nodeId: "node-forged-origin",
          reference: {
            ...valid,
            assurance_floor: "unbenchmarked"
          }
        })
      })).toThrowError(/assurance floor/iu);
      expect(provenanceRepository.readNodeSummary("node-forged-origin")).toEqual({
        contains_unbenchmarked_origin: false,
        contains_revoked_profile_origin: false,
        semantic_origin_count: 0,
        exact_provenance_key_count: 0,
        compacted_provenance_origin_count: 0,
        effective_generation_assurance_floor: null
      });
    } finally {
      db.close();
    }
  });

  it("prevents manual lifecycle promotion from lifting the custom shadow cap", () => {
    const db = new DatabaseSync(":memory:");
    bootstrapDatabase(db);
    const nodeRepository = new NodeRepository(db);
    const provenanceRepository = new SemanticOriginProvenanceRepository(db);
    nodeRepository.upsert(createQueueNode({
      id: "node-custom-manual-promotion",
      state: "candidate",
      delivery_state: "shadow_only"
    }));
    try {
      runRuntimeImmediateTransaction(db, {
        category: "protected_result_commit",
        operation: () => provenanceRepository.aggregateNodeOriginInTransaction({
          nodeId: "node-custom-manual-promotion",
          reference: customOrigin()
        })
      });
      const promoted = nodeRepository.updateState(
        "node-custom-manual-promotion",
        "active"
      );
      expect(promoted).toMatchObject({
        state: "active",
        contains_unbenchmarked_origin: true,
        delivery_state: "shadow_only"
      });
      expect(nodeRepository.listLiveInjectableByExactScope("scope-fenced-queue")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("normalizes caller-supplied unbenchmarked summaries to the worst assurance and shadow delivery", () => {
    const db = new DatabaseSync(":memory:");
    bootstrapDatabase(db);
    const nodeRepository = new NodeRepository(db);
    try {
      nodeRepository.upsert(createQueueNode({
        id: "node-unbenchmarked-normalized",
        state: "active",
        delivery_state: "eligible",
        contains_unbenchmarked_origin: true,
        effective_generation_assurance_floor: "recommended"
      }));
      expect(nodeRepository.getById("node-unbenchmarked-normalized")).toMatchObject({
        contains_unbenchmarked_origin: true,
        effective_generation_assurance_floor: "unbenchmarked",
        delivery_state: "shadow_only"
      });
      expect(nodeRepository.listLiveInjectableByExactScope("scope-fenced-queue")).toEqual([]);
    } finally {
      db.close();
    }
  });
});

