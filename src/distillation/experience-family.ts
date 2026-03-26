import type { TaskType } from "../types/domain.js";

export type ExperienceFamily =
  | "execution_debug"
  | "configuration_debug"
  | "integration_boundary"
  | "delivery_change"
  | "optimization"
  | "general";

const FAMILY_MAP: Record<TaskType, ExperienceFamily> = {
  bug_fix: "execution_debug",
  test_debug: "execution_debug",
  build_debug: "execution_debug",
  config_debug: "configuration_debug",
  integration_fix: "integration_boundary",
  feature_add: "delivery_change",
  refactor: "delivery_change",
  performance: "optimization",
  general: "general"
};

export const resolveExperienceFamily = (taskType: TaskType): ExperienceFamily => FAMILY_MAP[taskType];

export const areTaskFamiliesMergeCompatible = (left: TaskType, right: TaskType): boolean =>
  resolveExperienceFamily(left) === resolveExperienceFamily(right);
