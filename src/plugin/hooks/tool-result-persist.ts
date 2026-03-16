import type { ToolEvent } from "../../types/domain.js";
import type { HostToolResult } from "../../types/plugin.js";
import { nowIso } from "../../utils/clock.js";
import { createId } from "../../utils/ids.js";

export const normalizeToolResult = (result: HostToolResult): ToolEvent => {
  const exitCode = result.exitCode;
  const hasFailureExit = typeof exitCode === "number" && exitCode > 0;
  const status =
    hasFailureExit ? "failure" : result.status ?? (exitCode === 0 ? "success" : exitCode ? "failure" : "unknown");

  return {
    event_id: createId("tool"),
    tool_name: result.toolName,
    input_summary: result.inputSummary,
    output_summary: result.outputSummary,
    status,
    exit_code: exitCode,
    error_signature: result.errorSignature,
    started_at: result.startedAt ?? nowIso(),
    ended_at: result.endedAt ?? nowIso()
  };
};
