import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureCodexHooksFeatureEnabled,
  inspectCodexProjectHooks,
  repairCodexProjectHooks
} from "../../src/install/codex-hooks.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-hooks-"));
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
});

describe("Codex hook config helpers", () => {
  it("enables the codex_hooks feature flag in project config", () => {
    const cwd = makeTempDir();
    const configPath = join(cwd, ".codex", "config.toml");
    const result = ensureCodexHooksFeatureEnabled(configPath);

    expect(result.updated).toBe(true);
    expect(readFileSync(configPath, "utf8")).toContain("[features]");
    expect(readFileSync(configPath, "utf8")).toContain("codex_hooks = true");
  });

  it("inspects missing hook entries and disabled feature state", () => {
    const cwd = makeTempDir();
    const status = inspectCodexProjectHooks({
      cwd,
      hookCommand: "/tmp/experienceengine-codex-hook",
      runtimeTarget: "posix"
    });

    expect(status.state).toBe("disabled");
    expect(status.featureEnabled).toBe(false);
    expect(status.missingEvents).toEqual(["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]);
  });

  it("repairs stale Claude hook drift while preserving unrelated hooks", () => {
    const cwd = makeTempDir();
    const hooksPath = join(cwd, ".codex", "hooks.json");
    rmSync(join(cwd, ".codex"), { recursive: true, force: true });
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    writeFileSync(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "*",
                hooks: [
                  {
                    type: "command",
                    command: "/mnt/d/ExperienceEngineData/.experienceengine/bin/experienceengine-claude-hook"
                  },
                  {
                    type: "command",
                    command: "node ./custom-hook.js"
                  }
                ]
              }
            ]
          }
        },
        null,
        2
      ),
      { encoding: "utf8", flag: "w" }
    );

    const result = repairCodexProjectHooks({
      cwd,
      hookCommand: "/tmp/experienceengine-codex-hook",
      runtimeTarget: "posix"
    });
    const repaired = readFileSync(hooksPath, "utf8");

    expect(result.state).toBe("healthy");
    expect(result.removedClaudeHookCommands).toHaveLength(1);
    expect(repaired).toContain("node ./custom-hook.js");
    expect(repaired).toContain("/tmp/experienceengine-codex-hook");
    expect(repaired).not.toContain("experienceengine-claude-hook");
    expect(result.installedEvents).toEqual(["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]);
  });

  it("reports malformed hooks without overwriting the file", () => {
    const cwd = makeTempDir();
    const hooksPath = join(cwd, ".codex", "hooks.json");
    rmSync(join(cwd, ".codex"), { recursive: true, force: true });
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    writeFileSync(hooksPath, "{not-json", "utf8");

    const result = repairCodexProjectHooks({
      cwd,
      hookCommand: "/tmp/experienceengine-codex-hook",
      runtimeTarget: "posix"
    });

    expect(result.state).toBe("parse_error");
    expect(result.hookFileChanged).toBe(false);
    expect(readFileSync(hooksPath, "utf8")).toBe("{not-json");
    expect(existsSync(hooksPath)).toBe(true);
  });
});
