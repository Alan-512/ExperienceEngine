import type { DatabaseSync } from "node:sqlite";
import type { ExperienceCandidate } from "../../../types/domain.js";

type CandidateRow = {
  id: string;
  source_record_id: string;
  scope_id: string;
  task_type: ExperienceCandidate["task_type"];
  node_type: ExperienceCandidate["node_type"];
  trigger_pattern: string;
  applicability_notes: string | null;
  env_signature: string | null;
  compact_hint: string;
  goal: string | null;
  recommended_steps_json: string | null;
  avoid_steps_json: string | null;
  fallback_steps_json: string | null;
  success_signal: string;
  stop_condition: string | null;
  escalation_condition: string | null;
  evidence_summary: string;
  retrieval_text: string | null;
  source_kind: ExperienceCandidate["source_kind"];
  source_context_summary: string | null;
  source_outcome_signal: ExperienceCandidate["source_outcome_signal"];
  source_signal_json: string;
  lifecycle_state: ExperienceCandidate["lifecycle_state"];
  retry_count: number;
  distilled_node_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  distilled_at: string | null;
  discarded_at: string | null;
  last_failed_at: string | null;
};

export class CandidateRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapCandidate(row: CandidateRow): ExperienceCandidate {
    return {
      id: row.id,
      source_record_id: row.source_record_id,
      scope_id: row.scope_id,
      task_type: row.task_type,
      node_type: row.node_type,
      trigger_pattern: row.trigger_pattern,
      applicability_notes: row.applicability_notes ?? undefined,
      env_signature: row.env_signature ?? undefined,
      compact_hint: row.compact_hint,
      goal: row.goal ?? undefined,
      recommended_steps: JSON.parse(row.recommended_steps_json ?? "[]") as string[],
      avoid_steps: JSON.parse(row.avoid_steps_json ?? "[]") as string[],
      fallback_steps: JSON.parse(row.fallback_steps_json ?? "[]") as string[],
      success_signal: row.success_signal,
      stop_condition: row.stop_condition ?? undefined,
      escalation_condition: row.escalation_condition ?? undefined,
      evidence_summary: row.evidence_summary,
      retrieval_text: row.retrieval_text ?? undefined,
      source_kind: row.source_kind,
      source_context_summary: row.source_context_summary ?? undefined,
      source_outcome_signal: row.source_outcome_signal,
      source_signal: JSON.parse(row.source_signal_json) as ExperienceCandidate["source_signal"],
      lifecycle_state: row.lifecycle_state,
      retry_count: row.retry_count,
      distilled_node_id: row.distilled_node_id ?? undefined,
      last_error: row.last_error ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      distilled_at: row.distilled_at ?? undefined,
      discarded_at: row.discarded_at ?? undefined,
      last_failed_at: row.last_failed_at ?? undefined
    };
  }

  upsert(candidate: ExperienceCandidate): ExperienceCandidate {
    const payload = {
      id: candidate.id,
      source_record_id: candidate.source_record_id,
      scope_id: candidate.scope_id,
      task_type: candidate.task_type,
      node_type: candidate.node_type,
      trigger_pattern: candidate.trigger_pattern,
      applicability_notes: candidate.applicability_notes ?? null,
      env_signature: candidate.env_signature ?? null,
      compact_hint: candidate.compact_hint,
      goal: candidate.goal ?? null,
      recommended_steps_json: JSON.stringify(candidate.recommended_steps ?? []),
      avoid_steps_json: JSON.stringify(candidate.avoid_steps ?? []),
      fallback_steps_json: JSON.stringify(candidate.fallback_steps ?? []),
      success_signal: candidate.success_signal,
      stop_condition: candidate.stop_condition ?? null,
      escalation_condition: candidate.escalation_condition ?? null,
      evidence_summary: candidate.evidence_summary,
      retrieval_text: candidate.retrieval_text ?? null,
      source_kind: candidate.source_kind,
      source_context_summary: candidate.source_context_summary ?? null,
      source_outcome_signal: candidate.source_outcome_signal,
      source_signal_json: JSON.stringify(candidate.source_signal),
      lifecycle_state: candidate.lifecycle_state,
      retry_count: candidate.retry_count,
      distilled_node_id: candidate.distilled_node_id ?? null,
      last_error: candidate.last_error ?? null,
      created_at: candidate.created_at,
      updated_at: candidate.updated_at,
      distilled_at: candidate.distilled_at ?? null,
      discarded_at: candidate.discarded_at ?? null,
      last_failed_at: candidate.last_failed_at ?? null
    };

    this.db
      .prepare(
        `INSERT INTO experience_candidates
          (id, source_record_id, scope_id, task_type, node_type, trigger_pattern, applicability_notes, env_signature,
           compact_hint, goal, recommended_steps_json, avoid_steps_json, fallback_steps_json, success_signal, stop_condition,
           escalation_condition, evidence_summary, retrieval_text, source_kind, source_context_summary, source_outcome_signal,
           source_signal_json, lifecycle_state, retry_count, distilled_node_id, last_error, created_at, updated_at, distilled_at,
           discarded_at, last_failed_at)
         VALUES
          (@id, @source_record_id, @scope_id, @task_type, @node_type, @trigger_pattern, @applicability_notes, @env_signature,
           @compact_hint, @goal, @recommended_steps_json, @avoid_steps_json, @fallback_steps_json, @success_signal, @stop_condition,
           @escalation_condition, @evidence_summary, @retrieval_text, @source_kind, @source_context_summary, @source_outcome_signal,
           @source_signal_json, @lifecycle_state, @retry_count, @distilled_node_id, @last_error, @created_at, @updated_at, @distilled_at,
           @discarded_at, @last_failed_at)
         ON CONFLICT(id) DO UPDATE SET
           source_record_id = excluded.source_record_id,
           trigger_pattern = excluded.trigger_pattern,
           applicability_notes = excluded.applicability_notes,
           env_signature = excluded.env_signature,
           compact_hint = excluded.compact_hint,
           goal = excluded.goal,
           recommended_steps_json = excluded.recommended_steps_json,
           avoid_steps_json = excluded.avoid_steps_json,
           fallback_steps_json = excluded.fallback_steps_json,
           success_signal = excluded.success_signal,
           stop_condition = excluded.stop_condition,
           escalation_condition = excluded.escalation_condition,
           evidence_summary = excluded.evidence_summary,
           retrieval_text = excluded.retrieval_text,
           source_kind = excluded.source_kind,
           source_context_summary = excluded.source_context_summary,
           source_outcome_signal = excluded.source_outcome_signal,
           source_signal_json = excluded.source_signal_json,
           lifecycle_state = excluded.lifecycle_state,
           retry_count = excluded.retry_count,
           distilled_node_id = excluded.distilled_node_id,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at,
           distilled_at = excluded.distilled_at,
           discarded_at = excluded.discarded_at,
           last_failed_at = excluded.last_failed_at`
      )
      .run(payload);

    return candidate;
  }

  getById(id: string): ExperienceCandidate | undefined {
    const row = this.db.prepare("SELECT * FROM experience_candidates WHERE id = ? LIMIT 1").get(id) as
      | CandidateRow
      | undefined;
    return row ? this.mapCandidate(row) : undefined;
  }

  listByScope(scopeId: string): ExperienceCandidate[] {
    return this.db
      .prepare("SELECT * FROM experience_candidates WHERE scope_id = ? ORDER BY updated_at DESC")
      .all(scopeId)
      .map((row) => this.mapCandidate(row as CandidateRow));
  }

  listByLifecycleState(state: ExperienceCandidate["lifecycle_state"]): ExperienceCandidate[] {
    return this.db
      .prepare("SELECT * FROM experience_candidates WHERE lifecycle_state = ? ORDER BY updated_at DESC")
      .all(state)
      .map((row) => this.mapCandidate(row as CandidateRow));
  }

  listBySourceRecordId(sourceRecordId: string): ExperienceCandidate[] {
    return this.db
      .prepare("SELECT * FROM experience_candidates WHERE source_record_id = ? ORDER BY updated_at DESC")
      .all(sourceRecordId)
      .map((row) => this.mapCandidate(row as CandidateRow));
  }
}
