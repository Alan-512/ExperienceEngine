import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_NODE_DELIVERY_STATE_BY_LIFECYCLE,
  resolveEffectiveNodeDeliveryState
} from "../../../runtime/learning-queue/delivery-policy.js";
import type { ExperienceNode } from "../../../types/domain.js";

export class NodeRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapNode(row: {
    id: string;
    node_type: ExperienceNode["node_type"];
    scope_id: string;
    task_type: ExperienceNode["task_type"];
    experience_kind: ExperienceNode["experience_kind"] | null;
    confidence_signal: ExperienceNode["confidence_signal"] | null;
    validation_state: ExperienceNode["validation_state"] | null;
    correction_scope: ExperienceNode["correction_scope"] | null;
    correction_category: ExperienceNode["correction_category"] | null;
    deviation_pattern: string | null;
    corrected_constraint: string | null;
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
    promotion_signal: ExperienceNode["promotion_signal"] | null;
    promotion_reason: string | null;
    merge_decision: ExperienceNode["merge_decision"] | null;
    merge_reason: string | null;
    priority_promotion_applied: number | null;
    source_kind: ExperienceNode["source_kind"];
    origin_record_ids_json: string;
    helped_record_ids_json: string;
    harmed_record_ids_json: string;
    state: ExperienceNode["state"];
    delivery_state: ExperienceNode["delivery_state"] | null;
    usage_count: number;
    helped_count: number;
    harmed_count: number;
    consecutive_harmed_count: number | null;
    last_feedback_verdict: ExperienceNode["last_feedback_verdict"] | null;
    support_count: number;
    last_used_at: string | null;
    last_helped_at: string | null;
    last_harmed_at: string | null;
    quarantined_at: string | null;
    quarantine_reason: string | null;
    embedding_manifest_id: string | null;
    migration_status: ExperienceNode["migration_status"] | null;
    migration_last_error: string | null;
    migration_updated_at: string | null;
    source_fingerprint_hash: string | null;
    portable_validation_evidence_json: string | null;
    quarantine_lease_expires_at: string | null;
    quarantine_original_delivery_state: ExperienceNode["quarantine_original_delivery_state"] | null;
    quarantine_release_attempt_count: number | null;
    quarantine_last_release_attempt_at: string | null;
    quarantine_release_reason: string | null;
    quarantine_no_harm_pass_count: number | null;
    contains_unbenchmarked_origin: number;
    contains_revoked_profile_origin: number;
    semantic_origin_count: number;
    exact_provenance_key_count: number;
    compacted_provenance_origin_count: number;
    effective_generation_assurance_floor:
      ExperienceNode["effective_generation_assurance_floor"] | null;
    created_at: string;
    updated_at: string;
  }): ExperienceNode {
    return {
      id: row.id,
      node_type: row.node_type,
      scope_id: row.scope_id,
      task_type: row.task_type,
      experience_kind: row.experience_kind ?? undefined,
      confidence_signal: row.confidence_signal ?? undefined,
      validation_state: row.validation_state ?? undefined,
      correction_scope: row.correction_scope ?? undefined,
      correction_category: row.correction_category ?? undefined,
      deviation_pattern: row.deviation_pattern ?? undefined,
      corrected_constraint: row.corrected_constraint ?? undefined,
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
      promotion_signal: row.promotion_signal ?? undefined,
      promotion_reason: row.promotion_reason ?? undefined,
      merge_decision: row.merge_decision ?? undefined,
      merge_reason: row.merge_reason ?? undefined,
      priority_promotion_applied: Boolean(row.priority_promotion_applied),
      source_kind: row.source_kind,
      origin_record_ids: JSON.parse(row.origin_record_ids_json) as string[],
      helped_record_ids: JSON.parse(row.helped_record_ids_json) as string[],
      harmed_record_ids: JSON.parse(row.harmed_record_ids_json) as string[],
      state: row.state,
      delivery_state: resolveEffectiveNodeDeliveryState({
        state: row.state,
        delivery_state: row.delivery_state ?? undefined,
        contains_unbenchmarked_origin: Boolean(row.contains_unbenchmarked_origin),
        contains_revoked_profile_origin: Boolean(row.contains_revoked_profile_origin)
      }),
      usage_count: row.usage_count,
      helped_count: row.helped_count,
      harmed_count: row.harmed_count,
      consecutive_harmed_count: row.consecutive_harmed_count ?? 0,
      last_feedback_verdict: row.last_feedback_verdict ?? undefined,
      support_count: row.support_count,
      last_used_at: row.last_used_at ?? undefined,
      last_helped_at: row.last_helped_at ?? undefined,
      last_harmed_at: row.last_harmed_at ?? undefined,
      quarantined_at: row.quarantined_at ?? undefined,
      quarantine_reason: row.quarantine_reason ?? undefined,
      embedding_manifest_id: row.embedding_manifest_id ?? undefined,
      migration_status: (row.migration_status as ExperienceNode["migration_status"]) ?? undefined,
      migration_last_error: row.migration_last_error ?? undefined,
      migration_updated_at: row.migration_updated_at ?? undefined,
      source_fingerprint_hash: row.source_fingerprint_hash ?? undefined,
      portable_validation_evidence: row.portable_validation_evidence_json ? JSON.parse(row.portable_validation_evidence_json) : undefined,
      quarantine_lease_expires_at: row.quarantine_lease_expires_at ?? undefined,
      quarantine_original_delivery_state: (row.quarantine_original_delivery_state as ExperienceNode["quarantine_original_delivery_state"]) ?? undefined,
      quarantine_release_attempt_count: row.quarantine_release_attempt_count ?? undefined,
      quarantine_last_release_attempt_at: row.quarantine_last_release_attempt_at ?? undefined,
      quarantine_release_reason: row.quarantine_release_reason ?? undefined,
      quarantine_no_harm_pass_count: row.quarantine_no_harm_pass_count ?? undefined,
      contains_unbenchmarked_origin: Boolean(row.contains_unbenchmarked_origin),
      contains_revoked_profile_origin: Boolean(row.contains_revoked_profile_origin),
      semantic_origin_count: row.semantic_origin_count,
      exact_provenance_key_count: row.exact_provenance_key_count,
      compacted_provenance_origin_count: row.compacted_provenance_origin_count,
      effective_generation_assurance_floor:
        row.effective_generation_assurance_floor ?? undefined,
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
      experience_kind: node.experience_kind ?? null,
      confidence_signal: node.confidence_signal ?? null,
      validation_state: node.validation_state ?? null,
      correction_scope: node.correction_scope ?? null,
      correction_category: node.correction_category ?? null,
      deviation_pattern: node.deviation_pattern ?? null,
      corrected_constraint: node.corrected_constraint ?? null,
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
      promotion_signal: node.promotion_signal ?? null,
      promotion_reason: node.promotion_reason ?? null,
      merge_decision: node.merge_decision ?? null,
      merge_reason: node.merge_reason ?? null,
      priority_promotion_applied: node.priority_promotion_applied ? 1 : 0,
      source_kind: node.source_kind,
      origin_record_ids_json: JSON.stringify(node.origin_record_ids ?? []),
      helped_record_ids_json: JSON.stringify(node.helped_record_ids ?? []),
      harmed_record_ids_json: JSON.stringify(node.harmed_record_ids ?? []),
      state: node.state,
      delivery_state: resolveEffectiveNodeDeliveryState(node),
      usage_count: node.usage_count,
      helped_count: node.helped_count,
      harmed_count: node.harmed_count,
      consecutive_harmed_count: node.consecutive_harmed_count ?? 0,
      last_feedback_verdict: node.last_feedback_verdict ?? null,
      support_count: node.support_count,
      last_used_at: node.last_used_at ?? null,
      last_helped_at: node.last_helped_at ?? null,
      last_harmed_at: node.last_harmed_at ?? null,
      quarantined_at: node.quarantined_at ?? null,
      quarantine_reason: node.quarantine_reason ?? null,
      embedding_manifest_id: node.embedding_manifest_id ?? null,
      migration_status: node.migration_status ?? null,
      migration_last_error: node.migration_last_error ?? null,
      migration_updated_at: node.migration_updated_at ?? null,
      source_fingerprint_hash: node.source_fingerprint_hash ?? null,
      portable_validation_evidence_json: node.portable_validation_evidence ? JSON.stringify(node.portable_validation_evidence) : null,
      quarantine_lease_expires_at: node.quarantine_lease_expires_at ?? null,
      quarantine_original_delivery_state: node.quarantine_original_delivery_state ?? null,
      quarantine_release_attempt_count: node.quarantine_release_attempt_count ?? null,
      quarantine_last_release_attempt_at: node.quarantine_last_release_attempt_at ?? null,
      quarantine_release_reason: node.quarantine_release_reason ?? null,
      quarantine_no_harm_pass_count: node.quarantine_no_harm_pass_count ?? null,
      contains_unbenchmarked_origin: node.contains_unbenchmarked_origin ? 1 : 0,
      contains_revoked_profile_origin: node.contains_revoked_profile_origin ? 1 : 0,
      semantic_origin_count: node.semantic_origin_count ?? 0,
      exact_provenance_key_count: node.exact_provenance_key_count ?? 0,
      compacted_provenance_origin_count:
        node.compacted_provenance_origin_count ?? 0,
      effective_generation_assurance_floor:
        node.contains_unbenchmarked_origin
          ? "unbenchmarked"
          : node.effective_generation_assurance_floor ?? null,
      created_at: node.created_at,
      updated_at: node.updated_at
    };

    this.db
      .prepare(
        `INSERT INTO experience_nodes
          (id, node_type, scope_id, task_type, experience_kind, confidence_signal, validation_state, correction_scope, correction_category, deviation_pattern, corrected_constraint, trigger_pattern, applicability_notes, env_signature, compact_hint, goal, recommended_steps_json,
           avoid_steps_json, fallback_steps_json, success_signal, stop_condition, escalation_condition, evidence_summary, retrieval_text, embedding_json, embedding_provider, embedding_model, embedding_version, embedding_dimensions, distillation_mode_used, distillation_source, redistilled_from, promotion_signal, promotion_reason, merge_decision, merge_reason, priority_promotion_applied, source_kind,
           origin_record_ids_json, helped_record_ids_json, harmed_record_ids_json, state, delivery_state,
            usage_count, helped_count, harmed_count, consecutive_harmed_count, last_feedback_verdict, support_count, last_used_at, last_helped_at, last_harmed_at, quarantined_at, quarantine_reason, embedding_manifest_id, migration_status, migration_last_error, migration_updated_at, source_fingerprint_hash, portable_validation_evidence_json, quarantine_lease_expires_at, quarantine_original_delivery_state, quarantine_release_attempt_count, quarantine_last_release_attempt_at, quarantine_release_reason, quarantine_no_harm_pass_count,
            contains_unbenchmarked_origin, contains_revoked_profile_origin, semantic_origin_count, exact_provenance_key_count, compacted_provenance_origin_count, effective_generation_assurance_floor,
            created_at, updated_at)
         VALUES
         (@id, @node_type, @scope_id, @task_type, @experience_kind, @confidence_signal, @validation_state, @correction_scope, @correction_category, @deviation_pattern, @corrected_constraint, @trigger_pattern, @applicability_notes, @env_signature, @compact_hint, @goal, @recommended_steps_json,
           @avoid_steps_json, @fallback_steps_json, @success_signal, @stop_condition, @escalation_condition, @evidence_summary, @retrieval_text, @embedding_json, @embedding_provider, @embedding_model, @embedding_version, @embedding_dimensions, @distillation_mode_used, @distillation_source, @redistilled_from, @promotion_signal, @promotion_reason, @merge_decision, @merge_reason, @priority_promotion_applied, @source_kind,
           @origin_record_ids_json, @helped_record_ids_json, @harmed_record_ids_json, @state, @delivery_state,
           @usage_count, @helped_count, @harmed_count, @consecutive_harmed_count, @last_feedback_verdict, @support_count, @last_used_at, @last_helped_at, @last_harmed_at, @quarantined_at, @quarantine_reason, @embedding_manifest_id, @migration_status, @migration_last_error, @migration_updated_at, @source_fingerprint_hash, @portable_validation_evidence_json, @quarantine_lease_expires_at, @quarantine_original_delivery_state, @quarantine_release_attempt_count, @quarantine_last_release_attempt_at, @quarantine_release_reason, @quarantine_no_harm_pass_count,
           @contains_unbenchmarked_origin, @contains_revoked_profile_origin, @semantic_origin_count, @exact_provenance_key_count, @compacted_provenance_origin_count, @effective_generation_assurance_floor,
           @created_at, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
          experience_kind = excluded.experience_kind,
          confidence_signal = excluded.confidence_signal,
          validation_state = excluded.validation_state,
          correction_scope = excluded.correction_scope,
          correction_category = excluded.correction_category,
          deviation_pattern = excluded.deviation_pattern,
          corrected_constraint = excluded.corrected_constraint,
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
          promotion_signal = excluded.promotion_signal,
          promotion_reason = excluded.promotion_reason,
          merge_decision = excluded.merge_decision,
          merge_reason = excluded.merge_reason,
          priority_promotion_applied = excluded.priority_promotion_applied,
          source_kind = excluded.source_kind,
          origin_record_ids_json = excluded.origin_record_ids_json,
          helped_record_ids_json = excluded.helped_record_ids_json,
          harmed_record_ids_json = excluded.harmed_record_ids_json,
          state = excluded.state,
          usage_count = excluded.usage_count,
          helped_count = excluded.helped_count,
          harmed_count = excluded.harmed_count,
          consecutive_harmed_count = excluded.consecutive_harmed_count,
          last_feedback_verdict = excluded.last_feedback_verdict,
          support_count = excluded.support_count,
          last_used_at = excluded.last_used_at,
          last_helped_at = excluded.last_helped_at,
          last_harmed_at = excluded.last_harmed_at,
          quarantined_at = excluded.quarantined_at,
          quarantine_reason = excluded.quarantine_reason,
          embedding_manifest_id = excluded.embedding_manifest_id,
          migration_status = excluded.migration_status,
          migration_last_error = excluded.migration_last_error,
          migration_updated_at = excluded.migration_updated_at,
          source_fingerprint_hash = excluded.source_fingerprint_hash,
          portable_validation_evidence_json = excluded.portable_validation_evidence_json,
          quarantine_lease_expires_at = excluded.quarantine_lease_expires_at,
          quarantine_original_delivery_state = excluded.quarantine_original_delivery_state,
          quarantine_release_attempt_count = excluded.quarantine_release_attempt_count,
          quarantine_last_release_attempt_at = excluded.quarantine_last_release_attempt_at,
          quarantine_release_reason = excluded.quarantine_release_reason,
          quarantine_no_harm_pass_count = excluded.quarantine_no_harm_pass_count,
          contains_unbenchmarked_origin = MAX(
            experience_nodes.contains_unbenchmarked_origin,
            excluded.contains_unbenchmarked_origin
          ),
          contains_revoked_profile_origin = MAX(
            experience_nodes.contains_revoked_profile_origin,
            excluded.contains_revoked_profile_origin
          ),
          semantic_origin_count = MAX(
            experience_nodes.semantic_origin_count,
            excluded.semantic_origin_count
          ),
          exact_provenance_key_count = MAX(
            experience_nodes.exact_provenance_key_count,
            excluded.exact_provenance_key_count
          ),
          compacted_provenance_origin_count = MAX(
            experience_nodes.compacted_provenance_origin_count,
            excluded.compacted_provenance_origin_count
          ),
          effective_generation_assurance_floor = CASE
            WHEN experience_nodes.contains_unbenchmarked_origin = 1
              OR excluded.contains_unbenchmarked_origin = 1
              OR experience_nodes.effective_generation_assurance_floor = 'unbenchmarked'
              OR excluded.effective_generation_assurance_floor = 'unbenchmarked'
              THEN 'unbenchmarked'
            WHEN experience_nodes.effective_generation_assurance_floor = 'supported'
              OR excluded.effective_generation_assurance_floor = 'supported'
              THEN 'supported'
            ELSE COALESCE(
              experience_nodes.effective_generation_assurance_floor,
              excluded.effective_generation_assurance_floor
            )
          END,
          delivery_state = CASE
            WHEN experience_nodes.contains_revoked_profile_origin = 1
              OR excluded.contains_revoked_profile_origin = 1
              THEN 'quarantined'
            WHEN experience_nodes.contains_unbenchmarked_origin = 1
              OR excluded.contains_unbenchmarked_origin = 1
              THEN 'shadow_only'
            ELSE excluded.delivery_state
          END,
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

  listLiveInjectableByExactScope(scopeId: string): ExperienceNode[] {
    return this.db
      .prepare(
        `SELECT * FROM experience_nodes
         WHERE scope_id = ?
           AND contains_unbenchmarked_origin = 0
           AND contains_revoked_profile_origin = 0
           AND delivery_state IN ('eligible', 'conservative_only')
         ORDER BY updated_at DESC`
      )
      .all(scopeId)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listConservativeCrossScopeCandidates(scopeId: string): ExperienceNode[] {
    return this.db
      .prepare(
        `SELECT * FROM experience_nodes
         WHERE scope_id != ?
           AND contains_unbenchmarked_origin = 0
           AND contains_revoked_profile_origin = 0
           AND delivery_state IN ('eligible', 'conservative_only')
         ORDER BY updated_at DESC`
      )
      .all(scopeId)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listDiagnosticCandidatesByExactScope(scopeId: string): ExperienceNode[] {
    return this.db
      .prepare(
        `SELECT * FROM experience_nodes
         WHERE scope_id = ?
           AND state = 'candidate'
           AND delivery_state = 'shadow_only'
         ORDER BY updated_at DESC`
      )
      .all(scopeId)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listShadowEligibleByExactScope(scopeId: string): ExperienceNode[] {
    return this.db
      .prepare(
        `SELECT * FROM experience_nodes
         WHERE scope_id = ?
           AND delivery_state IN ('eligible', 'conservative_only', 'shadow_only')
         ORDER BY updated_at DESC`
      )
      .all(scopeId)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listShadowProbeByExactScope(scopeId: string): ExperienceNode[] {
    return this.db
      .prepare(
        `SELECT * FROM experience_nodes
         WHERE scope_id = ?
           AND delivery_state = 'shadow_probe'
         ORDER BY updated_at DESC`
      )
      .all(scopeId)
      .map((row) => this.mapNode(row as Parameters<typeof this.mapNode>[0]));
  }

  listInjectableByExactScope(scopeId: string): ExperienceNode[] {
    return this.listLiveInjectableByExactScope(scopeId);
  }

  listInjectableByScope(scopeId: string): ExperienceNode[] {
    return this.listLiveInjectableByExactScope(scopeId);
  }

  listByScope(scopeId: string): ExperienceNode[] {
    return this.db
      .prepare("SELECT * FROM experience_nodes WHERE scope_id = ? ORDER BY updated_at DESC")
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
      delivery_state: resolveEffectiveNodeDeliveryState({
        ...node,
        state,
        delivery_state: DEFAULT_NODE_DELIVERY_STATE_BY_LIFECYCLE[state]
      }),
      updated_at: new Date().toISOString()
    });
  }
}
