import { describe, expect, it } from "vitest";
import {
  buildClaudeAddCommand,
  buildExperienceEngineMcpServerCommand,
  parseClaudeMcpServerInfo
} from "../../src/install/claude-cli.js";

describe("Claude CLI wiring", () => {
  it("builds the documented add command for the ExperienceEngine MCP server", () => {
    const command = buildClaudeAddCommand("/tmp/experienceengine", "/tmp/ee-home");

    expect([command.bin, ...command.args]).toEqual([
      "claude",
      "mcp",
      "add",
      "-s",
      "project",
      "experienceengine",
      "-e",
      "EXPERIENCE_ENGINE_HOME=/tmp/ee-home",
      "--",
      ...buildExperienceEngineMcpServerCommand("/tmp/experienceengine")
    ]);
  });

  it("parses `claude mcp get` output", () => {
    const info = parseClaudeMcpServerInfo(`experienceengine:
  Scope: Project config (shared via .mcp.json)
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: --no-warnings /tmp/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=/tmp/ee-home

To remove this server, run: claude mcp remove "experienceengine" -s project`);

    expect(info.name).toBe("experienceengine");
    expect(info.scope).toContain("Project config");
    expect(info.connected).toBe(true);
    expect(info.transport).toBe("stdio");
    expect(info.command).toBe("node");
    expect(info.args).toContain("mcp-server");
    expect(info.env).toEqual(["EXPERIENCE_ENGINE_HOME=/tmp/ee-home"]);
  });
});
