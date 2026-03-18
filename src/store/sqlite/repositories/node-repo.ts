import type { DatabaseSync } from "node:sqlite";
import type { ExperienceNode } from "../../../types/domain.js";

export class NodeRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapNode(row: {
    id: string;
    node_type: ExperienceNode["node_type"];
    scope_id: string;
    task_type: ExperienceNode["task_type"];
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
    embedding_json: string | null;
    embedding_provider: string | null;
    embedding_model: string | null;
    embedding_version: string | null;
    embedding_dimensions: number | null;
    distillation_mode_used: string | null;
    distillation_source: string | null;
    redistilled_from: string | null;
    source_kind: ExperienceNode["source_kind"];
    origin_record_ids_json: string;
    helped_record_ids_json: string;
    harmed_record_ids_json: string;
    state: ExperienceNode["state"];
    usage_count: number;
    helped_count: number;
    harmed_count: number;
    support_count: number;
    last_used_at: string | null;
    last_helped_at: string | null;
    last_harmed_at: string | null;
    created_at: string;
    updated_at: string;
  }): ExperienceNode {
    return {
      id: row.id,
      node_type: row.node_type,
      scope_id: row.scope_id,
      task_type: row.task_type,
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
      embedding: row.embedding_json ? (JSON.parse(row.embedding_json) as number[]) : undefined,
      embedding_provider: row.embedding_provider ?? undefined,
      embedding_model: row.embedding_model ?? undefined,
      embedding_version: row.embedding_version ?? undefined,
      embedding_dimensions: row.embedding_dimensions ?? undefined,
      distillation_mode_used: row.distillation_mode_used as ExperienceNode["distillation_mode_used"],
      distillation_source: row.distillation_source as ExperienceNode["distillation_source"],
      redistilled_from: row.redistilled_from as ExperienceNode["redistilled_from"],
      source_kind: row.source_kind,
      origin_record_ids: JSON.parse(row.origin_record_ids_json) as string[],
      helped_record_ids: JSON.parse(row.helped_record_ids_json) as string[],
      harmed_record_ids: JSON.parse(row.harmed_record_ids_json) as string[],
      state: row.state,
      usage_count: row.usage_count,
      helped_count: row.helped_count,
      harmed_count: row.harmed_count,
      support_count: row.support_count,
      last_used_at: row.last_used_at ?? undefined,
      last_helped_at: row.last_helped_at ?? undefined,
      last_harmed_at: row.last_harmed_at ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  upsert(node: ExperienceNode): ExperienceNode {
    const payload = {
      id: node.id,
      node_type: node.node_type,
      scope_id: node.scope_id,
      task_type: node.task_type,
      trigger_pattern: node.trigger_pattern,
      applicability_notes: node.applicability_notes ?? null,
      env_signature: node.env_signature ?? null,
      compact_hint: node.compact_hint,
      goal: node.goal ?? null,
      recommended_steps_json: JSON.stringify(node.recommended_steps ?? []),
      avoid_steps_json: JSON.stringify(node.avoid_steps ?? []),
      fallback_steps_json: JSON.stringify(node.fallback_steps ?? []),
      success_signal: node.success_signal,
      stop_condition: node.stop_condition ?? null,
      escalation_condition: node.escalation_condition ?? null,
      evidence_summary: node.evidence_summary,
      retrieval_text: node.retrieval_text ?? null,
      embedding_json: node.embedding ? JSON.stringify(node.embedding) : null,
      embedding_provider: node.embedding_provider ?? null,
      embedding_model: node.embedding_model ?? null,
      embedding_version: node.embedding_version ?? null,
      embedding_dimensions: node.embedding_dimensions ?? null,
      distillation_mode_used: node.distillation_mode_used ?? null,
      distillation_source: node.distillation_source ?? null,
      redistilled_from: node.redistilled_from ?? null,
      source_kind: node.source_kind,
      origin_record_ids_json: JSON.stringify(node.origin_record_ids ?? []),
      helped_record_ids_json: JSON.stringify(node.helped_record_ids ?? []),
      harmed_record_ids_json: JSON.stringify(node.harmed_record_ids ?? []),
      state: node.state,
      usage_count: node.usage_count,
      helped_count: node.helped_count,
      harmed_count: node.harmed_count,
      support_count: node.support_count,
      last_used_at: node.last_used_at ?? null,
      last_helped_at: node.last_helped_at ?? null,
      last_harmed_at: node.last_harmed_at ?? null,
      created_at: node.created_at,
      updated_at: node.updated_at
    };

    this.db
      .prepare(
        `INSERT INTO experience_nodes
          (id, node_type, scope_id, task_type, trigger_pattern, applicability_notes, env_signature, compact_hint, goal, recommended_steps_json,
           avoid_steps_json, fallback_steps_json, success_signal, stop_condition, escalation_condition, evidence_summary, retrieval_text, embedding_json, embedding_provider, embedding_model, embedding_version, embedding_dimensions, distillation_mode_used, distillation_source, redistilled_from, source_kind,
           origin_record_ids_json, helped_record_ids_json, harmed_record_ids_json, state,
           usage_count, helped_count, harmed_count, support_count, last_used_at, last_helped_at, last_harmed_at, created_at, updated_at)
         VALUES
         (@id, @node_type, @scope_id, @task_type, @trigger_pattern, @applicability_notes, @env_signature, @compact_hint, @goal, @recommended_steps_json,
           @avoid_steps_json, @fallback_steps_json, @success_signal, @stop_condition, @escalation_condition, @evidence_summary, @retrieval_text, @embedding_json, @embedding_provider, @embedding_model, @embedding_version, @embedding_dimensions, @distillation_mode_used, @distillation_source, @redistilled_from, @source_kind,
           @origin_record_ids_json, @helped_record_ids_json, @harmed_record_ids_json, @state,
           @usage_count, @helped_count, @harmed_count, @support_count, @last_used_at, @last_helped_at, @last_harmed_at, @created_at, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
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
          embedding_json = excluded.embedding_json,
          embedding_provider = excluded.embedding_provider,
          embedding_model = excluded.embedding_model,
          embedding_version = excluded.embedding_version,
          embedding_dimensions = excluded.embedding_dimensions,
          distillation_mode_used = excluded.distillation_mode_used,
          distillation_source = excluded.distillation_source,
          redistilled_from = excluded.redistilled_from,
          source_kind = excluded.source_kind,
          origin_record_ids_json = excluded.origin_record_ids_json,
          helped_record_ids_json = excluded.helped_record_ids_json,
          harmed_record_ids_json = excluded.harmed_record_ids_json,
          state = excluded.state,
          usage_count = excluded.usage_count,
          helped_count = excluded.helped_count,
          harmed_count = excluded.harmed_count,
          support_count = excluded.support_count,
          last_used_at = excluded.last_used_at,
          last_helped_at = excluded.last_helped_at,
          last_harmed_at = excluded.last_harmed_at,
          updated_at = excluded.updated_at`
      )
      .run(payload);
    return node;
  }

  listAll(): ExperienceNode[] {
    return this.db
      .prepare("SELECT * FROM experience_nodes ORDER BY updated_at DESC")
      .all()
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listActive(): ExperienceNode[] {
    return this.db
      .prepare("SELECT * FROM experience_nodes WHERE state = 'active' ORDER BY updated_at DESC")
      .all()
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listByState(state: ExperienceNode["state"]): ExperienceNode[] {
    return this.db
      .prepare("SELECT * FROM experience_nodes WHERE state = ? ORDER BY updated_at DESC")
      .all(state)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listByType(nodeType: ExperienceNode["node_type"]): ExperienceNode[] {
    return this.db
      .prepare("SELECT * FROM experience_nodes WHERE node_type = ? ORDER BY updated_at DESC")
      .all(nodeType)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  getById(id: string): ExperienceNode | undefined {
    const row = this.db.prepare("SELECT * FROM experience_nodes WHERE id = ? LIMIT 1").get(id) as
      | Parameters<typeof this.mapNode>[0]
      | undefined;
    return row ? this.mapNode(row) : undefined;
  }

  listByIds(ids: string[]): ExperienceNode[] {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    return this.db
      .prepare(`SELECT * FROM experience_nodes WHERE id IN (${placeholders}) ORDER BY updated_at DESC`)
      .all(...ids)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listInjectableByScope(scopeId: string): ExperienceNode[] {
    return this.db
      .prepare(
        `SELECT * FROM experience_nodes
         WHERE scope_id = ?
           AND state IN ('active', 'cooling', 'candidate')
         ORDER BY updated_at DESC`
      )
      .all(scopeId)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  updateState(id: string, state: ExperienceNode["state"]): ExperienceNode | undefined {
    const node = this.getById(id);
    if (!node) {
      return undefined;
    }

    return this.upsert({
      ...node,
      state,
      updated_at: new Date().toISOString()
    });
  }
}
