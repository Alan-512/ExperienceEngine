import type { ExperienceEngineConfig } from "../config/config-schema.js";

type ModelRerankerConfig = Pick<
  ExperienceEngineConfig,
  "retrievalRerankerMode" | "retrievalRerankerModel"
>;

export const resolveModelRerankerMode = (config?: ModelRerankerConfig): "disabled" | "heuristic" | "model" => {
  const configured = config?.retrievalRerankerMode ?? "auto";
  if (configured === "disabled") {
    return "disabled";
  }
  if (configured === "heuristic") {
    return "heuristic";
  }
  if (configured === "model") {
    return "model";
  }
  return config?.retrievalRerankerModel?.trim() ? "model" : "heuristic";
};
