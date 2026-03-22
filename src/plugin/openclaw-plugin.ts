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
  normalizePromptPayload,
  normalizeToolPayload,
  applyInjectionToPayload,
  extractSessionKey,
  mergeHookPayload
} from "./runtime-helpers.js";
class OpenClawExperiencePlugin implements ExperiencePlugin {
  constructor(private readonly runtime: ExperienceRuntimeService) {}

  async beforePromptBuild(context: HostPromptContext) {
    return this.runtime.beforePromptBuild(context);
  }

  async persistToolResult(result: HostToolResult) {
    return this.runtime.persistToolResult(result);
  }

  async finalizeTask(context: HostPromptContext): Promise<ExperienceInput> {
    return this.runtime.finalizeTask(context);
  }

  register(api: OpenClawPluginApi): void {
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
      if (!context.userMessage && !context.taskSummary) {
        return payload;
      }

      if (context.sessionId) {
        this.runtime.recoverToolEvents(context.sessionId, source);
      }

      await this.finalizeTask(context);
      await this.runtime.waitForBackgroundLearning();
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
  new OpenClawExperiencePlugin(new ExperienceRuntimeService(loadConfig(configOverrides), logger, runtimeOptions));

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
