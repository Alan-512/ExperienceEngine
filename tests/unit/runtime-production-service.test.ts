import { describe, expect, it, vi } from "vitest";
import {
  createPackageLocalOpenClawRuntimeNativeService,
  createUnavailableOpenClawRuntimeNativeService,
  PRODUCTION_NATIVE_OPERATION_BINDINGS
} from "../../src/runtime/activation/production-service.js";
import { OPENCLAW_NATIVE_OPERATIONS } from "../../src/runtime/activation/constants.js";
import type {
  RuntimePackageLocalServiceController
} from "../../src/runtime/activation/service-controller.js";

describe("package-local production runtime service", () => {
  it("binds the exact frozen native operation set without aliases", () => {
    expect(Object.keys(PRODUCTION_NATIVE_OPERATION_BINDINGS).sort()).toEqual(
      [...OPENCLAW_NATIVE_OPERATIONS].sort()
    );
  });

  it("combines status, controls, and lifecycle without replacing request_drain", async () => {
    const start = vi.fn(() => ({ ok: true, code: "controller_started" }));
    const stop = vi.fn(() => ({ ok: true, code: "controller_stopped" }));
    const controller = { start, stop } as unknown as RuntimePackageLocalServiceController;
    const requestDrain = vi.fn(async () => ({
      ok: true,
      operation: "request_drain" as const,
      code: "idempotent_drain_requested",
      result: { replayed: false }
    }));
    const service = createPackageLocalOpenClawRuntimeNativeService({
      controller,
      statusProvider: () => ({
        interaction_active: true,
        learning_runtime_active: false,
        production_learning_ready: false,
        package_activation_state: "preparing",
        blocked_boundary: "none",
        next_action: "Complete preactivation verification.",
        warning: null
      }),
      controlHandlers: { request_drain: requestDrain }
    });

    await expect(service.execute({ operation: "status" })).resolves.toMatchObject({
      ok: true,
      code: "runtime_status_projected",
      result: {
        interaction_active: true,
        learning_runtime_active: false,
        production_learning_ready: false
      }
    });
    await expect(service.execute({ operation: "repair_explanation" })).resolves.toMatchObject({
      ok: true,
      result: {
        next_action: "Complete preactivation verification.",
        package_activation_state: "preparing"
      }
    });
    await expect(service.execute({ operation: "request_drain" })).resolves.toMatchObject({
      ok: true,
      code: "idempotent_drain_requested"
    });
    expect(requestDrain).toHaveBeenCalledOnce();
    await expect(service.start()).resolves.toEqual({
      ok: true,
      code: "controller_started"
    });
    await expect(service.stop()).resolves.toEqual({
      ok: true,
      code: "controller_stopped"
    });
  });

  it("keeps the default service truthful and inactive when dependencies are not bound", async () => {
    const service = createUnavailableOpenClawRuntimeNativeService({
      reason: "package_descriptor_missing",
      interactionActive: true
    });
    await expect(service.execute({ operation: "status" })).resolves.toMatchObject({
      ok: true,
      code: "runtime_service_unavailable",
      result: {
        interaction_active: true,
        learning_runtime_active: false,
        production_learning_ready: false,
        warning: "package_descriptor_missing"
      }
    });
    await expect(service.execute({ operation: "initialize_package_activation" })).resolves.toMatchObject({
      ok: false,
      code: "EE_NATIVE_OPERATION_UNAVAILABLE"
    });
    await expect(service.start()).resolves.toMatchObject({
      ok: false,
      code: "runtime_service_unavailable"
    });
  });
});
