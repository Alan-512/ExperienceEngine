import { describe, expect, it } from "vitest";
import { resolveScope } from "../../src/input/scope-resolver.js";

describe("resolveScope", () => {
  it("normalizes scope identity for WSL-mounted Windows paths with different casing", () => {
    const upper = resolveScope("/mnt/d/project/ExperienceEngine");
    const lower = resolveScope("/mnt/d/project/experienceengine");

    expect(upper.scope_id).toBe(lower.scope_id);
    expect(upper.root_path).toBe("/mnt/d/project/ExperienceEngine");
    expect(lower.root_path).toBe("/mnt/d/project/experienceengine");
  });
});
