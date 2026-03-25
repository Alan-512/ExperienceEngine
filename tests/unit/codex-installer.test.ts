import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { inspectCodexInstall, installCodexAdapter } from "../../src/install/codex-installer.js";
import { readCurrentPackageVersion } from "../../src/version/package-version.js";

const tempDirs: string[] = [];
const originalAgentsPath = join(process.cwd(), "AGENTS.md");
const originalAgentsContent = existsSync(originalAgentsPath)
  ? readFileSync(originalAgentsPath, "utf8")
  : null;

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-install-"));
  tempDirs.push(dir);
  return dir;
};

const makeMountedTempDir = (): string => {
  const root = join(resolve("."), ".tmp-codex-install");
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

  if (originalAgentsContent === null) {
    rmSync(originalAgentsPath, { force: true });
  } else {
    writeFileSync(originalAgentsPath, originalAgentsContent, "utf8");
  }
});

describe("Codex installer", () => {
  const currentVersion = readCurrentPackageVersion();

  it("writes install state and registers the MCP server", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    const env = {
      OPENROUTER_API_KEY: "test-openrouter-key",
      CODEX_CONFIG_PATH: join(homeDir, "codex-openrouter.toml")
    } satisfies NodeJS.ProcessEnv;

    rmSync(env.CODEX_CONFIG_PATH, { force: true });
    const configPayload = `model = "stepfun/step-3.5-flash:free"
model_provider = "openrouter"

[model_providers.openrouter]
base_url = "https://openrouter.ai/api/v1"
env_key = "OPENROUTER_API_KEY"
`;
    writeFileSync(env.CODEX_CONFIG_PATH, configPayload, "utf8");

    const report = installCodexAdapter({
      homeDir,
      env,
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
    expect(commands[1]).toContain("--env EXPERIENCE_ENGINE_ADAPTER=codex");

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

  it("writes a managed ExperienceEngine instruction block into AGENTS.md", () => {
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

    const agents = readFileSync(originalAgentsPath, "utf8");
    expect(agents).toContain("<!-- EXPERIENCEENGINE:CODEX-INSTRUCTION START -->");
    expect(agents).toContain("experienceengine_lookup_hints");
    expect(agents).toContain("experienceengine_finalize_task");
  });

  it("preserves unrelated AGENTS.md content and updates the managed block idempotently", () => {
    const homeDir = makeTempDir();

    writeFileSync(
      originalAgentsPath,
      ["# Local project guidance", "", "Keep existing content untouched.", ""].join("\n"),
      "utf8"
    );

    const runner = (command: { bin: string; args: string[] }) => {
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
    };

    installCodexAdapter({ homeDir, runner });
    const first = readFileSync(originalAgentsPath, "utf8");
    installCodexAdapter({ homeDir, runner });
    const second = readFileSync(originalAgentsPath, "utf8");

    expect(first).toContain("# Local project guidance");
    expect(first).toContain("Keep existing content untouched.");
    expect(first.match(/EXPERIENCEENGINE:CODEX-INSTRUCTION START/g)).toHaveLength(1);
    expect(second).toBe(first);
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

  it("does not report llm distillation for auth-only Codex configs without an explicit provider", () => {
    const homeDir = makeTempDir();
    mkdirSync(join(homeDir, ".codex"), { recursive: true });
    const configPath = join(homeDir, ".codex", "config.toml");
    writeFileSync(
      configPath,
      `model = "gpt-5.4"
`,
      "utf8"
    );

    installCodexAdapter({
      homeDir,
      env: {
        CODEX_CONFIG_PATH: configPath
      },
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
      env: {
        CODEX_CONFIG_PATH: configPath
      },
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

    expect(status.distillationStatus?.distillationMode).toBe("rule");
    expect(status.distillationStatus?.distillationSource).toBe("rule");
    expect(status.distillationStatus?.reason).toContain("explicit");
  });

  it("uses shared distillation secrets when the Codex MCP env does not include provider keys", () => {
    const homeDir = makeTempDir();
    const productHome = join(homeDir, ".experienceengine");
    mkdirSync(productHome, { recursive: true });
    writeFileSync(
      join(productHome, "settings.json"),
      `${JSON.stringify(
        {
          distillation: {
            provider: "gemini",
            auth_mode: "api_key",
            model: "gemini-3.1-flash-lite-preview"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    writeFileSync(
      join(productHome, "secrets.json"),
      `${JSON.stringify(
        {
          GEMINI_API_KEY: "gemini-test-key"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

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
  env: EXPERIENCE_ENGINE_HOME=${productHome}
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
  env: EXPERIENCE_ENGINE_HOME=${productHome}
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`;
        }
        return "";
      }
    });

    expect(status.distillationStatus?.distillationMode).toBe("llm");
    expect(status.distillationStatus?.diagnostics.missingEnv).toEqual([]);
  });

  it("writes windows-compatible launcher commands when runtime target is windows", () => {
    const homeDir = makeMountedTempDir();
    const commands: string[] = [];

    const report = installCodexAdapter({
      homeDir,
      runtimeTarget: "windows",
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
  command: cmd.exe
  args: /c D:\\ExperienceEngineData\\.experienceengine\\bin\\experienceengine-codex-mcp-server.cmd
  cwd: -
  env: EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}
  startup_timeout_sec: 120
  remove: codex mcp remove experienceengine`;
        }
        return "";
      }
    });

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      runtimeTarget?: string;
      launcherPaths?: { mcpServer?: string };
    };

    expect(commands[1]).toContain("cmd.exe /c");
    expect(commands[1]).toContain("experienceengine-codex-mcp-server.cmd");
    expect(payload.runtimeTarget).toBe("windows");
    expect(payload.launcherPaths?.mcpServer).toContain("experienceengine-codex-mcp-server.cmd");
    expect(report.runtimeTarget).toBe("windows");
    expect(readFileSync(payload.launcherPaths?.mcpServer ?? "", "utf8")).toContain("wsl.exe bash -lc");
  });
});

const reportPathPlaceholder = (): string => "/tmp/experienceengine/dist/cli/index.js";
