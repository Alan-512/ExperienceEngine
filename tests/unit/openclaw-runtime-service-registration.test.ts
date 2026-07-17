import { describe, expect, it, vi } from "vitest";
import {
  createExperiencePlugin
} from "../../src/plugin/openclaw-plugin.js";
import {
  OpenClawRuntimeNativeService
} from "../../src/runtime/activation/native-service.js";
import { OPENCLAW_NATIVE_OPERATIONS } from "../../src/runtime/activation/constants.js";
import {
  OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD,
  createOpenClawNativeCommandGatewayRequest
} from "../../src/runtime/activation/openclaw-native-command-gateway.js";

describe("OpenClaw runtime service registration", () => {
  it("registers one package-local lifecycle service and delegates start and stop", async () => {
    const start = vi.fn(() => ({ ok: true, code: "started" }));
    const stop = vi.fn(() => ({ ok: true, code: "stopped" }));
    const nativeService = new OpenClawRuntimeNativeService({
      lifecycle: { start, stop }
    });
    const registerService = vi.fn();
    createExperiencePlugin({}, undefined, {}, nativeService).register({
      registerService,
      on: vi.fn()
    });

    expect(registerService).toHaveBeenCalledOnce();
    const registration = registerService.mock.calls[0][0] as {
      id: string;
      start: (context?: { stateDir?: string }) => Promise<void>;
      stop: (context?: { stateDir?: string }) => Promise<void>;
    };
    expect(registration.id).toBe("experienceengine-runtime");
    const context = { stateDir: "openclaw-state-test" };
    await registration.start(context);
    await registration.stop(context);
    expect(start).toHaveBeenCalledWith(context);
    expect(stop).toHaveBeenCalledWith(context);
  });

  it("registers a truthful inactive service by default", async () => {
    const warn = vi.fn();
    const registerService = vi.fn();
    createExperiencePlugin().register({
      registerService,
      logger: { warn },
      on: vi.fn()
    });
    const registration = registerService.mock.calls[0][0] as {
      start: () => Promise<void>;
    };
    await registration.start();
    expect(warn).toHaveBeenCalledWith(
      "experienceengine.runtime_service_inactive code=runtime_service_unavailable",
      expect.objectContaining({
        ok: false,
        code: "runtime_service_unavailable"
      })
    );
  });

  it("registers the exact native operation command set and delegates each command to the same service", async () => {
    const execute = vi.fn(async (input: {
      operation: string;
      payload?: Record<string, unknown>;
    }) => ({
      ok: true,
      operation: input.operation as typeof OPENCLAW_NATIVE_OPERATIONS[number],
      code: "delegated",
      result: input.payload ?? {}
    }));
    const nativeService = new OpenClawRuntimeNativeService();
    nativeService.execute = execute;
    const registerCommand = vi.fn();
    createExperiencePlugin({}, undefined, {}, nativeService).register({
      registerCommand,
      registerService: vi.fn(),
      on: vi.fn()
    });
    expect(registerCommand).toHaveBeenCalledTimes(OPENCLAW_NATIVE_OPERATIONS.length);
    expect(registerCommand.mock.calls.map(([definition]) => definition.name).sort()).toEqual(
      OPENCLAW_NATIVE_OPERATIONS.map((operation) => `experienceengine_${operation}`).sort()
    );
    const pause = registerCommand.mock.calls
      .map(([definition]) => definition)
      .find((definition) => definition.name === "experienceengine_pause_learning") as {
        handler: (context: {
          isAuthorizedSender: boolean;
          args?: string;
          commandBody: string;
        }) => Promise<{ text: string }>;
      };
    const reply = await pause.handler({
      isAuthorizedSender: true,
      args: JSON.stringify({
        control_request_id: "command-pause-test",
        expected_projection_revision: 7
      }),
      commandBody: "/experienceengine_pause_learning"
    });
    expect(JSON.parse(reply.text)).toMatchObject({
      ok: true,
      operation: "pause_learning",
      code: "delegated",
      result: {
        control_request_id: "command-pause-test",
        expected_projection_revision: 7
      }
    });
    expect(execute).toHaveBeenCalledWith({
      operation: "pause_learning",
      payload: {
        control_request_id: "command-pause-test",
        expected_projection_revision: 7
      }
    });
  });

  it("registers a model-independent admin Gateway command probe", async () => {
    const execute = vi.fn(async () => ({
      ok: true,
      operation: "status" as const,
      code: "runtime_status",
      result: { learning_runtime_active: true }
    }));
    const nativeService = new OpenClawRuntimeNativeService();
    nativeService.execute = execute;
    const registerGatewayMethod = vi.fn();
    createExperiencePlugin({}, undefined, {}, nativeService).register({
      registerGatewayMethod,
      registerService: vi.fn(),
      on: vi.fn()
    });

    expect(registerGatewayMethod).toHaveBeenCalledOnce();
    const [method, handler, options] = registerGatewayMethod.mock.calls[0] as [
      string,
      (input: {
        params: Record<string, unknown>;
        respond: (
          ok: boolean,
          payload?: unknown,
          error?: { code: string; message: string }
        ) => void;
      }) => Promise<void>,
      { scope: string }
    ];
    expect(method).toBe(OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD);
    expect(options).toEqual({ scope: "operator.admin" });
    const respond = vi.fn();
    const probe = createOpenClawNativeCommandGatewayRequest({
      probeId: "plugin-registration-probe",
      operation: "status"
    });
    await handler({ params: probe, respond });
    expect(execute).toHaveBeenCalledWith({
      operation: "status",
      payload: {}
    });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({
      probe_id: "plugin-registration-probe",
      command_name: "experienceengine_status",
      runtime_json: expect.objectContaining({
        operation: "status",
        code: "runtime_status"
      })
    }));
  });

  it("rejects unauthorized and malformed command requests before native authority evaluation", async () => {
    const execute = vi.fn();
    const nativeService = new OpenClawRuntimeNativeService();
    nativeService.execute = execute;
    const registerCommand = vi.fn();
    createExperiencePlugin({}, undefined, {}, nativeService).register({
      registerCommand,
      registerService: vi.fn(),
      on: vi.fn()
    });
    const retry = registerCommand.mock.calls
      .map(([definition]) => definition)
      .find((definition) => definition.name === "experienceengine_retry_package_activation") as {
        handler: (context: {
          isAuthorizedSender: boolean;
          args?: string;
          commandBody: string;
        }) => Promise<{ text: string }>;
      };
    await expect(retry.handler({
      isAuthorizedSender: false,
      args: "{}",
      commandBody: "/experienceengine_retry_package_activation"
    })).resolves.toEqual({
      text: expect.stringContaining("EE_NATIVE_COMMAND_UNAUTHORIZED")
    });
    await expect(retry.handler({
      isAuthorizedSender: true,
      args: "not-json",
      commandBody: "/experienceengine_retry_package_activation"
    })).resolves.toEqual({
      text: expect.stringContaining("EE_NATIVE_COMMAND_ARGUMENT_INVALID")
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
