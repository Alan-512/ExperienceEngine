import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { installClaudeCodeAdapter } from "../../src/install/claude-code-installer.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-install-"));
  tempDirs.push(dir);
  return dir;
};

const makeMountedTempDir = (): string => {
  const root = join(resolve("."), ".tmp-claude-install");
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "case-"));
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
      hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; timeout?: number }> }>>;
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
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("node -e");
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("dist/cli/index.js");
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("claude-hook");
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.timeout).toBe(30);
    expect(settings.hooks?.SessionEnd?.[0]?.hooks[0]?.timeout).toBe(120);
    expect(commands[0]).toBe("claude mcp get experienceengine");
    expect(commands[1]).toContain("claude mcp add -s project experienceengine -e");
    expect(commands[1]).toContain("EXPERIENCE_ENGINE_HOME_WINDOWS=");
    expect(commands[1]).toContain("EXPERIENCE_ENGINE_HOME_POSIX=");
    expect(commands[1]).toContain("-- node -e");
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

  it("removes stale ExperienceEngine hook variants before writing the current hook command", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();
    const settingsPath = join(projectDir, ".claude", "settings.local.json");

    mkdirSync(join(projectDir, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "node --no-warnings '/mnt/d/project/ExperienceEngine/dist/cli/index.js' claude-hook"
                  },
                  {
                    type: "command",
                    command: "node --no-warnings '/mnt/d/project/experienceengine/dist/cli/index.js' claude-hook"
                  }
                ]
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
      hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(settings.hooks?.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks).toHaveLength(1);
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("claude-hook");
  });

  it("writes windows-compatible hook and mcp launcher commands when runtime target is windows", () => {
    const homeDir = makeMountedTempDir();
    const projectDir = makeMountedTempDir();
    const commands: string[] = [];

    const report = installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runtimeTarget: "windows",
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
  Command: cmd.exe
  Args: /c D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-mcp-server.cmd
  Environment:
    EXPERIENCE_ENGINE_HOME=D:\\ExperienceEngineData\\.experienceengine

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
      runtimeTarget?: string;
      launcherPaths?: { hook?: string; mcpServer?: string };
    };
    const hookLauncher = readFileSync(installState.launcherPaths?.hook ?? "", "utf8");

    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("node -e");
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("dist/cli/index.js");
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("claude-hook");
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).not.toContain("cmd.exe /c");
    expect(commands[1]).toContain("-e EXPERIENCE_ENGINE_HOME_WINDOWS=");
    expect(commands[1]).toContain("-e EXPERIENCE_ENGINE_HOME_POSIX=");
    expect(commands[1]).toContain("-e EXPERIENCE_ENGINE_PACKAGE_ROOT_WINDOWS=");
    expect(commands[1]).toContain("-e EXPERIENCE_ENGINE_PACKAGE_ROOT_POSIX=");
    expect(commands[1]).toContain("-- node -e");
    expect(commands[1]).not.toContain("-- cmd.exe /c");
    expect(installState.runtimeTarget).toBe("windows");
    expect(installState.launcherPaths?.hook).toContain("experienceengine-claude-hook.cmd");
    expect(installState.launcherPaths?.mcpServer).toContain("experienceengine-mcp-server.cmd");
    if (process.platform === "linux") {
      expect(hookLauncher).toContain("wsl.exe bash -lc");
    } else {
      expect(hookLauncher).toContain("node --no-warnings");
      expect(hookLauncher).toContain("claude-hook");
      expect(hookLauncher).toContain("set \"EXPERIENCE_ENGINE_HOME=");
    }
  });

  it("disables the marketplace plugin when installing project-local Claude hooks", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();
    const globalSettingsPath = join(homeDir, ".claude", "settings.json");

    mkdirSync(join(homeDir, ".claude"), { recursive: true });
    writeFileSync(
      globalSettingsPath,
      `${JSON.stringify(
        {
          enabledPlugins: {
            "experienceengine@experienceengine": true,
            "other-plugin@example": true
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

    const globalSettings = JSON.parse(readFileSync(globalSettingsPath, "utf8")) as {
      enabledPlugins?: Record<string, boolean>;
    };

    expect(globalSettings.enabledPlugins?.["experienceengine@experienceengine"]).toBe(false);
    expect(globalSettings.enabledPlugins?.["other-plugin@example"]).toBe(true);
  });

  it("persists effective hybrid settings for Claude hook processes", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();

    installClaudeCodeAdapter({
      homeDir,
      projectDir,
      env: {
        EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine"),
        EXPERIENCE_ENGINE_HYBRID_ENABLED: "true",
        EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED: "true",
        EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED: "true",
        EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED: "true",
        EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_LLM_ENABLED: "true",
        EXPERIENCE_ENGINE_HYBRID_ROLLOUT_MODE: "canary",
        EXPERIENCE_ENGINE_HYBRID_CANARY_RATE: "0.5",
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "gemini",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gemini-3.1-flash-lite-preview"
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          throw new Error("missing");
        }
        return "";
      }
    });

    const eeSettings = JSON.parse(
      readFileSync(join(homeDir, ".experienceengine", "settings.json"), "utf8")
    ) as {
      hybrid?: {
        enabled?: boolean;
        sync_explain_enabled?: boolean;
        async_postmortem_enabled?: boolean;
        rollout_mode?: string;
        canary_rate?: number;
        explain_llm_enabled?: boolean;
        async_postmortem_llm_enabled?: boolean;
      };
    };

    expect(eeSettings.hybrid?.enabled).toBe(true);
    expect(eeSettings.hybrid?.sync_explain_enabled).toBe(true);
    expect(eeSettings.hybrid?.async_postmortem_enabled).toBe(true);
    expect(eeSettings.hybrid?.rollout_mode).toBe("canary");
    expect(eeSettings.hybrid?.canary_rate).toBe(0.5);
    expect(eeSettings.hybrid?.explain_llm_enabled).toBe(true);
    expect(eeSettings.hybrid?.async_postmortem_llm_enabled).toBe(true);
  });
});
