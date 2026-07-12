import { describe, expect, it } from "vitest";
import {
  FENCED_LEARNING_QUEUE_CONTRACT_FIXTURE,
  LEARNING_CANDIDATE_STATES,
  LEARNING_FAILURE_CLASSES,
  LEARNING_FAILURE_CODES,
  LEARNING_FAILURE_POLICIES,
  LEARNING_FAILURE_SCOPES,
  LEARNING_JOB_STATES,
  LEARNING_QUEUE_PROTECTED_OPERATIONS,
  MAX_EXACT_NODE_PROVENANCE_KEYS,
  PROTECTED_WRITE_OPERATION_MATRIX,
  ROUTE_FAILURE_ESCALATION_POLICY_VERSION
} from "../../src/runtime/learning-queue/constants.js";
import {
  resolveLearningFailurePolicy
} from "../../src/runtime/learning-queue/failure-policy.js";
import {
  classifyDistillationFailure,
  DistillationExecutionError
} from "../../src/distillation/errors.js";
import {
  inspectFencedLearningQueueAuthority
} from "../../src/runtime/learning-queue/inspection.js";
import {
  createFencedLearningQueueFixture,
  createProductionAuthorityProvider,
  QUEUE_FIXTURE_CLAIM_EXPIRY,
  QUEUE_FIXTURE_NOW
} from "../fixtures/fenced-learning-queue-fixture.js";
import type {
  ProductionWriteAuthorityProvider
} from "../../src/runtime/learning-queue/types.js";

describe("fenced learning queue contract", () => {
  it("materializes exhaustive states, failure mapping, protected operations, and provenance policy", () => {
    expect(LEARNING_JOB_STATES).toEqual([
      "pending",
      "processing",
      "blocked",
      "failed",
      "succeeded",
      "discarded"
    ]);
    expect(LEARNING_CANDIDATE_STATES).toEqual([
      "pending",
      "blocked",
      "failed",
      "distilled",
      "discarded"
    ]);
    expect(Object.keys(LEARNING_FAILURE_POLICIES).sort()).toEqual(
      [...LEARNING_FAILURE_CODES].sort()
    );
    for (const code of LEARNING_FAILURE_CODES) {
      const policy = LEARNING_FAILURE_POLICIES[code];
      expect(LEARNING_FAILURE_CLASSES).toContain(policy.failure_class);
      expect(LEARNING_FAILURE_SCOPES).toContain(policy.failure_scope);
    }
    expect(Object.keys(PROTECTED_WRITE_OPERATION_MATRIX).sort()).toEqual(
      [...LEARNING_QUEUE_PROTECTED_OPERATIONS].sort()
    );
    expect(FENCED_LEARNING_QUEUE_CONTRACT_FIXTURE).toMatchObject({
      route_failure_escalation_policy_version:
        ROUTE_FAILURE_ESCALATION_POLICY_VERSION,
      automatic_candidate_to_route_escalation: false,
      max_exact_node_provenance_keys: MAX_EXACT_NODE_PROVENANCE_KEYS,
      custom_generation_delivery_cap_version: "custom-shadow-only-v1",
      production_queue_claiming_enabled_without_s6: false,
      semantic_completion_enabled_without_s6: false
    });
    expect(inspectFencedLearningQueueAuthority()).toEqual({
      stage: "fenced_learning_queue_s5",
      contract_version: "fenced-learning-queue-v1",
      fenced_queue_semantics_implemented: true,
      separate_retry_counters_implemented: true,
      semantic_origin_provenance_implemented: true,
      custom_shadow_cap_implemented: true,
      route_failure_escalation_policy_version: "route-escalation-disabled-v1",
      production_write_authority_connected: false,
      production_queue_claiming_enabled: false,
      semantic_production_writes_enabled: false,
      production_learning_ready: false,
      learning_runtime_active: false
    });
  });

  it("forbids free-text or candidate-count route escalation", () => {
    expect(() => resolveLearningFailurePolicy({
      code: "EE_ROUTE_OUTPUT_SCHEMA_INVALID",
      source: "candidate_validation"
    })).toThrowError(/route-escalation-disabled-v1/u);
    expect(resolveLearningFailurePolicy({
      code: "EE_ROUTE_OUTPUT_SCHEMA_INVALID",
      source: "route_health_probe"
    })).toMatchObject({
      failure_class: "system_route",
      failure_scope: "provider_route",
      counter_effect: "system_attempt"
    });
    expect(() => resolveLearningFailurePolicy({
      code: "EE_CANDIDATE_CONTENT_INVALID",
      source: "provider_execution"
    })).toThrowError(/candidate-validation/u);

    expect(classifyDistillationFailure(
      new Error("candidate content invalid and HTTP 429")
    )).toMatchObject({
      code: "EE_PROVIDER_CONTRACT_INVALID",
      source: "provider_execution"
    });
    expect(classifyDistillationFailure(new DistillationExecutionError(
      "candidate_content_invalid",
      "arbitrary diagnostic text",
      "EE_CANDIDATE_CONTENT_INVALID",
      "candidate_validation"
    ))).toMatchObject({
      code: "EE_CANDIDATE_CONTENT_INVALID",
      source: "candidate_validation"
    });
  });

  it("keeps production claim fail-closed when S6 authority is absent", () => {
    const fixture = createFencedLearningQueueFixture({
      productionAuthorityProvider: createProductionAuthorityProvider({
        unavailable: true
      })
    });
    try {
      expect(() => fixture.repository.claimNext({
        claimId: "claim-unavailable",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })).toThrowError(/production write authority is unavailable/iu);
      expect(fixture.repository.getById(fixture.job.id)).toMatchObject({
        status: "pending",
        state_revision: 1,
        claim_id: null,
        system_attempt_count: 0,
        content_retry_count: 0
      });
    } finally {
      fixture.db.close();
    }
  });

  it("rejects activation-only workers and non-active package roles even if an external provider lies", () => {
    const invalidProvider = {
      getProductionWriteAuthorityInTransaction(input: Parameters<
        ProductionWriteAuthorityProvider["getProductionWriteAuthorityInTransaction"]
      >[0]) {
        return {
          ...createProductionAuthorityProvider()
            .getProductionWriteAuthorityInTransaction(input),
          worker_mode: "activation_only",
          package_generation_role: "pending"
        };
      }
    } as unknown as ProductionWriteAuthorityProvider;
    const fixture = createFencedLearningQueueFixture({
      productionAuthorityProvider: invalidProvider
    });
    try {
      expect(() => fixture.repository.claimNext({
        claimId: "claim-activation-only",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })).toThrowError(/authority identity does not match/iu);
      expect(fixture.repository.getById(fixture.job.id)?.status).toBe("pending");
    } finally {
      fixture.db.close();
    }
  });

  it("enforces claim nullability mechanically and keeps candidates free of transient ownership", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      expect(() => fixture.db.prepare(
        "UPDATE distillation_jobs SET status = 'processing' WHERE id = ?"
      ).run(fixture.job.id)).toThrowError(/complete claim identity/u);

      const candidateColumns = fixture.db.prepare(
        "PRAGMA table_info(experience_candidates)"
      ).all() as Array<{ name: string }>;
      expect(candidateColumns.some((column) => column.name === "claim_owner_id")).toBe(false);
      expect(candidateColumns.some((column) => column.name === "claim_fencing_token")).toBe(false);
    } finally {
      fixture.db.close();
    }
  });
});

