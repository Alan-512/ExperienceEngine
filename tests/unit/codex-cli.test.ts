import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";
import {
  buildCodexAddCommand,
  createTemporaryCodexConfigWithoutServer,
  buildCodexMcpServerCommand,
  ensureCodexMcpServerStartupTimeout,
  parseCodexMcpServerInfo,
  resolveEffectiveCodexConfigPath,
  stripCodexMcpServerSections
} from "../../src/install/codex-cli.js";
import {
  buildCodexHookCommandForTarget,
  resolveCodexLauncherPaths
} from "../../src/install/codex-runtime-target.js";

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
    const command = buildCodexAddCommand("/tmp/experienceengine", "/tmp/ee-home", undefined, [], "posix");

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
      "EXPERIENCE_ENGINE_HOME=D:\\ExperienceEngineData\\.experienceengine",
      "--",
      "cmd.exe",
      "/c",
      "\"D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-codex-mcp-server.cmd\""
    ]);
  });

  it("quotes windows launcher commands when the path contains spaces", () => {
    const command = buildCodexAddCommand(
      "/mnt/d/project/ExperienceEngine",
      "/mnt/d/Experience Engine Data/.experienceengine",
      undefined,
      [],
      "windows"
    );

    expect(command.args).toContain("EXPERIENCE_ENGINE_HOME=D:\\Experience Engine Data\\.experienceengine");
    expect(command.args.at(-1)).toBe("\"D:\\Experience Engine Data\\.experienceengine\\bin\\experienceengine-codex-mcp-server.cmd\"");
  });

  it("quotes windows hook commands when the path contains spaces", () => {
    const launchers = resolveCodexLauncherPaths({
      productHome: "/mnt/d/Experience Engine Data/.experienceengine"
    });

    expect(buildCodexHookCommandForTarget("windows", launchers)).toBe(
      "cmd.exe /c \"D:\\Experience Engine Data\\.experienceengine\\bin\\experienceengine-codex-hook.cmd\""
    );
  });

  it("adds repeated server env bindings when extra adapter env is provided", () => {
    const command = buildCodexAddCommand("/tmp/experienceengine", "/tmp/ee-home", undefined, [
      ["EXPERIENCE_ENGINE_ADAPTER", "codex"],
      ["CODEX_CONFIG_PATH", "/tmp/codex.toml"],
      ["OPENROUTER_API_KEY", "token"]
    ], "posix");

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

  it("resolves the effective Codex config path from CODEX_CONFIG_PATH when present", () => {
    expect(
      resolveEffectiveCodexConfigPath({
        env: {
          CODEX_CONFIG_PATH: "/tmp/codex.custom.toml"
        }
      })
    ).toBe("/tmp/codex.custom.toml");
  });

  it("strips the ExperienceEngine MCP server root and nested sections from a Codex config", () => {
    const next = stripCodexMcpServerSections(
      `model = "gpt-5.4"

[mcp_servers.experienceengine]
command = "/tmp/experienceengine"
args = ["-"]

[mcp_servers.experienceengine.env]
EXPERIENCE_ENGINE_HOME = "/tmp/ee-home"

[projects."/repo"]
trust_level = "trusted"
`,
      "experienceengine"
    );

    expect(next).toContain('model = "gpt-5.4"');
    expect(next).toContain('[projects."/repo"]');
    expect(next).not.toContain("[mcp_servers.experienceengine]");
    expect(next).not.toContain("[mcp_servers.experienceengine.env]");
    expect(next).not.toContain("EXPERIENCE_ENGINE_HOME");
  });

  it("writes a temporary Codex config without the ExperienceEngine MCP server", () => {
    const homeDir = makeTempDir();
    const configPath = join(homeDir, "codex.toml");
    const tempRoot = makeTempDir();
    const env = {
      CODEX_CONFIG_PATH: configPath
    } satisfies NodeJS.ProcessEnv;

    const payload = `model = "gpt-5.4"

[mcp_servers.experienceengine]
command = "/tmp/experienceengine"
args = ["-"]

[mcp_servers.experienceengine.env]
EXPERIENCE_ENGINE_HOME = "/tmp/ee-home"

[notice]
hide_full_access_warning = true
`;

    rmSync(configPath, { force: true });
    writeFileSync(configPath, payload, "utf8");

    const isolated = createTemporaryCodexConfigWithoutServer("experienceengine", {
      env,
      tempRoot
    });

    expect(existsSync(isolated.configPath)).toBe(true);
    expect(readFileSync(isolated.configPath, "utf8")).toContain('model = "gpt-5.4"');
    expect(readFileSync(isolated.configPath, "utf8")).toContain("[notice]");
    expect(readFileSync(isolated.configPath, "utf8")).not.toContain("[mcp_servers.experienceengine]");
    expect(readFileSync(isolated.configPath, "utf8")).not.toContain("[mcp_servers.experienceengine.env]");

    isolated.cleanup();
    expect(existsSync(isolated.configPath)).toBe(false);
  });
});
