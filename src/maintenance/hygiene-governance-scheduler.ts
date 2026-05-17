import type { DatabaseSync } from "node:sqlite";
import { resolveScope } from "../input/scope-resolver.js";
import { buildHygieneGovernanceInput, planHygieneGovernance } from "./hygiene-governance-planner.js";
import type { HygieneGovernancePlannerProvider } from "./hygiene-governance-planner.js";
import { validateHygieneGovernancePlan } from "./hygiene-governance-validator.js";
import { applyValidatedHygieneGovernanceActions } from "./hygiene-governance-applicator.js";
import { AttributionRecordRepository } from "../store/sqlite/repositories/attribution-record-repo.js";
import { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import {
  GovernanceLeaseRepository,
  GovernancePlanRepository,
  GovernanceRunRepository,
  GovernanceScheduleRepository
} from "../store/sqlite/repositories/hygiene-governance-repo.js";

export type GovernanceDrainResult =
  | { status: "completed" }
  | { status: "checkpointed"; checkpoint: Record<string, unknown> }
  | { status: "deferred"; reason: "lease_held" | "not_scheduled" | "backoff" }
  | { status: "failed"; failureClass: string; message: string };

export type GovernanceDrainWorker = {
  drain(input: {
    scopeId: string;
    runId?: string;
    checkpoint?: Record<string, unknown>;
    now: string;
    budget: { maxActions: number; maxRuntimeMs: number };
  }): Promise<{ status: "completed" } | { status: "checkpointed"; checkpoint: Record<string, unknown> }>;
};

export type SchedulerOptions = {
  now?: () => string;
  intervalMs?: number;
  leaseTtlMs?: number;
  backoffMs?: number;
  maxActions?: number;
  maxRuntimeMs?: number;
  hostInstanceId?: string;
  worker?: GovernanceDrainWorker;
  planner?: HygieneGovernancePlannerProvider;
};

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_BACKOFF_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ACTIONS = 20;
const DEFAULT_MAX_RUNTIME_MS = 5_000;

class DefaultHygieneGovernanceWorker implements GovernanceDrainWorker {
  constructor(
    private readonly db: DatabaseSync,
    private readonly planner?: HygieneGovernancePlannerProvider
  ) {}

  async drain(input: {
    scopeId: string;
    runId?: string;
    now: string;
    budget: { maxActions: number; maxRuntimeMs: number };
  }): Promise<{ status: "completed" } | { status: "checkpointed"; checkpoint: Record<string, unknown> }> {
    const scope = new ScopeRepository(this.db).getById(input.scopeId);
    const nodes = new NodeRepository(this.db).listByScope(input.scopeId);
    const candidates = new CandidateRepository(this.db).listByScope(input.scopeId);
    const attributionRecords = new AttributionRecordRepository(this.db).listRecentByScope(input.scopeId, 50);
    const governanceInput = buildHygieneGovernanceInput({
      scopeId: input.scopeId,
      scopeName: scope?.scope_name,
      scopeType: scope?.scope_type,
      nodes,
      candidates,
      attributionRecords,
      now: input.now,
      maxFindings: input.budget.maxActions,
      maxNodes: Math.max(input.budget.maxActions * 2, input.budget.maxActions),
      maxCandidates: input.budget.maxActions,
      exportRiskEnabled: true
    });
    const planRepo = new GovernancePlanRepository(this.db);
    const reusablePlan = planRepo.findReusableCompletedPlan(input.scopeId, governanceInput.findingHash);
    if (reusablePlan) {
      this.db
        .prepare("UPDATE hygiene_governance_schedules SET last_finding_hash = ?, last_run_status = 'completed', updated_at = ? WHERE scope_id = ?")
        .run(governanceInput.findingHash, input.now, input.scopeId);
      return { status: "completed" };
    }

    const plan = await planHygieneGovernance(governanceInput, this.planner ? { planner: this.planner } : {});
    const validation = validateHygieneGovernancePlan(governanceInput, plan);
    const storedPlan = planRepo.create({
      run_id: input.runId,
      scope_id: input.scopeId,
      status: "proposed",
      finding_hash: governanceInput.findingHash,
      risk: plan.actions.some((action) => action.riskLevel === "high") ? "high" : "low",
      plan: plan as unknown as Record<string, unknown>,
      validator_result: validation as unknown as Record<string, unknown>,
      created_at: input.now,
      updated_at: input.now
    });
    applyValidatedHygieneGovernanceActions(this.db, {
      input: governanceInput,
      plan,
      validation,
      runId: input.runId,
      planId: storedPlan.plan_id,
      now: input.now,
      maxActions: input.budget.maxActions
    });
    this.db
      .prepare(
        `UPDATE hygiene_governance_plans
         SET status = 'completed', updated_at = ?
         WHERE plan_id = ?`
      )
      .run(input.now, storedPlan.plan_id);
    this.db
      .prepare("UPDATE hygiene_governance_schedules SET last_finding_hash = ?, last_run_status = 'completed', updated_at = ? WHERE scope_id = ?")
      .run(governanceInput.findingHash, input.now, input.scopeId);
    return { status: "completed" };
  }
}

export class HygieneGovernanceScheduler {
  private readonly scheduleRepo: GovernanceScheduleRepository;
  private readonly leaseRepo: GovernanceLeaseRepository;
  private readonly runRepo: GovernanceRunRepository;
  private readonly now: () => string;
  private readonly intervalMs: number;
  private readonly leaseTtlMs: number;
  private readonly backoffMs: number;
  private readonly maxActions: number;
  private readonly maxRuntimeMs: number;
  private readonly hostInstanceId: string;
  private readonly worker: GovernanceDrainWorker;

  constructor(private readonly db: DatabaseSync, options: SchedulerOptions = {}) {
    this.scheduleRepo = new GovernanceScheduleRepository(db);
    this.leaseRepo = new GovernanceLeaseRepository(db);
    this.runRepo = new GovernanceRunRepository(db);
    this.now = options.now ?? (() => new Date().toISOString());
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
    this.maxRuntimeMs = options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;
    this.hostInstanceId = options.hostInstanceId ?? "host";
    this.worker = options.worker ?? new DefaultHygieneGovernanceWorker(db, options.planner);
  }

  maybeEnqueue(input: {
    cwd?: string;
    scopeId?: string;
    trigger: string;
    findingHash?: string;
  }): { scopeId: string; enqueued: boolean; reason: "due" | "not_due" | "backoff" } {
    const scopeId = input.scopeId ?? resolveScope(input.cwd).scope_id;
    const result = this.scheduleRepo.maybeEnqueue({
      scopeId,
      trigger: input.trigger,
      now: this.now(),
      intervalMs: this.intervalMs,
      findingHash: input.findingHash
    });

    return {
      scopeId,
      ...result
    };
  }

  async drainDueScope(scopeId: string): Promise<GovernanceDrainResult> {
    const now = this.now();
    const schedule = this.scheduleRepo.get(scopeId);
    if (!schedule) {
      return { status: "deferred", reason: "not_scheduled" };
    }
    if (schedule.backoff_until && schedule.backoff_until > now) {
      return { status: "deferred", reason: "backoff" };
    }

    const lease = this.leaseRepo.acquire({
      scopeId,
      owner: this.hostInstanceId,
      now,
      ttlMs: this.leaseTtlMs
    });
    if (!lease) {
      return { status: "deferred", reason: "lease_held" };
    }

    const pendingRun = this.runRepo.listByScope(scopeId).find((entry) => entry.status === "pending");
    const run = pendingRun ?? this.runRepo.create({
      scope_id: scopeId,
      trigger: schedule.pending_reasons[0] ?? "scheduled",
      status: "running",
      started_at: now,
      created_at: now,
      updated_at: now
    });
    if (pendingRun) {
      this.db
        .prepare(
          `UPDATE hygiene_governance_runs
           SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
           WHERE run_id = ?`
        )
        .run(now, now, pendingRun.run_id);
    }

    try {
      const result = await this.worker.drain({
        scopeId,
        runId: run.run_id,
        checkpoint: run.checkpoint,
        now,
        budget: { maxActions: this.maxActions, maxRuntimeMs: this.maxRuntimeMs }
      });
      if (result.status === "checkpointed") {
        const checkpointedAt = this.now();
        this.db
          .prepare(
            `UPDATE hygiene_governance_runs
             SET status = 'pending', checkpoint_json = ?, updated_at = ?
             WHERE run_id = ?`
          )
          .run(JSON.stringify(result.checkpoint), checkpointedAt, run.run_id);
        this.leaseRepo.release(scopeId, this.hostInstanceId);
        return { status: "checkpointed", checkpoint: result.checkpoint };
      }
      const completedAt = this.now();
      this.db
        .prepare(
          `UPDATE hygiene_governance_runs
           SET status = 'completed', finished_at = ?, updated_at = ?
           WHERE run_id = ?`
        )
        .run(completedAt, completedAt, run.run_id);
      this.leaseRepo.release(scopeId, this.hostInstanceId);
      return { status: "completed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = this.now();
      this.db
        .prepare(
          `UPDATE hygiene_governance_runs
           SET status = 'failed', failure_class = 'worker_error', failure_message = ?, finished_at = ?, updated_at = ?
           WHERE run_id = ?`
        )
        .run(message, failedAt, failedAt, run.run_id);
      this.scheduleRepo.recordFailure({
        scopeId,
        failureClass: "worker_error",
        now: failedAt,
        backoffMs: this.backoffMs
      });
      this.leaseRepo.release(scopeId, this.hostInstanceId);
      return { status: "failed", failureClass: "worker_error", message };
    }
  }
}

export const drainDueHygieneGovernance = async (
  db: DatabaseSync,
  options: SchedulerOptions & { scopeId: string }
): Promise<GovernanceDrainResult> => {
  const scheduler = new HygieneGovernanceScheduler(db, options);
  return scheduler.drainDueScope(options.scopeId);
};
