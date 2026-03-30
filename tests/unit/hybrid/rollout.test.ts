import { describe, expect, it } from "vitest";
import { resolveHybridRolloutState } from "../../../src/hybrid/rollout.js";

describe("resolveHybridRolloutState", () => {
  it("keeps shadow mode active but non-user-visible", () => {
    expect(
      resolveHybridRolloutState(
        {
          hybridEnabled: true,
          hybridRolloutMode: "shadow",
          hybridCanaryRate: 0.1,
          hybridKillSwitch: false
        },
        "session:shadow"
      )
    ).toMatchObject({
      effectiveMode: "shadow",
      hybridActive: true,
      userVisible: false
    });
  });

  it("excludes turns outside the canary slice", () => {
    expect(
      resolveHybridRolloutState(
        {
          hybridEnabled: true,
          hybridRolloutMode: "canary",
          hybridCanaryRate: 0,
          hybridKillSwitch: false
        },
        "session:control"
      )
    ).toMatchObject({
      effectiveMode: "control",
      hybridActive: false,
      userVisible: false
    });
  });

  it("forces the hybrid path off when the kill switch is enabled", () => {
    expect(
      resolveHybridRolloutState(
        {
          hybridEnabled: true,
          hybridRolloutMode: "live",
          hybridCanaryRate: 1,
          hybridKillSwitch: true
        },
        "session:kill"
      )
    ).toMatchObject({
      effectiveMode: "disabled",
      hybridActive: false,
      userVisible: false,
      reason: "kill_switch"
    });
  });
});
