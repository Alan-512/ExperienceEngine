import type { DatabaseSync } from "node:sqlite";
import type { TraceCapsule, TraceTask, TraceEvent, EvidenceRef, TraceOutcome, TraceCaptureMetadata, HostTraceCapabilityProfile } from "../../../types/domain.js";
import { withTransaction } from "../db.js";

type TraceCapsuleRow = {
  id: string;
  episode_id: string | null;
  task_run_id: string | null;
  scope_id: string;
  session_id: string | null;
  task_json: string;
  outcome_json: string;
  capture_metadata_json: string;
  host_profile_json: string;
  created_at: string;
  updated_at: string;
};

type TraceEventRow = {
  id: string;
  trace_capsule_id: string;
  event_type: TraceEvent["event_type"];
  timestamp: string;
  source_json: string;
  payload_json: string;
};

type TraceEvidenceRefRow = {
  id: string;
  trace_capsule_id: string;
  ref_type: EvidenceRef["ref_type"];
  path_or_uri: string;
  content_hash: string | null;
  summary: string | null;
  is_redacted: number;
  size_bytes: number | null;
};

export class TraceRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRow(
    row: TraceCapsuleRow,
    events: TraceEvent[],
    evidenceRefs: EvidenceRef[]
  ): TraceCapsule {
    return {
      id: row.id,
      episode_id: row.episode_id ?? undefined,
      task_run_id: row.task_run_id ?? undefined,
      scope_id: row.scope_id,
      session_id: row.session_id ?? undefined,
      task: JSON.parse(row.task_json) as TraceTask,
      events,
      evidence_refs: evidenceRefs,
      outcome: JSON.parse(row.outcome_json) as TraceOutcome,
      capture_metadata: JSON.parse(row.capture_metadata_json) as TraceCaptureMetadata,
      host_profile: JSON.parse(row.host_profile_json) as HostTraceCapabilityProfile,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private loadEvents(capsuleId: string): TraceEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM trace_events WHERE trace_capsule_id = ? ORDER BY timestamp ASC, id ASC")
      .all(capsuleId) as TraceEventRow[];

    return rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      timestamp: row.timestamp,
      source: JSON.parse(row.source_json) as TraceEvent["source"],
      payload: JSON.parse(row.payload_json) as Record<string, any>
    }));
  }

  private loadEvidenceRefs(capsuleId: string): EvidenceRef[] {
    const rows = this.db
      .prepare("SELECT * FROM trace_evidence_refs WHERE trace_capsule_id = ?")
      .all(capsuleId) as TraceEvidenceRefRow[];

    return rows.map((row) => ({
      id: row.id,
      ref_type: row.ref_type,
      path_or_uri: row.path_or_uri,
      content_hash: row.content_hash ?? undefined,
      summary: row.summary ?? undefined,
      is_redacted: row.is_redacted === 1,
      size_bytes: row.size_bytes ?? undefined
    }));
  }

  /**
   * Idempotently saves a TraceCapsule, along with its trace events and evidence refs in a single transaction.
   */
  upsert(capsule: TraceCapsule): TraceCapsule {
    withTransaction(this.db, () => {
      // 1. Upsert the main capsule row
      this.db
        .prepare(
          `INSERT INTO trace_capsules
            (id, episode_id, task_run_id, scope_id, session_id, task_json, outcome_json, capture_metadata_json, host_profile_json, created_at, updated_at)
           VALUES
            (@id, @episode_id, @task_run_id, @scope_id, @session_id, @task_json, @outcome_json, @capture_metadata_json, @host_profile_json, @created_at, @updated_at)
           ON CONFLICT(id) DO UPDATE SET
            episode_id = excluded.episode_id,
            task_run_id = excluded.task_run_id,
            scope_id = excluded.scope_id,
            session_id = excluded.session_id,
            task_json = excluded.task_json,
            outcome_json = excluded.outcome_json,
            capture_metadata_json = excluded.capture_metadata_json,
            host_profile_json = excluded.host_profile_json,
            updated_at = excluded.updated_at`
        )
        .run({
          id: capsule.id,
          episode_id: capsule.episode_id ?? null,
          task_run_id: capsule.task_run_id ?? null,
          scope_id: capsule.scope_id,
          session_id: capsule.session_id ?? null,
          task_json: JSON.stringify(capsule.task),
          outcome_json: JSON.stringify(capsule.outcome),
          capture_metadata_json: JSON.stringify(capsule.capture_metadata),
          host_profile_json: JSON.stringify(capsule.host_profile),
          created_at: capsule.created_at,
          updated_at: capsule.updated_at
        });

      // 2. Refresh trace events: Delete and rewrite them to keep ordering/indexing simple and idempotent
      this.db.prepare("DELETE FROM trace_events WHERE trace_capsule_id = ?").run(capsule.id);
      if (capsule.events && capsule.events.length > 0) {
        const insertEvent = this.db.prepare(
          `INSERT INTO trace_events
            (id, trace_capsule_id, event_type, timestamp, source_json, payload_json)
           VALUES
            (?, ?, ?, ?, ?, ?)`
        );
        for (const event of capsule.events) {
          insertEvent.run(
            event.id,
            capsule.id,
            event.event_type,
            event.timestamp,
            JSON.stringify(event.source),
            JSON.stringify(event.payload)
          );
        }
      }

      // 3. Refresh evidence refs: Delete and rewrite
      this.db.prepare("DELETE FROM trace_evidence_refs WHERE trace_capsule_id = ?").run(capsule.id);
      if (capsule.evidence_refs && capsule.evidence_refs.length > 0) {
        const insertRef = this.db.prepare(
          `INSERT INTO trace_evidence_refs
            (id, trace_capsule_id, ref_type, path_or_uri, content_hash, summary, is_redacted, size_bytes)
           VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const ref of capsule.evidence_refs) {
          insertRef.run(
            ref.id,
            capsule.id,
            ref.ref_type,
            ref.path_or_uri,
            ref.content_hash ?? null,
            ref.summary ?? null,
            ref.is_redacted ? 1 : 0,
            ref.size_bytes ?? null
          );
        }
      }
    });

    return capsule;
  }

  /**
   * Retrieves a capsule by ID, including its events and evidence refs.
   */
  getById(id: string): TraceCapsule | undefined {
    const row = this.db
      .prepare("SELECT * FROM trace_capsules WHERE id = ? LIMIT 1")
      .get(id) as TraceCapsuleRow | undefined;

    if (!row) return undefined;

    const events = this.loadEvents(row.id);
    const evidenceRefs = this.loadEvidenceRefs(row.id);
    return this.mapRow(row, events, evidenceRefs);
  }

  /**
   * Retrieves a capsule by linked TaskRun ID.
   */
  getByTaskRunId(taskRunId: string): TraceCapsule | undefined {
    const row = this.db
      .prepare("SELECT * FROM trace_capsules WHERE task_run_id = ? LIMIT 1")
      .get(taskRunId) as TraceCapsuleRow | undefined;

    if (!row) return undefined;

    return this.getById(row.id);
  }

  /**
   * Retrieves a capsule by Episode ID.
   */
  getByEpisodeId(episodeId: string): TraceCapsule | undefined {
    const row = this.db
      .prepare("SELECT * FROM trace_capsules WHERE episode_id = ? LIMIT 1")
      .get(episodeId) as TraceCapsuleRow | undefined;

    if (!row) return undefined;

    return this.getById(row.id);
  }

  /**
   * Deletes all trace capsules (and cascade events/refs) created older than retentionDays.
   */
  cleanupOldTraces(retentionDays: number): number {
    const cutOff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    
    // SQLite foreign key cascade delete will remove associated trace_events and trace_evidence_refs automatically
    const result = this.db.prepare("DELETE FROM trace_capsules WHERE created_at < ?").run(cutOff);
    return Number(result.changes);
  }

  /**
   * Trims the event and evidence count for a given trace capsule to enforce hard maximum bounds.
   */
  cleanupCapsuleLimits(capsuleId: string, maxEvents: number, maxEvidenceRefs: number): void {
    withTransaction(this.db, () => {
      // 1. Trim events
      const eventRows = this.db
        .prepare("SELECT id FROM trace_events WHERE trace_capsule_id = ? ORDER BY timestamp ASC, id ASC")
        .all(capsuleId) as Array<{ id: string }>;
      
      if (eventRows.length > maxEvents) {
        const eventsToDelete = eventRows.slice(0, eventRows.length - maxEvents);
        const deleteEvent = this.db.prepare("DELETE FROM trace_events WHERE id = ?");
        for (const ev of eventsToDelete) {
          deleteEvent.run(ev.id);
        }
      }

      // 2. Trim evidence refs
      const refRows = this.db
        .prepare("SELECT id FROM trace_evidence_refs WHERE trace_capsule_id = ? ORDER BY id ASC")
        .all(capsuleId) as Array<{ id: string }>;

      if (refRows.length > maxEvidenceRefs) {
        const refsToDelete = refRows.slice(0, refRows.length - maxEvidenceRefs);
        const deleteRef = this.db.prepare("DELETE FROM trace_evidence_refs WHERE id = ?");
        for (const ref of refsToDelete) {
          deleteRef.run(ref.id);
        }
      }
    });
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM trace_capsules").get() as { count: number }).count;
  }
}
