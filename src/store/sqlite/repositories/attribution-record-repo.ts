import type { DatabaseSync } from "node:sqlite";
import type { AttributionRecord, AttributionVerdict } from "../../../types/domain.js";

type AttributionRecordRow = {
  id: string;
  injection_id: string | null;
  node_id: string;
  episode_id: string | null;
  intervention_strength: AttributionRecord["intervention_strength"] | null;
  injection_mode: AttributionRecord["injection_mode"] | null;
  delivery_mode: AttributionRecord["delivery_mode"] | null;
  delivered: number;
  outcome: AttributionRecord["outcome"];
  attribution_verdict: AttributionRecord["attribution_verdict"];
  confidence: AttributionRecord["confidence"];
  evidence_refs_json: string;
  user_override: AttributionRecord["user_override"] | null;
  source: AttributionRecord["source"];
  attribution_reason: AttributionRecord["attribution_reason"] | null;
  created_at: string;
  resolved_at: string | null;
};

export class AttributionRecordRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(row: AttributionRecordRow): AttributionRecord {
    return {
      id: row.id,
      injection_id: row.injection_id ?? undefined,
      node_id: row.node_id,
      episode_id: row.episode_id ?? undefined,
      intervention_strength: row.intervention_strength ?? undefined,
      injection_mode: row.injection_mode ?? undefined,
      delivery_mode: row.delivery_mode ?? undefined,
      delivered: Boolean(row.delivered),
      outcome: row.outcome,
      attribution_verdict: row.attribution_verdict,
      confidence: row.confidence,
      evidence_refs: JSON.parse(row.evidence_refs_json) as string[],
      user_override: row.user_override ?? undefined,
      source: row.source,
      attribution_reason: row.attribution_reason ?? undefined,
      created_at: row.created_at,
      resolved_at: row.resolved_at ?? undefined
    };
  }

  insert(record: AttributionRecord): AttributionRecord {
    this.db
      .prepare(
        `INSERT INTO attribution_records
          (id, injection_id, node_id, episode_id, intervention_strength, injection_mode, delivery_mode, delivered,
           outcome, attribution_verdict, confidence, evidence_refs_json, user_override, source, attribution_reason,
           created_at, resolved_at)
         VALUES
          (@id, @injection_id, @node_id, @episode_id, @intervention_strength, @injection_mode, @delivery_mode, @delivered,
           @outcome, @attribution_verdict, @confidence, @evidence_refs_json, @user_override, @source, @attribution_reason,
           @created_at, @resolved_at)
         ON CONFLICT(id) DO NOTHING`
      )
      .run({
        id: record.id,
        injection_id: record.injection_id ?? null,
        node_id: record.node_id,
        episode_id: record.episode_id ?? null,
        intervention_strength: record.intervention_strength ?? null,
        injection_mode: record.injection_mode ?? null,
        delivery_mode: record.delivery_mode ?? null,
        delivered: Number(record.delivered),
        outcome: record.outcome,
        attribution_verdict: record.attribution_verdict,
        confidence: record.confidence,
        evidence_refs_json: JSON.stringify(record.evidence_refs),
        user_override: record.user_override ?? null,
        source: record.source,
        attribution_reason: record.attribution_reason ?? null,
        created_at: record.created_at,
        resolved_at: record.resolved_at ?? null
      });

    return record;
  }

  getById(id: string): AttributionRecord | undefined {
    const row = this.db.prepare("SELECT * FROM attribution_records WHERE id = ? LIMIT 1").get(id) as
      | AttributionRecordRow
      | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  listByInjectionId(injectionId: string): AttributionRecord[] {
    return this.db
      .prepare("SELECT * FROM attribution_records WHERE injection_id = ? ORDER BY created_at DESC, id DESC")
      .all(injectionId)
      .map((row) => this.mapRow(row as AttributionRecordRow));
  }

  listByNodeId(nodeId: string): AttributionRecord[] {
    return this.db
      .prepare("SELECT * FROM attribution_records WHERE node_id = ? ORDER BY created_at DESC, id DESC")
      .all(nodeId)
      .map((row) => this.mapRow(row as AttributionRecordRow));
  }

  listByEpisodeId(episodeId: string): AttributionRecord[] {
    return this.db
      .prepare("SELECT * FROM attribution_records WHERE episode_id = ? ORDER BY created_at DESC, id DESC")
      .all(episodeId)
      .map((row) => this.mapRow(row as AttributionRecordRow));
  }

  countByVerdict(verdict: AttributionVerdict): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM attribution_records WHERE attribution_verdict = ?")
        .get(verdict) as { count: number }
    ).count;
  }
}
