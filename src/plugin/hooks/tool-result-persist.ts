import type { ToolEvent } from "../../types/domain.js";
import type { HostToolResult } from "../../types/plugin.js";
import { nowIso } from "../../utils/clock.js";
import { createId } from "../../utils/ids.js";

export const normalizeToolResult = (result: HostToolResult): ToolEvent => ({
  event_id: createId("tool"),
  tool_name: result.toolName,
  input_summary: result.inputSummary,
  output_summary: result.outputSummary,
  status: result.status ?? (result.exitCode === 0 ? "success" : result.exitCode ? "failure" : "unknown"),
  exit_code: result.exitCode,
  error_signature: result.errorSignature,
  started_at: result.startedAt ?? nowIso(),
  ended_at: result.endedAt ?? nowIso()
});

