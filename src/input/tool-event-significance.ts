import type { ToolEvent } from "../types/domain.js";

const EXPLORATORY_TOOL_PATTERN = /\b(rg|grep|find|ls|pwd|cat|sed|head|tail|stat|glob|read)\b/i;
const EDIT_TOOL_PATTERN = /\b(apply_patch|edit|write|patch|update|modify)\b/i;

export const isExploratoryTool = (event: ToolEvent): boolean => EXPLORATORY_TOOL_PATTERN.test(event.tool_name);

export const isEditTool = (event: ToolEvent): boolean =>
  event.tool_name === "file_change" || EDIT_TOOL_PATTERN.test(event.tool_name);

export const isSignificantToolEvent = (event: ToolEvent): boolean =>
  event.status === "success" || event.status === "failure" || (event.exit_code ?? 0) > 0;

export const isSubstantiveToolEvent = (event: ToolEvent): boolean =>
  isSignificantToolEvent(event) && !isExploratoryTool(event) && !isEditTool(event);
