import type { CandidateSourceSignal, ExperienceInput, ToolEvent } from "../types/domain.js";
import { buildExtractionEvidence } from "./extraction-evidence.js";
import { normalizeWhitespace, truncate } from "../utils/text.js";

const CORRECTION_TOOL_PATTERN = /\b(apply_patch|edit|write|patch|update|modify)\b/i;
const CORRECTION_OUTPUT_PATTERN = /\b(applied|updated|patched|modified|wrote|fixed)\b/i;
const DIRECTIONAL_CORRECTION_CUE_PATTERN =
  /\b(wrong (?:direction|layer|behavior|goal|abstraction|boundary)|not (?:the )?(?:right|requested)|not what (?:i|we) (?:want|asked)|instead of|rather than|focus on|problem is (?:still )?in|issue is (?:still )?in|belongs? in|priority is|quality bar|verification order|wrong scope|wrong abstraction)\b/i;
const USER_FEEDBACK_EVENT_PATTERN = /\b(user|feedback|review|comment|instruction)\b/i;
const OBJECTIVE_VERIFICATION_PATTERN =
  /\b(test|probe|verify|verification|typecheck|doctor|assert|integration|smoke check|health check|browser verify|browser verification)\b/i;
const USER_CONFIRMATION_PATTERN =
  /\b(yes(?:,? this)?|that'?s right|looks good|approved|confirmed|accepted|this is correct|that works|exactly)\b/i;
const REVERSAL_HYPOTHESIS_PATTERN =
  /\b(initial|first|earlier|active|current) (?:working )?(?:hypothesis|direction|path|fix)|\bhypothesis\b|\blooked plausible\b/i;
const INVALIDATING_EVIDENCE_PATTERN =
  /\b(ruled out|disproved|contradicted|invalidated|showed .* still|showed .* wrong|proved .* wrong|not the root cause|wrong problem shape|still failing inside)\b/i;
const REVERSAL_PIVOT_PATTERN =
  /\b(pivoted|switched|moved the fix|moved .* into|reworked|replacement path|instead of continuing)\b/i;
const REPLACEMENT_PATH_PATTERN =
  /\b(provider routing|routing fix|interaction logic|replacement path|after the .* fix|after moving .* into|corrected .* path|updated .* after the stronger probe)\b/i;

export type CandidateSignalSummary = {
  failure_signature?: string;
  retry_count: number;
  correction_signals: string[];
  directional_correction?: CandidateSourceSignal["directional_correction"];
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

const pushDirectionalSnippet = (
  snippets: string[],
  sources: string[],
  snippet: string | undefined,
  source: string
): void => {
  const normalized = normalizeWhitespace(snippet ?? "");
  if (!normalized || snippets.includes(normalized)) {
    return;
  }
  snippets.push(normalized);
  sources.push(source);
};

const buildDirectionalCorrectionSignal = (input: ExperienceInput): CandidateSourceSignal["directional_correction"] => {
  const snippets: string[] = [];
  const sources: string[] = [];
  let sawUserExplicit = false;
  let sawTaskEvidence = false;

  if (input.context_summary && DIRECTIONAL_CORRECTION_CUE_PATTERN.test(input.context_summary)) {
    pushDirectionalSnippet(snippets, sources, input.context_summary, "context_summary");
    sawTaskEvidence = true;
  }

  for (const event of input.tool_events) {
    const summary = normalizeWhitespace(event.output_summary ?? event.error_signature ?? "");
    if (!summary) {
      continue;
    }

    const hasDirectionalCue = DIRECTIONAL_CORRECTION_CUE_PATTERN.test(summary);
    if (USER_FEEDBACK_EVENT_PATTERN.test(event.tool_name) && hasDirectionalCue) {
      pushDirectionalSnippet(snippets, sources, summary, `tool_event:${event.tool_name}`);
      sawUserExplicit = true;
      continue;
    }

    if (hasDirectionalCue) {
      pushDirectionalSnippet(snippets, sources, summary, `tool_event:${event.tool_name}`);
      sawTaskEvidence = true;
    }
  }

  if (snippets.length === 0 && DIRECTIONAL_CORRECTION_CUE_PATTERN.test(input.task_summary)) {
    pushDirectionalSnippet(snippets, sources, input.task_summary, "task_summary");
    sawTaskEvidence = true;
  }

  const objectiveSupport =
    input.outcome_signal === "success" &&
    input.tool_events.some(
      (event) =>
        event.status === "success" &&
        OBJECTIVE_VERIFICATION_PATTERN.test([event.tool_name, event.output_summary, event.error_signature].filter(Boolean).join(" "))
    );

  const userConfirmation =
    input.outcome_signal === "success" &&
    [input.context_summary, ...input.tool_events.map((event) => event.output_summary ?? event.error_signature ?? "")]
      .filter(Boolean)
      .some((text) => USER_CONFIRMATION_PATTERN.test(text));

  const detected = snippets.length > 0;
  const correctionSource =
    sawUserExplicit && sawTaskEvidence ? "mixed" : sawUserExplicit ? "user_explicit" : sawTaskEvidence ? "task_evidence" : undefined;
  const improvementEvidence =
    objectiveSupport && userConfirmation
      ? "mixed"
      : objectiveSupport
        ? "objective_support"
        : userConfirmation
          ? "user_confirmation"
          : "none";
  const correctionStrength = !detected
    ? "low"
    : improvementEvidence !== "none"
      ? "high"
      : correctionSource === "user_explicit" || correctionSource === "mixed"
        ? "medium"
        : "low";

  return {
    detected,
    sources: sources.slice(0, 4),
    snippets: snippets.slice(0, 4),
    correction_strength: correctionStrength,
    correction_source: correctionSource,
    objective_support: objectiveSupport,
    user_confirmation: userConfirmation,
    improvement_evidence: improvementEvidence
  };
};

const buildEvidenceDrivenReversalSignal = (
  input: ExperienceInput
): CandidateSourceSignal["evidence_driven_reversal"] => {
  const hypothesisSnippets: string[] = [];
  const invalidatingSnippets: string[] = [];
  const pivotSnippets: string[] = [];
  const replacementSnippets: string[] = [];
  const validatingSnippets: string[] = [];

  const pushSourceSnippet = (target: string[], value?: string): void => {
    const normalized = normalizeWhitespace(value ?? "");
    if (!normalized || target.includes(normalized)) {
      return;
    }
    target.push(normalized);
  };

  if (input.task_summary && REVERSAL_HYPOTHESIS_PATTERN.test(input.task_summary)) {
    pushSourceSnippet(hypothesisSnippets, input.task_summary);
  }
  if (input.context_summary) {
    if (REVERSAL_HYPOTHESIS_PATTERN.test(input.context_summary)) {
      pushSourceSnippet(hypothesisSnippets, input.context_summary);
    }
    if (INVALIDATING_EVIDENCE_PATTERN.test(input.context_summary)) {
      pushSourceSnippet(invalidatingSnippets, input.context_summary);
    }
    if (REVERSAL_PIVOT_PATTERN.test(input.context_summary)) {
      pushSourceSnippet(pivotSnippets, input.context_summary);
    }
    if (REPLACEMENT_PATH_PATTERN.test(input.context_summary)) {
      pushSourceSnippet(replacementSnippets, input.context_summary);
    }
    if (OBJECTIVE_VERIFICATION_PATTERN.test(input.context_summary) && /\b(pass|passed|succeeded|confirmed)\b/i.test(input.context_summary)) {
      pushSourceSnippet(validatingSnippets, input.context_summary);
    }
  }

  for (const event of input.tool_events) {
    const summary = normalizeWhitespace(event.output_summary ?? event.error_signature ?? "");
    if (!summary) {
      continue;
    }
    if (REVERSAL_HYPOTHESIS_PATTERN.test(summary)) {
      pushSourceSnippet(hypothesisSnippets, summary);
    }
    if (INVALIDATING_EVIDENCE_PATTERN.test(summary)) {
      pushSourceSnippet(invalidatingSnippets, summary);
    }
    if (REVERSAL_PIVOT_PATTERN.test(summary)) {
      pushSourceSnippet(pivotSnippets, summary);
    }
    if (REPLACEMENT_PATH_PATTERN.test(summary)) {
      pushSourceSnippet(replacementSnippets, summary);
    }
    if (
      event.status === "success" &&
      OBJECTIVE_VERIFICATION_PATTERN.test([event.tool_name, summary].join(" ")) &&
      /\b(pass|passed|succeeded|confirmed)\b/i.test(summary)
    ) {
      pushSourceSnippet(validatingSnippets, summary);
    }
  }

  const priorHypothesis = hypothesisSnippets.length > 0;
  const invalidatingEvidence = invalidatingSnippets.length > 0;
  const validatingEvidence = input.outcome_signal === "success" && validatingSnippets.length > 0;
  const replacementPath = pivotSnippets.length > 0 || replacementSnippets.length > 0;
  const detected = priorHypothesis && invalidatingEvidence && validatingEvidence && replacementPath;
  const reversalStrength = !detected ? "low" : validatingSnippets.length > 1 ? "high" : "medium";

  return {
    detected,
    reversal_source: detected ? "task_evidence" : undefined,
    reversal_strength: reversalStrength,
    prior_hypothesis: priorHypothesis,
    invalidating_evidence: invalidatingEvidence,
    validating_evidence: validatingEvidence,
    hypothesis_snippets: hypothesisSnippets.slice(0, 3),
    invalidating_snippets: invalidatingSnippets.slice(0, 3),
    pivot_snippets: pivotSnippets.slice(0, 3),
    replacement_snippets: replacementSnippets.slice(0, 3),
    validating_snippets: validatingSnippets.slice(0, 3)
  };
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
  const directionalCorrection = buildDirectionalCorrectionSignal(input);
  const evidenceDrivenReversal = buildEvidenceDrivenReversalSignal(input);
  const toolEventSummary = summarizeToolEvents(input.tool_events);

  const criticality = Boolean(failureSignature) || retryCount > 0 || correctionSignals.length > 0;
  const improvementRoom = input.outcome_signal === "failure" || retryCount > 0;
  const recoverablePath = input.outcome_signal === "success" || correctionSignals.length > 0;

  return {
    failure_signature: failureSignature,
    retry_count: retryCount,
    correction_signals: correctionSignals,
    directional_correction: directionalCorrection,
    evidence_driven_reversal: evidenceDrivenReversal,
    tool_event_summary: toolEventSummary,
    criticality,
    improvement_room: improvementRoom,
    recoverable_path: recoverablePath
  };
};
