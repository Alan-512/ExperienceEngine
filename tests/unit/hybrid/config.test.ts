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
        hybridPostmortemReviewProfileVersion: "hybrid-postmortem-canary"
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
  });
});
