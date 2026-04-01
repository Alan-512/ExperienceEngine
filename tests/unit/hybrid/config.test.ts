import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/config/load-config.js";

describe("hybrid phase 1 config", () => {
  it("loads the phase 1 hybrid defaults", () => {
    const config = loadConfig({}, { env: {}, homeDir: "/tmp/experienceengine-hybrid-config" });

    expect(config.hybridEnabled).toBe(false);
    expect(config.hybridSyncExplainEnabled).toBe(false);
    expect(config.hybridAsyncPostmortemEnabled).toBe(false);
    expect(config.hybridRolloutMode).toBe("live");
    expect(config.hybridCanaryRate).toBe(0.1);
    expect(config.hybridKillSwitch).toBe(false);
    expect(config.hybridRoutePolicyVersion).toBe("hybrid-phase1-v1");
    expect(config.hybridCapsuleSchemaVersion).toBe("hybrid-capsule-v1");
    expect(config.hybridExplainDecisionProfileVersion).toBe("hybrid-explain-v1");
    expect(config.hybridPostmortemReviewProfileVersion).toBe("hybrid-postmortem-v1");
    expect(config.hybridExplainLlmEnabled).toBe(false);
    expect(config.hybridExplainProviderMode).toBe("shared_distiller");
    expect(config.hybridExplainModelProfileVersion).toBe("hybrid-explain-llm-v1");
    expect(config.hybridAsyncPostmortemLlmEnabled).toBe(false);
    expect(config.hybridPostmortemProviderMode).toBe("shared_distiller");
    expect(config.hybridPostmortemModelProfileVersion).toBe("hybrid-postmortem-llm-v1");
  });

  it("accepts explicit phase 1 hybrid overrides", () => {
    const config = loadConfig(
      {
        hybridEnabled: true,
        hybridSyncExplainEnabled: true,
        hybridAsyncPostmortemEnabled: true,
        hybridRolloutMode: "canary",
        hybridCanaryRate: 1,
        hybridKillSwitch: false,
        hybridRoutePolicyVersion: "hybrid-phase1-canary",
        hybridCapsuleSchemaVersion: "hybrid-capsule-v2",
        hybridExplainDecisionProfileVersion: "hybrid-explain-canary",
        hybridPostmortemReviewProfileVersion: "hybrid-postmortem-canary",
        hybridExplainLlmEnabled: true,
        hybridExplainProviderMode: "shared_distiller",
        hybridExplainModelProfileVersion: "hybrid-explain-llm-canary",
        hybridAsyncPostmortemLlmEnabled: true,
        hybridPostmortemProviderMode: "shared_distiller",
        hybridPostmortemModelProfileVersion: "hybrid-postmortem-llm-canary"
      },
      { env: {}, homeDir: "/tmp/experienceengine-hybrid-config-overrides" }
    );

    expect(config.hybridEnabled).toBe(true);
    expect(config.hybridSyncExplainEnabled).toBe(true);
    expect(config.hybridAsyncPostmortemEnabled).toBe(true);
    expect(config.hybridRolloutMode).toBe("canary");
    expect(config.hybridCanaryRate).toBe(1);
    expect(config.hybridKillSwitch).toBe(false);
    expect(config.hybridRoutePolicyVersion).toBe("hybrid-phase1-canary");
    expect(config.hybridCapsuleSchemaVersion).toBe("hybrid-capsule-v2");
    expect(config.hybridExplainDecisionProfileVersion).toBe("hybrid-explain-canary");
    expect(config.hybridPostmortemReviewProfileVersion).toBe("hybrid-postmortem-canary");
    expect(config.hybridExplainLlmEnabled).toBe(true);
    expect(config.hybridExplainProviderMode).toBe("shared_distiller");
    expect(config.hybridExplainModelProfileVersion).toBe("hybrid-explain-llm-canary");
    expect(config.hybridAsyncPostmortemLlmEnabled).toBe(true);
    expect(config.hybridPostmortemProviderMode).toBe("shared_distiller");
    expect(config.hybridPostmortemModelProfileVersion).toBe("hybrid-postmortem-llm-canary");
  });

  it("loads persisted hybrid settings from settings.json when env is absent", () => {
    const homeDir = "/tmp/experienceengine-hybrid-settings";
    const settingsHome = join(homeDir, ".experienceengine");
    mkdirSync(settingsHome, { recursive: true });
    writeFileSync(
      join(settingsHome, "settings.json"),
      `${JSON.stringify(
        {
          hybrid: {
            enabled: true,
            sync_explain_enabled: true,
            async_postmortem_enabled: true,
            rollout_mode: "canary",
            canary_rate: 0.5,
            kill_switch: false,
            explain_llm_enabled: true,
            explain_provider_mode: "shared_distiller",
            explain_model_profile_version: "hybrid-explain-llm-settings",
            async_postmortem_llm_enabled: true,
            postmortem_provider_mode: "shared_distiller",
            postmortem_model_profile_version: "hybrid-postmortem-llm-settings"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const config = loadConfig({}, { env: {}, homeDir });

    expect(config.hybridEnabled).toBe(true);
    expect(config.hybridSyncExplainEnabled).toBe(true);
    expect(config.hybridAsyncPostmortemEnabled).toBe(true);
    expect(config.hybridRolloutMode).toBe("canary");
    expect(config.hybridCanaryRate).toBe(0.5);
    expect(config.hybridKillSwitch).toBe(false);
    expect(config.hybridExplainLlmEnabled).toBe(true);
    expect(config.hybridExplainProviderMode).toBe("shared_distiller");
    expect(config.hybridExplainModelProfileVersion).toBe("hybrid-explain-llm-settings");
    expect(config.hybridAsyncPostmortemLlmEnabled).toBe(true);
    expect(config.hybridPostmortemProviderMode).toBe("shared_distiller");
    expect(config.hybridPostmortemModelProfileVersion).toBe("hybrid-postmortem-llm-settings");
  });
});
