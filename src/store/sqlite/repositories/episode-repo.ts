import type { DatabaseSync } from "node:sqlite";
import type { EpisodeProjection, EpisodeSummary } from "../../../types/domain.js";
import { AttributionRecordRepository } from "./attribution-record-repo.js";
import { InjectionRepository } from "./injection-repo.js";
import { InputRecordRepository } from "./input-record-repo.js";
import { OutcomeRecordRepository } from "./outcome-record-repo.js";
import { ReviewEventRepository } from "./review-event-repo.js";
import { TaskRunRepository } from "./task-run-repo.js";

export class EpisodeRepository {
  private readonly inputRepo;
  private readonly taskRunRepo;
  private readonly outcomeRepo;
  private readonly injectionRepo;
  private readonly attributionRepo;
  private readonly reviewRepo;

  constructor(private readonly db: DatabaseSync) {
    this.inputRepo = new InputRecordRepository(db);
    this.taskRunRepo = new TaskRunRepository(db);
    this.outcomeRepo = new OutcomeRecordRepository(db);
    this.injectionRepo = new InjectionRepository(db);
    this.attributionRepo = new AttributionRecordRepository(db);
    this.reviewRepo = new ReviewEventRepository(db);
  }

  getByEpisodeId(episodeId: string): EpisodeProjection | undefined {
    const taskRun = this.taskRunRepo.getLatestByEpisodeId(episodeId);
    const inputRecords = this.inputRepo.listByEpisodeId(episodeId);
    const outcomeRecords = this.outcomeRepo.listByEpisodeId(episodeId);
    const injectionEvents = this.injectionRepo.listByEpisodeId(episodeId);
    const attributionRecords = this.attributionRepo.listByEpisodeId(episodeId);
    const reviewEvents = this.reviewRepo.listByEpisodeId(episodeId);

    if (
      !taskRun &&
      inputRecords.length === 0 &&
      outcomeRecords.length === 0 &&
      injectionEvents.length === 0 &&
      attributionRecords.length === 0 &&
      reviewEvents.length === 0
    ) {
      return undefined;
    }

    return {
      episode_id: episodeId,
      scope_id: taskRun?.scope_id ?? inputRecords[0]?.scope_id ?? injectionEvents[0]?.scope_id,
      session_id: taskRun?.session_id ?? inputRecords[0]?.session_id ?? injectionEvents[0]?.session_id,
      task_run: taskRun,
      input_records: inputRecords,
      outcome_records: outcomeRecords,
      injection_events: injectionEvents,
      attribution_records: attributionRecords,
      review_events: reviewEvents
    };
  }

  listRecentByScope(scopeId: string, limit = 10): EpisodeSummary[] {
    return this.db
      .prepare(
        `SELECT
           episode_id,
           scope_id,
           MAX(session_id) AS session_id,
           MAX(task_type) AS task_type,
           MAX(task_summary) AS task_summary,
           MAX(outcome_signal) AS outcome,
           MIN(created_at) AS created_at,
           MAX(created_at) AS updated_at
         FROM experience_input_records
         WHERE scope_id = ?
           AND episode_id IS NOT NULL
         GROUP BY episode_id, scope_id
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(scopeId, limit)
      .map((row) => {
        const value = row as {
          episode_id: string;
          scope_id: string;
          session_id: string | null;
          task_type: EpisodeSummary["task_type"] | null;
          task_summary: string | null;
          outcome: EpisodeSummary["outcome"] | null;
          created_at: string;
          updated_at: string;
        };
        return {
          episode_id: value.episode_id,
          scope_id: value.scope_id,
          session_id: value.session_id ?? undefined,
          task_type: value.task_type ?? undefined,
          task_summary: value.task_summary ?? undefined,
          outcome: value.outcome ?? undefined,
          created_at: value.created_at,
          updated_at: value.updated_at
        };
      });
  }
}
