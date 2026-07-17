import { loadConfig } from "../config/load-config.js";
import type {
  ExperienceInput,
} from "../types/domain.js";
import type {
  ExperiencePlugin,
  HostPromptContext,
  HostToolResult,
  OpenClawLogger,
  OpenClawPluginApi
} from "../types/plugin.js";
import {
  pluginConfigJsonSchema,
  pluginUiHints,
  type ExperienceEngineConfig
} from "../config/config-schema.js";
import { ExperienceRuntimeService } from "../runtime/service.js";
import {
  OPENCLAW_BACKGROUND_LEARNING_ENABLED,
  OPENCLAW_HYBRID_POSTTASK_ENABLED,
  OPENCLAW_SAFE_CONFIG_OVERRIDES
} from "./openclaw-runtime-defaults.js";
import {
  normalizePromptPayload,
  normalizeToolPayload,
  applyInjectionToPayload,
  extractSessionKey,
  mergeHookPayload
} from "./runtime-helpers.js";
import {
  OPENCLAW_RUNTIME_NATIVE_SERVICE_CONTRACT,
  type OpenClawRuntimeNativeService
} from "../runtime/activation/native-service.js";
import {
  OPENCLAW_NATIVE_OPERATIONS,
  type OpenClawNativeOperation
} from "../runtime/activation/constants.js";
import {
  createUnavailableOpenClawRuntimeNativeService
} from "../runtime/activation/production-service.js";
import {
  createDefaultInstalledOpenClawRuntimeService
} from "./openclaw-production-runtime.js";
import {
  writeOpenClawRuntimeHealthEvidence
} from "./openclaw-runtime-health.js";
import {
  OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD,
  OPENCLAW_NATIVE_COMMAND_PREFIX,
  createOpenClawNativeCommandGatewayResponse,
  parseOpenClawNativeCommandGatewayRequest
} from "../runtime/activation/openclaw-native-command-gateway.js";

const loadOpenClawRoutineInteractionModule = () => import("./openclaw-routine-interaction.js");

const defaultInstalledRuntimeServices = new Map<
  string,
  OpenClawRuntimeNativeService
>();

const resolveDefaultInstalledRuntimeService = (options: {
  packageRoot: string;
  config: ExperienceEngineConfig;
}): OpenClawRuntimeNativeService => {
  const identity = JSON.stringify({
    packageRoot: options.packageRoot,
    dataDir: options.config.dataDir,
    sqlitePath: options.config.sqlitePath,
    captureDir: options.config.captureDir
  });
  const existing = defaultInstalledRuntimeServices.get(identity);
  if (existing) {
    return existing;
  }
  const created = createDefaultInstalledOpenClawRuntimeService({
    packageRoot: options.packageRoot,
    config: options.config,
    interactionActive: true
  });
  defaultInstalledRuntimeServices.set(identity, created);
  return created;
};

const parseRuntimeCommandPayload = (args: string | undefined): Record<string, unknown> => {
  const trimmed = args?.trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Runtime command arguments must be one JSON object.");
  }
  return parsed as Record<string, unknown>;
};

const formatRuntimeCommandResult = (value: unknown): string =>
  JSON.stringify(value, null, 2);

const runtimeCommandDescription = (operation: OpenClawNativeOperation): string => {
  switch (operation) {
    case "status":
      return "Show truthful ExperienceEngine package-local runtime status.";
    case "repair_explanation":
      return "Explain the exact next repair action for ExperienceEngine runtime authority.";
    default:
      return `Run the idempotent ExperienceEngine runtime control ${operation}.`;
  }
};

const buildFinalizeDedupKey = (source: unknown, context: HostPromptContext): string | null => {
  if (!context.sessionId) {
    return null;
  }

  return JSON.stringify({
    sessionId: context.sessionId,
    cwd: context.cwd,
    userMessage: context.userMessage,
    taskSummary: context.taskSummary
  });
};

class OpenClawExperiencePlugin implements ExperiencePlugin {
  private nativeRuntimeService: OpenClawRuntimeNativeService;

  constructor(
    private readonly runtime: ExperienceRuntimeService,
    nativeRuntimeService?: OpenClawRuntimeNativeService
  ) {
    this.nativeRuntimeService = nativeRuntimeService ??
      createUnavailableOpenClawRuntimeNativeService({
        reason: "verified_package_local_runtime_dependencies_not_bound",
        interactionActive: true
      });
    this.nativeRuntimeServiceInjected = nativeRuntimeService !== undefined;
  }

  private readonly nativeRuntimeServiceInjected: boolean;

  async beforePromptBuild(context: HostPromptContext) {
    return this.runtime.beforePromptBuild({
      ...context,
      host: "openclaw"
    });
  }

  async persistToolResult(result: HostToolResult) {
    return this.runtime.persistToolResult(result);
  }

  async finalizeTask(context: HostPromptContext): Promise<ExperienceInput> {
    return this.runtime.finalizeTask({
      ...context,
      host: "openclaw"
    });
  }

  register(api: OpenClawPluginApi): void {
    if (!this.nativeRuntimeServiceInjected && api.rootDir?.trim()) {
      this.nativeRuntimeService = resolveDefaultInstalledRuntimeService({
        packageRoot: api.rootDir,
        config: this.runtime.config
      });
    }
    const completedFinalizations = new Map<string, number>();
    const inFlightFinalizations = new Map<string, Promise<void>>();
    const FINALIZE_CACHE_LIMIT = 256;
    const clearSessionFinalizeState = (sessionId?: string): void => {
      if (!sessionId) {
        return;
      }

      for (const key of completedFinalizations.keys()) {
        if (key.includes(`"sessionId":"${sessionId}"`)) {
          completedFinalizations.delete(key);
        }
      }
    };
    const trimCompletedFinalizations = (): void => {
      while (completedFinalizations.size > FINALIZE_CACHE_LIMIT) {
        const oldestKey = completedFinalizations.keys().next().value;
        if (!oldestKey) {
          break;
        }
        completedFinalizations.delete(oldestKey);
      }
    };

    this.runtime.captureWriter.capture("plugin_register", "global", {
      hasOn: typeof api.on === "function",
      captureRawPayloads: this.runtime.config.captureRawPayloads,
      captureDir: this.runtime.config.captureDir,
      sqlitePath: this.runtime.config.sqlitePath
    });

    api.registerService?.({
      id: OPENCLAW_RUNTIME_NATIVE_SERVICE_CONTRACT.service_id,
      start: async (context) => {
        const lifecycle = await this.nativeRuntimeService.start(context);
        if (!lifecycle.ok) {
          try {
            writeOpenClawRuntimeHealthEvidence({
              canonicalHome: this.runtime.config.dataDir,
              lifecycleState: "failed",
              code: lifecycle.code,
              detail: lifecycle.detail,
              nextAction: "Run `ee verify openclaw-production` and inspect the stable runtime failure code."
            });
          } catch {
            // Diagnostic persistence must not replace the authoritative lifecycle failure.
          }
          (api.logger ?? api.log)?.warn?.(
            `experienceengine.runtime_service_inactive code=${lifecycle.code}`,
            lifecycle
          );
          return;
        }
        const status = await this.nativeRuntimeService.execute({
          operation: "status"
        });
        try {
          writeOpenClawRuntimeHealthEvidence({
            canonicalHome: this.runtime.config.dataDir,
            lifecycleState: "active",
            code: status.code,
            statusProjection: status.result,
            nextAction: status.ok
              ? "Use the three runtime readiness projections; plugin load alone is not production readiness."
              : "Run `ee verify openclaw-production` and inspect the current activation authority."
          });
        } catch {
          // Health evidence is diagnostic and cannot change runtime authority.
        }
      },
      stop: async (context) => {
        const lifecycle = await this.nativeRuntimeService.stop(context);
        if (!lifecycle.ok) {
          (api.logger ?? api.log)?.warn?.(
            `experienceengine.runtime_service_stop_failed code=${lifecycle.code}`,
            lifecycle
          );
        }
        try {
          writeOpenClawRuntimeHealthEvidence({
            canonicalHome: this.runtime.config.dataDir,
            lifecycleState: lifecycle.ok ? "inactive" : "failed",
            code: lifecycle.code,
            detail: lifecycle.detail,
            nextAction: lifecycle.ok
              ? "Start the OpenClaw Gateway to reactivate the package-local runtime."
              : "Inspect the stable stop failure code before restarting the Gateway."
          });
        } catch {
          // Diagnostic persistence must not alter stop behavior.
        }
      }
    });

    for (const operation of OPENCLAW_NATIVE_OPERATIONS) {
      api.registerCommand?.({
        name: `${OPENCLAW_NATIVE_COMMAND_PREFIX}${operation}`,
        description: runtimeCommandDescription(operation),
        acceptsArgs: operation !== "status" && operation !== "repair_explanation",
        requireAuth: true,
        handler: async (context) => {
          if (!context.isAuthorizedSender) {
            return {
              text: formatRuntimeCommandResult({
                ok: false,
                operation,
                code: "EE_NATIVE_COMMAND_UNAUTHORIZED",
                result: null
              })
            };
          }
          try {
            const execution = await this.nativeRuntimeService.execute({
              operation,
              payload: parseRuntimeCommandPayload(context.args)
            });
            return { text: formatRuntimeCommandResult(execution) };
          } catch (error) {
            return {
              text: formatRuntimeCommandResult({
                ok: false,
                operation,
                code: "EE_NATIVE_COMMAND_ARGUMENT_INVALID",
                result: {
                  message: error instanceof Error ? error.message : String(error)
                }
              })
            };
          }
        }
      });
    }

    api.registerGatewayMethod?.(
      OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD,
      async ({ params, respond }) => {
        try {
          const request = parseOpenClawNativeCommandGatewayRequest(params);
          const runtimeResult = await this.nativeRuntimeService.execute({
            operation: request.operation,
            payload: request.payload
          });
          respond(true, createOpenClawNativeCommandGatewayResponse({
            request,
            runtimeResult
          }));
        } catch (error) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      },
      { scope: "operator.admin" }
    );

    api.on?.("before_prompt_build", async (payload, hookContext) => {
      const source = mergeHookPayload(payload, hookContext);
      this.runtime.captureWriter.capture("before_prompt_build", extractSessionKey(source), { payload, context: hookContext });
      const context = normalizePromptPayload(source);
      clearSessionFinalizeState(context.sessionId);
      const routineInteraction = await loadOpenClawRoutineInteractionModule().catch(() => null);
      const routineIntent = routineInteraction?.detectOpenClawRoutineIntent?.(context.userMessage);
      if (routineIntent && routineInteraction) {
        this.runtime.captureWriter.capture("openclaw_routine_interaction", extractSessionKey(source), {
          intent: routineIntent,
          cwd: context.cwd
        });
        return applyInjectionToPayload(
          payload,
          await routineInteraction.buildOpenClawRoutineInteractionContext(this.runtime.config, routineIntent, context.cwd, {
            runtimeActive: true,
            userMessage: context.userMessage
          })
        );
      }
      const result = await this.beforePromptBuild(context);
      if (result.notice) {
        (api.logger ?? api.log)?.info?.("experienceengine.notice", {
          sessionId: context.sessionId,
          notice: result.notice,
          mode: result.mode
        });
      }
      if (result.text && result.mode !== "skip") {
        return applyInjectionToPayload(payload, result.text);
      }

      return payload;
    });

    api.on?.("tool_result_persist", (payload, hookContext) => {
      const source = mergeHookPayload(payload, hookContext);
      this.runtime.captureWriter.capture("tool_result_persist", extractSessionKey(source), { payload, context: hookContext });
      const normalized = normalizeToolPayload(source);
      if (!normalized) {
        return payload;
      }

      const sessionId = extractSessionKey(source);
      void this.persistToolResult({ ...normalized, sessionId } as HostToolResult & { sessionId: string }).catch((error) => {
        (api.logger ?? api.log)?.warn?.("experienceengine.tool_result_persist_failed", {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
      return payload;
    });

    const finalize = async (payload: unknown, hookContext?: unknown) => {
      const source = mergeHookPayload(payload, hookContext);
      this.runtime.captureWriter.capture("finalize", extractSessionKey(source), { payload, context: hookContext });
      const context = normalizePromptPayload(source);
      const routineInteraction = await loadOpenClawRoutineInteractionModule().catch(() => null);
      if (routineInteraction?.detectOpenClawRoutineIntent?.(context.userMessage)) {
        return payload;
      }
      if (!context.userMessage && !context.taskSummary) {
        return payload;
      }

      const dedupKey = buildFinalizeDedupKey(source, context);
      if (dedupKey && completedFinalizations.has(dedupKey)) {
        return payload;
      }

      if (dedupKey) {
        const inFlight = inFlightFinalizations.get(dedupKey);
        if (inFlight) {
          await inFlight;
          return payload;
        }
      }

      const runFinalization = (async () => {
        const sessionId = context.sessionId;
        if (sessionId) {
          this.runtime.recoverToolEvents(sessionId, source);
        }
        await this.finalizeTask(context);
      })();

      if (dedupKey) {
        inFlightFinalizations.set(dedupKey, runFinalization);
      }

      try {
        await runFinalization;
      } finally {
        if (dedupKey) {
          inFlightFinalizations.delete(dedupKey);
          completedFinalizations.set(dedupKey, Date.now());
          trimCompletedFinalizations();
        }
      }

      return payload;
    };

    api.on?.("agent_end", finalize);
    api.on?.("session_end", finalize);
    api.on?.("message_sent", finalize);
  }
}

export const createExperiencePlugin = (
  configOverrides: Partial<ExperienceEngineConfig> = {},
  logger?: OpenClawLogger,
  runtimeOptions: ConstructorParameters<typeof ExperienceRuntimeService>[2] = {},
  nativeRuntimeService?: OpenClawRuntimeNativeService
): OpenClawExperiencePlugin =>
  new OpenClawExperiencePlugin(
    new ExperienceRuntimeService(loadConfig({
      ...configOverrides,
      ...OPENCLAW_SAFE_CONFIG_OVERRIDES
    }), logger, {
      disableBackgroundLearning: !OPENCLAW_BACKGROUND_LEARNING_ENABLED,
      disableHybridPosttask: !OPENCLAW_HYBRID_POSTTASK_ENABLED,
      ...runtimeOptions,
      autonomousHygieneGovernance: {
        enabled: true,
        ...runtimeOptions.autonomousHygieneGovernance
      }
    }),
    nativeRuntimeService
  );

const resolvePluginConfig = (api: OpenClawPluginApi): Partial<ExperienceEngineConfig> => {
  const rawConfig = (api.pluginConfig ?? api.config ?? {}) as Partial<ExperienceEngineConfig>;
  const resolvePath = api.resolvePath;

  if (!resolvePath) {
    return rawConfig;
  }

  return {
    ...rawConfig,
    dataDir: rawConfig.dataDir ? resolvePath(rawConfig.dataDir) : rawConfig.dataDir,
    sqlitePath: rawConfig.sqlitePath ? resolvePath(rawConfig.sqlitePath) : rawConfig.sqlitePath,
    captureDir: rawConfig.captureDir ? resolvePath(rawConfig.captureDir) : rawConfig.captureDir
  };
};

const plugin = {
  id: "experienceengine",
  name: "ExperienceEngine",
  configSchema: pluginConfigJsonSchema,
  uiHints: pluginUiHints,
  register(api: OpenClawPluginApi) {
    const runtime = createExperiencePlugin(resolvePluginConfig(api), api.logger ?? api.log);
    runtime.register(api);
  }
};

export default plugin;
