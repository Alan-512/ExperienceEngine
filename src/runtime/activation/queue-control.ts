import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  UNAVAILABLE_PRODUCTION_WRITE_AUTHORITY_PROVIDER
} from "../learning-queue/authority.js";
import {
  LEARNING_FAILURE_CODES,
  type LearningFailureCode
} from "../learning-queue/constants.js";
import { FencedLearningQueueRepository } from "../learning-queue/repository.js";
import type {
  LearningQueueMaintenanceAuthorityProvider
} from "../learning-queue/types.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  RuntimeControlRequestRepository,
  createControlRequestDigest,
  type ControlExecutionResult
} from "./control.js";
import {
  readSupervisorLeaseByHome
} from "./database.js";
import type {
  OpenClawNativeOperationHandler,
  OpenClawNativeOperationResult
} from "./native-service.js";
import type { ActivationWriter } from "./types.js";

const failureCodeSet = new Set<string>(LEARNING_FAILURE_CODES);

const requiredString = (
  payload: Record<string, unknown>,
  field: string
): string => {
  const value = payload[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
};

const requiredRevision = (
  payload: Record<string, unknown>,
  field: string
): number => {
  const value = payload[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
  return value as number;
};

const requiredFailureCode = (
  payload: Record<string, unknown>
): LearningFailureCode => {
  const value = requiredString(payload, "expected_failure_code");
  if (!failureCodeSet.has(value)) {
    throw new Error("expected_failure_code is not a frozen learning failure code.");
  }
  return value as LearningFailureCode;
};

const resultFromControl = (
  result: ControlExecutionResult
): OpenClawNativeOperationResult => ({
  ok: result.record.request_state === "completed",
  operation: "retry_blocked_system_work",
  code: result.record.result_code,
  result: {
    replayed: result.replayed,
    projection_revision: result.record.result_projection_revision,
    result_digest: result.record.result_digest
  }
});

export class RuntimeBlockedSystemWorkControlService {
  private readonly requests: RuntimeControlRequestRepository;

  constructor(private readonly options: {
    db: DatabaseSync;
    homeId: string;
    maintenanceAuthorityProvider: LearningQueueMaintenanceAuthorityProvider;
    clock?: RuntimeProcessAuthorityClock;
  }) {
    this.requests = new RuntimeControlRequestRepository(
      options.db,
      options.homeId,
      options.clock
    );
  }

  retry(options: {
    controlRequestId: string;
    expectedProjectionRevision: number;
    expectedGatewayInstanceId: string;
    expectedSupervisorLeaseEpoch: number | null;
    writer: ActivationWriter;
    jobId: string;
    expectedJobStateRevision: number;
    expectedCandidateStateRevision: number;
    expectedFailureCode: LearningFailureCode;
    routeFingerprint: string;
  }): ControlExecutionResult {
    const clock = this.options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
    return this.requests.execute({
      controlRequestId: options.controlRequestId,
      requestDigest: createControlRequestDigest({
        operation: "retry_blocked_system_work",
        parameters: {
          expectedProjectionRevision: options.expectedProjectionRevision,
          jobId: options.jobId,
          expectedJobStateRevision: options.expectedJobStateRevision,
          expectedCandidateStateRevision: options.expectedCandidateStateRevision,
          expectedFailureCode: options.expectedFailureCode,
          routeFingerprint: options.routeFingerprint
        }
      }),
      requestedOperation: "retry_blocked_system_work",
      expectedProjectionRevision: options.expectedProjectionRevision,
      expectedSupervisorLeaseEpoch: options.expectedSupervisorLeaseEpoch,
      expectedGatewayInstanceId: options.expectedGatewayInstanceId,
      writer: options.writer,
      mutate: ({ observedAt, activation }) => {
        const queue = new FencedLearningQueueRepository(
          this.options.db,
          this.options.homeId,
          UNAVAILABLE_PRODUCTION_WRITE_AUTHORITY_PROVIDER,
          this.options.maintenanceAuthorityProvider
        );
        const resumed = queue.resumeBlockedInTransaction({
          jobId: options.jobId,
          expectedJobStateRevision: options.expectedJobStateRevision,
          expectedCandidateStateRevision: options.expectedCandidateStateRevision,
          expectedFailureCode: options.expectedFailureCode,
          routeFingerprint: options.routeFingerprint,
          now: observedAt
        });
        return {
          projectionRevision: activation.activation_revision,
          resultCode: "blocked_system_work_retried",
          result: {
            accepted: true,
            jobId: resumed.job.id,
            jobStateRevision: resumed.job.state_revision,
            candidateStateRevision: resumed.candidate.state_revision
          }
        };
      }
    });
  }
}

export const createRuntimeNativeBlockedSystemWorkHandler = (options: {
  db: DatabaseSync;
  homeId: string;
  gatewayInstanceId: string;
  gatewayProcessStartToken: string;
  currentPluginPackageGenerationId: string;
  maintenanceAuthorityProvider: LearningQueueMaintenanceAuthorityProvider;
  idFactory?: () => string;
  clock?: RuntimeProcessAuthorityClock;
}): OpenClawNativeOperationHandler => {
  const clock = options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
  const service = new RuntimeBlockedSystemWorkControlService({
    db: options.db,
    homeId: options.homeId,
    maintenanceAuthorityProvider: options.maintenanceAuthorityProvider,
    clock
  });
  return async (payload) => {
    const authority = runRuntimeImmediateTransaction(options.db, {
      category: "lease",
      operation: () => {
        const observedAt = clock.captureObservedNowInTransaction(options.db);
        return evaluateFreshSupervisorAuthorityInTransaction({
          db: options.db,
          homeId: options.homeId,
          observedAt
        });
      }
    });
    let writer: ActivationWriter;
    let expectedSupervisorLeaseEpoch: number | null;
    if (authority.available && authority.fresh) {
      const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
      if (!supervisor) {
        throw new Error("Fresh supervisor authority lost its lease projection.");
      }
      writer = {
        kind: "supervisor",
        supervisor_owner_id: supervisor.owner_id,
        supervisor_lease_epoch: supervisor.lease_epoch,
        supervisor_lease_state_revision: supervisor.lease_state_revision
      };
      expectedSupervisorLeaseEpoch = supervisor.lease_epoch;
    } else {
      writer = {
        kind: "gateway_service_controller",
        gateway_instance_id: options.gatewayInstanceId,
        gateway_process_start_token: options.gatewayProcessStartToken,
        plugin_package_generation_id: options.currentPluginPackageGenerationId
      };
      expectedSupervisorLeaseEpoch = null;
    }
    return resultFromControl(service.retry({
      controlRequestId: typeof payload.control_request_id === "string" &&
        payload.control_request_id.trim().length > 0
        ? payload.control_request_id
        : (options.idFactory ?? randomUUID)(),
      expectedProjectionRevision: requiredRevision(
        payload,
        "expected_projection_revision"
      ),
      expectedGatewayInstanceId: options.gatewayInstanceId,
      expectedSupervisorLeaseEpoch,
      writer,
      jobId: requiredString(payload, "job_id"),
      expectedJobStateRevision: requiredRevision(
        payload,
        "expected_job_state_revision"
      ),
      expectedCandidateStateRevision: requiredRevision(
        payload,
        "expected_candidate_state_revision"
      ),
      expectedFailureCode: requiredFailureCode(payload),
      routeFingerprint: requiredString(payload, "route_fingerprint")
    }));
  };
};
