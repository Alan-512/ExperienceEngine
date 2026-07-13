import { describe, expect, it } from "vitest";
import { configSchema } from "../../src/config/config-schema.js";
import { DistillationExecutionError } from "../../src/distillation/errors.js";
import type {
  SemanticProcessingResult
} from "../../src/distillation/semantic-processor.js";
import {
  PackageWorkerSemanticQueueExecutor
} from "../../src/runtime/package/semantic-queue-executor.js";
import type {
  PackageWorkerSemanticRouteBinding
} from "../../src/runtime/package/semantic-route-adapter.js";
import {
  NodeRepository
} from "../../src/store/sqlite/repositories/node-repo.js";
import {
  createFencedLearningQueueFixture,
  createMaintenanceAuthorityProvider,
  createProductionAuthorityEvidence,
  createQueueNode,
  QUEUE_FIXTURE_HOME_ID,
  QUEUE_FIXTURE_NOW
} from "../fixtures/fenced-learning-queue-fixture.js";
import {
  FencedLearningQueueRepository
} from "../../src/runtime/learning-queue/repository.js";
import type {
  ProductionWriteAuthorityProvider
} from "../../src/runtime/learning-queue/types.js";

const routeBinding = (): PackageWorkerSemanticRouteBinding => ({
  config: configSchema.parse({
    distillationMode: "llm",
    distillationAllowPassthrough: false,
    distillationMaxRetries: 2
  }),
  processorOptions: {},
  distillationRouteFingerprint: "route-fingerprint-fenced-queue",
  embeddingRouteFingerprint: "embedding-route-fenced-queue"
});

const semanticResult = (): SemanticProcessingResult => ({
  node: createQueueNode({
    distillation_mode_used: "llm",
    distillation_source: "explicit_provider"
  }),
  mergeDecision: {
    action: "ADD",
    reason: "fixture semantic result",
    source: "rule"
  },
  reusedNodeIds: []
});

describe("package worker semantic queue executor", () => {
  it("claims through S5, performs semantic work outside SQLite authority, and completes atomically", async () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const observedTransactions: boolean[] = [];
      const executor = new PackageWorkerSemanticQueueExecutor({
        db: fixture.db,
        queueRepository: fixture.repository,
        routeBinding: routeBinding(),
        now: () => QUEUE_FIXTURE_NOW,
        idFactory: () => "claim-package-worker-complete",
        processorFactory: () => ({
          async process() {
            observedTransactions.push(fixture.db.isTransaction);
            return semanticResult();
          }
        })
      });
      await expect(executor.drainOne()).resolves.toEqual({
        status: "completed",
        jobId: fixture.job.id,
        nodeId: "node-fenced-queue"
      });
      expect(observedTransactions).toEqual([false]);
      expect(fixture.repository.getById(fixture.job.id)).toMatchObject({
        status: "succeeded",
        claim_id: null,
        content_retry_count: 0
      });
      expect(fixture.candidateRepository.getById(fixture.candidate.id)).toMatchObject({
        lifecycle_state: "distilled",
        content_retry_count: 0
      });
      expect(new NodeRepository(fixture.db).getById("node-fenced-queue")).toBeDefined();
    } finally {
      fixture.db.close();
    }
  });

  it("rejects stale semantic output and recovers authority loss without content retry", async () => {
    let workerFence = 7;
    const productionAuthorityProvider: ProductionWriteAuthorityProvider = {
      getProductionWriteAuthorityInTransaction(input) {
        return createProductionAuthorityEvidence(input.operation, {
          worker_fencing_token: workerFence
        });
      }
    };
    const fixture = createFencedLearningQueueFixture({
      productionAuthorityProvider
    });
    try {
      const repository = new FencedLearningQueueRepository(
        fixture.db,
        QUEUE_FIXTURE_HOME_ID,
        productionAuthorityProvider,
        createMaintenanceAuthorityProvider()
      );
      const executor = new PackageWorkerSemanticQueueExecutor({
        db: fixture.db,
        queueRepository: repository,
        routeBinding: routeBinding(),
        now: () => QUEUE_FIXTURE_NOW,
        idFactory: () => "claim-package-worker-stale",
        processorFactory: () => ({
          async process() {
            workerFence = 8;
            return semanticResult();
          }
        })
      });
      await expect(executor.drainOne()).resolves.toEqual({
        status: "interrupted",
        jobId: fixture.job.id,
        recovered: true,
        code: "EE_ACTIVATION_FENCING_REJECTED"
      });
      expect(repository.getById(fixture.job.id)).toMatchObject({
        status: "pending",
        claim_id: null,
        interruption_count: 1,
        content_retry_count: 0
      });
      expect(fixture.candidateRepository.getById(fixture.candidate.id)).toMatchObject({
        lifecycle_state: "pending",
        content_retry_count: 0
      });
      expect(new NodeRepository(fixture.db).getById("node-fenced-queue")).toBeUndefined();
    } finally {
      fixture.db.close();
    }
  });

  it("records stable candidate failure codes through S5", async () => {
    const fixture = createFencedLearningQueueFixture();
    try {
      const executor = new PackageWorkerSemanticQueueExecutor({
        db: fixture.db,
        queueRepository: fixture.repository,
        routeBinding: routeBinding(),
        now: () => QUEUE_FIXTURE_NOW,
        idFactory: () => "claim-package-worker-failure",
        processorFactory: () => ({
          async process() {
            throw new DistillationExecutionError(
              "candidate_output_schema_invalid",
              "fixture candidate output is invalid",
              "EE_CANDIDATE_OUTPUT_SCHEMA_INVALID",
              "candidate_validation"
            );
          }
        })
      });
      await expect(executor.drainOne()).resolves.toEqual({
        status: "failed",
        jobId: fixture.job.id,
        code: "EE_CANDIDATE_OUTPUT_SCHEMA_INVALID"
      });
      expect(fixture.repository.getById(fixture.job.id)).toMatchObject({
        status: "failed",
        content_retry_count: 1,
        failure_code: "EE_CANDIDATE_OUTPUT_SCHEMA_INVALID"
      });
      expect(fixture.candidateRepository.getById(fixture.candidate.id)).toMatchObject({
        lifecycle_state: "failed",
        content_retry_count: 1
      });
    } finally {
      fixture.db.close();
    }
  });
});
