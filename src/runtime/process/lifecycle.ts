import {
  ACTIVATION_ONLY_WORKER_OPERATIONS,
  PACKAGE_ACTIVATION_TIMING_POLICY,
  PRODUCTION_SEMANTIC_WORKER_OPERATIONS,
  SUPERVISOR_RUNTIME_POLICY,
  type ActivationOnlyWorkerOperation
} from "./constants.js";
import { toProcessAuthorityEpochMs } from "./clock.js";
import { RuntimeProcessAuthorityError } from "./errors.js";
import type {
  ForceTerminationIdentity,
  ProcessIdentity,
  WorkerOperation
} from "./types.js";

const activationOnlyOperations = new Set<string>(ACTIVATION_ONLY_WORKER_OPERATIONS);
const productionSemanticOperations = new Set<string>(PRODUCTION_SEMANTIC_WORKER_OPERATIONS);

export const computeBoundedRestartDecision = (options: {
  countInWindow: number;
  windowStartedAt: string | null;
  observedAt: string;
  kind: "supervisor_launch" | "worker_restart";
}): {
  allowed: boolean;
  nextCountInWindow: number;
  windowStartedAt: string;
  nextLaunchAt: string | null;
  blockedReason: "restart_budget_exhausted" | null;
} => {
  const observedMs = toProcessAuthorityEpochMs(options.observedAt);
  const windowStartMs = options.windowStartedAt
    ? toProcessAuthorityEpochMs(options.windowStartedAt)
    : Number.NaN;
  const reset = !Number.isFinite(windowStartMs) ||
    observedMs - windowStartMs >= SUPERVISOR_RUNTIME_POLICY.restart_window_ms;
  const count = reset ? 0 : options.countInWindow;
  const maximum = options.kind === "supervisor_launch"
    ? SUPERVISOR_RUNTIME_POLICY.max_supervisor_launches_per_window
    : SUPERVISOR_RUNTIME_POLICY.max_worker_restarts_per_window;

  if (count >= maximum) {
    return {
      allowed: false,
      nextCountInWindow: count,
      windowStartedAt: reset ? options.observedAt : options.windowStartedAt!,
      nextLaunchAt: null,
      blockedReason: "restart_budget_exhausted"
    };
  }

  const nextCount = count + 1;
  const backoffIndex = Math.min(
    Math.max(nextCount - 1, 0),
    SUPERVISOR_RUNTIME_POLICY.restart_backoff_ms.length - 1
  );
  const backoffMs = SUPERVISOR_RUNTIME_POLICY.restart_backoff_ms[backoffIndex];
  return {
    allowed: true,
    nextCountInWindow: nextCount,
    windowStartedAt: reset ? options.observedAt : options.windowStartedAt!,
    nextLaunchAt: new Date(observedMs + backoffMs).toISOString(),
    blockedReason: null
  };
};

export const computeLaunchAuthorizationExpiry = (options: {
  issuedAt: string;
  activationDeadlineAt?: string | null;
}): string => {
  const issuedMs = toProcessAuthorityEpochMs(options.issuedAt);
  const normalExpiry = issuedMs + PACKAGE_ACTIVATION_TIMING_POLICY.launch_authorization_ttl_ms;
  const deadlineMs = options.activationDeadlineAt
    ? toProcessAuthorityEpochMs(options.activationDeadlineAt)
    : Number.POSITIVE_INFINITY;
  return new Date(Math.min(normalExpiry, deadlineMs)).toISOString();
};

export const computeLaunchAttemptExpiry = (options: {
  reservedAt: string;
  authorizationExpiresAt: string;
}): string => new Date(Math.min(
  toProcessAuthorityEpochMs(options.reservedAt) +
    PACKAGE_ACTIVATION_TIMING_POLICY.launch_attempt_timeout_ms,
  toProcessAuthorityEpochMs(options.authorizationExpiresAt)
)).toISOString();

export const computeOrphanExitDeadline = (observedAt: string): string =>
  new Date(
    toProcessAuthorityEpochMs(observedAt) + SUPERVISOR_RUNTIME_POLICY.orphan_exit_timeout_ms
  ).toISOString();

export const computeGracefulDrainDeadline = (observedAt: string): string =>
  new Date(
    toProcessAuthorityEpochMs(observedAt) + SUPERVISOR_RUNTIME_POLICY.graceful_drain_timeout_ms
  ).toISOString();

export const evaluateWorkerOperation = (options: {
  workerMode: "production" | "activation_only";
  operation: WorkerOperation;
  productionActivationAuthorized: boolean;
}): {
  allowed: boolean;
  effectiveMode: "production" | "activation_only";
  reason:
    | "activation_only_allowlist"
    | "production_activation_required"
    | "production_operation_authorized"
    | "operation_not_allowlisted";
} => {
  if (activationOnlyOperations.has(options.operation)) {
    return {
      allowed: true,
      effectiveMode: options.productionActivationAuthorized && options.workerMode === "production"
        ? "production"
        : "activation_only",
      reason: "activation_only_allowlist"
    };
  }
  if (!productionSemanticOperations.has(options.operation)) {
    return {
      allowed: false,
      effectiveMode: "activation_only",
      reason: "operation_not_allowlisted"
    };
  }
  if (options.workerMode !== "production" || !options.productionActivationAuthorized) {
    return {
      allowed: false,
      effectiveMode: "activation_only",
      reason: "production_activation_required"
    };
  }
  return {
    allowed: true,
    effectiveMode: "production",
    reason: "production_operation_authorized"
  };
};

export const assertActivationOnlyWorkerOperation = (
  operation: WorkerOperation
): asserts operation is ActivationOnlyWorkerOperation => {
  if (!activationOnlyOperations.has(operation)) {
    throw new RuntimeProcessAuthorityError(
      "EE_WORKER_OPERATION_FORBIDDEN",
      `Worker operation ${operation} is not in the activation-only allowlist.`
    );
  }
};

const processIdentityMatches = (
  expected: ProcessIdentity,
  observed: ProcessIdentity
): boolean => expected.owner_id === observed.owner_id &&
  expected.process_id === observed.process_id &&
  expected.process_start_token === observed.process_start_token &&
  expected.package_generation_id === observed.package_generation_id;

export const mayForceTerminateStaleProcess = (options: {
  storedAuthority: ForceTerminationIdentity;
  observedProcess: ForceTerminationIdentity;
}): boolean => processIdentityMatches(options.storedAuthority, options.observedProcess) &&
  options.storedAuthority.supervisor_lease_epoch ===
    options.observedProcess.supervisor_lease_epoch &&
  options.storedAuthority.worker_fencing_token ===
    options.observedProcess.worker_fencing_token;

export const assertSafeForceTerminationIdentity = (options: {
  storedAuthority: ForceTerminationIdentity;
  observedProcess: ForceTerminationIdentity;
}): void => {
  if (!mayForceTerminateStaleProcess(options)) {
    throw new RuntimeProcessAuthorityError(
      "EE_FORCE_TERMINATION_IDENTITY_INCOMPLETE",
      "Force termination requires exact owner, PID, process-start token, package generation, supervisor epoch, and worker fence."
    );
  }
};
