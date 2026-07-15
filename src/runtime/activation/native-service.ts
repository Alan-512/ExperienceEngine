import {
  OPENCLAW_NATIVE_OPERATIONS,
  type OpenClawNativeOperation
} from "./constants.js";

export type OpenClawNativeOperationResult = {
  ok: boolean;
  operation: OpenClawNativeOperation;
  code: string;
  result: unknown;
};

export type OpenClawNativeOperationHandler = (
  payload: Record<string, unknown>
) => OpenClawNativeOperationResult | Promise<OpenClawNativeOperationResult>;

export type OpenClawRuntimeLifecycleResult = {
  ok: boolean;
  code: string;
  detail?: unknown;
};

export type OpenClawRuntimeLifecycleContext = {
  config?: Record<string, unknown>;
  workspaceDir?: string;
  stateDir?: string;
  logger?: {
    debug?: (message: string, meta?: unknown) => void;
    info?: (message: string, meta?: unknown) => void;
    warn?: (message: string, meta?: unknown) => void;
    error?: (message: string, meta?: unknown) => void;
  };
};

export type OpenClawRuntimeLifecycle = {
  start: (
    context?: OpenClawRuntimeLifecycleContext
  ) => OpenClawRuntimeLifecycleResult | Promise<OpenClawRuntimeLifecycleResult>;
  stop: (
    context?: OpenClawRuntimeLifecycleContext
  ) => OpenClawRuntimeLifecycleResult | Promise<OpenClawRuntimeLifecycleResult>;
};

const operationSet = new Set<string>(OPENCLAW_NATIVE_OPERATIONS);
const OPERATION_PREFIX = "experienceengine.runtime.";

const normalizeOperation = (value: string): OpenClawNativeOperation | null => {
  const normalized = value.startsWith(OPERATION_PREFIX)
    ? value.slice(OPERATION_PREFIX.length)
    : value;
  return operationSet.has(normalized)
    ? normalized as OpenClawNativeOperation
    : null;
};

const errorCode = (error: unknown): string => {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "EE_NATIVE_OPERATION_FAILED";
};

const errorResult = (
  operation: OpenClawNativeOperation,
  error: unknown
): OpenClawNativeOperationResult => ({
  ok: false,
  operation,
  code: errorCode(error),
  result: {
    message: error instanceof Error ? error.message : String(error)
  }
});

export class OpenClawRuntimeNativeService {
  constructor(private readonly options: {
    handlers?: Partial<Record<OpenClawNativeOperation, OpenClawNativeOperationHandler>>;
    lifecycle?: OpenClawRuntimeLifecycle;
  } = {}) {}

  async execute(input: {
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<OpenClawNativeOperationResult> {
    const operation = normalizeOperation(input.operation);
    if (!operation) {
      return {
        ok: false,
        operation: "status",
        code: "EE_NATIVE_OPERATION_UNKNOWN",
        result: { requested_operation: input.operation }
      };
    }
    const handler = this.options.handlers?.[operation];
    if (!handler) {
      return {
        ok: false,
        operation,
        code: "EE_NATIVE_OPERATION_UNAVAILABLE",
        result: null
      };
    }
    try {
      const result = await handler(input.payload ?? {});
      return result.operation === operation
        ? result
        : {
          ok: false,
          operation,
          code: "EE_NATIVE_OPERATION_RESULT_MISMATCH",
          result: { returned_operation: result.operation }
        };
    } catch (error) {
      return errorResult(operation, error);
    }
  }

  async start(
    context?: OpenClawRuntimeLifecycleContext
  ): Promise<OpenClawRuntimeLifecycleResult> {
    if (!this.options.lifecycle) {
      return { ok: false, code: "runtime_lifecycle_unavailable" };
    }
    try {
      return await this.options.lifecycle.start(context);
    } catch (error) {
      return {
        ok: false,
        code: errorCode(error),
        detail: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async stop(
    context?: OpenClawRuntimeLifecycleContext
  ): Promise<OpenClawRuntimeLifecycleResult> {
    if (!this.options.lifecycle) {
      return { ok: false, code: "runtime_lifecycle_unavailable" };
    }
    try {
      return await this.options.lifecycle.stop(context);
    } catch (error) {
      return {
        ok: false,
        code: errorCode(error),
        detail: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}

export type DeferredOpenClawRuntimeBinding = {
  service: OpenClawRuntimeNativeService;
  dispose?: () => void | Promise<void>;
};

export type DeferredOpenClawRuntimeBinder = (
  context?: OpenClawRuntimeLifecycleContext
) => DeferredOpenClawRuntimeBinding | Promise<DeferredOpenClawRuntimeBinding>;

export class DeferredOpenClawRuntimeNativeService extends OpenClawRuntimeNativeService {
  private binding: DeferredOpenClawRuntimeBinding | null = null;
  private bindingPromise: Promise<DeferredOpenClawRuntimeBinding> | null = null;

  constructor(
    private readonly binder: DeferredOpenClawRuntimeBinder,
    private readonly unavailableService: OpenClawRuntimeNativeService
  ) {
    super();
  }

  private async resolveBinding(
    context?: OpenClawRuntimeLifecycleContext
  ): Promise<DeferredOpenClawRuntimeBinding> {
    if (this.binding) {
      return this.binding;
    }
    if (!this.bindingPromise) {
      this.bindingPromise = Promise.resolve(this.binder(context)).then((binding) => {
        this.binding = binding;
        return binding;
      }).finally(() => {
        this.bindingPromise = null;
      });
    }
    return this.bindingPromise;
  }

  override async execute(input: {
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<OpenClawNativeOperationResult> {
    if (this.binding) {
      return this.binding.service.execute(input);
    }
    if (this.bindingPromise) {
      try {
        const binding = await this.bindingPromise;
        return binding.service.execute(input);
      } catch {
        return this.unavailableService.execute(input);
      }
    }
    return this.unavailableService.execute(input);
  }

  override async start(
    context?: OpenClawRuntimeLifecycleContext
  ): Promise<OpenClawRuntimeLifecycleResult> {
    try {
      const binding = await this.resolveBinding(context);
      return binding.service.start(context);
    } catch (error) {
      return {
        ok: false,
        code: errorCode(error),
        detail: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  override async stop(
    context?: OpenClawRuntimeLifecycleContext
  ): Promise<OpenClawRuntimeLifecycleResult> {
    if (!this.binding) {
      return this.unavailableService.stop(context);
    }
    const binding = this.binding;
    const result = await binding.service.stop(context);
    await binding.dispose?.();
    this.binding = null;
    return result;
  }
}

export const OPENCLAW_RUNTIME_NATIVE_SERVICE_CONTRACT = Object.freeze({
  service_id: "experienceengine-runtime",
  operation_prefix: OPERATION_PREFIX,
  operations: OPENCLAW_NATIVE_OPERATIONS,
  missing_handler_behavior: "fail_closed",
  unknown_operation_behavior: "stable_rejection",
  deferred_binding_reuses_same_service_object: true
});
