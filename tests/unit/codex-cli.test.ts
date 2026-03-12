import { describe, expect, it } from "vitest";
import {
  buildCodexAddCommand,
  buildCodexMcpServerCommand,
  parseCodexMcpServerInfo
} from "../../src/install/codex-cli.js";

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
      ...buildCodexMcpServerCommand("/tmp/experienceengine")
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
  });
});
