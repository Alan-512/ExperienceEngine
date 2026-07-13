import type { DatabaseSync } from "node:sqlite";
import type {
  OpenClawNativeOperation,
  READ_ONLY_OPENCLAW_NATIVE_OPERATIONS
} from "./constants.js";
import {
  OpenClawRuntimeNativeService,
  type OpenClawNativeOperationHandler,
  type OpenClawNativeOperationResult
} from "./native-service.js";
import type { RuntimePackageLocalServiceController } from "./service-controller.js";
import {
  createRuntimeNativeControlHandlers
} from "./native-control-handlers.js";
import {
  createRuntimeNativeBlockedSystemWorkHandler
} from "./queue-control.js";
import type {
  LearningQueueMaintenanceAuthorityProvider
} from "../learning-queue/types.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import type {
  RuntimePackageGenerationResolver
} from "./service-controller.js";

export type RuntimeNativeStatusProvider = () => unknown | Promise<unknown>;

const result = (
  operation: OpenClawNativeOperation,
  code: string,
  value: unknown
): OpenClawNativeOperationResult => ({
  ok: true,
  operation,
  code,
  result: value
});

const repairProjection = (value: unknown): unknown => {
  if (!value || typeof value !== "object") {
    return { next_action: "Inspect the current runtime status projection." };
  }
  const projection = value as Record<string, unknown>;
  return {
    next_action: typeof projection.next_action === "string"
      ? projection.next_action
      : "Inspect the current runtime status projection.",
    warning: typeof projection.warning === "string"
      ? projection.warning
      : null,
    package_activation_state: projection.package_activation_state ?? null,
    blocked_boundary: projection.blocked_boundary ?? "none"
  };
};

export const createPackageLocalOpenClawRuntimeNativeService = (options: {
  controller: RuntimePackageLocalServiceController;
  statusProvider: RuntimeNativeStatusProvider;
  controlHandlers?: Partial<Record<OpenClawNativeOperation, OpenClawNativeOperationHandler>>;
  pauseLearning?: OpenClawNativeOperationHandler;
  resumeLearning?: OpenClawNativeOperationHandler;
  retryBlockedSystemWork?: OpenClawNativeOperationHandler;
}): OpenClawRuntimeNativeService => {
  const status: OpenClawNativeOperationHandler = async () => result(
    "status",
    "runtime_status_projected",
    await options.statusProvider()
  );
  const repair: OpenClawNativeOperationHandler = async () => result(
    "repair_explanation",
    "runtime_repair_explained",
    repairProjection(await options.statusProvider())
  );
  const handlers: Partial<Record<OpenClawNativeOperation, OpenClawNativeOperationHandler>> = {
    status,
    repair_explanation: repair,
    ...options.controlHandlers
  };
  if (options.pauseLearning) {
    handlers.pause_learning = options.pauseLearning;
  }
  if (options.resumeLearning) {
    handlers.resume_learning = options.resumeLearning;
  }
  if (options.retryBlockedSystemWork) {
    handlers.retry_blocked_system_work = options.retryBlockedSystemWork;
  }
  return new OpenClawRuntimeNativeService({
    handlers,
    lifecycle: {
      start: () => options.controller.start(),
      stop: () => options.controller.stop()
    }
  });
};

export const createProductionOpenClawRuntimeService = (options: {
  db: DatabaseSync;
  homeId: string;
  gatewayInstanceId: string;
  gatewayProcessStartToken: string;
  currentPluginPackageGenerationId: string;
  controller: RuntimePackageLocalServiceController;
  statusProvider: RuntimeNativeStatusProvider;
  resolvePackageGeneration: RuntimePackageGenerationResolver;
  maintenanceAuthorityProvider: LearningQueueMaintenanceAuthorityProvider;
  initializeOrResume: () => {
    ok: boolean;
    code: string;
    detail?: unknown;
  } | Promise<{
    ok: boolean;
    code: string;
    detail?: unknown;
  }>;
  idFactory?: () => string;
  clock?: RuntimeProcessAuthorityClock;
}): OpenClawRuntimeNativeService => {
  const controlHandlers = createRuntimeNativeControlHandlers({
    db: options.db,
    homeId: options.homeId,
    gatewayInstanceId: options.gatewayInstanceId,
    gatewayProcessStartToken: options.gatewayProcessStartToken,
    currentPluginPackageGenerationId:
      options.currentPluginPackageGenerationId,
    resolvePackageGeneration: options.resolvePackageGeneration,
    initializeOrResume: options.initializeOrResume,
    idFactory: options.idFactory,
    clock: options.clock
  });
  return createPackageLocalOpenClawRuntimeNativeService({
    controller: options.controller,
    statusProvider: options.statusProvider,
    controlHandlers,
    retryBlockedSystemWork: createRuntimeNativeBlockedSystemWorkHandler({
      db: options.db,
      homeId: options.homeId,
      gatewayInstanceId: options.gatewayInstanceId,
      gatewayProcessStartToken: options.gatewayProcessStartToken,
      currentPluginPackageGenerationId:
        options.currentPluginPackageGenerationId,
      maintenanceAuthorityProvider: options.maintenanceAuthorityProvider,
      idFactory: options.idFactory,
      clock: options.clock
    })
  });
};

export const createUnavailableOpenClawRuntimeNativeService = (options: {
  reason: string;
  interactionActive: boolean;
}): OpenClawRuntimeNativeService => {
  const projection = Object.freeze({
    interaction_active: options.interactionActive,
    learning_runtime_active: false,
    production_learning_ready: false,
    package_activation_state: "unavailable",
    blocked_boundary: "none",
    next_action: "Bind verified package-local production runtime dependencies.",
    warning: options.reason
  });
  return new OpenClawRuntimeNativeService({
    handlers: {
      status: async () => result(
        "status",
        "runtime_service_unavailable",
        projection
      ),
      repair_explanation: async () => result(
        "repair_explanation",
        "runtime_service_unavailable",
        repairProjection(projection)
      )
    },
    lifecycle: {
      start: () => ({
        ok: false,
        code: "runtime_service_unavailable",
        detail: { reason: options.reason }
      }),
      stop: () => ({
        ok: true,
        code: "runtime_already_inactive",
        detail: { reason: options.reason }
      })
    }
  });
};

export const PACKAGE_LOCAL_PRODUCTION_SERVICE_CONTRACT = Object.freeze({
  gateway_executes_semantic_work: false,
  lifecycle_owner: "package_local_supervisor",
  read_only_operations: Object.freeze([
    "status",
    "repair_explanation"
  ] as const satisfies typeof READ_ONLY_OPENCLAW_NATIVE_OPERATIONS),
  unavailable_defaults_fail_closed: true
});

export const PRODUCTION_NATIVE_OPERATION_BINDINGS = Object.freeze({
  status: "status_projection",
  pause_learning: "package_control_idempotency",
  resume_learning: "package_control_idempotency",
  retry_blocked_system_work: "s5_queue_control_idempotency",
  initialize_package_activation: "package_control_idempotency",
  prepare_package_generation: "package_control_idempotency",
  prepare_package_rollback: "package_control_idempotency",
  retry_package_activation: "package_control_idempotency",
  cancel_package_transition: "package_control_idempotency",
  retry_production_activation: "package_control_idempotency",
  request_drain: "package_control_idempotency",
  repair_explanation: "status_projection"
} as const satisfies Record<OpenClawNativeOperation, string>);
