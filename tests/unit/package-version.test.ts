import { describe, expect, it } from "vitest";
import { buildVersionStatus, compareVersions } from "../../src/version/package-version.js";

describe("package version helpers", () => {
  it("compares semver-like numeric versions", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
  });

  it("marks installed adapters without recorded version as upgradeable", () => {
    expect(buildVersionStatus(true, undefined, "0.1.0")).toEqual({
      currentVersion: "0.1.0",
      recordedVersion: null,
      state: "unknown",
      updateAvailable: true
    });
  });

  it("marks newer local package versions as upgrade-available", () => {
    expect(buildVersionStatus(true, "0.1.0", "0.2.0")).toEqual({
      currentVersion: "0.2.0",
      recordedVersion: "0.1.0",
      state: "upgrade-available",
      updateAvailable: true
    });
  });
});
