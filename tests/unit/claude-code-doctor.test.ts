import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { installClaudeCodeAdapter } from "../../src/install/claude-code-installer.js";
import { inspectClaudeCodeInstall } from "../../src/install/claude-code-doctor.js";
import { readCurrentPackageVersion } from "../../src/version/package-version.js";
import { CLAUDE_MARKETPLACE_STATE_FILENAME } from "../../src/install/claude-marketplace-state.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-doctor-"));
  tempDirs.push(dir);
  return dir;
};

const makeMountedTempDir = (): string => {
  const root = join(resolve("."), ".tmp-claude-doctor");
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

describe("Claude Code doctor", () => {
  const currentVersion = readCurrentPackageVersion();

  it("reports installed hooks from project-local settings", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();

    installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
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
    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
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

    expect(inspection.installed).toBe(true);
    expect(inspection.versionStatus.recordedVersion).toBe(currentVersion);
    expect(inspection.versionStatus.state).toBe("current");
    expect(inspection.hooksPresent.userPromptSubmit).toBe(true);
    expect(inspection.hooksPresent.preToolUse).toBe(true);
    expect(inspection.hooksPresent.postToolUse).toBe(true);
    expect(inspection.hooksPresent.postToolUseFailure).toBe(true);
    expect(inspection.hooksPresent.sessionEnd).toBe(true);
    expect(inspection.hostWiring.wired).toBe(true);
    expect(inspection.hostWiring.transport).toBe("stdio");
    expect(inspection.hostWiring.scope).toContain("Project config");
    expect(inspection.distillationStatus?.distillationMode).toBeTruthy();
    expect(inspection.distillationStatus?.distillationSource).toBeTruthy();
  });

  it("reports the configured runtime target and windows launcher commands", () => {
    const homeDir = makeMountedTempDir();
    const projectDir = makeMountedTempDir();

    installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runtimeTarget: "windows",
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
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

    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
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

    expect(inspection.runtimeTarget).toBe("windows");
    expect(inspection.launcherPaths?.hook).toContain("experienceengine-claude-hook.cmd");
    expect(inspection.launcherPaths?.mcpServer).toContain("experienceengine-mcp-server.cmd");
    expect(inspection.hooksPresent.userPromptSubmit).toBe(true);
  });

  it("keeps doctor usable when install state exists but is not parseable", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();
    const installStateDir = join(homeDir, ".experienceengine", "adapters", "claude-code");
    mkdirSync(installStateDir, { recursive: true });
    writeFileSync(join(installStateDir, "install.json"), "");

    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      env: {},
      runner() {
        return "";
      }
    });

    expect(inspection.installed).toBe(true);
    expect(inspection.versionStatus.state).toBe("unknown");
    expect(inspection.runtimeTarget).toBeTruthy();
  });

  it("treats marketplace-managed Claude wiring as installed even without local install state", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();

    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Plugin config
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: /tmp/claude-plugin/node_modules/@alan512/experienceengine/dist/cli/index.js mcp-server
  Environment:
    NODE_PATH=/tmp/claude-plugin/node_modules
    EXPERIENCE_ENGINE_HOME=/tmp/claude-plugin/experienceengine-home
    EXPERIENCE_ENGINE_CLAUDE_HOOK_SOURCE=marketplace

To remove this server, run: claude mcp remove "experienceengine"`;
        }
        return "";
      }
    });

    expect(inspection.installed).toBe(true);
    expect(inspection.hostWiring.wired).toBe(true);
    expect(inspection.hookSource).toBe("marketplace");
    expect(inspection.hooksPresent.userPromptSubmit).toBe(false);
  });

  it("prefers explicit marketplace marker and heartbeat over command heuristics", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();
    const marketplaceHome = join(projectDir, ".claude-plugin-home", "experienceengine-home");

    mkdirSync(marketplaceHome, { recursive: true });
    mkdirSync(join(homeDir, ".claude"), { recursive: true });
    writeFileSync(
      join(homeDir, ".claude", "settings.json"),
      JSON.stringify(
        {
          enabledPlugins: {
            "experienceengine@experienceengine": true
          }
        },
        null,
        2
      )
    );
    writeFileSync(
      join(marketplaceHome, CLAUDE_MARKETPLACE_STATE_FILENAME),
      JSON.stringify(
        {
          adapter: "claude-code",
          install_mode: "marketplace",
          hook_source: "marketplace",
          package_version: currentVersion,
          written_at: "2026-03-27T08:00:00.000Z",
          last_hook_seen_at: "2026-03-27T08:10:00.000Z"
        },
        null,
        2
      )
    );

    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Plugin config
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: /tmp/some-other-plugin/runtime.js
  Environment:
    EXPERIENCE_ENGINE_HOME=${marketplaceHome}

To remove this server, run: claude mcp remove "experienceengine"`;
        }
        return "";
      }
    });

    expect(inspection.installed).toBe(true);
    expect(inspection.hookSource).toBe("marketplace");
    expect(inspection.interactionReady).toBe(true);
    expect(inspection.marketplaceState?.install_mode).toBe("marketplace");
    expect(inspection.marketplaceState?.last_hook_seen_at).toBe("2026-03-27T08:10:00.000Z");
  });

  it("flags duplicate hook sources when project-local hooks and marketplace runtime are both active", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();
    const marketplaceHome = join(homeDir, ".experienceengine");

    installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Plugin config
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: /tmp/claude-plugin/node_modules/@alan512/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=${marketplaceHome}
    EXPERIENCE_ENGINE_CLAUDE_HOOK_SOURCE=marketplace

To remove this server, run: claude mcp remove "experienceengine"`;
        }
        return "";
      }
    });

    mkdirSync(marketplaceHome, { recursive: true });
    mkdirSync(join(homeDir, ".claude"), { recursive: true });
    const currentSettings = JSON.parse(readFileSync(join(homeDir, ".claude", "settings.json"), "utf8"));
    writeFileSync(
      join(homeDir, ".claude", "settings.json"),
      JSON.stringify(
        {
          ...currentSettings,
          enabledPlugins: {
            "experienceengine@experienceengine": true
          }
        },
        null,
        2
      )
    );
    writeFileSync(
      join(marketplaceHome, CLAUDE_MARKETPLACE_STATE_FILENAME),
      JSON.stringify(
        {
          adapter: "claude-code",
          install_mode: "marketplace",
          hook_source: "marketplace",
          package_version: currentVersion,
          written_at: "2026-03-31T00:00:00.000Z",
          last_hook_seen_at: "2026-03-31T00:10:00.000Z"
        },
        null,
        2
      )
    );

    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Plugin config
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: /tmp/claude-plugin/node_modules/@alan512/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=${marketplaceHome}
    EXPERIENCE_ENGINE_CLAUDE_HOOK_SOURCE=marketplace

To remove this server, run: claude mcp remove "experienceengine"`;
        }
        return "";
      }
    });

    expect(inspection.hookSource).toBe("project-local");
    expect(inspection.duplicateHookSources).toBe(true);
    expect(inspection.interactionReady).toBe(false);
  });

  it("does not treat a disabled marketplace plugin plus stale marketplace marker as a duplicate source", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();
    const marketplaceHome = join(homeDir, ".experienceengine");

    installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Project config (shared via .mcp.json)
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: --no-warnings /tmp/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=${marketplaceHome}

To remove this server, run: claude mcp remove "experienceengine" -s project`;
        }
        return "";
      }
    });

    mkdirSync(marketplaceHome, { recursive: true });
    mkdirSync(join(homeDir, ".claude"), { recursive: true });
    const currentSettings = JSON.parse(readFileSync(join(homeDir, ".claude", "settings.json"), "utf8"));
    writeFileSync(
      join(homeDir, ".claude", "settings.json"),
      JSON.stringify(
        {
          ...currentSettings,
          enabledPlugins: {
            "experienceengine@experienceengine": false
          }
        },
        null,
        2
      )
    );
    writeFileSync(
      join(marketplaceHome, CLAUDE_MARKETPLACE_STATE_FILENAME),
      JSON.stringify(
        {
          adapter: "claude-code",
          install_mode: "marketplace",
          hook_source: "marketplace",
          package_version: currentVersion,
          written_at: "2026-03-31T00:00:00.000Z",
          last_hook_seen_at: "2026-03-31T00:10:00.000Z"
        },
        null,
        2
      )
    );

    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Project config (shared via .mcp.json)
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: --no-warnings /tmp/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=${marketplaceHome}

To remove this server, run: claude mcp remove "experienceengine" -s project`;
        }
        return "";
      }
    });

    expect(inspection.hookSource).toBe("project-local");
    expect(inspection.duplicateHookSources).toBe(false);
    expect(inspection.interactionReady).toBe(true);
  });
});
