import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { installClaudeCodeAdapter } from "../../src/install/claude-code-installer.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-install-"));
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

describe("Claude Code installer", () => {
  it("writes project-local hook configuration and install state", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();

    const report = installClaudeCodeAdapter({ homeDir, projectDir });
    const settingsPath = join(projectDir, ".claude", "settings.local.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };
    const installState = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      settingsPath: string;
      captureDir: string;
    };

    expect(report.settingsPath).toBe(settingsPath);
    expect(existsSync(settingsPath)).toBe(true);
    expect(settings.hooks?.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks?.PreToolUse?.[0]?.matcher).toBe("*");
    expect(settings.hooks?.PostToolUse?.[0]?.matcher).toBe("*");
    expect(settings.hooks?.PostToolUseFailure?.[0]?.matcher).toBe("*");
    expect(settings.hooks?.SessionEnd).toHaveLength(1);
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("node --no-warnings");
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("claude-hook");
    expect(installState.adapter).toBe("claude-code");
    expect(installState.settingsPath).toBe(settingsPath);
    expect(installState.captureDir).toBe(report.captureDir);
  });

  it("merges ExperienceEngine hooks without clobbering unrelated settings", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();
    const settingsPath = join(projectDir, ".claude", "settings.local.json");

    rmSync(join(projectDir, ".claude"), { recursive: true, force: true });
    mkdirSync(join(projectDir, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          env: { FOO: "bar" },
          hooks: {
            PreToolUse: [
              {
                matcher: "Write",
                hooks: [{ type: "command", command: "echo existing-write" }]
              }
            ]
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    installClaudeCodeAdapter({ homeDir, projectDir });
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      env?: Record<string, string>;
      hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };

    expect(settings.env).toEqual({ FOO: "bar" });
    expect(settings.hooks?.PreToolUse).toHaveLength(2);
    expect(settings.hooks?.PreToolUse?.some((entry) => entry.matcher === "Write")).toBe(true);
    expect(settings.hooks?.PreToolUse?.some((entry) => entry.matcher === "*")).toBe(true);
  });
});
