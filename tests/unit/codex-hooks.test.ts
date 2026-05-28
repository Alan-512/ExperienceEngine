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
  it("enables the hooks feature flag in project config", () => {
    const cwd = makeTempDir();
    const configPath = join(cwd, ".codex", "config.toml");
    const result = ensureCodexHooksFeatureEnabled(configPath);

    expect(result.updated).toBe(true);
    expect(readFileSync(configPath, "utf8")).toContain("[features]");
    expect(readFileSync(configPath, "utf8")).toContain("hooks = true");
  });

  it("migrates the deprecated codex_hooks feature flag", () => {
    const cwd = makeTempDir();
    const configPath = join(cwd, ".codex", "config.toml");
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    writeFileSync(configPath, "[features]\ncodex_hooks = true\n", "utf8");

    const result = ensureCodexHooksFeatureEnabled(configPath);
    const config = readFileSync(configPath, "utf8");

    expect(result.updated).toBe(true);
    expect(config).toContain("hooks = true");
    expect(config).not.toContain("codex_hooks");
  });

  it("inspects missing hook entries and disabled feature state", () => {
    const cwd = makeTempDir();
    const status = inspectCodexProjectHooks({
      cwd,
      homeDir: cwd,
      hookCommand: "/tmp/experienceengine-codex-hook",
      runtimeTarget: "posix"
    });

    expect(status.state).toBe("disabled");
    expect(status.featureEnabled).toBe(false);
    expect(status.missingEvents).toEqual(["UserPromptSubmit", "PostToolUse", "Stop"]);
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
      homeDir: cwd,
      hookCommand: "/tmp/experienceengine-codex-hook",
      runtimeTarget: "posix"
    });
    const repaired = readFileSync(hooksPath, "utf8");

    expect(result.state).toBe("healthy");
    expect(result.removedClaudeHookCommands).toHaveLength(1);
    expect(repaired).toContain("node ./custom-hook.js");
    expect(repaired).toContain("/tmp/experienceengine-codex-hook");
    expect(repaired).not.toContain("experienceengine-claude-hook");
    expect(result.installedEvents).toEqual(["UserPromptSubmit", "PostToolUse", "Stop"]);
    expect(JSON.parse(repaired).hooks.PreToolUse).toHaveLength(1);
  });

  it("replaces stale inline Codex node launchers with the project hook launcher", () => {
    const cwd = makeTempDir();
    const hooksPath = join(cwd, ".codex", "hooks.json");
    rmSync(join(cwd, ".codex"), { recursive: true, force: true });
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    writeFileSync(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command:
                      "node -e \"const cp=require('node:child_process'); cp.spawn(process.execPath,['dist/cli/index.js','codex-hook'])\""
                  }
                ]
              }
            ],
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command:
                      "node -e \"const cp=require('node:child_process'); cp.spawn(process.execPath,['dist/cli/index.js','codex-hook'])\""
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
      homeDir: cwd,
      hookCommand: "cmd.exe /c \"D:/project/.codex/experienceengine-codex-hook.cmd\"",
      runtimeTarget: "windows"
    });
    const repaired = readFileSync(hooksPath, "utf8");
    const hooks = JSON.parse(repaired) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(result.state).toBe("healthy");
    expect(repaired).not.toContain("node -e");
    expect(hooks.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
      "cmd.exe /c \"D:/project/.codex/experienceengine-codex-hook.cmd\""
    );
    expect(hooks.hooks.PostToolUse[0].hooks[0].command).toBe(
      "cmd.exe /c \"D:/project/.codex/experienceengine-codex-hook.cmd\""
    );
    expect(hooks.hooks.Stop[0].hooks[0].command).toBe(
      "cmd.exe /c \"D:/project/.codex/experienceengine-codex-hook.cmd\""
    );
  });

  it("can opt into PreToolUse registration for synchronous gating experiments", () => {
    const cwd = makeTempDir();
    const result = repairCodexProjectHooks({
      cwd,
      homeDir: cwd,
      hookCommand: "/tmp/experienceengine-codex-hook",
      runtimeTarget: "posix",
      includePreToolUse: true
    });
    const hooks = JSON.parse(readFileSync(join(cwd, ".codex", "hooks.json"), "utf8")) as {
      hooks: Record<string, unknown[]>;
    };

    expect(result.installedEvents).toEqual(["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]);
    expect(hooks.hooks.PreToolUse).toHaveLength(1);
  });

  it("reports malformed hooks without overwriting the file", () => {
    const cwd = makeTempDir();
    const hooksPath = join(cwd, ".codex", "hooks.json");
    rmSync(join(cwd, ".codex"), { recursive: true, force: true });
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    writeFileSync(hooksPath, "{not-json", "utf8");

    const result = repairCodexProjectHooks({
      cwd,
      homeDir: cwd,
      hookCommand: "/tmp/experienceengine-codex-hook",
      runtimeTarget: "posix"
    });

    expect(result.state).toBe("parse_error");
    expect(result.hookFileChanged).toBe(false);
    expect(readFileSync(hooksPath, "utf8")).toBe("{not-json");
    expect(existsSync(hooksPath)).toBe(true);
  });
});
