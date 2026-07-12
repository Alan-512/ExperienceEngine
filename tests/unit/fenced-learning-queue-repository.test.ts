import { describe, expect, it } from "vitest";
import {
  createSemanticOriginReference
} from "../../src/runtime/learning-queue/provenance.js";
import {
  FencedLearningQueueRepository
} from "../../src/runtime/learning-queue/repository.js";
import {
  NodeRepository
} from "../../src/store/sqlite/repositories/node-repo.js";
import {
  createFencedLearningQueueFixture,
  createMaintenanceAuthorityProvider,
  createProductionAuthorityProvider,
  createQueueNode,
  createQueueSemanticOrigin,
  QUEUE_FIXTURE_CLAIM_EXPIRY,
  QUEUE_FIXTURE_HOME_ID,
  QUEUE_FIXTURE_NOW
} from "../fixtures/fenced-learning-queue-fixture.js";

const claimExpectation = (job: {
  id: string;
  claim_id: string | null;
  claim_owner_id: string | null;
  claim_fencing_token: number | null;
  state_revision: number;
}) => ({
  jobId: job.id,
  claimId: job.claim_id!,
  claimOwnerId: job.claim_owner_id!,
  claimFencingToken: job.claim_fencing_token!,
  expectedStateRevision: job.state_revision
});

const customOrigin = () => createQueueSemanticOrigin();

const repairedCustomOrigin = () => createSemanticOriginReference({
  configuration_generation_id: "configuration-repaired",
  package_generation_id: "package-repaired",
  generation_profile_id: "custom-contract-v1",
  generation_profile_version: "1.0.0",
  generation_profile_status: "active",
  quality_profile: "custom",
  stage_routes: {
    learning_gate: {
      route_fingerprint: "learning-gate-repaired",
      validation_record_id: "validation-learning-gate-repaired",
      benchmark_assurance: "unbenchmarked",
      contract_version: "learning-gate-contract-v1"
    },
    distillation: {
      route_fingerprint: "route-fingerprint-repaired",
      validation_record_id: "validation-distillation-repaired",
      benchmark_assurance: "unbenchmarked",
      contract_version: "distillation-contract-v1"
    },
    merge_decision: {
      route_kind: "deterministic",
      route_fingerprint: "deterministic-merge-repaired",
      validation_record_id: "validation-merge-repaired",
      benchmark_assurance: "unbenchmarked",
      contract_version: "merge-contract-v1"
    }
  },
  createdAt: "2026-07-12T16:04:00.000Z"
});

describe("fenced learning queue repository", () => {
  it("claims one runnable job atomically and renews only the exact current claim", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const claimed = fixture.repository.claimNext({
        claimId: "claim-fenced-queue",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      });
      expect(claimed).toMatchObject({
        status: "processing",
        state_revision: 2,
        claim_id: "claim-fenced-queue",
        claim_owner_id: "worker-fenced-queue",
        claim_fencing_token: 7,
        claimed_supervisor_lease_epoch: 11,
        claimed_activation_revision: 13,
        claimed_production_activation_handshake_id: "handshake-fenced-queue",
        claimed_configuration_generation_id: "configuration-fenced-queue",
        claimed_effective_route_set_id: "route-set-fenced-queue",
        claimed_effective_route_revision: 17,
        system_attempt_count: 1,
        interruption_count: 0,
        content_retry_count: 0
      });
      expect(fixture.repository.claimNext({
        claimId: "claim-duplicate",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })).toBeUndefined();

      expect(() => fixture.repository.renewClaim({
        claim: {
          ...claimExpectation(claimed!),
          expectedStateRevision: 1
        },
        now: "2026-07-12T16:01:00.000Z",
        claimExpiresAt: "2026-07-12T16:06:00.000Z"
      })).toThrowError(/stale/u);

      const renewed = fixture.repository.renewClaim({
        claim: claimExpectation(claimed!),
        now: "2026-07-12T16:01:00.000Z",
        claimExpiresAt: "2026-07-12T16:06:00.000Z"
      });
      expect(renewed).toMatchObject({
        status: "processing",
        state_revision: 3,
        claim_heartbeat_at: "2026-07-12T16:01:00.000Z",
        claim_expires_at: "2026-07-12T16:06:00.000Z"
      });

      const staleAuthorityRepository = new FencedLearningQueueRepository(
        fixture.db,
        QUEUE_FIXTURE_HOME_ID,
        createProductionAuthorityProvider({
          overrides: { worker_fencing_token: 8 }
        }),
        createMaintenanceAuthorityProvider()
      );
      expect(() => staleAuthorityRepository.renewClaim({
        claim: claimExpectation(renewed),
        now: "2026-07-12T16:02:00.000Z",
        claimExpiresAt: "2026-07-12T16:07:00.000Z"
      })).toThrowError(/claim-time authority snapshot/u);
    } finally {
      fixture.db.close();
    }
  });

  it("binds candidate provenance before claim and rejects current route drift", () => {
    const fixture = createFencedLearningQueueFixture({
      productionAuthorityProvider: createProductionAuthorityProvider({
        overrides: {
          route_fingerprint: "route-drifted"
        }
      })
    });
    try {
      expect(fixture.candidateRepository.getById(fixture.candidate.id)).toMatchObject({
        semantic_origin_provenance_key: createQueueSemanticOrigin().provenance_key,
        lifecycle_state: "pending",
        content_retry_count: 0
      });
      expect(() => fixture.repository.claimNext({
        claimId: "claim-drifted-route",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })).toThrowError(/route does not match current production authority/iu);
      expect(fixture.repository.getById(fixture.job.id)).toMatchObject({
        status: "pending",
        state_revision: 1,
        claim_id: null,
        system_attempt_count: 0
      });
    } finally {
      fixture.db.close();
    }
  });

  it("forbids new claims while draining and bounds existing-claim renewal by the drain deadline", () => {
    const drainingFixture = createFencedLearningQueueFixture({
      productionAuthorityProvider: createProductionAuthorityProvider({
        overrides: {
          worker_lease_state: "draining",
          worker_shutdown_requested_at: "2026-07-12T15:59:00.000Z",
          worker_drain_deadline_at: "2026-07-12T16:04:00.000Z"
        }
      })
    });
    try {
      expect(() => drainingFixture.repository.claimNext({
        claimId: "claim-draining-forbidden",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: "2026-07-12T16:03:00.000Z"
      })).toThrowError(/worker lease state draining/iu);
    } finally {
      drainingFixture.db.close();
    }

    const activeFixture = createFencedLearningQueueFixture();
    try {
      const claimed = activeFixture.repository.claimNext({
        claimId: "claim-draining-renewal",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: "2026-07-12T16:03:00.000Z"
      })!;
      const drainingRepository = new FencedLearningQueueRepository(
        activeFixture.db,
        QUEUE_FIXTURE_HOME_ID,
        createProductionAuthorityProvider({
          overrides: {
            worker_lease_state: "draining",
            worker_shutdown_requested_at: "2026-07-12T16:01:00.000Z",
            worker_drain_deadline_at: "2026-07-12T16:04:00.000Z"
          }
        }),
        createMaintenanceAuthorityProvider()
      );
      expect(() => drainingRepository.renewClaim({
        claim: claimExpectation(claimed),
        now: "2026-07-12T16:02:00.000Z",
        claimExpiresAt: "2026-07-12T16:05:00.000Z"
      })).toThrowError(/drain deadline/iu);
      const renewed = drainingRepository.renewClaim({
        claim: claimExpectation(claimed),
        now: "2026-07-12T16:02:00.000Z",
        claimExpiresAt: "2026-07-12T16:04:00.000Z"
      });
      expect(renewed.claim_expires_at).toBe("2026-07-12T16:04:00.000Z");
    } finally {
      activeFixture.db.close();
    }
  });

  it("separates system blocking, content retries, and terminal discard", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const firstClaim = fixture.repository.claimNext({
        claimId: "claim-system-block",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })!;
      const blocked = fixture.repository.recordWorkerFailure({
        claim: claimExpectation(firstClaim),
        code: "EE_PROVIDER_TRANSIENT",
        source: "provider_execution",
        now: "2026-07-12T16:01:00.000Z",
        nextAttemptAt: "2026-07-12T16:02:00.000Z",
        maxContentRetries: 2
      });
      expect(blocked.job).toMatchObject({
        status: "blocked",
        claim_id: null,
        system_attempt_count: 1,
        interruption_count: 0,
        content_retry_count: 0,
        failure_code: "EE_PROVIDER_TRANSIENT"
      });
      expect(blocked.candidate).toMatchObject({
        lifecycle_state: "blocked",
        content_retry_count: 0,
        semantic_origin_provenance_key: createQueueSemanticOrigin().provenance_key
      });

      const resumed = fixture.repository.resumeBlocked({
        jobId: blocked.job.id,
        expectedJobStateRevision: blocked.job.state_revision,
        expectedCandidateStateRevision: blocked.candidate.state_revision,
        expectedFailureCode: "EE_PROVIDER_TRANSIENT",
        routeFingerprint: "route-fingerprint-fenced-queue",
        now: "2026-07-12T16:02:00.000Z"
      });
      expect(resumed.job.status).toBe("pending");
      expect(resumed.candidate.content_retry_count).toBe(0);
      expect(resumed.candidate.semantic_origin_provenance_key).toBe(
        createQueueSemanticOrigin().provenance_key
      );

      const firstContentClaim = fixture.repository.claimNext({
        claimId: "claim-content-1",
        now: "2026-07-12T16:02:00.000Z",
        claimExpiresAt: "2026-07-12T16:07:00.000Z"
      })!;
      const failed = fixture.repository.recordWorkerFailure({
        claim: claimExpectation(firstContentClaim),
        code: "EE_CANDIDATE_CONTENT_INVALID",
        source: "candidate_validation",
        now: "2026-07-12T16:03:00.000Z",
        nextAttemptAt: "2026-07-12T16:04:00.000Z",
        maxContentRetries: 2
      });
      expect(failed.job).toMatchObject({
        status: "failed",
        system_attempt_count: 2,
        interruption_count: 0,
        content_retry_count: 1
      });
      expect(failed.candidate).toMatchObject({
        lifecycle_state: "failed",
        content_retry_count: 1
      });

      const secondContentClaim = fixture.repository.claimNext({
        claimId: "claim-content-2",
        now: "2026-07-12T16:04:00.000Z",
        claimExpiresAt: "2026-07-12T16:09:00.000Z"
      })!;
      const discarded = fixture.repository.recordWorkerFailure({
        claim: claimExpectation(secondContentClaim),
        code: "EE_CANDIDATE_OUTPUT_SCHEMA_INVALID",
        source: "candidate_validation",
        now: "2026-07-12T16:05:00.000Z",
        nextAttemptAt: "2026-07-12T16:06:00.000Z",
        maxContentRetries: 2
      });
      expect(discarded.job).toMatchObject({
        status: "discarded",
        system_attempt_count: 3,
        interruption_count: 0,
        content_retry_count: 2,
        terminal_reason_code: "EE_CANDIDATE_OUTPUT_SCHEMA_INVALID"
      });
      expect(discarded.candidate).toMatchObject({
        lifecycle_state: "discarded",
        content_retry_count: 2
      });
    } finally {
      fixture.db.close();
    }
  });

  it("resumes on a newly validated route while preserving candidate provenance and aggregating actual completion provenance", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const originalProvenanceKey = createQueueSemanticOrigin().provenance_key;
      const firstClaim = fixture.repository.claimNext({
        claimId: "claim-before-route-repair",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })!;
      const blocked = fixture.repository.recordWorkerFailure({
        claim: claimExpectation(firstClaim),
        code: "EE_PROVIDER_CONFIGURATION_INVALID",
        source: "setup",
        now: "2026-07-12T16:01:00.000Z",
        nextAttemptAt: "2026-07-12T16:02:00.000Z",
        maxContentRetries: 2
      });
      const repairedRepository = new FencedLearningQueueRepository(
        fixture.db,
        QUEUE_FIXTURE_HOME_ID,
        createProductionAuthorityProvider({
          overrides: {
            package_generation_id: "package-repaired",
            configuration_generation_id: "configuration-repaired",
            effective_route_set_id: "route-set-repaired",
            effective_route_revision: 18,
            route_fingerprint: "route-fingerprint-repaired"
          }
        }),
        createMaintenanceAuthorityProvider({
          overrides: {
            configuration_generation_id: "configuration-repaired",
            effective_route_set_id: "route-set-repaired",
            effective_route_revision: 18,
            route_fingerprint: "route-fingerprint-repaired",
            validation_current: true
          }
        })
      );
      const resumed = repairedRepository.resumeBlocked({
        jobId: blocked.job.id,
        expectedJobStateRevision: blocked.job.state_revision,
        expectedCandidateStateRevision: blocked.candidate.state_revision,
        expectedFailureCode: "EE_PROVIDER_CONFIGURATION_INVALID",
        routeFingerprint: "route-fingerprint-repaired",
        now: "2026-07-12T16:02:00.000Z"
      });
      expect(resumed.candidate.semantic_origin_provenance_key).toBe(
        originalProvenanceKey
      );
      expect(resumed.job.route_fingerprint).toBe("route-fingerprint-repaired");

      const repairedClaim = repairedRepository.claimNext({
        claimId: "claim-after-route-repair",
        now: "2026-07-12T16:03:00.000Z",
        claimExpiresAt: "2026-07-12T16:08:00.000Z"
      })!;
      const nodeRepository = new NodeRepository(fixture.db);
      const completed = repairedRepository.completeSemantic({
        claim: claimExpectation(repairedClaim),
        now: "2026-07-12T16:04:00.000Z",
        nodeId: "node-fenced-queue",
        distillationSource: "explicit_provider",
        semanticOrigin: repairedCustomOrigin(),
        applySemanticWrites: () => nodeRepository.upsert(createQueueNode())
      });
      expect(completed.candidate.semantic_origin_provenance_key).toBe(
        originalProvenanceKey
      );
      expect(completed.provenance).toMatchObject({
        contains_unbenchmarked_origin: true,
        semantic_origin_count: 2,
        exact_provenance_key_count: 2,
        effective_generation_assurance_floor: "unbenchmarked"
      });
      expect(nodeRepository.getById("node-fenced-queue")?.delivery_state).toBe(
        "shadow_only"
      );
    } finally {
      fixture.db.close();
    }
  });

  it("recovers authority loss as interruption only and rejects stale semantic output", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const claimed = fixture.repository.claimNext({
        claimId: "claim-interrupted",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })!;
      const oldClaim = claimExpectation(claimed);
      const recovered = fixture.repository.recoverInterruptedClaim({
        claim: oldClaim,
        mode: "current_authority",
        now: "2026-07-12T16:01:00.000Z",
        code: "EE_ACTIVATION_FENCING_REJECTED"
      });
      expect(recovered.job).toMatchObject({
        status: "pending",
        claim_id: null,
        system_attempt_count: 1,
        interruption_count: 1,
        content_retry_count: 0,
        failure_code: "EE_ACTIVATION_FENCING_REJECTED"
      });
      expect(recovered.candidate).toMatchObject({
        lifecycle_state: "pending",
        content_retry_count: 0,
        failure_class: "interruption"
      });

      expect(() => fixture.repository.completeSemantic({
        claim: oldClaim,
        now: "2026-07-12T16:02:00.000Z",
        nodeId: "node-stale-output",
        distillationSource: "explicit_provider",
        semanticOrigin: customOrigin(),
        applySemanticWrites: () => {
          throw new Error("stale callback must not run");
        }
      })).toThrowError(/stale/u);
      expect(fixture.db.prepare(
        "SELECT COUNT(*) AS count FROM experience_nodes WHERE id = 'node-stale-output'"
      ).get()).toEqual({ count: 0 });
    } finally {
      fixture.db.close();
    }
  });

  it("permits exact claim-expiry recovery only at or after the recorded deadline", () => {
    const fixture = createFencedLearningQueueFixture({
      maintenanceAuthorityProvider: createMaintenanceAuthorityProvider({
        unavailable: true
      })
    });
    try {
      const claimed = fixture.repository.claimNext({
        claimId: "claim-expiry-recovery",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })!;
      expect(() => fixture.repository.recoverInterruptedClaim({
        claim: claimExpectation(claimed),
        mode: "claim_expiry",
        now: "2026-07-12T16:04:59.999Z"
      })).toThrowError(/before the exact claim deadline/iu);
      const recovered = fixture.repository.recoverInterruptedClaim({
        claim: claimExpectation(claimed),
        mode: "claim_expiry",
        now: QUEUE_FIXTURE_CLAIM_EXPIRY
      });
      expect(recovered.job).toMatchObject({
        status: "pending",
        interruption_count: 1,
        content_retry_count: 0,
        failure_code: "EE_CLAIM_EXPIRED"
      });
      expect(recovered.candidate).toMatchObject({
        lifecycle_state: "pending",
        content_retry_count: 0
      });
    } finally {
      fixture.db.close();
    }
  });

  it("commits node, provenance, candidate, and job atomically with custom shadow cap", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const claimed = fixture.repository.claimNext({
        claimId: "claim-complete",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })!;
      const nodeRepository = new NodeRepository(fixture.db);
      const completed = fixture.repository.completeSemantic({
        claim: claimExpectation(claimed),
        now: "2026-07-12T16:01:00.000Z",
        nodeId: "node-fenced-queue",
        distillationSource: "explicit_provider",
        semanticOrigin: customOrigin(),
        applySemanticWrites: () => nodeRepository.upsert(createQueueNode())
      });
      expect(completed.job).toMatchObject({
        status: "succeeded",
        claim_id: null,
        content_retry_count: 0
      });
      expect(completed.candidate).toMatchObject({
        lifecycle_state: "distilled",
        content_retry_count: 0
      });
      expect(completed.provenance).toMatchObject({
        contains_unbenchmarked_origin: true,
        semantic_origin_count: 1,
        effective_generation_assurance_floor: "unbenchmarked"
      });
      expect(nodeRepository.getById("node-fenced-queue")).toMatchObject({
        contains_unbenchmarked_origin: true,
        delivery_state: "shadow_only"
      });
      expect(nodeRepository.listLiveInjectableByExactScope("scope-fenced-queue")).toEqual([]);
      expect(nodeRepository.listDiagnosticCandidatesByExactScope("scope-fenced-queue")).toEqual([]);
      expect(nodeRepository.listShadowEligibleByExactScope("scope-fenced-queue")).toHaveLength(1);
    } finally {
      fixture.db.close();
    }
  });

  it("rolls back every semantic write when any completion invariant fails", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const claimed = fixture.repository.claimNext({
        claimId: "claim-rollback",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })!;
      const nodeRepository = new NodeRepository(fixture.db);
      expect(() => fixture.repository.completeSemantic({
        claim: claimExpectation(claimed),
        now: "2026-07-12T16:01:00.000Z",
        nodeId: "node-fenced-queue",
        distillationSource: "explicit_provider",
        semanticOrigin: customOrigin(),
        applySemanticWrites: () => {
          nodeRepository.upsert(createQueueNode());
          throw new Error("semantic write failed");
        }
      })).toThrowError(/semantic write failed/u);
      expect(nodeRepository.getById("node-fenced-queue")).toBeUndefined();
      expect(fixture.repository.getById(claimed.id)).toMatchObject({
        status: "processing",
        claim_id: "claim-rollback",
        state_revision: claimed.state_revision
      });
      expect(fixture.candidateRepository.getById(fixture.candidate.id)).toMatchObject({
        lifecycle_state: "pending",
        semantic_origin_provenance_key: createQueueSemanticOrigin().provenance_key
      });
    } finally {
      fixture.db.close();
    }
  });

  it("terminally discards a processing job when the bound candidate disappeared without consuming content retry", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const claimed = fixture.repository.claimNext({
        claimId: "claim-missing-candidate",
        now: QUEUE_FIXTURE_NOW,
        claimExpiresAt: QUEUE_FIXTURE_CLAIM_EXPIRY
      })!;
      fixture.db.prepare(
        "DELETE FROM experience_candidates WHERE id = ?"
      ).run(fixture.candidate.id);
      const discarded = fixture.repository.discardMissingCandidate({
        claim: claimExpectation(claimed),
        now: "2026-07-12T16:01:00.000Z"
      });
      expect(discarded).toMatchObject({
        status: "discarded",
        claim_id: null,
        content_retry_count: 0,
        interruption_count: 0,
        terminal_reason_code: "EE_CANDIDATE_MISSING",
        failure_class: "terminal",
        failure_scope: "candidate"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("cancels pending work through maintenance authority without consuming content retry", () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const candidate = fixture.candidateRepository.getById(fixture.candidate.id)!;
      const cancelled = fixture.repository.cancel({
        jobId: fixture.job.id,
        expectedJobStateRevision: fixture.job.state_revision,
        expectedCandidateStateRevision: candidate.state_revision!,
        now: "2026-07-12T16:01:00.000Z"
      });
      expect(cancelled.job).toMatchObject({
        status: "discarded",
        content_retry_count: 0,
        terminal_reason_code: "EE_OPERATOR_CANCELLED"
      });
      expect(cancelled.candidate).toMatchObject({
        lifecycle_state: "discarded",
        content_retry_count: 0,
        terminal_reason_code: "EE_OPERATOR_CANCELLED"
      });
    } finally {
      fixture.db.close();
    }
  });
});

