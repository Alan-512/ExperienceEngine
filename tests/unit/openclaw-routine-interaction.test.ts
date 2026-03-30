import { describe, expect, it } from "vitest";
import { detectOpenClawRoutineIntent } from "../../src/plugin/openclaw-routine-interaction.js";

describe("detectOpenClawRoutineIntent", () => {
  it("matches readiness questions phrased as ready in this repo", () => {
    expect(detectOpenClawRoutineIntent("Is ExperienceEngine ready in this repo?")).toBe("inspect_readiness");
  });

  it("matches recent-silence questions phrased as stayed quiet lately in this repo", () => {
    expect(detectOpenClawRoutineIntent("Why has ExperienceEngine stayed quiet lately in this repo?")).toBe(
      "explain_recent_silence"
    );
  });
});
