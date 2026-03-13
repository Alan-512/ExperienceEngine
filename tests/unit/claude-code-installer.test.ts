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
    const commands: string[] = [];

    const report = installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "claude mcp get experienceengine") {
          if (commands.length === 1) {
            throw new Error("missing");
          }

          return `experienceengine:
  Scope: Project config (shared via .mcp.json)
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: --no-warnings /tmp/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}

To remove this server, run: claude mcp remove "experienceengine" -s project`;
        }
        return "";
      }
    });
    const settingsPath = join(projectDir, ".claude", "settings.local.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
    };
    const installState = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      installedVersion: string;
      settingsPath: string;
      captureDir: string;
      serverName: string;
      hostWiring: { wired: boolean; transport?: string };
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
    expect(commands[0]).toBe("claude mcp get experienceengine");
    expect(commands[1]).toContain("claude mcp add --scope project -e");
    expect(commands[1]).toContain("experienceengine -- node --no-warnings");
    expect(installState.adapter).toBe("claude-code");
    expect(installState.installedVersion).toBe(report.installedVersion);
    expect(installState.settingsPath).toBe(settingsPath);
    expect(installState.captureDir).toBe(report.captureDir);
    expect(installState.serverName).toBe("experienceengine");
    expect(installState.hostWiring.wired).toBe(true);
    expect(installState.hostWiring.transport).toBe("stdio");
    expect(report.serverName).toBe("experienceengine");
    expect(report.hostWiring.wired).toBe(true);
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

    installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          throw new Error("missing");
        }
        return "";
      }
    });
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
