import { describe, expect, it } from "vitest";
import { resolveTaskType } from "../../src/input/tasktype-resolver.js";

describe("resolveTaskType", () => {
  it("detects test debug tasks", () => {
    expect(resolveTaskType("Fix the failing vitest assertion in auth flow")).toBe("test_debug");
  });

  it("returns unknown when no pattern matches", () => {
    expect(resolveTaskType("Refine the roadmap copy")).toBe("unknown");
  });
});

