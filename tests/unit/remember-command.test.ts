import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runRememberCommand } from "../../src/cli/commands/remember.js";
import { loadConfig } from "../../src/config/load-config.js";
import { ExperienceInteractionService } from "../../src/interaction/service.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-remember-command-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
});

describe("remember command", () => {
  it("persists a manual experience node", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");

    runRememberCommand([
      "--cwd",
      "/repo",
      "--trigger",
      "When the auth test fails after a refactor",
      "--hint",
      "Run the auth test after each refactor slice and stop when it regresses.",
      "--task",
      "refactor",
      "--type",
      "strategy",
      "--goal",
      "Keep the auth flow stable during refactors"
    ]);

    const service = new ExperienceInteractionService(loadConfig());
    const active = service.listActiveNodes();

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      sourceKind: "user_authored_candidate_promoted",
      taskType: "refactor"
    });
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringMatching(/^\[ExperienceEngine\] Stored manual strategy node node_/)],
        ["Task type: refactor"],
        ["State: active"],
        ["Hint: Run the auth test after each refactor slice and stop when it regresses."]
      ])
    );
  });

  it("prints validation errors for invalid authored experience", () => {
    runRememberCommand(["--trigger", "short", "--hint", "too short"]);

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Unable to remember this experience."],
        ["- triggerPattern must be at least 12 characters."],
        ["- hint must be at least 16 characters."]
      ])
    );
  });
});
