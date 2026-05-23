import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureAntigravityGlobalWiring,
  inspectAntigravityGlobalWiring
} from "../../src/install/antigravity-global-wiring.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-antigravity-global-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
    }
  }
});

describe("Antigravity global wiring", () => {
  it("installs user-level plugins for Agent Desktop and agy CLI", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };

    const report = await ensureAntigravityGlobalWiring({
      homeDir,
      env
    });

    expect(report.agentDesktopGlobalActivation).toBe("supported");
    expect(report.mcpRegistered).toBe(true);
    expect(report.hooksRegistered).toBe(true);
    expect(report.agentDesktopPluginRegistered).toBe(true);
    expect(report.agyCliPluginRegistered).toBe(true);
    expect(report.lifecycleMode).toBe("host_native_hooks_validated");

    const desktopPluginDir = join(homeDir, ".gemini", "config", "plugins", "experienceengine");
    const cliPluginDir = join(homeDir, ".gemini", "antigravity-cli", "plugins", "experienceengine");
    expect(report.agentDesktopPluginDir).toBe(desktopPluginDir);
    expect(report.agyCliPluginDir).toBe(cliPluginDir);
    expect(existsSync(join(desktopPluginDir, "plugin.json"))).toBe(true);
    expect(existsSync(join(desktopPluginDir, "hooks.json"))).toBe(true);
    expect(existsSync(join(desktopPluginDir, "mcp_config.json"))).toBe(true);
    expect(existsSync(join(cliPluginDir, "plugin.json"))).toBe(true);
    expect(existsSync(join(cliPluginDir, "hooks.json"))).toBe(true);
    expect(existsSync(join(cliPluginDir, "mcp_config.json"))).toBe(true);

    const hooks = JSON.parse(readFileSync(join(desktopPluginDir, "hooks.json"), "utf8"));
    expect(hooks.experienceengine.PreInvocation[0].command).toBe("node experienceengine-antigravity-hook.mjs PreInvocation");
    expect(hooks.experienceengine.PreToolUse[0].hooks[0].command).toContain("PreToolUse");

    const mcp = JSON.parse(readFileSync(join(homeDir, ".gemini", "antigravity", "mcp_config.json"), "utf8"));
    expect(mcp.mcpServers.experienceengine.command).toBe("node");
    const sharedMcp = JSON.parse(readFileSync(join(homeDir, ".gemini", "config", "mcp_config.json"), "utf8"));
    expect(sharedMcp.mcpServers.experienceengine.command).toBe("node");
  });

  it("inspects missing global activation as unknown rather than project active", () => {
    const homeDir = makeTempDir();

    const report = inspectAntigravityGlobalWiring({ homeDir });

    expect(report.mcpRegistered).toBe(false);
    expect(report.hooksRegistered).toBe(false);
    expect(report.agentDesktopGlobalActivation).toBe("unknown");
  });

  it("reports Antigravity IDE MCP cache separately from native hook support", () => {
    const homeDir = makeTempDir();
    const ideMcpDir = join(homeDir, ".gemini", "antigravity-ide", "mcp", "experienceengine");
    mkdirSync(ideMcpDir, { recursive: true });
    writeFileSync(join(ideMcpDir, "experienceengine_get_capabilities.json"), "{}\n", "utf8");

    const report = inspectAntigravityGlobalWiring({ homeDir });

    expect(report.ideMcpCacheDir).toBe(ideMcpDir);
    expect(report.ideMcpToolCacheRegistered).toBe(true);
    expect(report.ideHooksRegistered).toBe(false);
    expect(report.ideActivation).toBe("mcp_cache_observed");
  });

  it("reports Antigravity IDE hooks through the global plugin surface", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };

    await ensureAntigravityGlobalWiring({ homeDir, env });
    const report = inspectAntigravityGlobalWiring({ homeDir });

    expect(report.idePluginRegistered).toBe(false);
    expect(report.agentDesktopPluginRegistered).toBe(true);
    expect(report.ideHooksRegistered).toBe(true);
    expect(report.ideActivation).toBe("hooks_observed");
  });
});
