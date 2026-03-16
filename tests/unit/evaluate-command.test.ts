import { afterEach, describe, expect, it, vi } from "vitest";
import { runEvaluateCommand } from "../../src/cli/commands/evaluate.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
});

describe("evaluate command", () => {
  it("prints usage for unsupported targets", () => {
    runEvaluateCommand("unknown");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Usage: ee evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]"
    );
  });
});
