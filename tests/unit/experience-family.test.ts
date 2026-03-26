import { describe, expect, it } from "vitest";

import { areTaskFamiliesMergeCompatible, resolveExperienceFamily } from "../../src/distillation/experience-family.js";

describe("experience-family", () => {
  it("groups test_debug and bug_fix into the same executable-debug family", () => {
    expect(resolveExperienceFamily("test_debug")).toBe(resolveExperienceFamily("bug_fix"));
    expect(areTaskFamiliesMergeCompatible("test_debug", "bug_fix")).toBe(true);
  });

  it("groups build_debug with test_debug for reusable execution-loop lessons", () => {
    expect(resolveExperienceFamily("build_debug")).toBe(resolveExperienceFamily("test_debug"));
    expect(areTaskFamiliesMergeCompatible("build_debug", "test_debug")).toBe(true);
  });

  it("keeps unrelated families incompatible", () => {
    expect(areTaskFamiliesMergeCompatible("performance", "config_debug")).toBe(false);
    expect(areTaskFamiliesMergeCompatible("feature_add", "test_debug")).toBe(false);
  });
});
