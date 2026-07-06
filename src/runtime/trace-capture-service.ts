import type { DatabaseSync } from "node:sqlite";
import {
  normalizeAntigravityEvent,
  normalizeClaudeEvent,
  normalizeCodexEvent,
  normalizeOpenClawEvent
} from "../adapters/host-normalizers.js";
import { getHostTraceCapabilityProfile } from "../adapters/trace-capabilities.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import type { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import type { TraceRepository } from "../store/sqlite/repositories/trace-repo.js";
import type {
  ExperienceInput,
  ExperienceInputRecord,
  HostTraceCapabilityProfile,
  InjectionEvent,
  TaskRun,
  TraceCapsule,
  TraceEvent,
  TraceProvenanceSummary
} from "../types/domain.js";
import type { HostPromptContext, HostToolResult } from "../types/plugin.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";

export type TraceCaptureSessionState = {
  traceEvents?: TraceEvent[];
  lastInjectionEvent?: InjectionEvent;
};

export type TraceCaptureServiceOptions = {
  config: ExperienceEngineConfig;
  db: DatabaseSync;
  traceRepo: TraceRepository;
  inputRepo: InputRecordRepository;
  taskRunRepo: TaskRunRepository;
};

const DIRECTIONAL_CORRECTION_CUE_PATTERN =
  /\b(wrong (?:direction|layer|behavior|goal|abstraction|boundary)|not (?:the )?(?:right|requested)|not what (?:i|we) (?:want|asked)|instead of|rather than|focus on|problem is (?:still )?in|issue is (?:still )?in|belongs? in|priority is|quality bar|verification order|wrong scope|wrong abstraction)\b/i;

export const normalizeTraceHost = (host: string | undefined): TaskRun["host"] => {
  const normalized = String(host || "").toLowerCase();
  if (normalized.includes("claude")) {
    return "claude-code";
  }
  if (normalized.includes("codex")) {
    return "codex";
  }
  if (normalized.includes("antigravity")) {
    return "antigravity";
  }
  return "openclaw";
};

const includesTraceScope = (patterns: string[], scopeId: string, cwd?: string): boolean =>
  patterns.length === 0 ||
  patterns.some((pattern) => pattern === scopeId || (cwd ? cwd.includes(pattern) : false));

function normalizeHostEvent(host: string | undefined, raw: any): TraceEvent {
  const normalizedHost = normalizeTraceHost(host);
  if (normalizedHost === "claude-code") {
    return normalizeClaudeEvent(raw);
  } else if (normalizedHost === "codex") {
    return normalizeCodexEvent(raw);
  } else if (normalizedHost === "openclaw") {
    return normalizeOpenClawEvent(raw);
  } else {
    return normalizeAntigravityEvent(raw);
  }
}

export class TraceCaptureService {
  constructor(private readonly options: TraceCaptureServiceOptions) {}

  isEnabledFor(context: HostPromptContext, scopeId?: string): boolean {
    if (!this.options.config.traceCaptureEnabled) {
      return false;
    }

    const host = normalizeTraceHost(context.host);
    if (this.options.config.traceCaptureHosts.length > 0 && !this.options.config.traceCaptureHosts.includes(host)) {
      return false;
    }

    return scopeId ? includesTraceScope(this.options.config.traceCaptureScopes, scopeId, context.cwd) : true;
  }

  private shouldPersistDiagnosticTraceSnapshot(context: HostPromptContext, scopeId: string): boolean {
    if (!this.options.config.tracePersistDiagnosticSnapshots || !this.isEnabledFor(context, scopeId)) {
      return false;
    }

    const host = normalizeTraceHost(context.host);
    return (
      this.options.config.traceDiagnosticSnapshotHosts.includes(host) ||
      this.options.config.traceDiagnosticSnapshotScopes.some((pattern) =>
        pattern === scopeId || (context.cwd ? context.cwd.includes(pattern) : false)
      )
    );
  }

  captureRawEvent(session: TraceCaptureSessionState, context: HostPromptContext, raw: any): void {
    if (!this.isEnabledFor(context)) {
      return;
    }

    session.traceEvents ??= [];
    session.traceEvents.push(normalizeHostEvent(context.host, raw));
  }

  capturePromptEvent(session: TraceCaptureSessionState, context: HostPromptContext, message = ""): void {
    if (!this.isEnabledFor(context)) {
      return;
    }

    const isCorrection = DIRECTIONAL_CORRECTION_CUE_PATTERN.test(message);
    const eventName = isCorrection ? "correction" : "prompt";
    const rawPromptEvent: any = {
      timestamp: nowIso()
    };

    const host = normalizeTraceHost(context.host);
    if (host === "claude-code") {
      rawPromptEvent.eventName = eventName;
      rawPromptEvent.promptText = message;
    } else if (host === "codex") {
      rawPromptEvent.type = eventName;
      rawPromptEvent.prompt = message;
    } else if (host === "openclaw") {
      rawPromptEvent.event = eventName === "correction" ? "correction" : "message";
      rawPromptEvent.message = message;
    } else {
      rawPromptEvent.name = eventName;
      rawPromptEvent.prompt = message;
    }

    this.captureRawEvent(session, context, rawPromptEvent);
  }

  captureToolResultEvents(input: {
    sessionId: string;
    session: TraceCaptureSessionState;
    context: HostPromptContext;
    result: HostToolResult;
  }): void {
    if (!this.isEnabledFor(input.context)) {
      return;
    }

    const host = normalizeTraceHost(input.context.host);
    const traceCallId =
      input.result.toolCallId ||
      stableId("tracecall", `${input.sessionId}:${input.result.toolName}:${input.result.inputSummary ?? ""}`);
    const rawToolCallEvent: any = {
      timestamp: input.result.startedAt || nowIso(),
      id: `${traceCallId}:call`,
      toolName: input.result.toolName,
      toolInputSummary: input.result.inputSummary || "",
      arguments: input.result.inputSummary || "",
      toolCallId: input.result.toolCallId || "call_unknown"
    };

    if (host === "claude-code") {
      rawToolCallEvent.eventName = "beforetooluse";
    } else if (host === "codex") {
      rawToolCallEvent.type = "tool_call";
    } else if (host === "openclaw") {
      rawToolCallEvent.event = "tool_call";
    } else {
      rawToolCallEvent.name = "tool_call";
    }

    this.captureRawEvent(input.session, input.context, rawToolCallEvent);

    const rawToolResultEvent: any = {
      timestamp: input.result.endedAt || nowIso(),
      id: `${traceCallId}:result`,
      toolName: input.result.toolName,
      toolInputSummary: input.result.inputSummary || "",
      arguments: input.result.inputSummary || "",
      toolOutputSummary: input.result.outputSummary || input.result.errorSignature || "",
      result: input.result.outputSummary || "",
      error: input.result.errorSignature || "",
      status: input.result.status || "success",
      exitCode: input.result.exitCode,
      exit_code: input.result.exitCode,
      toolCallId: input.result.toolCallId || "call_unknown"
    };

    if (host === "claude-code") {
      rawToolResultEvent.eventName = input.result.status === "failure" ? "posttoolusefailure" : "posttoolusesuccess";
    } else if (host === "codex") {
      rawToolResultEvent.type = "tool_result";
    } else if (host === "openclaw") {
      rawToolResultEvent.event = "tool_result";
    } else {
      rawToolResultEvent.name = "tool_result";
    }

    this.captureRawEvent(input.session, input.context, rawToolResultEvent);
  }

  private buildTraceHostProfile(host: TaskRun["host"]): HostTraceCapabilityProfile {
    return getHostTraceCapabilityProfile(host, this.options.db);
  }

  private buildTraceProvenanceSummary(input: {
    hostProfile: HostTraceCapabilityProfile;
    events: TraceEvent[];
    completenessScore: number;
    droppedEventsCount: number;
    redactionApplied: boolean;
    diagnosticSnapshotId?: string;
  }): TraceProvenanceSummary {
    const evidenceCategoryCounts: Record<string, number> = {};
    for (const event of input.events) {
      evidenceCategoryCounts[event.event_type] = (evidenceCategoryCounts[event.event_type] ?? 0) + 1;
    }

    const capabilityStates = new Set(Object.values(input.hostProfile.capabilities).map((capability) => capability.state));
    const capabilityState = capabilityStates.size === 1
      ? [...capabilityStates][0] ?? "unavailable"
      : capabilityStates.size > 1
        ? "mixed"
        : "unavailable";

    return {
      completeness_score: input.completenessScore,
      host: input.hostProfile.host,
      capability_state: capabilityState,
      evidence_category_counts: evidenceCategoryCounts,
      dropped_events_count: input.droppedEventsCount,
      redaction_applied: input.redactionApplied,
      source_provenance: "runtime_trace",
      learning_use_reason: input.completenessScore >= 0.6 ? "trace evidence available for distillation" : "trace evidence available but incomplete",
      diagnostic_snapshot_id: input.diagnosticSnapshotId
    };
  }

  persistForFinalizedRun(input: {
    context: HostPromptContext;
    session: TraceCaptureSessionState;
    sessionId: string;
    experienceInput: ExperienceInput;
    record: ExperienceInputRecord;
    taskRun: TaskRun;
    episodeId: string;
  }): { experienceInput: ExperienceInput; taskRun: TaskRun; record: ExperienceInputRecord } {
    const scopeId = input.experienceInput.scope_id;
    if (!this.isEnabledFor(input.context, scopeId)) {
      return {
        experienceInput: input.experienceInput,
        taskRun: input.taskRun,
        record: input.record
      };
    }

    const host = normalizeTraceHost(input.context.host);
    const rawStopEvent: any = {
      timestamp: nowIso(),
      reason: input.context.outcomeSignal || input.experienceInput.outcome_signal || "completed"
    };
    if (host === "claude-code") {
      rawStopEvent.eventName = "stop";
    } else if (host === "codex") {
      rawStopEvent.type = "stop";
    } else if (host === "openclaw") {
      rawStopEvent.event = "stop";
    } else {
      rawStopEvent.name = "stop";
    }
    this.captureRawEvent(input.session, input.context, rawStopEvent);

    const observedEvents = input.session.traceEvents ?? [];
    const diagnosticSnapshotPersistence = this.shouldPersistDiagnosticTraceSnapshot(input.context, scopeId);
    const maxEvents = this.options.config.traceMaxEvents;
    const persistedEvents = diagnosticSnapshotPersistence ? observedEvents.slice(-maxEvents) : [];
    const droppedEventsCount = diagnosticSnapshotPersistence
      ? Math.max(0, observedEvents.length - persistedEvents.length)
      : observedEvents.length;
    const hasPrompt = observedEvents.some((event) => event.event_type === "prompt" || event.event_type === "correction");
    const hasStop = observedEvents.some((event) => event.event_type === "stop" || event.event_type === "task_completion");
    const expectedToolEvidence = input.experienceInput.tool_events.length === 0
      || observedEvents.some((event) =>
        event.event_type === "tool_call" ||
        event.event_type === "tool_result" ||
        event.event_type === "tool_failure" ||
        event.event_type === "verification" ||
        event.event_type === "file_change"
      );
    const completenessScore = Number(
      (
        0.25 +
        (hasPrompt ? 0.25 : 0) +
        (expectedToolEvidence ? 0.25 : 0) +
        (hasStop ? 0.25 : 0)
      ).toFixed(2)
    );
    const capsuleId = `trace_cap_${createId("trace")}`;
    const now = nowIso();
    const traceCompleteness = Math.min(1, completenessScore);
    const hostProfile = this.buildTraceHostProfile(host);
    const traceProvenance = this.buildTraceProvenanceSummary({
      hostProfile,
      events: observedEvents,
      completenessScore: traceCompleteness,
      droppedEventsCount,
      redactionApplied: observedEvents.length > 0,
      diagnosticSnapshotId: diagnosticSnapshotPersistence ? capsuleId : undefined
    });
    const tracedInput: ExperienceInput = {
      ...input.experienceInput,
      trace_capsule_id: diagnosticSnapshotPersistence ? capsuleId : undefined,
      trace_completeness: traceCompleteness,
      trace_provenance: traceProvenance
    };
    const tracedRecord: ExperienceInputRecord = {
      ...input.record,
      trace_capsule_id: diagnosticSnapshotPersistence ? capsuleId : undefined,
      trace_completeness: traceCompleteness,
      trace_provenance: traceProvenance
    };
    const tracedTaskRun: TaskRun = {
      ...input.taskRun,
      trace_capsule_id: diagnosticSnapshotPersistence ? capsuleId : undefined,
      trace_completeness: traceCompleteness,
      trace_provenance: traceProvenance,
      updated_at: now
    };

    if (diagnosticSnapshotPersistence) {
      const capsule: TraceCapsule = {
        id: capsuleId,
        scope_id: scopeId,
        episode_id: input.episodeId,
        task_run_id: input.taskRun.id,
        session_id: input.sessionId,
        task: {
          goal: input.experienceInput.task_summary || input.context.taskSummary || input.context.userMessage || "",
          user_constraints: [],
          injected_expectations: input.session.lastInjectionEvent?.scorecard?.recommendation
            ? [input.session.lastInjectionEvent.scorecard.recommendation]
            : [],
          delivered_node_ids: input.experienceInput.injected_node_ids
        },
        events: persistedEvents,
        evidence_refs: [],
        outcome: {
          outcome_signal: input.experienceInput.outcome_signal,
          confidence: hasStop ? "medium" : "low",
          summary: input.context.contextSummary ?? input.experienceInput.context_summary ?? input.experienceInput.task_summary,
          failure_signature: input.experienceInput.tool_events.find((event) => event.status === "failure")?.error_signature
        },
        capture_metadata: {
          is_complete: traceCompleteness >= 0.75,
          completeness_score: traceCompleteness,
          metadata_only: false,
          dropped_events_count: droppedEventsCount,
          redaction_applied: observedEvents.length > 0,
          size_bytes: JSON.stringify(persistedEvents).length
        },
        host_profile: hostProfile,
        created_at: now,
        updated_at: now
      };

      this.options.traceRepo.upsert(capsule);
      this.options.traceRepo.cleanupOldTraces(this.options.config.traceRetentionDays);
      this.options.traceRepo.cleanupCapsuleLimits(capsuleId, this.options.config.traceMaxEvents, this.options.config.traceMaxEvidenceRefs);
    }
    this.options.inputRepo.upsert(tracedRecord);
    this.options.taskRunRepo.upsert(tracedTaskRun);

    return {
      experienceInput: tracedInput,
      taskRun: tracedTaskRun,
      record: tracedRecord
    };
  }
}
