import { describe, expect, it } from "vitest";
import { computeBenchmarkRecordDigest } from "../../src/evaluation/matched-block/contract.js";
import {
  createOpenClawMultiScenarioExecutionBundle
} from "../../src/evaluation/matched-block/openclaw-multi-scenario-execution.js";
import {
  createOpenClawMultiScenarioCampaignPlan
} from "../../src/evaluation/matched-block/openclaw-multi-scenario-plan.js";
import type { BenchmarkRuntimeManifest } from "../../src/evaluation/matched-block/types.js";

const withDigest = <T extends Record<string, unknown>>(
  value: T,
  field: keyof T & string
): T => {
  const next = { ...value } as Record<string, unknown>;
  next[field] = computeBenchmarkRecordDigest(next, field);
  return next as T;
};

const plan = createOpenClawMultiScenarioCampaignPlan({
  campaignVersion: "1",
  repetitionsPerScenario: 1,
  createdAt: "2026-07-17T12:00:00.000Z",
  artifact: {
    file_name: "artifact.tgz",
    size_bytes: 10,
    sha256: "a".repeat(64),
    published_channel: "clawhub",
    package_name: "@alan512/experienceengine",
    package_version: "0.5.1"
  },
  host: {
    executable_name: "openclaw",
    openclaw_version: "2026.7.1",
    node_version: "22.21.0",
    platform: "linux-x64",
    model_provider: "openrouter",
    model_identity: "openrouter/tencent/hy3:free",
    host_mode: "local_embedded"
  }
});

const runtimeManifest = withDigest({
  runtime_manifest_schema_version: "benchmark-runtime-v1",
  runtime_manifest_id: "multi-scenario-runtime-v1",
  package_name: "@alan512/experienceengine",
  package_version: "0.5.1",
  published_channel: "clawhub",
  artifact_integrity: `sha256:${"a".repeat(64)}`,
  registry_record_identity: "clawhub:exact",
  openclaw_version: "2026.7.1",
  node_version: "22.21.0",
  platform: "linux-x64",
  host_identity: "openclaw-local-wsl",
  host_model_provider: "openrouter",
  host_model_identity_fingerprint: "model-fingerprint",
  host_model_parameters_digest: "model-parameters",
  configuration_digest: "configuration",
  profile_registry_digest: "profile-registry",
  benchmark_evidence_target_id: "phase-0.5c",
  created_at: plan.created_at,
  runtime_manifest_digest: ""
} satisfies BenchmarkRuntimeManifest, "runtime_manifest_digest");

const executionContract = {
  preflight_attempt_limit: 1,
  harness_version: "openclaw-multi-scenario-harness-v1",
  transcript_adapter_version: "openclaw-multi-scenario-transcript-v1",
  scorer_version: "matched-block-scorecard-v2",
  observer_contract_digest: "observer",
  timeout_policy_digest: "timeout",
  resource_policy_digest: "resource",
  fixture_reset_policy_digest: "fixture-reset",
  network_retry_policy_version: "network-retry-none-v1"
};

describe("OpenClaw multi-scenario execution bundle", () => {
  it("builds three independent sealed blocks without changing claim thresholds", () => {
    const bundle = createOpenClawMultiScenarioExecutionBundle({
      plan,
      runtimeManifest,
      executionContract
    });
    expect(bundle.fixtures).toHaveLength(3);
    expect(bundle.blocks).toHaveLength(3);
    expect(bundle.publication_plan.minimum_repetitions_per_scenario).toBe(5);
    expect(bundle.blocks.map((entry) => entry.block_manifest.scenario_id)).toEqual(
      plan.scenarios.map((entry) => entry.adapter.scenario_id)
    );
    for (const entry of bundle.blocks) {
      expect(entry.arm_plans.map((armPlan) => armPlan.arm)).toEqual(
        entry.block_manifest.planned_arm_order
      );
      expect(entry.block_manifest.benchmark_protocol_version).toBe(
        "matched-block-benchmark-v2"
      );
    }
  });
});
