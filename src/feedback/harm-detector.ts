import type { ExperienceInput } from "../types/domain.js";

export const detectHarm = (input: ExperienceInput): boolean =>
  input.outcome_signal === "failure" && input.injected_node_ids.length > 0;

