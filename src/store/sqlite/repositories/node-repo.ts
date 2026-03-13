import type { DatabaseSync } from "node:sqlite";
import type { ExperienceNode } from "../../../types/domain.js";

export class NodeRepository {
  constructor(private readonly db: DatabaseSync) {}

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
      source_kind: node.source_kind,
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
           avoid_steps_json, fallback_steps_json, success_signal, stop_condition, escalation_condition, evidence_summary, source_kind, state,
           usage_count, helped_count, harmed_count, support_count, last_used_at, last_helped_at, last_harmed_at, created_at, updated_at)
         VALUES
         (@id, @node_type, @scope_id, @task_type, @trigger_pattern, @applicability_notes, @env_signature, @compact_hint, @goal, @recommended_steps_json,
           @avoid_steps_json, @fallback_steps_json, @success_signal, @stop_condition, @escalation_condition, @evidence_summary, @source_kind, @state,
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
          source_kind = excluded.source_kind,
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
    return this.db.prepare("SELECT * FROM experience_nodes ORDER BY updated_at DESC").all() as unknown as ExperienceNode[];
  }

  listActive(): ExperienceNode[] {
    return this.db
      .prepare("SELECT * FROM experience_nodes WHERE state = 'active' ORDER BY updated_at DESC")
      .all() as unknown as ExperienceNode[];
  }

  getById(id: string): ExperienceNode | undefined {
    return this.db.prepare("SELECT * FROM experience_nodes WHERE id = ? LIMIT 1").get(id) as unknown as
      | ExperienceNode
      | undefined;
  }

  listByIds(ids: string[]): ExperienceNode[] {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    return this.db
      .prepare(`SELECT * FROM experience_nodes WHERE id IN (${placeholders}) ORDER BY updated_at DESC`)
      .all(...ids) as unknown as ExperienceNode[];
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
