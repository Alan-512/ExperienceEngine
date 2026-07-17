import { describe, expect, it } from "vitest";
import {
  createOpenClawNativeCommandGatewayRequest,
  createOpenClawNativeCommandGatewayResponse,
  parseOpenClawNativeCommandGatewayResponse
} from "../../src/runtime/activation/openclaw-native-command-gateway.js";

const request = createOpenClawNativeCommandGatewayRequest({
  probeId: "probe-current-gateway",
  operation: "status"
});

const validResponse = createOpenClawNativeCommandGatewayResponse({
  request,
  runtimeResult: {
    ok: true,
    operation: "status",
    code: "runtime_status",
    result: { learning_runtime_active: true }
  }
});

describe("OpenClaw native command Gateway probe", () => {
  it("accepts only the exact current plugin runtime response", () => {
    expect(parseOpenClawNativeCommandGatewayResponse({
      value: validResponse,
      expectedRequest: request
    }).runtime_json).toEqual({
      ok: true,
      operation: "status",
      code: "runtime_status",
      result: { learning_runtime_active: true }
    });
  });

  it("rejects a natural-language model response", () => {
    expect(() => parseOpenClawNativeCommandGatewayResponse({
      value: "ExperienceEngine is active and healthy.",
      expectedRequest: request
    })).toThrow(/response envelope is invalid/u);
  });

  it("rejects a wrong command envelope", () => {
    expect(() => parseOpenClawNativeCommandGatewayResponse({
      value: {
        ...validResponse,
        unexpected: true
      },
      expectedRequest: request
    })).toThrow(/response envelope is invalid/u);
  });

  it("rejects the wrong plugin command identity", () => {
    expect(() => parseOpenClawNativeCommandGatewayResponse({
      value: {
        ...validResponse,
        command_name: "experienceengine_repair_explanation"
      },
      expectedRequest: request
    })).toThrow(/identity is invalid/u);
  });

  it("rejects a response with missing runtime JSON", () => {
    const { runtime_json: _runtimeJson, ...withoutRuntimeJson } = validResponse;
    expect(() => parseOpenClawNativeCommandGatewayResponse({
      value: withoutRuntimeJson,
      expectedRequest: request
    })).toThrow(/response envelope is invalid/u);
  });

  it("rejects a stale Gateway response bound to an earlier probe", () => {
    expect(() => parseOpenClawNativeCommandGatewayResponse({
      value: {
        ...validResponse,
        probe_id: "probe-stale-gateway"
      },
      expectedRequest: request
    })).toThrow(/invalid or stale/u);
  });
});
