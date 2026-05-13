import { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../store/sqlite/db.js";
import { nowIso } from "../utils/clock.js";
import { candidateToInitialJob, draftToCandidate } from "./learning-candidate-factory.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { LlmLearningGate } from "../analyzer/llm-learning-gate.js";
import type { DistillationQueueWorker } from "../distillation/queue-worker.js";
import type { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import type { DistillationJobRepository } from "../store/sqlite/repositories/distillation-job-repo.js";
import type { TaskRunRepository } from "../store/sqlite/repositories/task-run-repo.js";
import type { ExperienceInput } from "../types/domain.js";
import type { OpenClawLogger } from "../types/plugin.js";

export type LearningPipelineServiceOptions = {
  config: ExperienceEngineConfig;
  db: DatabaseSync;
  candidateRepo: CandidateRepository;
  jobRepo: DistillationJobRepository;
  taskRunRepo: TaskRunRepository;
  logger: OpenClawLogger;
  getLearningGate: () => Promise<LlmLearningGate | undefined>;
  getDistillationWorker: () => Promise<DistillationQueueWorker | undefined>;
};

export class LearningPipelineService {
  constructor(private readonly options: LearningPipelineServiceOptions) {}

  async persistCandidatesAsync(
    input: ExperienceInput,
    originRecordId: string,
    taskRunId?: string,
    sessionId?: string
  ): Promise<void> {
    const learningGate = await this.options.getLearningGate();
    if (!learningGate) {
      if (taskRunId) {
        const taskRun = this.options.taskRunRepo.getById(taskRunId);
        if (taskRun) {
          this.options.taskRunRepo.upsert({
            ...taskRun,
            learning_status: "not_applicable",
            learning_reason: "background learning disabled",
            updated_at: nowIso()
          });
        }
      }
      return;
    }

    const result = await learningGate.generateCandidateDrafts(input);
    if (taskRunId) {
      const taskRun = this.options.taskRunRepo.getById(taskRunId);
      if (taskRun) {
        this.options.taskRunRepo.upsert({
          ...taskRun,
          learning_status: result.drafts.length
            ? "captured"
            : result.source === "disabled" && result.reason === "distillation disabled"
              ? "not_applicable"
              : "rejected",
          learning_reason: result.reason,
          updated_at: nowIso()
        });
      }
    }
    if (!result.drafts.length) {
      this.options.logger.debug?.("experienceengine.learning_skipped", {
        sessionId,
        taskType: input.task_type,
        reason: result.reason,
        source: result.source
      });
      return;
    }

    const persistedCandidates = result.drafts.map((draft) =>
      draftToCandidate(
        draft,
        input,
        originRecordId,
        taskRunId,
        result.directionalCorrectionSignal,
        result.evidenceDrivenReversalSignal
      )
    );
    withTransaction(this.options.db, () => {
      for (const candidate of persistedCandidates) {
        this.options.candidateRepo.upsert(candidate);
        this.options.jobRepo.upsert(candidateToInitialJob(candidate, this.options.config.distillerProfile));
      }
    });

    this.options.logger.info?.("experienceengine.learning_captured", {
      sessionId,
      taskType: input.task_type,
      candidateCount: persistedCandidates.length,
      source: result.source,
      reason: result.reason
    });

    if (this.options.config.distillationAutoDrain) {
      const distillationWorker = await this.options.getDistillationWorker();
      if (!distillationWorker) {
        return;
      }

      await distillationWorker.drain().catch((error) => {
        this.options.logger.error?.("experienceengine.distillation_drain_failed", {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }
  }
}
