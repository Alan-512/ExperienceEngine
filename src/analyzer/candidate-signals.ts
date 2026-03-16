import type { ExperienceInput, ToolEvent } from "../types/domain.js";
import { buildExtractionEvidence } from "./extraction-evidence.js";
import { normalizeWhitespace, truncate } from "../utils/text.js";

const CORRECTION_TOOL_PATTERN = /\b(apply_patch|edit|write|patch|update|modify)\b/i;
const CORRECTION_OUTPUT_PATTERN = /\b(applied|updated|patched|modified|wrote|fixed)\b/i;

export type CandidateSignalSummary = {
  failure_signature?: string;
  retry_count: number;
  correction_signals: string[];
  tool_event_summary: string[];
  criticality: boolean;
  improvement_room: boolean;
  recoverable_path: boolean;
};

const isCorrectionEvent = (event: ToolEvent): boolean =>
  CORRECTION_TOOL_PATTERN.test(event.tool_name) || CORRECTION_OUTPUT_PATTERN.test(event.output_summary ?? "");

const toEventDigest = (event: ToolEvent): string => {
  const detail = normalizeWhitespace(event.error_signature ?? event.output_summary ?? "");
  const trimmedDetail = detail ? truncate(detail, 120) : undefined;
  const statusLabel = event.status === "failure" ? "failed" : event.status === "success" ? "succeeded" : "unknown";
  return [event.tool_name, statusLabel, trimmedDetail].filter(Boolean).join(": ");
};

const pushUnique = (target: string[], value?: string): void => {
  if (!value) {
    return;
  }
  if (!target.includes(value)) {
    target.push(value);
  }
};

const summarizeToolEvents = (events: ToolEvent[]): string[] => {
  const summary: string[] = [];
  const failures = events.filter((event) => event.status === "failure");
  const corrections = events.filter(isCorrectionEvent);
  const lastSuccess = [...events].reverse().find((event) => event.status === "success");

  failures.slice(-2).forEach((event) => pushUnique(summary, `failure: ${toEventDigest(event)}`));
  corrections.slice(-2).forEach((event) => pushUnique(summary, `correction: ${toEventDigest(event)}`));
  if (lastSuccess) {
    pushUnique(summary, `success: ${toEventDigest(lastSuccess)}`);
  }

  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.tool_name, (counts.get(event.tool_name) ?? 0) + 1);
  }
  for (const [tool, count] of counts) {
    if (count > 1) {
      pushUnique(summary, `repeat: ${tool} x${count}`);
    }
  }

  return summary.slice(0, 6);
};

export const buildCandidateSignals = (input: ExperienceInput): CandidateSignalSummary => {
  const evidence = buildExtractionEvidence(input);
  const failureSignature = evidence?.primaryFailureSignature;
  const failureEvents = input.tool_events.filter((event) => event.status === "failure");
  const retryCount = failureEvents.length;
  const correctionEvents = input.tool_events.filter(isCorrectionEvent);
  const correctionSignals = [...new Set(correctionEvents.map((event) => event.tool_name))].slice(0, 3);
  const toolEventSummary = summarizeToolEvents(input.tool_events);

  const criticality = Boolean(failureSignature) || retryCount > 0 || correctionSignals.length > 0;
  const improvementRoom = input.outcome_signal === "failure" || retryCount > 0;
  const recoverablePath = input.outcome_signal === "success" || correctionSignals.length > 0;

  return {
    failure_signature: failureSignature,
    retry_count: retryCount,
    correction_signals: correctionSignals,
    tool_event_summary: toolEventSummary,
    criticality,
    improvement_room: improvementRoom,
    recoverable_path: recoverablePath
  };
};
