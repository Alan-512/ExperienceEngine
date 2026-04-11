import { describe, expect, it } from "vitest";
import { createExperiencePlugin } from "../../src/plugin/openclaw-plugin.js";
import { getOpenClawRuntimeDefaults } from "../../src/plugin/openclaw-runtime-defaults.js";

describe("OpenClaw runtime defaults", () => {
  it("keeps background learning enabled while leaving async posttask disabled by default", () => {
    expect(getOpenClawRuntimeDefaults()).toEqual({
      learningLoopState: "learning_loop_active",
      backgroundLearningEnabled: true,
      hybridPosttaskEnabled: false
    });

    const plugin = createExperiencePlugin();
    const runtime = (plugin as unknown as {
      runtime: {
        backgroundLearningEnabled: boolean;
        hybridPosttaskEnabled: boolean;
      };
    }).runtime;

    expect(runtime.backgroundLearningEnabled).toBe(true);
    expect(runtime.hybridPosttaskEnabled).toBe(false);
  });

  it("still lets explicit runtime overrides change the defaults when a caller opts in", () => {
    const plugin = createExperiencePlugin({}, undefined, {
      disableBackgroundLearning: true,
      disableHybridPosttask: false
    });
    const runtime = (plugin as unknown as {
      runtime: {
        backgroundLearningEnabled: boolean;
        hybridPosttaskEnabled: boolean;
      };
    }).runtime;

    expect(runtime.backgroundLearningEnabled).toBe(false);
    expect(runtime.hybridPosttaskEnabled).toBe(true);
  });
});
