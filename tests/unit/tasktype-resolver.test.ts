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

  it("ignores inline shell commands when classifying repo sanity prompts", () => {
    expect(
      resolveTaskType(
        "This is a read-only repository verification task. Run `pwd` and `test -f package.json && echo ok`. Report whether package.json exists."
      )
    ).toBe("general");
  });

  it("ignores shell-like run clauses even when the host strips code formatting", () => {
    expect(
      resolveTaskType(
        "This is a read-only repository verification task. Run pwd and test -f package.json && echo ok. Report whether package.json exists."
      )
    ).toBe("general");
  });

  it("still classifies explicit debug narratives even when commands are stripped", () => {
    expect(
      resolveTaskType(
        "This is a test debugging verification task. Run `pnpm test tests/unit/openclaw-baseline.test.ts` and report whether the test command passed."
      )
    ).toBe("test_debug");
  });
});
