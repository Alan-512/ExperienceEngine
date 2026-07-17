import {
  OPENCLAW_NATIVE_OPERATIONS,
  type OpenClawNativeOperation
} from "./constants.js";
import type {
  OpenClawNativeOperationResult
} from "./native-service.js";

export const OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD =
  "experienceengine.runtime.command" as const;
export const OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT =
  "experienceengine-native-command-gateway-v1" as const;
export const OPENCLAW_NATIVE_COMMAND_PLUGIN_ID = "experienceengine" as const;
export const OPENCLAW_NATIVE_COMMAND_PREFIX = "experienceengine_" as const;

export type OpenClawNativeCommandGatewayRequest = {
  contract: typeof OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT;
  probe_id: string;
  plugin_id: typeof OPENCLAW_NATIVE_COMMAND_PLUGIN_ID;
  command_name: string;
  operation: OpenClawNativeOperation;
  payload: Record<string, unknown>;
};

export type OpenClawNativeCommandGatewayResponse = {
  contract: typeof OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT;
  probe_id: string;
  plugin_id: typeof OPENCLAW_NATIVE_COMMAND_PLUGIN_ID;
  command_name: string;
  operation: OpenClawNativeOperation;
  runtime_json: OpenClawNativeOperationResult;
};

const operationSet = new Set<string>(OPENCLAW_NATIVE_OPERATIONS);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const hasExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean => {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
};

const commandNameForOperation = (operation: OpenClawNativeOperation): string =>
  `${OPENCLAW_NATIVE_COMMAND_PREFIX}${operation}`;

const assertProbeId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 128
  ) {
    throw new Error("Native command probe_id must be a non-empty bounded string.");
  }
  return value;
};

const assertOperation = (value: unknown): OpenClawNativeOperation => {
  if (typeof value !== "string" || !operationSet.has(value)) {
    throw new Error("Native command operation is not recognized.");
  }
  return value as OpenClawNativeOperation;
};

export const createOpenClawNativeCommandGatewayRequest = (options: {
  probeId: string;
  operation: OpenClawNativeOperation;
  payload?: Record<string, unknown>;
}): OpenClawNativeCommandGatewayRequest => ({
  contract: OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT,
  probe_id: assertProbeId(options.probeId),
  plugin_id: OPENCLAW_NATIVE_COMMAND_PLUGIN_ID,
  command_name: commandNameForOperation(options.operation),
  operation: options.operation,
  payload: options.payload ?? {}
});

export const parseOpenClawNativeCommandGatewayRequest = (
  value: unknown
): OpenClawNativeCommandGatewayRequest => {
  const record = asRecord(value);
  if (!record || !hasExactKeys(record, [
    "contract",
    "probe_id",
    "plugin_id",
    "command_name",
    "operation",
    "payload"
  ])) {
    throw new Error("Native command Gateway request envelope is invalid.");
  }
  const operation = assertOperation(record.operation);
  const payload = asRecord(record.payload);
  if (
    record.contract !== OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT ||
    record.plugin_id !== OPENCLAW_NATIVE_COMMAND_PLUGIN_ID ||
    record.command_name !== commandNameForOperation(operation) ||
    !payload
  ) {
    throw new Error("Native command Gateway request identity is invalid.");
  }
  return {
    contract: OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT,
    probe_id: assertProbeId(record.probe_id),
    plugin_id: OPENCLAW_NATIVE_COMMAND_PLUGIN_ID,
    command_name: record.command_name,
    operation,
    payload
  };
};

export const createOpenClawNativeCommandGatewayResponse = (options: {
  request: OpenClawNativeCommandGatewayRequest;
  runtimeResult: OpenClawNativeOperationResult;
}): OpenClawNativeCommandGatewayResponse => ({
  contract: OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT,
  probe_id: options.request.probe_id,
  plugin_id: OPENCLAW_NATIVE_COMMAND_PLUGIN_ID,
  command_name: options.request.command_name,
  operation: options.request.operation,
  runtime_json: options.runtimeResult
});

export const parseOpenClawNativeCommandGatewayResponse = (options: {
  value: unknown;
  expectedRequest: OpenClawNativeCommandGatewayRequest;
}): OpenClawNativeCommandGatewayResponse => {
  const record = asRecord(options.value);
  if (!record || !hasExactKeys(record, [
    "contract",
    "probe_id",
    "plugin_id",
    "command_name",
    "operation",
    "runtime_json"
  ])) {
    throw new Error("Native command Gateway response envelope is invalid.");
  }
  const runtimeJson = asRecord(record.runtime_json);
  if (!runtimeJson || !hasExactKeys(runtimeJson, [
    "ok",
    "operation",
    "code",
    "result"
  ])) {
    throw new Error("Native command Gateway response is missing exact runtime JSON.");
  }
  if (
    record.contract !== OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT ||
    record.probe_id !== options.expectedRequest.probe_id ||
    record.plugin_id !== OPENCLAW_NATIVE_COMMAND_PLUGIN_ID ||
    record.command_name !== options.expectedRequest.command_name ||
    record.operation !== options.expectedRequest.operation ||
    typeof runtimeJson.ok !== "boolean" ||
    runtimeJson.operation !== options.expectedRequest.operation ||
    typeof runtimeJson.code !== "string" ||
    runtimeJson.code.trim().length === 0
  ) {
    throw new Error("Native command Gateway response identity is invalid or stale.");
  }
  return {
    contract: OPENCLAW_NATIVE_COMMAND_GATEWAY_CONTRACT,
    probe_id: options.expectedRequest.probe_id,
    plugin_id: OPENCLAW_NATIVE_COMMAND_PLUGIN_ID,
    command_name: options.expectedRequest.command_name,
    operation: options.expectedRequest.operation,
    runtime_json: {
      ok: runtimeJson.ok,
      operation: options.expectedRequest.operation,
      code: runtimeJson.code,
      result: runtimeJson.result
    }
  };
};
