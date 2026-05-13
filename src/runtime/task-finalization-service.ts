import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import { createEmptyStats, updateStats } from "../feedback/stats-updater.js";
import { buildExperienceInput } from "../input/input-adapter.js";
import { resolveScope } from "../input/scope-resolver.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";
import type { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import type { OutcomeRecordRepository } from "../store/sqlite/repositories/outcome-record-repo.js";
import type { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import type { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import type { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import type {
  ExperienceInput,
  ExperienceInputRecord,
  OutcomeRecord,
  TaskRun,
  ToolEvent
} from "../types/domain.js";
import type { HostPromptContext } from "../types/plugin.js";

export type TaskFinalizationSessionState = {
  context?: HostPromptContext;
  toolEvents: ToolEvent[];
  injectedNodeIds: string[];
};

export type TaskFinalizationServiceOptions = {
  scopeRepo: ScopeRepository;
  inputRepo: InputRecordRepository;
  taskRunRepo: TaskRunRepository;
  outcomeRepo: OutcomeRecordRepository;
  statsRepo: StatsRepository;
};

export const mergeContext = (existing: HostPromptContext | undefined, incoming: HostPromptContext): HostPromptContext => ({
  host: incoming.host ?? existing?.host,
  sessionId: incoming.sessionId ?? existing?.sessionId,
  cwd: incoming.cwd ?? existing?.cwd,
  userMessage: incoming.userMessage || existing?.userMessage || "",
  taskSummary: incoming.taskSummary ?? existing?.taskSummary,
  contextSummary: incoming.contextSummary ?? existing?.contextSummary,
  injectedNodeIds: incoming.injectedNodeIds ?? existing?.injectedNodeIds
});

const toEvidence = (input: ExperienceInput): string[] =>
  input.tool_events.map((event) =>
    [event.tool_name, event.status, event.error_signature ?? event.output_summary]
      .filter(Boolean)
      .join(": ")
  );

const toInputRecord = (input: ExperienceInput, sessionId?: string, episodeId?: string): ExperienceInputRecord => ({
  record_id: createId("input"),
  episode_id: episodeId,
  scope_id: input.scope_id,
  session_id: sessionId,
  task_type: input.task_type,
  task_summary: input.task_summary,
  outcome_signal: input.outcome_signal,
  context_summary: input.context_summary,
  evidence: toEvidence(input),
  injected_node_ids: input.injected_node_ids,
  created_at: nowIso()
});

const toTaskRun = (input: ExperienceInput, sessionId: string, context: HostPromptContext, episodeId?: string): TaskRun => {
  const timestamp = nowIso();
  const signals = buildCandidateSignals(input);

  return {
    id: stableId("taskrun", `${sessionId}:${input.task_summary}:${timestamp}`),
    episode_id: episodeId,
    host: context.host ?? "openclaw",
    scope_id: input.scope_id,
    session_id: sessionId,
    task_type: input.task_type,
    task_summary: input.task_summary,
    prompt_excerpt: context.userMessage,
    context_summary: input.context_summary,
    started_at: timestamp,
    ended_at: timestamp,
    final_status:
      input.outcome_signal === "success" ? "success" : input.outcome_signal === "failure" ? "failure" : "unknown",
    failure_signature: signals.failure_signature,
    learning_status: undefined,
    learning_reason: undefined,
    created_at: timestamp,
    updated_at: timestamp
  };
};

const toOutcomeRecord = (taskRun: TaskRun, input: ExperienceInput, episodeId?: string): OutcomeRecord => ({
  id: createId("outcome"),
  episode_id: episodeId,
  task_run_id: taskRun.id,
  outcome_signal: input.outcome_signal,
  failure_signature: taskRun.failure_signature,
  summary: input.task_summary,
  created_at: nowIso()
});

export class TaskFinalizationService {
  constructor(private readonly options: TaskFinalizationServiceOptions) {}

  buildFinalizedInput(context: HostPromptContext, session: TaskFinalizationSessionState): ExperienceInput {
    const mergedContext = mergeContext(session.context, context);
    const injectedNodeIds =
      session.injectedNodeIds.length > 0 ? session.injectedNodeIds : mergedContext.injectedNodeIds ?? [];
    return buildExperienceInput(
      {
        ...mergedContext,
        injectedNodeIds
      },
      session.toolEvents
    );
  }

  persistFinalizedRun(input: {
    experienceInput: ExperienceInput;
    sessionId: string;
    session: TaskFinalizationSessionState;
    episodeId?: string;
    context: HostPromptContext;
    cwd?: string;
  }): {
    record: ExperienceInputRecord;
    taskRun: TaskRun;
  } {
    const resolvedScope = resolveScope(input.cwd ?? input.session.context?.cwd);
    const existingScope = this.options.scopeRepo.getById(resolvedScope.scope_id);
    this.options.scopeRepo.upsert({
      ...resolvedScope,
      is_disabled: existingScope?.is_disabled ?? resolvedScope.is_disabled
    });

    const record = toInputRecord(input.experienceInput, input.sessionId, input.episodeId);
    this.options.inputRepo.upsert(record);

    if (input.experienceInput.task_type !== "unknown") {
      const currentStats =
        this.options.statsRepo.get(input.experienceInput.scope_id, input.experienceInput.task_type) ??
        createEmptyStats(input.experienceInput.scope_id, input.experienceInput.task_type);
      this.options.statsRepo.upsert(
        updateStats(currentStats, input.experienceInput.outcome_signal, input.experienceInput.injected_node_ids.length > 0)
      );
    }

    const taskRun = toTaskRun(input.experienceInput, input.sessionId, input.context, input.episodeId);
    this.options.taskRunRepo.upsert(taskRun);
    this.options.outcomeRepo.upsert(toOutcomeRecord(taskRun, input.experienceInput, input.episodeId));

    return { record, taskRun };
  }
}
