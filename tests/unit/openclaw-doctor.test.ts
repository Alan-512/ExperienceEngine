import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOpenClawConfigGetCommand,
  buildOpenClawInfoCommand,
  buildOpenClawWorkspaceGetCommand,
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

const boxedWarningsOutput = `\u2502
\u25c7  Config warnings \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e
\u2502
\u2502  - plugins.entries.feishu: plugin feishu: duplicate plugin id detected;
\u2502    global plugin will be overridden by bundled plugin
\u2502    (/home/seed/.openclaw/extensions/feishu/index.ts)
\u2502  - plugins.entries.qwen-portal-auth: plugin not found: qwen-portal-auth
\u2502    (stale config entry ignored; remove it from plugins config)
\u2502
\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f
ExperienceEngine
id: experienceengine
Status: loaded
`;

describe("OpenClaw doctor host-state parsing", () => {
  const currentVersion = readCurrentPackageVersion();

  it("parses formatted plugin info with warning prefixes", () => {
    const parsed = parseOpenClawPluginInfo(pluginInfoOutput);

    expect(parsed.pluginId).toBe("experienceengine");
    expect(parsed.status).toBe("error");
    expect(parsed.error).toContain("EACCES");
    expect(parsed.installPath).toBe("~/openclaw-dev/ExperienceEngine-git");
    expect(parsed.warnings[0]).toContain("plugins.entries.feishu");
  });

  it("normalizes OpenClaw boxed warning output into concise warning entries", () => {
    const parsed = parseOpenClawPluginInfo(boxedWarningsOutput);

    expect(parsed.status).toBe("loaded");
    expect(parsed.warnings).toEqual([
      "plugins.entries.feishu: plugin feishu: duplicate plugin id detected; global plugin will be overridden by bundled plugin (/home/seed/.openclaw/extensions/feishu/index.ts)",
      "plugins.entries.qwen-portal-auth: plugin not found: qwen-portal-auth (stale config entry ignored; remove it from plugins config)"
    ]);
  });

  it("parses warning-prefixed plugin entry config JSON", () => {
    const parsed = parseOpenClawPluginEntryConfig(pluginConfigOutput);

    expect(parsed.entry?.enabled).toBe(true);
    expect(parsed.entry?.config?.sqlitePath).toBe(
      "/home/seed/.openclaw/experienceengine/sqlite/experienceengine.db"
    );
    expect(parsed.warnings[0]).toContain("plugins.entries.feishu");
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
    commandOutputs.set(
      [buildOpenClawWorkspaceGetCommand().bin, ...buildOpenClawWorkspaceGetCommand().args].join(" "),
      "/home/seed/.openclaw/workspace"
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
    expect(status.workspace).toEqual({
      path: "/home/seed/.openclaw/workspace",
      globalWorkspace: true,
      isolationBehavior: "session_isolated"
    });
    expect(status.versionStatus.recordedVersion).toBe(currentVersion);
    expect(status.versionStatus.state).toBe("current");
  }, 20_000);

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

  it("detects install drift when the copied plugin bundle is stale", () => {
    const homeDir = makeTempDir();
    const packageRoot = join(homeDir, "ExperienceEngine");
    const installPath = join(homeDir, ".openclaw", "extensions", "experienceengine");
    const installStateDir = join(homeDir, ".experienceengine", "adapters", "openclaw");

    mkdirSync(join(packageRoot, "dist", "plugin"), { recursive: true });
    mkdirSync(join(packageRoot, "dist", "runtime"), { recursive: true });
    mkdirSync(join(packageRoot, "dist", "store", "sqlite", "repositories"), { recursive: true });
    mkdirSync(join(installPath, "dist", "plugin"), { recursive: true });
    mkdirSync(join(installPath, "dist", "runtime"), { recursive: true });
    mkdirSync(join(installPath, "dist", "store", "sqlite", "repositories"), { recursive: true });
    mkdirSync(installStateDir, { recursive: true });

    writeFileSync(join(packageRoot, "dist", "plugin", "openclaw-plugin.js"), "// bundle\n", "utf8");
    writeFileSync(join(packageRoot, "dist", "runtime", "service.js"), "// bundle\n", "utf8");
    writeFileSync(join(packageRoot, "dist", "store", "sqlite", "db.js"), "// bundle\n", "utf8");
    writeFileSync(
      join(packageRoot, "dist", "store", "sqlite", "repositories", "injection-repo.js"),
      "// bundle\n",
      "utf8"
    );

    writeFileSync(join(installPath, "dist", "plugin", "openclaw-plugin.js"), "// bundle\n", "utf8");
    writeFileSync(join(installPath, "dist", "runtime", "service.js"), "// stale bundle\n", "utf8");
    writeFileSync(join(installPath, "dist", "store", "sqlite", "db.js"), "// bundle\n", "utf8");
    writeFileSync(
      join(installPath, "dist", "store", "sqlite", "repositories", "injection-repo.js"),
      "// bundle\n",
      "utf8"
    );
    writeFileSync(
      join(installStateDir, "install.json"),
      JSON.stringify({
        adapter: "openclaw",
        installedAt: "2026-03-19T00:00:00.000Z",
        installedVersion: "0.1.0",
        packageRoot,
        hostWiring: { wired: true, restartRecommended: false },
        dataDir: join(homeDir, ".experienceengine"),
        sqlitePath: join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"),
        captureDir: join(homeDir, ".experienceengine", "captures")
      }),
      "utf8"
    );

    const pluginInfo = `ExperienceEngine
id: experienceengine
Status: loaded
Source path: ${packageRoot}
Install path: ${installPath}
`;
    const pluginConfig = JSON.stringify({
      enabled: true,
      config: {
        dataDir: join(homeDir, ".experienceengine"),
        sqlitePath: join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"),
        captureDir: join(homeDir, ".experienceengine", "captures")
      }
    });

    const status = inspectOpenClawInstall({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw plugins info experienceengine") {
          return pluginInfo;
        }
        if (key === "openclaw config get plugins.entries.experienceengine") {
          return pluginConfig;
        }
        if (key === "openclaw config get agents.defaults.workspace") {
          return "/mnt/d/project/ExperienceEngine";
        }
        return "";
      }
    });

    expect(status.hostState.configMatches).toBe(true);
    expect(status.workspace).toEqual({
      path: "/mnt/d/project/ExperienceEngine",
      globalWorkspace: false,
      isolationBehavior: "project_scope"
    });
    expect(status.hostState.driftDetected).toBe(true);
    expect(status.hostState.driftReason).toMatch(
      /dist\/(plugin\/openclaw-plugin\.js|runtime\/service\.js)/
    );
  });

  it("treats tilde-prefixed install paths as the real home directory when checking drift", () => {
    const homeDir = makeTempDir();
    const packageRoot = join(homeDir, "ExperienceEngine");
    const installPath = join(homeDir, ".openclaw", "extensions", "experienceengine");

    mkdirSync(join(packageRoot, "dist", "plugin"), { recursive: true });
    mkdirSync(join(packageRoot, "dist", "runtime"), { recursive: true });
    mkdirSync(join(packageRoot, "dist", "store", "sqlite", "repositories"), { recursive: true });
    mkdirSync(join(installPath, "dist", "plugin"), { recursive: true });
    mkdirSync(join(installPath, "dist", "runtime"), { recursive: true });
    mkdirSync(join(installPath, "dist", "store", "sqlite", "repositories"), { recursive: true });

    for (const relativePath of [
      "dist/plugin/openclaw-plugin.js",
      "dist/runtime/service.js",
      "dist/store/sqlite/db.js",
      "dist/store/sqlite/repositories/injection-repo.js"
    ]) {
      writeFileSync(join(packageRoot, relativePath), "// same bundle\n", "utf8");
      writeFileSync(join(installPath, relativePath), "// same bundle\n", "utf8");
    }

    const installStateDir = join(homeDir, ".experienceengine", "adapters", "openclaw");
    mkdirSync(installStateDir, { recursive: true });
    writeFileSync(
      join(installStateDir, "install.json"),
      JSON.stringify({
        adapter: "openclaw",
        installedAt: "2026-03-19T00:00:00.000Z",
        installedVersion: "0.1.0",
        packageRoot,
        hostWiring: { wired: true, restartRecommended: false },
        dataDir: join(homeDir, ".experienceengine"),
        sqlitePath: join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"),
        captureDir: join(homeDir, ".experienceengine", "captures")
      }),
      "utf8"
    );

    const status = inspectOpenClawInstall({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw plugins info experienceengine") {
          return `ExperienceEngine
id: experienceengine
Status: loaded
Source path: ${packageRoot}
Install path: ~/.openclaw/extensions/experienceengine
`;
        }
        if (key === "openclaw config get plugins.entries.experienceengine") {
          return JSON.stringify({
            enabled: true,
            config: {
              dataDir: join(homeDir, ".experienceengine"),
              sqlitePath: join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"),
              captureDir: join(homeDir, ".experienceengine", "captures")
            }
          });
        }
        return "";
      }
    });

    expect(status.hostState.configMatches).toBe(true);
    expect(status.hostState.driftDetected).toBe(false);
    expect(status.hostState.driftReason).toBeUndefined();
  });
});
