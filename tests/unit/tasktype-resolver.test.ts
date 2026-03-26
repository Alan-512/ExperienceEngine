import { describe, expect, it } from "vitest";
import { resolveTaskType } from "../../src/input/tasktype-resolver.js";

describe("resolveTaskType", () => {
  it("detects test debug tasks", () => {
    expect(resolveTaskType("Fix the failing vitest assertion in auth flow")).toBe("test_debug");
  });

  it("detects refactor tasks", () => {
    expect(resolveTaskType("Refactor the auth service to remove duplicated branching")).toBe("refactor");
  });

  it("detects provider and model routing troubleshooting as config_debug", () => {
    expect(
      resolveTaskType("Debug the OpenRouter free model routing issue and find a working provider/model configuration.")
    ).toBe("config_debug");
  });

  it("detects API key and endpoint configuration troubleshooting as config_debug", () => {
    expect(
      resolveTaskType("Investigate why the API key and endpoint configuration fails for the Gemini provider.")
    ).toBe("config_debug");
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

  it("classifies authentication regression investigations with fixture handshake language as test_debug", () => {
    expect(
      resolveTaskType(
        "Review payments authentication regression starting from fixture handshake behavior in read-only mode; identify likely first diagnostic step."
      )
    ).toBe("test_debug");
  });
});
