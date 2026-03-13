import { describe, expect, it } from "vitest";
import { resolveTaskType } from "../../src/input/tasktype-resolver.js";

describe("resolveTaskType", () => {
  it("detects test debug tasks", () => {
    expect(resolveTaskType("Fix the failing vitest assertion in auth flow")).toBe("test_debug");
  });

  it("detects refactor tasks", () => {
    expect(resolveTaskType("Refactor the auth service to remove duplicated branching")).toBe("refactor");
  });

  it("falls back to general when no specialized matcher applies", () => {
    expect(resolveTaskType("Refine the roadmap copy")).toBe("general");
  });
});
