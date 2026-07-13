import { describe, expect, it } from "vitest";
import {
  createS6LearningQueueMaintenanceAuthorityProvider
} from "../../src/runtime/activation/authority.js";
import {
  createRuntimeNativeBlockedSystemWorkHandler
} from "../../src/runtime/activation/queue-control.js";
import {
  OpenClawRuntimeNativeService
} from "../../src/runtime/activation/native-service.js";
import {
  UNAVAILABLE_PRODUCTION_WRITE_AUTHORITY_PROVIDER
} from "../../src/runtime/learning-queue/authority.js";
import {
  FencedLearningQueueRepository
} from "../../src/runtime/learning-queue/repository.js";
import {
  createSemanticOriginReference
} from "../../src/runtime/learning-queue/provenance.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  CandidateRepository
} from "../../src/store/sqlite/repositories/candidate-repo.js";
import {
  bootstrapDatabase
} from "../../src/store/sqlite/db.js";
import {
  createFixtureRouteAuthorityProvider,
  createRuntimeProductionLifecycleFixture
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_GATEWAY_ID,
  PROCESS_FIXTURE_GATEWAY_START,
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";
import {
  createQueueCandidate
} from "../fixtures/fenced-learning-queue-fixture.js";

describe("runtime blocked system-work control", () => {
  it("resumes one blocked job through S5 maintenance authority and replays the control request", async () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      bootstrapDatabase(fixture.db);
      const candidate = createQueueCandidate({
        id: "candidate-native-blocked-retry",
        task_run_id: "taskrun-native-blocked-retry",
        source_record_id: "input-native-blocked-retry",
        created_at: PROCESS_FIXTURE_START,
        updated_at: PROCESS_FIXTURE_START
      });
      new CandidateRepository(fixture.db).upsert(candidate);
      const maintenance = createS6LearningQueueMaintenanceAuthorityProvider({
        routeAuthorityProvider: createFixtureRouteAuthorityProvider(),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      const queue = new FencedLearningQueueRepository(
        fixture.db,
        PROCESS_FIXTURE_HOME_ID,
        UNAVAILABLE_PRODUCTION_WRITE_AUTHORITY_PROVIDER,
        maintenance
      );
      const semanticOrigin = createSemanticOriginReference({
        configuration_generation_id:
          fixture.productionHandshake.configuration_generation_id,
        package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        generation_profile_id: "custom-contract-v1",
        generation_profile_version: "1.0.0",
        generation_profile_status: "active",
        quality_profile: "custom",
        stage_routes: {
          learning_gate: {
            route_fingerprint: "fixture-route-learning_gate",
            validation_record_id: "validation-learning-gate",
            benchmark_assurance: "unbenchmarked",
            contract_version: "learning-gate-contract-v1"
          },
          distillation: {
            route_fingerprint: "fixture-route-distillation",
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
        createdAt: PROCESS_FIXTURE_START
      });
      queue.registerPendingJob({
        jobId: "job-native-blocked-retry",
        candidateId: candidate.id,
        extractorProfile: "native-blocked-retry-test",
        routeFingerprint: "fixture-route-distillation",
        semanticOrigin,
        createdAt: PROCESS_FIXTURE_START
      });
      fixture.db.prepare(
        `UPDATE distillation_jobs
         SET status = 'blocked',
             state_revision = 2,
             failure_code = 'EE_PROVIDER_CONFIGURATION_INVALID',
             failure_class = 'configuration',
             failure_scope = 'system',
             blocked_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        PROCESS_FIXTURE_START,
        PROCESS_FIXTURE_START,
        "job-native-blocked-retry"
      );
      fixture.db.prepare(
        `UPDATE experience_candidates
         SET lifecycle_state = 'blocked',
             state_revision = 2,
             failure_code = 'EE_PROVIDER_CONFIGURATION_INVALID',
             failure_class = 'configuration',
             failure_scope = 'system',
             blocked_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        PROCESS_FIXTURE_START,
        PROCESS_FIXTURE_START,
        candidate.id
      );

      const service = new OpenClawRuntimeNativeService({
        handlers: {
          retry_blocked_system_work:
            createRuntimeNativeBlockedSystemWorkHandler({
              db: fixture.db,
              homeId: PROCESS_FIXTURE_HOME_ID,
              gatewayInstanceId: PROCESS_FIXTURE_GATEWAY_ID,
              gatewayProcessStartToken: PROCESS_FIXTURE_GATEWAY_START,
              currentPluginPackageGenerationId: PROCESS_FIXTURE_PACKAGE_ID,
              maintenanceAuthorityProvider: maintenance,
              clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
            })
        }
      });
      const payload = {
        control_request_id: "control-native-blocked-retry",
        expected_projection_revision: fixture.activation.activation_revision,
        job_id: "job-native-blocked-retry",
        expected_job_state_revision: 2,
        expected_candidate_state_revision: 2,
        expected_failure_code: "EE_PROVIDER_CONFIGURATION_INVALID",
        route_fingerprint: "fixture-route-distillation"
      };
      await expect(service.execute({
        operation: "retry_blocked_system_work",
        payload
      })).resolves.toMatchObject({
        ok: true,
        code: "blocked_system_work_retried",
        result: {
          replayed: false,
          projection_revision: fixture.activation.activation_revision
        }
      });
      await expect(service.execute({
        operation: "experienceengine.runtime.retry_blocked_system_work",
        payload
      })).resolves.toMatchObject({
        ok: true,
        code: "blocked_system_work_retried",
        result: { replayed: true }
      });
      expect(queue.getById("job-native-blocked-retry")).toMatchObject({
        status: "pending",
        state_revision: 3,
        failure_code: null,
        route_fingerprint: "fixture-route-distillation"
      });
      const updatedCandidate = fixture.db.prepare(
        `SELECT lifecycle_state, state_revision, failure_code
         FROM experience_candidates WHERE id = ?`
      ).get(candidate.id) as Record<string, unknown>;
      expect(updatedCandidate).toEqual({
        lifecycle_state: "pending",
        state_revision: 3,
        failure_code: null
      });
    } finally {
      fixture.db.close();
    }
  });
});
