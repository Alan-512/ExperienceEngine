import { describe, expect, it } from "vitest";
import {
  resolveOpenClawMultiScenarioInstallSource
} from "../../scripts/validation/lib/openclaw-multi-scenario-install-source.mjs";

describe("OpenClaw multi-scenario install source", () => {
  it("uses the native npm channel for published npm artifacts", () => {
    expect(resolveOpenClawMultiScenarioInstallSource({
      publishedChannel: "npm",
      packageName: "@alan512/experienceengine",
      packageVersion: "0.5.2",
      artifactPath: "sealed-npm-artifact.tgz"
    })).toBe("npm:@alan512/experienceengine@0.5.2");
  });

  it("keeps the exact archive path for ClawHub artifacts", () => {
    expect(resolveOpenClawMultiScenarioInstallSource({
      publishedChannel: "clawhub",
      packageName: "@alan512/experienceengine",
      packageVersion: "0.5.2",
      artifactPath: "sealed-clawhub-artifact.tgz"
    })).toBe("sealed-clawhub-artifact.tgz");
  });

  it("fails closed for unsupported channels", () => {
    expect(() => resolveOpenClawMultiScenarioInstallSource({
      publishedChannel: "local-pack" as "npm",
      packageName: "@alan512/experienceengine",
      packageVersion: "0.5.2",
      artifactPath: "sealed-artifact.tgz"
    })).toThrow("Unsupported OpenClaw multi-scenario published channel");
  });
});
