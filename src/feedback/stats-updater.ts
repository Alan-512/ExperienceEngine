import type { OutcomeSignal, ScopeTaskStats, TaskType } from "../types/domain.js";
import { nowIso } from "../utils/clock.js";

export const createEmptyStats = (scopeId: string, taskType: TaskType): ScopeTaskStats => ({
  scope_id: scopeId,
  task_type: taskType,
  total_tasks: 0,
  success_tasks: 0,
  failed_tasks: 0,
  unknown_tasks: 0,
  injected_tasks: 0,
  injected_success_tasks: 0,
  updated_at: nowIso()
});

export const updateStats = (
  current: ScopeTaskStats,
  outcome: OutcomeSignal,
  injected: boolean
): ScopeTaskStats => ({
  ...current,
  total_tasks: current.total_tasks + 1,
  success_tasks: current.success_tasks + Number(outcome === "success"),
  failed_tasks: current.failed_tasks + Number(outcome === "failure"),
  unknown_tasks: current.unknown_tasks + Number(outcome === "unknown"),
  injected_tasks: current.injected_tasks + Number(injected),
  injected_success_tasks: current.injected_success_tasks + Number(injected && outcome === "success"),
  updated_at: nowIso()
});

