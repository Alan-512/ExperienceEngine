import { describe, expect, it } from "vitest";
import {
  buildClaudeAddCommand,
  parseClaudeMcpServerInfo
} from "../../src/install/claude-cli.js";

describe("Claude CLI wiring", () => {
  it("builds the documented add command for the ExperienceEngine MCP server", () => {
    const command = buildClaudeAddCommand("/mnt/d/tmp/experienceengine", "/mnt/d/tmp/ee-home");

    expect(command.bin).toBe("claude");
    expect(command.args.slice(0, 5)).toEqual(["mcp", "add", "-s", "project", "experienceengine"]);
    expect(command.args).toContain("EXPERIENCE_ENGINE_HOME_WINDOWS=D:\\tmp\\ee-home");
    expect(command.args).toContain("EXPERIENCE_ENGINE_HOME_POSIX=/mnt/d/tmp/ee-home");
    expect(command.args).toContain("EXPERIENCE_ENGINE_PACKAGE_ROOT_WINDOWS=D:\\tmp\\experienceengine");
    expect(command.args).toContain("EXPERIENCE_ENGINE_PACKAGE_ROOT_POSIX=/mnt/d/tmp/experienceengine");
    expect(command.args.slice(-3)[0]).toBe("node");
    expect(command.args.slice(-3)[1]).toBe("-e");
    expect(command.args.slice(-3)[2]).toContain("process.platform==='win32'");
    expect(command.args.slice(-3)[2]).toContain("'mcp-server'");
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
