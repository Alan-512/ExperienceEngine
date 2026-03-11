import { loadConfig } from "../config/load-config.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { analyzeExperience } from "../analyzer/experience-analyzer.js";
import type { ExperienceNode, ToolEvent } from "../types/domain.js";
import type { ExperiencePlugin, HostPromptContext, HostToolResult } from "../types/plugin.js";
import { handleBeforePromptBuild } from "./hooks/before-prompt-build.js";
import { finalizeExperienceInput } from "./hooks/message-sent.js";
import { normalizeToolResult } from "./hooks/tool-result-persist.js";

export const createExperiencePlugin = (
  configOverrides: Partial<ExperienceEngineConfig> = {},
  seededNodes: ExperienceNode[] = []
): ExperiencePlugin => {
  const config = loadConfig(configOverrides);
  const toolEvents: ToolEvent[] = [];

  return {
    async beforePromptBuild(context: HostPromptContext) {
      return handleBeforePromptBuild(context, seededNodes, undefined, toolEvents.slice(-10));
    },

    async persistToolResult(result: HostToolResult) {
      const event = normalizeToolResult(result);
      toolEvents.push(event);
      return event;
    },

    async finalizeTask(context: HostPromptContext) {
      const input = finalizeExperienceInput(context, toolEvents.slice(-20));
      analyzeExperience(input);
      return input;
    }
  };
};

export const defaultPlugin = createExperiencePlugin;
