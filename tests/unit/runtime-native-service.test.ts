import { describe, expect, it, vi } from "vitest";
import {
  DeferredOpenClawRuntimeNativeService,
  OpenClawRuntimeNativeService
} from "../../src/runtime/activation/native-service.js";
import {
  createUnavailableOpenClawRuntimeNativeService
} from "../../src/runtime/activation/production-service.js";

describe("OpenClaw runtime native service", () => {
  it("normalizes the package-local operation alias and returns the exact handler result", async () => {
    const status = vi.fn(async () => ({
      ok: true,
      operation: "status" as const,
      code: "status_ok",
      result: { interaction_active: true }
    }));
    const service = new OpenClawRuntimeNativeService({ handlers: { status } });

    await expect(service.execute({
      operation: "experienceengine.runtime.status"
    })).resolves.toEqual({
      ok: true,
      operation: "status",
      code: "status_ok",
      result: { interaction_active: true }
    });
    expect(status).toHaveBeenCalledWith({});
  });

  it("rejects unknown and unavailable operations without inventing authority", async () => {
    const service = new OpenClawRuntimeNativeService();
    await expect(service.execute({ operation: "unknown" })).resolves.toMatchObject({
      ok: false,
      code: "EE_NATIVE_OPERATION_UNKNOWN"
    });
    await expect(service.execute({ operation: "pause_learning" })).resolves.toEqual({
      ok: false,
      operation: "pause_learning",
      code: "EE_NATIVE_OPERATION_UNAVAILABLE",
      result: null
    });
  });

  it("maps authority errors to stable result codes", async () => {
    const service = new OpenClawRuntimeNativeService({
      handlers: {
        request_drain: async () => {
          throw Object.assign(new Error("stale drain"), {
            code: "EE_CONTROL_REQUEST_STALE"
          });
        }
      }
    });
    await expect(service.execute({ operation: "request_drain" })).resolves.toMatchObject({
      ok: false,
      operation: "request_drain",
      code: "EE_CONTROL_REQUEST_STALE",
      result: { message: "stale drain" }
    });
  });

  it("delegates lifecycle start and stop to one package-local controller", async () => {
    const start = vi.fn(() => ({ ok: true, code: "started" }));
    const stop = vi.fn(() => ({ ok: true, code: "stopped" }));
    const service = new OpenClawRuntimeNativeService({
      lifecycle: { start, stop }
    });
    await expect(service.start()).resolves.toEqual({ ok: true, code: "started" });
    await expect(service.stop()).resolves.toEqual({ ok: true, code: "stopped" });
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("binds one deferred delegate on lifecycle start and reuses it for native commands", async () => {
    const execute = vi.fn(async () => ({
      ok: true,
      operation: "status" as const,
      code: "bound_status",
      result: { learning_runtime_active: false }
    }));
    const start = vi.fn(async () => ({ ok: true, code: "bound_started" }));
    const stop = vi.fn(async () => ({ ok: true, code: "bound_stopped" }));
    const bound = new OpenClawRuntimeNativeService({ lifecycle: { start, stop } });
    bound.execute = execute;
    const dispose = vi.fn();
    const binder = vi.fn(async () => ({ service: bound, dispose }));
    const deferred = new DeferredOpenClawRuntimeNativeService(
      binder,
      createUnavailableOpenClawRuntimeNativeService({
        reason: "not_started",
        interactionActive: true
      })
    );

    await expect(deferred.execute({ operation: "status" })).resolves.toMatchObject({
      code: "runtime_service_unavailable"
    });
    const context = { stateDir: "host-state" };
    await expect(deferred.start(context)).resolves.toEqual({
      ok: true,
      code: "bound_started"
    });
    await expect(deferred.start(context)).resolves.toEqual({
      ok: true,
      code: "bound_started"
    });
    expect(binder).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledWith(context);
    await expect(deferred.execute({ operation: "status" })).resolves.toMatchObject({
      code: "bound_status"
    });
    expect(execute).toHaveBeenCalledOnce();
    await expect(deferred.stop(context)).resolves.toEqual({
      ok: true,
      code: "bound_stopped"
    });
    expect(stop).toHaveBeenCalledWith(context);
    expect(dispose).toHaveBeenCalledOnce();
    await expect(deferred.execute({ operation: "status" })).resolves.toMatchObject({
      code: "runtime_service_unavailable"
    });
  });
});
