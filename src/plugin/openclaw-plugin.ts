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

const loadOpenClawRoutineInteractionModule = () => import("./openclaw-routine-interaction.js");

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
  constructor(private readonly runtime: ExperienceRuntimeService) {}

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

    api.on?.("before_prompt_build", async (payload, hookContext) => {
      const source = mergeHookPayload(payload, hookContext);
      this.runtime.captureWriter.capture("before_prompt_build", extractSessionKey(source), { payload, context: hookContext });
      const context = normalizePromptPayload(source);
      clearSessionFinalizeState(context.sessionId);
      const routineInteraction = await loadOpenClawRoutineInteractionModule().catch(() => null);
      const routineIntent = routineInteraction?.detectOpenClawRoutineIntent(context.userMessage);
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
      if (routineInteraction?.detectOpenClawRoutineIntent(context.userMessage)) {
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
  runtimeOptions: ConstructorParameters<typeof ExperienceRuntimeService>[2] = {}
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
    })
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
