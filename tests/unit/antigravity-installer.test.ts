import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAntigravityAdapter, inspectAntigravityInstall, repairAntigravityAdapter } from "../../src/install/antigravity.js";
import { runInstallCommand } from "../../src/cli/commands/install.js";
import { runRepairCommand } from "../../src/cli/commands/repair.js";
import { runUpgradeCommand } from "../../src/cli/commands/upgrade.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

vi.mock("../../src/install/antigravity.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/install/antigravity.js")>();
  return {
    ...original,
    repairAntigravityAdapter: vi.fn().mockImplementation(async (options = {}) => {
      if (!options.cwd) {
        return {
          adapter: "antigravity",
          installed: true,
          packageRoot: "/mock/package/root",
          installedVersion: "0.1.0",
          captureDir: "/mock/captures",
          lifecycleMode: "host_native_hooks_validated",
          mcpRegistered: true,
          hooksRegistered: true,
          installScope: "user",
          agentDesktopGlobalActivation: "supported",
          globalWiring: {
            lifecycleMode: "host_native_hooks_validated",
            agentDesktopGlobalActivation: "supported",
            agentDesktopPluginDir: "/mock/.gemini/config/plugins/experienceengine",
            agentDesktopPluginRegistered: true,
            agyCliPluginDir: "/mock/.gemini/antigravity-cli/plugins/experienceengine",
            agyCliPluginRegistered: true,
            mcpConfigPath: "/mock/.gemini/antigravity/mcp_config.json",
            mcpRegistered: true,
            hooksRegistered: true,
            hookContractSpikePassed: true,
            serverName: "experienceengine",
            serverCommand: "node dist/cli/index.js mcp-server"
          },
          projectWiring: {
            cwd: "/mock/project",
            mcpRegistered: true,
            hooksRegistered: true,
            lifecycleMode: "host_native_hooks_validated"
          },
          serverName: "experienceengine",
          serverCommand: "node dist/cli/index.js mcp-server",
          hostWiring: {
            wired: true,
            command: "node dist/cli/index.js mcp-server",
            transport: "stdio",
            enabled: true
          }
        };
      }
      return await original.repairAntigravityAdapter(options);
    })
  };
});

const tempDirs: string[] = [];
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-antigravity-"));
  tempDirs.push(dir);
  return dir;
};

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

beforeEach(() => {
  consoleLogSpy.mockClear();
});

afterEach(() => {
  consoleLogSpy.mockClear();
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
    }
  }
});

describe("Antigravity installer & command wiring", () => {
  it("installs MCP config and hook files in a target directory", async () => {
    const tempDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(tempDir, ".experienceengine") };

    const report = await installAntigravityAdapter({
      cwd: tempDir,
      env,
      homeDir: tempDir,
      mcpOnly: false
    });

    expect(report.adapter).toBe("antigravity");
    expect(report.mcpRegistered).toBe(true);
    expect(report.hooksRegistered).toBe(true);
    expect(report.globalWiring.agentDesktopPluginRegistered).toBe(true);
    expect(report.globalWiring.agyCliPluginRegistered).toBe(true);

    const mcpPath = join(tempDir, ".gemini", "antigravity", "mcp_config.json");
    const hooksPath = join(tempDir, ".gemini", "config", "plugins", "experienceengine", "hooks.json");
    const launcherPath = join(tempDir, ".gemini", "config", "plugins", "experienceengine", "experienceengine-antigravity-hook.mjs");

    expect(existsSync(mcpPath)).toBe(true);
    expect(existsSync(hooksPath)).toBe(true);
    expect(existsSync(launcherPath)).toBe(true);

    const mcpContent = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(mcpContent.mcpServers.experienceengine).toBeDefined();

    const hooksContent = JSON.parse(readFileSync(hooksPath, "utf8"));
    expect(hooksContent.experienceengine.PreInvocation).toBeDefined();
    expect(hooksContent.experienceengine.PreToolUse).toBeDefined();
    expect(hooksContent.experienceengine.PostToolUse).toBeDefined();
    expect(hooksContent.experienceengine.Stop).toBeDefined();
    expect(hooksContent.experienceengine.PreInvocation[0].command).toContain("PreInvocation");
    expect(hooksContent.experienceengine.PreToolUse[0].hooks[0].command).toContain("PreToolUse");
    expect(hooksContent.experienceengine.PostToolUse[0].hooks[0].command).toContain("PostToolUse");
    expect(hooksContent.experienceengine.Stop[0].command).toContain("Stop");
  });

  it("installs in mcp-only mode if configured", async () => {
    const tempDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(tempDir, ".experienceengine") };

    const report = await installAntigravityAdapter({
      cwd: tempDir,
      env,
      homeDir: tempDir,
      mcpOnly: true
    });

    expect(report.adapter).toBe("antigravity");
    expect(report.mcpRegistered).toBe(true);
    expect(report.hooksRegistered).toBe(false);

    const hooksPath = join(tempDir, ".gemini", "config", "plugins", "experienceengine", "hooks.json");
    expect(existsSync(hooksPath)).toBe(false);
  });

  it("defaults to validated Agent Desktop hooks", async () => {
    const tempDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(tempDir, ".experienceengine") };

    const report = await installAntigravityAdapter({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });

    expect(report.adapter).toBe("antigravity");
    expect(report.mcpRegistered).toBe(true);
    expect(report.hooksRegistered).toBe(true);
    expect(report.lifecycleMode).toBe("host_native_hooks_validated");

    const mcpPath = join(tempDir, ".gemini", "antigravity", "mcp_config.json");
    const hooksPath = join(tempDir, ".gemini", "config", "plugins", "experienceengine", "hooks.json");

    expect(existsSync(mcpPath)).toBe(true);
    expect(existsSync(hooksPath)).toBe(true);
  });

  it("inspects existing installs and detects registration state", async () => {
    const tempDir = makeTempDir();
    const env = {
      EXPERIENCE_ENGINE_HOME: join(tempDir, ".experienceengine")
    };

    // Before install
    const inspectBefore = inspectAntigravityInstall({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });
    expect(inspectBefore.installed).toBe(false);
    expect(inspectBefore.mcpRegistered).toBe(false);
    expect(inspectBefore.hooksRegistered).toBe(false);

    // Install
    await installAntigravityAdapter({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });

    // After install
    const inspectAfter = inspectAntigravityInstall({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });
    expect(inspectAfter.installed).toBe(true);
    expect(inspectAfter.mcpRegistered).toBe(true);
    expect(inspectAfter.hooksRegistered).toBe(true);
    expect(inspectAfter.projectWiring.mcpRegistered).toBe(false);
    expect(inspectAfter.projectWiring.hooksRegistered).toBe(false);
  });

  it("wires repair adapter correctly", async () => {
    const tempDir = makeTempDir();
    const env = {
      EXPERIENCE_ENGINE_HOME: join(tempDir, ".experienceengine")
    };

    const report = await repairAntigravityAdapter({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });
    expect(report.adapter).toBe("antigravity");
    expect(report.mcpRegistered).toBe(true);
  });

  it("can run install, repair, and upgrade commands for antigravity", async () => {
    // 1. Install
    await runInstallCommand("antigravity", {
      installAntigravityAdapter: async () =>
        ({
          adapter: "antigravity",
          installedVersion: "0.1.0",
          packageRoot: "/tmp/ee",
          serverName: "experienceengine",
          serverCommand: "node dist/cli/index.js mcp-server",
          lifecycleMode: "host_native_hooks_validated",
          mcpRegistered: true,
          hooksRegistered: true,
          installScope: "user",
          agentDesktopGlobalActivation: "unsupported",
          globalWiring: {
            lifecycleMode: "host_native_hooks_validated",
            agentDesktopGlobalActivation: "supported",
            agentDesktopPluginDir: "/tmp/.gemini/config/plugins/experienceengine",
            agentDesktopPluginRegistered: true,
            agyCliPluginDir: "/tmp/.gemini/antigravity-cli/plugins/experienceengine",
            agyCliPluginRegistered: true,
            mcpConfigPath: "/tmp/.gemini/antigravity/mcp_config.json",
            mcpRegistered: true,
            hooksRegistered: true,
            hookContractSpikePassed: true,
            serverName: "experienceengine",
            serverCommand: "node dist/cli/index.js mcp-server"
          },
          projectWiring: {
            cwd: "/tmp/project",
            mcpRegistered: true,
            hooksRegistered: true,
            lifecycleMode: "host_native_hooks_validated"
          },
          captureDir: "/tmp/captures"
        }) as never,
      readRegistryHealth: () => ({
        checks: [],
        hasNonOfficialRegistry: false,
        warnings: []
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Installed antigravity adapter."],
        ["Install scope: user"],
        ["Installed version: 0.1.0"],
        ["Server name: experienceengine"],
        ["Server command: node dist/cli/index.js mcp-server"],
        ["Lifecycle mode: host_native_hooks_validated"],
        ["Global MCP Registered: yes"],
        ["Global Hooks Registered: yes"],
        ["Agent Desktop plugin: /tmp/.gemini/config/plugins/experienceengine"],
        ["agy CLI plugin: /tmp/.gemini/antigravity-cli/plugins/experienceengine"],
        ["Current project: /tmp/project"],
        ["Current project MCP Registered: yes"],
        ["Current project Hooks Registered: yes"],
        ["Agent Desktop global activation: unsupported"]
      ])
    );

    consoleLogSpy.mockClear();

    // 2. Repair
    await runRepairCommand("antigravity");
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining("Repaired antigravity adapter wiring.")]
      ])
    );

    consoleLogSpy.mockClear();

    // 3. Upgrade
    await runUpgradeCommand("antigravity", [], {
      inspectAntigravityInstall: () =>
        ({
          versionStatus: { recordedVersion: "0.0.9" }
        }) as never,
      installAntigravityAdapter: async () =>
        ({
          adapter: "antigravity",
          installedVersion: "0.1.0",
          serverName: "experienceengine",
          serverCommand: "node dist/cli/index.js mcp-server",
          lifecycleMode: "host_native_hooks_validated",
          mcpRegistered: true,
          hooksRegistered: true,
          installScope: "user",
          agentDesktopGlobalActivation: "unsupported",
          globalWiring: {
            lifecycleMode: "host_native_hooks_validated",
            agentDesktopGlobalActivation: "supported",
            agentDesktopPluginDir: "/tmp/.gemini/config/plugins/experienceengine",
            agentDesktopPluginRegistered: true,
            agyCliPluginDir: "/tmp/.gemini/antigravity-cli/plugins/experienceengine",
            agyCliPluginRegistered: true,
            mcpConfigPath: "/tmp/.gemini/antigravity/mcp_config.json",
            mcpRegistered: true,
            hooksRegistered: true,
            hookContractSpikePassed: true,
            serverName: "experienceengine",
            serverCommand: "node dist/cli/index.js mcp-server"
          },
          projectWiring: {
            cwd: "/tmp/project",
            mcpRegistered: true,
            hooksRegistered: true,
            lifecycleMode: "host_native_hooks_validated"
          }
        }) as never
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Upgraded antigravity adapter."],
        ["Version: 0.0.9 -> 0.1.0"],
        ["New Antigravity sessions in activated projects will use the updated hook command and MCP server."]
      ])
    );
  });
});
