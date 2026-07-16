import { canonicalJson, sha256Text } from "../../runtime/package/package-generation.js";
import {
  MATCHED_BLOCK_ARMS,
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION
} from "./constants.js";
import type { MatchedBlockArm } from "./types.js";

export type MatchedBlockArmControl = {
  benchmark_protocol_version: string;
  arm: MatchedBlockArm;
  ee_runtime_mode: "enabled" | "disabled";
  decision_pipeline_mode: "enabled" | "disabled";
  delivery_mode: "normal" | "forced_suppressed" | "disabled";
  capture_would_have_delivered: boolean;
  external_instrumentation_required: true;
};

export const MATCHED_BLOCK_ARM_CONTROLS: Readonly<
  Record<MatchedBlockArm, MatchedBlockArmControl>
> = Object.freeze({
  treatment: Object.freeze({
    benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
    arm: "treatment",
    ee_runtime_mode: "enabled",
    decision_pipeline_mode: "enabled",
    delivery_mode: "normal",
    capture_would_have_delivered: true,
    external_instrumentation_required: true
  }),
  forced_holdout: Object.freeze({
    benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
    arm: "forced_holdout",
    ee_runtime_mode: "enabled",
    decision_pipeline_mode: "enabled",
    delivery_mode: "forced_suppressed",
    capture_would_have_delivered: true,
    external_instrumentation_required: true
  }),
  no_ee: Object.freeze({
    benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
    arm: "no_ee",
    ee_runtime_mode: "disabled",
    decision_pipeline_mode: "disabled",
    delivery_mode: "disabled",
    capture_would_have_delivered: false,
    external_instrumentation_required: true
  })
});

export const getMatchedBlockArmControl = (
  arm: MatchedBlockArm
): MatchedBlockArmControl => MATCHED_BLOCK_ARM_CONTROLS[arm];

export const computeMatchedBlockArmControlDigest = (
  arm: MatchedBlockArm
): string => sha256Text(canonicalJson(getMatchedBlockArmControl(arm)));

export const deriveMatchedBlockArmOrder = (
  randomizationSeed: string
): MatchedBlockArm[] => {
  if (randomizationSeed.trim().length === 0) {
    throw new Error("Matched-block randomization seed must be non-empty.");
  }
  return [...MATCHED_BLOCK_ARMS]
    .map((arm) => ({
      arm,
      key: sha256Text(canonicalJson({
        benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
        randomization_seed: randomizationSeed,
        arm
      }))
    }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.arm.localeCompare(right.arm))
    .map(({ arm }) => arm);
};
