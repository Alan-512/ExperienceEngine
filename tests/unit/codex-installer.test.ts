import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { inspectCodexInstall, installCodexAdapter } from "../../src/install/codex-installer.js";
import { readCurrentPackageVersion } from "../../src/version/package-version.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-install-"));
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

describe("Codex installer", () => {
  const currentVersion = readCurrentPackageVersion();

  it("writes install state and registers the MCP server", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];

    const report = installCodexAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "codex mcp get experienceengine") {
          if (commands.length === 1) {
            throw new Error("missing");
          }
          return `experienceengine
  enabled: true
  transport: stdio
  command: node
  args: --no-warnings ${reportPathPlaceholder()} codex-mcp-server
  cwd: -
  env: EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`;
        }
        return "";
      }
    });

    expect(report.installed).toBe(true);
    expect(report.hostWiring.wired).toBe(true);
    expect(existsSync(report.paths.installStatePath)).toBe(true);
    expect(readFileSync(join(homeDir, ".codex", "config.toml"), "utf8")).toContain("startup_timeout_sec = 60.0");
    expect(commands[0]).toBe("codex mcp get experienceengine");
    expect(commands[1]).toContain("codex mcp add experienceengine --env");

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      installedVersion: string;
      serverName: string;
      hostWiring: { wired: boolean };
    };

    expect(payload.adapter).toBe("codex");
    expect(payload.installedVersion).toBe(report.installedVersion);
    expect(payload.serverName).toBe("experienceengine");
    expect(payload.hostWiring.wired).toBe(true);
  });

  it("removes and re-adds the MCP server when a prior registration exists", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    let reads = 0;

    installCodexAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "codex mcp get experienceengine") {
          reads += 1;
          if (reads === 1) {
            return `experienceengine
  enabled: true
  transport: stdio
  command: node
  args: --no-warnings /tmp/old/dist/cli/index.js codex-mcp-server
  cwd: -
  env: EXPERIENCE_ENGINE_HOME=/tmp/old-home
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`;
          }

          return `experienceengine
  enabled: true
  transport: stdio
  command: node
  args: --no-warnings /tmp/new/dist/cli/index.js codex-mcp-server
  cwd: -
  env: EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`;
        }
        return "";
      }
    });

    expect(commands).toContain("codex mcp remove experienceengine");
    expect(commands.filter((command) => command === "codex mcp get experienceengine")).toHaveLength(2);
  });

  it("reports current host wiring for doctor output", () => {
    const homeDir = makeTempDir();
    installCodexAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "codex mcp get experienceengine") {
          return `experienceengine
  enabled: true
  transport: stdio
  command: node
  args: --no-warnings /tmp/experienceengine/dist/cli/index.js codex-mcp-server
  cwd: -
  env: EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`;
        }
        return "";
      }
    });

    const status = inspectCodexInstall({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "codex mcp get experienceengine") {
          return `experienceengine
  enabled: true
  transport: stdio
  command: node
  args: --no-warnings /tmp/experienceengine/dist/cli/index.js codex-mcp-server
  cwd: -
  env: EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`;
        }
        return "";
      }
    });

    expect(status.installed).toBe(true);
    expect(status.versionStatus.recordedVersion).toBe(currentVersion);
    expect(status.versionStatus.state).toBe("current");
    expect(status.hostWiring.wired).toBe(true);
    expect(status.hostWiring.transport).toBe("stdio");
  });
});

const reportPathPlaceholder = (): string => "/tmp/experienceengine/dist/cli/index.js";
