import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { HybridRolloutMode } from "./types.js";

export type HybridRolloutState = {
  effectiveMode: HybridRolloutMode | "disabled" | "control";
  hybridActive: boolean;
  userVisible: boolean;
  reason: "enabled" | "shadow" | "canary_selected" | "canary_excluded" | "disabled" | "kill_switch";
};

const computeBucket = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
};

export const resolveHybridRolloutState = (
  config: Pick<
    ExperienceEngineConfig,
    "hybridEnabled" | "hybridRolloutMode" | "hybridCanaryRate" | "hybridKillSwitch"
  >,
  key: string
): HybridRolloutState => {
  if (!config.hybridEnabled) {
    return {
      effectiveMode: "disabled",
      hybridActive: false,
      userVisible: false,
      reason: "disabled"
    };
  }

  if (config.hybridKillSwitch) {
    return {
      effectiveMode: "disabled",
      hybridActive: false,
      userVisible: false,
      reason: "kill_switch"
    };
  }

  if (config.hybridRolloutMode === "shadow") {
    return {
      effectiveMode: "shadow",
      hybridActive: true,
      userVisible: false,
      reason: "shadow"
    };
  }

  if (config.hybridRolloutMode === "canary") {
    const selected = computeBucket(key) < config.hybridCanaryRate;
    return {
      effectiveMode: selected ? "canary" : "control",
      hybridActive: selected,
      userVisible: selected,
      reason: selected ? "canary_selected" : "canary_excluded"
    };
  }

  return {
    effectiveMode: "live",
    hybridActive: true,
    userVisible: true,
    reason: "enabled"
  };
};
