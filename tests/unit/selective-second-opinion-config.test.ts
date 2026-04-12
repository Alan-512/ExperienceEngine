import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";

describe("selective sync second opinion config", () => {
  it("defaults to disabled", () => {
    const config = loadConfig({}, { env: {}, homeDir: "/tmp/experienceengine-second-opinion-config-defaults" });

    expect(config.syncSecondOpinionMode).toBe("disabled");
    expect(config.syncSecondOpinionModel).toBe("");
  });

  it("loads env overrides", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_SYNC_SECOND_OPINION_MODE: "selective",
          EXPERIENCE_ENGINE_SYNC_SECOND_OPINION_MODEL: "gpt-second-opinion-mini"
        } as NodeJS.ProcessEnv,
        homeDir: "/tmp/experienceengine-second-opinion-config-env"
      }
    );

    expect(config.syncSecondOpinionMode).toBe("selective");
    expect(config.syncSecondOpinionModel).toBe("gpt-second-opinion-mini");
  });
});
