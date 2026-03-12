import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOpenClawConfigGetCommand,
  buildOpenClawInfoCommand,
  parseOpenClawPluginEntryConfig,
  parseOpenClawPluginInfo
} from "../../src/install/openclaw-cli.js";
import {
  classifyOpenClawHostWarnings,
  inspectOpenClawInstall,
  installOpenClawAdapter
} from "../../src/install/openclaw-installer.js";
import { readCurrentPackageVersion } from "../../src/version/package-version.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-doctor-"));
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

const pluginInfoOutput = `Config warnings:\\n- plugins.entries.feishu: plugin feishu: duplicate plugin id detected; later plugin may be overridden (/home/seed/.openclaw/extensions/feishu/index.ts)
ExperienceEngine
id: experienceengine
Context-aware experience intervention controller for coding and debugging tasks.

Status: error
Source: ~/openclaw-dev/ExperienceEngine-git/src/plugin/openclaw-plugin.ts
Origin: config
Version: 0.1.0
Error: Error: EACCES: permission denied, open '/home/seed/.openclaw/experienceengine/runtime-captures/capture.json'

Install: path
Source path: ~/openclaw-dev/ExperienceEngine-git
Install path: ~/openclaw-dev/ExperienceEngine-git
Recorded version: 0.1.0
Installed at: 2026-03-11T15:01:59.475Z
`;

const pluginConfigOutput = `Config warnings:\\n- plugins.entries.feishu: plugin feishu: duplicate plugin id detected; later plugin may be overridden (/home/seed/.openclaw/extensions/feishu/index.ts)
{
  "enabled": true,
  "config": {
    "dataDir": "/home/seed/.openclaw/experienceengine",
    "sqlitePath": "/home/seed/.openclaw/experienceengine/sqlite/experienceengine.db",
    "captureDir": "/home/seed/.openclaw/experienceengine/runtime-captures"
  }
}
`;

describe("OpenClaw doctor host-state parsing", () => {
  const currentVersion = readCurrentPackageVersion();

  it("parses formatted plugin info with warning prefixes", () => {
    const parsed = parseOpenClawPluginInfo(pluginInfoOutput);

    expect(parsed.pluginId).toBe("experienceengine");
    expect(parsed.status).toBe("error");
    expect(parsed.error).toContain("EACCES");
    expect(parsed.installPath).toBe("~/openclaw-dev/ExperienceEngine-git");
    expect(parsed.warnings[0]).toContain("Config warnings:");
  });

  it("parses warning-prefixed plugin entry config JSON", () => {
    const parsed = parseOpenClawPluginEntryConfig(pluginConfigOutput);

    expect(parsed.entry?.enabled).toBe(true);
    expect(parsed.entry?.config?.sqlitePath).toBe(
      "/home/seed/.openclaw/experienceengine/sqlite/experienceengine.db"
    );
    expect(parsed.warnings[0]).toContain("Config warnings:");
  });

  it("inspects live host state and reports config matches", () => {
    const homeDir = makeTempDir();
    const commandOutputs = new Map<string, string>();
    const installCommands: string[] = [];

    installOpenClawAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        installCommands.push(key);
        return "";
      }
    });

    commandOutputs.set(
      [buildOpenClawInfoCommand("experienceengine").bin, ...buildOpenClawInfoCommand("experienceengine").args].join(
        " "
      ),
      pluginInfoOutput
    );
    commandOutputs.set(
      [buildOpenClawConfigGetCommand("experienceengine").bin, ...buildOpenClawConfigGetCommand("experienceengine").args].join(
        " "
      ),
      pluginConfigOutput
    );

    const status = inspectOpenClawInstall({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        return commandOutputs.get(key) ?? "";
      }
    });

    expect(installCommands).toHaveLength(5);
    expect(status.hostState.status).toBe("error");
    expect(status.hostState.enabled).toBe(true);
    expect(status.hostState.error).toContain("EACCES");
    expect(status.hostState.configMatches).toBe(false);
    expect(status.versionStatus.recordedVersion).toBe(currentVersion);
    expect(status.versionStatus.state).toBe("current");
  });

  it("classifies owned, advisory, and external warnings separately", () => {
    const classified = classifyOpenClawHostWarnings({
      packageRoot: "/mnt/d/project/ExperienceEngine",
      hostState: {
        warnings: [
          "plugin experienceengine: copied install root is world-writable",
          "plugins.allow is empty; discovered non-bundled plugins may auto-load unexpectedly",
          "plugins.entries.feishu: plugin feishu: duplicate plugin id detected"
        ],
        sourcePath: "~/.openclaw/extensions/experienceengine/src/plugin/openclaw-plugin.ts",
        installPath: "~/.openclaw/extensions/experienceengine"
      }
    });

    expect(classified.owned).toEqual([
      "plugin experienceengine: copied install root is world-writable"
    ]);
    expect(classified.advisory).toEqual([
      "plugins.allow is empty; discovered non-bundled plugins may auto-load unexpectedly"
    ]);
    expect(classified.external).toEqual([
      "plugins.entries.feishu: plugin feishu: duplicate plugin id detected"
    ]);
  });
});
