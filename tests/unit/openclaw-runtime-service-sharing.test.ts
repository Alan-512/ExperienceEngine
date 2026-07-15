import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPENCLAW_NATIVE_OPERATIONS } from "../../src/runtime/activation/constants.js";
import type { OpenClawPluginApi } from "../../src/types/plugin.js";

type RegisteredService = Parameters<
  NonNullable<OpenClawPluginApi["registerService"]>
>[0];
type RegisteredCommand = Parameters<
  NonNullable<OpenClawPluginApi["registerCommand"]>
>[0];

const execute = vi.fn(async (input: { operation: string }) => ({
  ok: true,
  operation: input.operation,
  code: "shared_runtime_service",
  result: null
}));
const start = vi.fn(async () => ({ ok: true, code: "started" }));
const stop = vi.fn(async () => ({ ok: true, code: "stopped" }));
const createDefaultInstalledOpenClawRuntimeService = vi.fn(() => ({
  execute,
  start,
  stop
}));

vi.mock("../../src/plugin/openclaw-production-runtime.js", () => ({
  createDefaultInstalledOpenClawRuntimeService
}));

describe("OpenClaw runtime service sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares one package-local service across startup and command registries", async () => {
    const { createExperiencePlugin } = await import(
      "../../src/plugin/openclaw-plugin.js"
    );
    const startupServices: RegisteredService[] = [];
    const commandDefinitions: RegisteredCommand[] = [];
    const rootDir = "/openclaw/extensions/experienceengine";

    createExperiencePlugin().register({
      rootDir,
      registerService: (service) => startupServices.push(service),
      on: vi.fn()
    });
    createExperiencePlugin().register({
      rootDir,
      registerCommand: (command) => commandDefinitions.push(command),
      on: vi.fn()
    });

    expect(createDefaultInstalledOpenClawRuntimeService).toHaveBeenCalledOnce();
    await startupServices[0].start({ stateDir: "/openclaw" });
    const status = commandDefinitions.find((command) =>
      command.name === "experienceengine_status"
    );
    expect(commandDefinitions).toHaveLength(OPENCLAW_NATIVE_OPERATIONS.length);
    await expect(status?.handler({
      isAuthorizedSender: true,
      commandBody: "/experienceengine_status"
    })).resolves.toEqual({
      text: expect.stringContaining("shared_runtime_service")
    });
    expect(start).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      operation: "status",
      payload: {}
    });
  }, 10_000);
});
