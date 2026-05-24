import type { ExperienceInput, ToolEvent, TraceCapsule, TraceEvent, OutcomeSignal } from "../types/domain.js";
import { resolveTaskType } from "./tasktype-resolver.js";
import { resolveOutcome } from "./outcome-resolver.js";

/**
 * Projects a host-neutral TraceCapsule into a legacy-compatible ExperienceInput.
 */
export const projectTraceCapsule = (capsule: TraceCapsule): ExperienceInput => {
  // 1. Isolate user-origin goal/summary for the task summary and task type resolution (Task 2.3)
  const taskSummary = capsule.task.goal || "";
  const taskType = resolveTaskType(taskSummary);

  // 2. Extract and pair tool events (Task 2.1 & 2.2)
  const toolEvents: ToolEvent[] = [];
  const events = capsule.events || [];

  // Group events by tool_call_id if present
  const toolCalls = events.filter((e) => e.event_type === "tool_call");
  const toolResults = events.filter((e) => e.event_type === "tool_result" || e.event_type === "tool_failure");

  // Keep track of paired result/failure IDs to avoid duplicate mapping
  const handledResultIds = new Set<string>();

  for (const call of toolCalls) {
    const callId = call.payload.tool_call_id || call.payload.call_id || call.payload.id || call.id;
    const toolName = call.payload.tool_name || call.payload.name || "unknown_tool";
    const inputSummary = call.payload.arguments || call.payload.args || call.payload.input || "";
    
    // Find matching result or failure event
    const matchedResult = toolResults.find((r) => {
      const rCallId = r.payload.tool_call_id || r.payload.call_id || r.payload.id;
      return rCallId === callId && !handledResultIds.has(r.id);
    });

    let status: "success" | "failure" | "unknown" = "unknown";
    let outputSummary = "";
    let exitCode: number | undefined;
    let errorSignature: string | undefined;
    let endedAt: string | undefined;

    if (matchedResult) {
      handledResultIds.add(matchedResult.id);
      endedAt = matchedResult.timestamp;
      
      if (matchedResult.event_type === "tool_failure") {
        status = "failure";
        errorSignature = matchedResult.payload.error || matchedResult.payload.error_signature || "Tool execution failed";
        exitCode = typeof matchedResult.payload.exit_code === "number" ? matchedResult.payload.exit_code : 1;
        outputSummary = matchedResult.payload.output || matchedResult.payload.message || "";
      } else {
        status = matchedResult.payload.status === "failure" ? "failure" : "success";
        outputSummary = matchedResult.payload.result || matchedResult.payload.output || "";
        exitCode = typeof matchedResult.payload.exit_code === "number" ? matchedResult.payload.exit_code : 0;
      }
    }

    toolEvents.push({
      event_id: callId,
      tool_name: toolName,
      input_summary: typeof inputSummary === "string" ? inputSummary : JSON.stringify(inputSummary),
      output_summary: typeof outputSummary === "string" ? outputSummary : JSON.stringify(outputSummary),
      status,
      exit_code: exitCode,
      error_signature: errorSignature,
      started_at: call.timestamp,
      ended_at: endedAt
    });
  }

  // Handle unmatched tool results/failures to avoid losing any execution evidence (Task 2.2 dedupe)
  for (const res of toolResults) {
    if (handledResultIds.has(res.id)) {
      continue;
    }

    const callId = res.payload.tool_call_id || res.payload.call_id || res.payload.id || res.id;
    
    // Deduplicate: If we already have a paired or registered ToolEvent for this callId, skip it
    if (toolEvents.some((e) => e.event_id === callId)) {
      continue;
    }

    const toolName = res.payload.tool_name || res.payload.name || "unknown_tool";
    const outputSummary = res.payload.result || res.payload.output || res.payload.error || "";
    const status = res.event_type === "tool_failure" || res.payload.status === "failure" ? "failure" : "success";

    toolEvents.push({
      event_id: callId,
      tool_name: toolName,
      status,
      input_summary: undefined,
      output_summary: typeof outputSummary === "string" ? outputSummary : JSON.stringify(outputSummary),
      exit_code: typeof res.payload.exit_code === "number" ? res.payload.exit_code : (status === "failure" ? 1 : 0),
      error_signature: res.event_type === "tool_failure" ? (res.payload.error || "Tool execution failed") : undefined,
      started_at: res.timestamp,
      ended_at: res.timestamp
    });
  }

  // Handle other trace events (Task 5.5)
  const otherEvents = events.filter(
    (e) => e.event_type === "file_change" || e.event_type === "verification" || e.event_type === "correction"
  );
  for (const e of otherEvents) {
    if (e.event_type === "file_change") {
      toolEvents.push({
        event_id: e.id,
        tool_name: "file_change",
        status: "success",
        input_summary: e.payload.path || e.payload.file || "",
        output_summary: e.payload.action || "write",
        started_at: e.timestamp,
        ended_at: e.timestamp
      });
    } else if (e.event_type === "verification") {
      toolEvents.push({
        event_id: e.id,
        tool_name: "verification",
        status: e.payload.status === "failure" ? "failure" : "success",
        input_summary: e.payload.tool || e.payload.command || "",
        output_summary: e.payload.result || e.payload.message || "",
        started_at: e.timestamp,
        ended_at: e.timestamp
      });
    } else if (e.event_type === "correction") {
      toolEvents.push({
        event_id: e.id,
        tool_name: "correction",
        status: "success",
        input_summary: e.payload.correction_type || e.payload.type || "",
        output_summary: e.payload.feedback || e.payload.instruction || "",
        started_at: e.timestamp,
        ended_at: e.timestamp
      });
    }
  }

  // 3. Determine Outcome Signal
  let outcomeSignal: OutcomeSignal = "unknown";
  if (capsule.outcome.outcome_signal === "success") {
    outcomeSignal = "success";
  } else if (capsule.outcome.outcome_signal === "failure") {
    outcomeSignal = "failure";
  } else {
    // Fall back to legacy outcome resolver (Task 2.1)
    outcomeSignal = resolveOutcome(toolEvents, capsule.outcome.summary);
  }

  const traceIsUnstable = capsule.host_profile?.transcript_stability === "unstable" ||
    (capsule.events || []).some((e) => e.source?.is_unstable === true);

  return {
    scope_id: capsule.scope_id,
    task_type: taskType,
    task_summary: taskSummary,
    tool_events: toolEvents,
    outcome_signal: outcomeSignal,
    context_summary: capsule.outcome.summary || undefined,
    injected_node_ids: capsule.task.delivered_node_ids || [],
    trace_capsule_id: capsule.id,
    trace_completeness: capsule.capture_metadata?.completeness_score,
    trace_is_unstable: traceIsUnstable
  };
};
