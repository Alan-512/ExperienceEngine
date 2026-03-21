import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";
import {
  buildCodexAddCommand,
  buildCodexMcpServerCommand,
  ensureCodexMcpServerStartupTimeout,
  parseCodexMcpServerInfo
} from "../../src/install/codex-cli.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-cli-"));
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

describe("Codex CLI wiring", () => {
  it("builds the documented add command for the ExperienceEngine MCP server", () => {
    const command = buildCodexAddCommand("/tmp/experienceengine", "/tmp/ee-home");

    expect([command.bin, ...command.args]).toEqual([
      "codex",
      "mcp",
      "add",
      "experienceengine",
      "--env",
      "EXPERIENCE_ENGINE_HOME=/tmp/ee-home",
      "--",
      "/tmp/ee-home/bin/experienceengine-codex-mcp-server"
    ]);
  });

  it("builds a windows launcher command when a windows runtime target is requested", () => {
    const command = buildCodexAddCommand("/mnt/d/project/experienceengine", "/mnt/d/ExperienceEngineData/.experienceengine", undefined, [], "windows");

    expect([command.bin, ...command.args]).toEqual([
      "codex",
      "mcp",
      "add",
      "experienceengine",
      "--env",
      "EXPERIENCE_ENGINE_HOME=/mnt/d/ExperienceEngineData/.experienceengine",
      "--",
      "cmd.exe",
      "/c",
      "D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-codex-mcp-server.cmd"
    ]);
  });

  it("adds repeated server env bindings when extra adapter env is provided", () => {
    const command = buildCodexAddCommand("/tmp/experienceengine", "/tmp/ee-home", undefined, [
      ["EXPERIENCE_ENGINE_ADAPTER", "codex"],
      ["CODEX_CONFIG_PATH", "/tmp/codex.toml"],
      ["OPENROUTER_API_KEY", "token"]
    ]);

    expect([command.bin, ...command.args]).toEqual([
      "codex",
      "mcp",
      "add",
      "experienceengine",
      "--env",
      "EXPERIENCE_ENGINE_HOME=/tmp/ee-home",
      "--env",
      "EXPERIENCE_ENGINE_ADAPTER=codex",
      "--env",
      "CODEX_CONFIG_PATH=/tmp/codex.toml",
      "--env",
      "OPENROUTER_API_KEY=token",
      "--",
      "/tmp/ee-home/bin/experienceengine-codex-mcp-server"
    ]);
  });

  it("parses `codex mcp get` output", () => {
    const info = parseCodexMcpServerInfo(`experienceengine
  enabled: true
  transport: stdio
  command: node
  args: --no-warnings /tmp/experienceengine/dist/cli/index.js codex-mcp-server
  cwd: -
  env: EXPERIENCE_ENGINE_HOME=/tmp/ee-home
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`);

    expect(info.name).toBe("experienceengine");
    expect(info.enabled).toBe(true);
    expect(info.transport).toBe("stdio");
    expect(info.command).toBe("node");
    expect(info.args).toContain("codex-mcp-server");
    expect(info.env).toContain("EXPERIENCE_ENGINE_HOME=/tmp/ee-home");
    expect(info.startupTimeoutSec).toBe(120);
  });

  it("writes a startup timeout override into Codex config", () => {
    const homeDir = makeTempDir();

    const configPath = ensureCodexMcpServerStartupTimeout("experienceengine", 60, { homeDir });

    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, "utf8")).toContain("[mcp_servers.experienceengine]");
    expect(readFileSync(configPath, "utf8")).toContain("startup_timeout_sec = 60.0");
  });
});
