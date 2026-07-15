import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK
} from "../process/clock.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import {
  readSupervisorLaunchState
} from "../process/database.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  RuntimePackageActivationControlService,
  type ControlExecutionResult
} from "./control.js";
import { RuntimePackageActivationRepository } from "./repository.js";
import {
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import type {
  OpenClawNativeOperationHandler,
  OpenClawNativeOperationResult
} from "./native-service.js";
import type {
  RuntimePackageGenerationResolver
} from "./service-controller.js";
import type {
  ActivationWriter
} from "./types.js";

class NativeControlArgumentError extends Error {
  readonly code = "EE_NATIVE_COMMAND_ARGUMENT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "NativeControlArgumentError";
  }
}

const requiredString = (
  payload: Record<string, unknown>,
  field: string
): string => {
  const value = payload[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new NativeControlArgumentError(`${field} must be a non-empty string.`);
  }
  return value;
};

const requiredRevision = (
  payload: Record<string, unknown>,
  field: string
): number => {
  const value = payload[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new NativeControlArgumentError(
      `${field} must be a non-negative safe integer.`
    );
  }
  return value as number;
};

const resultFromControl = (
  operation: OpenClawNativeOperationResult["operation"],
  result: ControlExecutionResult
): OpenClawNativeOperationResult => ({
  ok: result.record.request_state === "completed",
  operation,
  code: result.record.result_code,
  result: {
    replayed: result.replayed,
    projection_revision: result.record.result_projection_revision,
    result_digest: result.record.result_digest
  }
});

export const createRuntimeNativeControlHandlers = (options: {
  db: DatabaseSync;
  homeId: string;
  gatewayInstanceId: string;
  gatewayProcessStartToken: string;
  currentPluginPackageGenerationId: string;
  resolvePackageGeneration: RuntimePackageGenerationResolver;
  initializeOrResume: () => {
    ok: boolean;
    code: string;
    detail?: unknown;
  } | Promise<{
    ok: boolean;
    code: string;
    detail?: unknown;
  }>;
  retryBlockedSystemWork?: OpenClawNativeOperationHandler;
  idFactory?: () => string;
  clock?: RuntimeProcessAuthorityClock;
}): Partial<Record<OpenClawNativeOperationResult["operation"], OpenClawNativeOperationHandler>> => {
  const clock = options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
  const idFactory = options.idFactory ?? randomUUID;
  const control = new RuntimePackageActivationControlService(
    options.db,
    options.homeId,
    clock
  );

  const currentWriter = (): {
    writer: ActivationWriter;
    expectedSupervisorLeaseEpoch: number | null;
  } => {
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
    if (authority.available && authority.fresh) {
      const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
      if (!supervisor) {
        throw new Error("Fresh supervisor authority lost its current lease projection.");
      }
      return {
        writer: {
          kind: "supervisor",
          supervisor_owner_id: supervisor.owner_id,
          supervisor_lease_epoch: supervisor.lease_epoch,
          supervisor_lease_state_revision: supervisor.lease_state_revision
        },
        expectedSupervisorLeaseEpoch: supervisor.lease_epoch
      };
    }
    return {
      writer: {
        kind: "gateway_service_controller",
        gateway_instance_id: options.gatewayInstanceId,
        gateway_process_start_token: options.gatewayProcessStartToken,
        plugin_package_generation_id:
          options.currentPluginPackageGenerationId
      },
      expectedSupervisorLeaseEpoch: null
    };
  };

  const controlRequestId = (payload: Record<string, unknown>): string =>
    typeof payload.control_request_id === "string" &&
      payload.control_request_id.trim().length > 0
      ? payload.control_request_id
      : idFactory();

  const authorizationId = (payload: Record<string, unknown>): string =>
    typeof payload.authorization_id === "string" &&
      payload.authorization_id.trim().length > 0
      ? payload.authorization_id
      : idFactory();

  const prepareInitialization: OpenClawNativeOperationHandler = async () => {
    const descriptor = options.resolvePackageGeneration(
      options.currentPluginPackageGenerationId
    );
    if (!descriptor) {
      return {
        ok: false,
        operation: "prepare_package_activation",
        code: "current_package_generation_not_resolvable",
        result: null
      };
    }
    const revisions = deriveCurrentRuntimeNativeRevisions({
      db: options.db,
      homeId: options.homeId
    });
    return {
      ok: true,
      operation: "prepare_package_activation",
      code: "package_activation_request_prepared",
      result: {
        operation: "initialize_package_activation",
        package_generation_id: options.currentPluginPackageGenerationId,
        expected_projection_revision: revisions.projection_revision,
        expected_launch_revision: revisions.launch_revision,
        control_request_id: idFactory(),
        authorization_id: idFactory(),
        mutates_authority: false
      }
    };
  };

  const initialize: OpenClawNativeOperationHandler = async (payload) => {
    const packageGenerationId = requiredString(
      payload,
      "package_generation_id"
    );
    const requestedControlRequestId = requiredString(
      payload,
      "control_request_id"
    );
    const requestedAuthorizationId = requiredString(
      payload,
      "authorization_id"
    );
    const expectedProjectionRevision = requiredRevision(
      payload,
      "expected_projection_revision"
    );
    const expectedLaunchRevision = requiredRevision(
      payload,
      "expected_launch_revision"
    );
    if (packageGenerationId !== options.currentPluginPackageGenerationId) {
      throw new NativeControlArgumentError(
        "package_generation_id must match the exact current plugin package generation."
      );
    }
    const descriptor = options.resolvePackageGeneration(
      packageGenerationId
    );
    if (!descriptor) {
      return {
        ok: false,
        operation: "initialize_package_activation",
        code: "current_package_generation_not_resolvable",
        result: null
      };
    }
    const activationRepository = new RuntimePackageActivationRepository(
      options.db,
      options.homeId,
      clock
    );
    if (!activationRepository.read()) {
      activationRepository.bootstrapPackageActivationAuthority();
    }
    const initialized = control.initializePackageActivation({
        controlRequestId: requestedControlRequestId,
        expectedProjectionRevision,
        expectedLaunchRevision,
        authorizationId: requestedAuthorizationId,
        packageClosure: descriptor.packageClosure,
        expectedGatewayInstanceId: options.gatewayInstanceId,
        writer: {
          kind: "gateway_service_controller",
          gateway_instance_id: options.gatewayInstanceId,
          gateway_process_start_token: options.gatewayProcessStartToken,
          plugin_package_generation_id:
            options.currentPluginPackageGenerationId
        }
      });
    if (
      initialized.record.request_state === "completed" &&
      !initialized.replayed
    ) {
      const lifecycle = await options.initializeOrResume();
      if (!lifecycle.ok) {
        return {
          ok: false,
          operation: "initialize_package_activation",
          code: lifecycle.code,
          result: {
            control_result: resultFromControl(
              "initialize_package_activation",
              initialized
            ).result,
            lifecycle_detail: lifecycle.detail ?? null
          }
        };
      }
    }
    return resultFromControl("initialize_package_activation", initialized);
  };

  const pauseLearning: OpenClawNativeOperationHandler = async (payload) => {
    const activation = readPackageActivationAuthority(options.db, options.homeId);
    const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
    const worker = readWorkerLeaseByHome(options.db, options.homeId);
    if (!activation || !supervisor || !worker) {
      return {
        ok: false,
        operation: "pause_learning",
        code: "runtime_authority_not_current",
        result: null
      };
    }
    return resultFromControl(
      "pause_learning",
      control.pauseLearning({
        controlRequestId: controlRequestId(payload),
        expectedProjectionRevision: requiredRevision(
          payload,
          "expected_projection_revision"
        ),
        expectedGatewayInstanceId: options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch: supervisor.lease_epoch,
        expectedWorkerOwnerId: worker.owner_id,
        expectedWorkerFencingToken: worker.fencing_token,
        writer: {
          kind: "supervisor",
          supervisor_owner_id: supervisor.owner_id,
          supervisor_lease_epoch: supervisor.lease_epoch,
          supervisor_lease_state_revision: supervisor.lease_state_revision
        }
      })
    );
  };

  const resumeLearning: OpenClawNativeOperationHandler = async (payload) => {
    const authority = currentWriter();
    const resumed = control.resumeLearning({
      controlRequestId: controlRequestId(payload),
      expectedProjectionRevision: requiredRevision(
        payload,
        "expected_projection_revision"
      ),
      expectedGatewayInstanceId: options.gatewayInstanceId,
      expectedSupervisorLeaseEpoch: authority.expectedSupervisorLeaseEpoch,
      authorizationId: authorizationId(payload),
      expectedLaunchRevision: requiredRevision(
        payload,
        "expected_launch_revision"
      ),
      writer: authority.writer
    });
    if (
      resumed.record.request_state === "completed" &&
      resumed.record.result_code === "learning_resume_restart_authorized"
    ) {
      const lifecycle = await options.initializeOrResume();
      if (!lifecycle.ok) {
        return {
          ok: false,
          operation: "resume_learning",
          code: lifecycle.code,
          result: lifecycle.detail ?? null
        };
      }
    }
    return resultFromControl("resume_learning", resumed);
  };

  const prepareGeneration: OpenClawNativeOperationHandler = async (payload) => {
    const target = requiredString(payload, "package_generation_id");
    const descriptor = options.resolvePackageGeneration(target);
    if (!descriptor) {
      return {
        ok: false,
        operation: "prepare_package_generation",
        code: "package_generation_not_resolvable",
        result: { package_generation_id: target }
      };
    }
    const authority = currentWriter();
    return resultFromControl(
      "prepare_package_generation",
      control.preparePackageGeneration({
        controlRequestId: controlRequestId(payload),
        expectedProjectionRevision: requiredRevision(
          payload,
          "expected_projection_revision"
        ),
        expectedGatewayInstanceId: options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch:
          authority.expectedSupervisorLeaseEpoch,
        authorizationId: authorizationId(payload),
        expectedLaunchRevision: requiredRevision(
          payload,
          "expected_launch_revision"
        ),
        packageClosure: descriptor.packageClosure,
        writer: authority.writer
      })
    );
  };

  const prepareRollback: OpenClawNativeOperationHandler = async (payload) => {
    const authority = currentWriter();
    return resultFromControl(
      "prepare_package_rollback",
      control.prepareRollback({
        controlRequestId: controlRequestId(payload),
        expectedProjectionRevision: requiredRevision(
          payload,
          "expected_projection_revision"
        ),
        expectedGatewayInstanceId: options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch:
          authority.expectedSupervisorLeaseEpoch,
        authorizationId: authorizationId(payload),
        expectedLaunchRevision: requiredRevision(
          payload,
          "expected_launch_revision"
        ),
        writer: authority.writer
      })
    );
  };

  const retryPackage: OpenClawNativeOperationHandler = async (payload) => {
    const authority = currentWriter();
    return resultFromControl(
      "retry_package_activation",
      control.retryPackageActivation({
        controlRequestId: controlRequestId(payload),
        expectedProjectionRevision: requiredRevision(
          payload,
          "expected_projection_revision"
        ),
        expectedGatewayInstanceId: options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch:
          authority.expectedSupervisorLeaseEpoch,
        authorizationId: authorizationId(payload),
        expectedLaunchRevision: requiredRevision(
          payload,
          "expected_launch_revision"
        ),
        writer: authority.writer
      })
    );
  };

  const cancelTransition: OpenClawNativeOperationHandler = async (payload) => {
    const authority = currentWriter();
    const activation = readPackageActivationAuthority(options.db, options.homeId);
    const needsActiveRestart = Boolean(
      authority.writer.kind === "gateway_service_controller" &&
      activation &&
      activation.blocked_boundary !== "pre_identity_initial" &&
      !activation.production_activation_handshake_id
    );
    return resultFromControl(
      "cancel_package_transition",
      control.cancelPackageTransition({
        controlRequestId: controlRequestId(payload),
        expectedProjectionRevision: requiredRevision(
          payload,
          "expected_projection_revision"
        ),
        expectedGatewayInstanceId: options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch:
          authority.expectedSupervisorLeaseEpoch,
        authorizationId: needsActiveRestart
          ? authorizationId(payload)
          : undefined,
        expectedLaunchRevision: needsActiveRestart
          ? requiredRevision(payload, "expected_launch_revision")
          : undefined,
        writer: authority.writer
      })
    );
  };

  const retryProduction: OpenClawNativeOperationHandler = async (payload) => {
    const authority = currentWriter();
    const gatewayWriter = authority.writer.kind === "gateway_service_controller";
    return resultFromControl(
      "retry_production_activation",
      control.retryProductionActivation({
        controlRequestId: controlRequestId(payload),
        expectedProjectionRevision: requiredRevision(
          payload,
          "expected_projection_revision"
        ),
        expectedGatewayInstanceId: options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch:
          authority.expectedSupervisorLeaseEpoch,
        authorizationId: gatewayWriter ? authorizationId(payload) : undefined,
        expectedLaunchRevision: gatewayWriter
          ? requiredRevision(payload, "expected_launch_revision")
          : undefined,
        writer: authority.writer
      })
    );
  };

  const requestDrain: OpenClawNativeOperationHandler = async (payload) => {
    const activation = readPackageActivationAuthority(options.db, options.homeId);
    const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
    const worker = readWorkerLeaseByHome(options.db, options.homeId);
    if (!activation || !supervisor || !worker) {
      return {
        ok: false,
        operation: "request_drain",
        code: "runtime_authority_not_current",
        result: null
      };
    }
    return resultFromControl(
      "request_drain",
      control.requestDrain({
        controlRequestId: controlRequestId(payload),
        expectedProjectionRevision: requiredRevision(
          payload,
          "expected_projection_revision"
        ),
        expectedGatewayInstanceId: options.gatewayInstanceId,
        expectedSupervisorLeaseEpoch: supervisor.lease_epoch,
        expectedWorkerOwnerId: worker.owner_id,
        expectedWorkerFencingToken: worker.fencing_token,
        writer: {
          kind: "supervisor",
          supervisor_owner_id: supervisor.owner_id,
          supervisor_lease_epoch: supervisor.lease_epoch,
          supervisor_lease_state_revision: supervisor.lease_state_revision
        }
      })
    );
  };

  const handlers: Partial<Record<OpenClawNativeOperationResult["operation"], OpenClawNativeOperationHandler>> = {
    prepare_package_activation: prepareInitialization,
    pause_learning: pauseLearning,
    resume_learning: resumeLearning,
    initialize_package_activation: initialize,
    prepare_package_generation: prepareGeneration,
    prepare_package_rollback: prepareRollback,
    retry_package_activation: retryPackage,
    cancel_package_transition: cancelTransition,
    retry_production_activation: retryProduction,
    request_drain: requestDrain
  };
  if (options.retryBlockedSystemWork) {
    handlers.retry_blocked_system_work = options.retryBlockedSystemWork;
  }
  return handlers;
};

export const deriveCurrentRuntimeNativeRevisions = (options: {
  db: DatabaseSync;
  homeId: string;
}): {
  projection_revision: number;
  launch_revision: number;
} => ({
  projection_revision:
    readPackageActivationAuthority(options.db, options.homeId)
      ?.activation_revision ?? 0,
  launch_revision:
    readSupervisorLaunchState(options.db, options.homeId)?.launch_revision ?? 0
});
