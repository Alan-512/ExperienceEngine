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
        ["- OpenClaw: automated repair is available with `ee repair openclaw` when doctor reports host drift."],
        ["- Codex: re-run `ee install codex` if MCP wiring is missing or stale."],
        ["- Claude Code: re-run the marketplace install flow if hooks or MCP wiring are missing."]
      ])
    );
  });
});
