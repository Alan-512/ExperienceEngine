import type { HostPromptContext } from "../../types/plugin.js";
import type { ToolEvent } from "../../types/domain.js";
import { buildExperienceInput } from "../../input/input-adapter.js";

export const finalizeExperienceInput = (context: HostPromptContext, toolEvents: ToolEvent[] = []) =>
  buildExperienceInput(context, toolEvents);

