import type { DatabaseSync } from "node:sqlite";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { LlmHygieneGovernancePlanner } from "../maintenance/hygiene-governance-llm-planner.js";
import {
  HygieneGovernanceScheduler,
  type SchedulerOptions as HygieneGovernanceSchedulerOptions
} from "../maintenance/hygiene-governance-scheduler.js";
import type { HostPromptContext, OpenClawLogger } from "../types/plugin.js";

export type HygieneGovernanceRuntimeOptions = {
  config: ExperienceEngineConfig;
  db: DatabaseSync;
  logger: OpenClawLogger;
  runtimeOptions: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    fetchImpl?: typeof fetch;
    autonomousHygieneGovernance?: HygieneGovernanceSchedulerOptions & {
      enabled?: boolean;
    };
  };
};

export type HygieneGovernanceQueueResult = {
  status: "disabled" | "queued" | "skipped";
  reason?: "not_due" | "backoff";
  scopeId?: string;
};

export class HygieneGovernanceRuntime {
  private readonly pendingTasks = new Set<Promise<void>>();

  constructor(private readonly options: HygieneGovernanceRuntimeOptions) {}

  private trackTask(task: Promise<void>): void {
    const tracked = task
      .catch((error) => {
        this.options.logger.error?.("experienceengine.hygiene_governance_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        this.pendingTasks.delete(tracked);
      });
    this.pendingTasks.add(tracked);
  }

  async wait(): Promise<void> {
    await Promise.allSettled(this.pendingTasks);
  }

  queue(context: HostPromptContext, trigger: string): HygieneGovernanceQueueResult {
    const options = this.options.runtimeOptions.autonomousHygieneGovernance;
    if (!options?.enabled) {
      return { status: "disabled" };
    }

    const { enabled: _enabled, ...schedulerOptions } = options;
    if (!schedulerOptions.planner) {
      const planner = new LlmHygieneGovernancePlanner({
        config: this.options.config,
        env: this.options.runtimeOptions.env,
        homeDir: this.options.runtimeOptions.homeDir,
        fetchImpl: this.options.runtimeOptions.fetchImpl
      });
      if (planner.hasEndpoint()) {
        schedulerOptions.planner = planner;
      }
    }

    const scheduler = new HygieneGovernanceScheduler(this.options.db, schedulerOptions);
    const queued = scheduler.maybeEnqueue({
      cwd: context.cwd,
      trigger
    });
    if (!queued.enqueued) {
      return {
        status: "skipped",
        reason: queued.reason === "due" ? undefined : queued.reason,
        scopeId: queued.scopeId
      };
    }

    this.trackTask(
      scheduler.drainDueScope(queued.scopeId).then(() => undefined)
    );
    return { status: "queued", scopeId: queued.scopeId };
  }
}
