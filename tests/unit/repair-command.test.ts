import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRepairCommand } from "../../src/cli/commands/repair.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const originalCwd = process.cwd();
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const tempDirs: string[] = [];

afterEach(() => {
  consoleLogSpy.mockClear();
  process.chdir(originalCwd);
  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("repair command", () => {
  it("prints a consolidated repair summary without a target", () => {
    runRepairCommand();

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Repair summary:"],
        ["- OpenClaw: automated repair is available with `ee repair openclaw` when doctor reports host drift."],
        ["- Codex: automated repair is available with `ee repair codex` for MCP, hooks, and runtime path drift."],
        ["- Claude Code: re-run the marketplace install flow if hooks or MCP wiring are missing."]
      ])
    );
  });

  it("repairs Codex project hooks without invoking Codex MCP registration", () => {
    const cwd = mkdtempSync(join(tmpdir(), "experienceengine-repair-codex-"));
    const home = mkdtempSync(join(tmpdir(), "experienceengine-repair-home-"));
    tempDirs.push(cwd, home);
    process.chdir(cwd);
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");

    runRepairCommand("codex");

    const hooksPath = join(cwd, ".codex", "hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8")) as {
      hooks: Record<string, unknown>;
    };

    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
    expect(hooks.hooks.UserPromptSubmit).toBeDefined();
    expect(hooks.hooks.PostToolUse).toBeDefined();
    expect(hooks.hooks.Stop).toBeDefined();
    expect(hooks.hooks.PreToolUse).toBeUndefined();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Repaired codex project wiring."],
        ["MCP registration refreshed: skipped (project hooks/instructions only)"],
        [
          "[ExperienceEngine] Codex hook review: Open /hooks in Codex and approve the ExperienceEngine hooks (UserPromptSubmit, PostToolUse, Stop)."
        ]
      ])
    );
  });
});
