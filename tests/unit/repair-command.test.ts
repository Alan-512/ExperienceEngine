import { afterEach, describe, expect, it, vi } from "vitest";
import { runRepairCommand } from "../../src/cli/commands/repair.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
});

describe("repair command", () => {
  it("prints a consolidated repair summary without a target", () => {
    runRepairCommand();

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Repair summary:"],
        ["- OpenClaw: run `ee repair openclaw` when doctor reports host drift."],
        ["- Codex: re-run the Codex-specific ExperienceEngine installation command if MCP wiring is missing."],
        ["- Claude Code: re-run the Claude Code-specific ExperienceEngine installation command if hooks or MCP wiring are missing."]
      ])
    );
  });
});
