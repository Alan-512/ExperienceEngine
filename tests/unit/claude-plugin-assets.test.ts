import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");

describe("Claude plugin assets", () => {
  it("defines a Claude plugin manifest with distributable metadata", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, ".claude-plugin", "plugin.json"), "utf8")
    ) as Record<string, unknown>;

    expect(manifest.name).toBe("experienceengine");
    expect(manifest.description).toBeTypeOf("string");
    expect(manifest.version).toBeTypeOf("string");
  });

  it("defines hooks that bootstrap dependencies and route Claude hook events into EE", () => {
    const hooks = JSON.parse(
      readFileSync(join(repoRoot, "hooks", "hooks.json"), "utf8")
    ) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;
    };

    expect(hooks.hooks.SessionStart?.[0]?.matcher).toBe("startup|resume|clear|compact");
    expect(hooks.hooks.SessionStart?.[0]?.hooks[0]?.command).toContain("install-deps.sh");
    expect(hooks.hooks.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("claude-hook.sh");
    expect(hooks.hooks.PreToolUse?.[0]?.hooks[0]?.command).toContain("claude-hook.sh");
    expect(hooks.hooks.PostToolUse?.[0]?.hooks[0]?.command).toContain("claude-hook.sh");
    expect(hooks.hooks.PostToolUseFailure?.[0]?.hooks[0]?.command).toContain("claude-hook.sh");
    expect(hooks.hooks.SessionEnd?.[0]?.hooks[0]?.command).toContain("claude-hook.sh");
  });

  it("defines an MCP server that runs from the plugin root and persists data in plugin data", () => {
    const mcp = JSON.parse(readFileSync(join(repoRoot, ".mcp.json"), "utf8")) as {
      [key: string]: {
        command: string;
        args?: string[];
        env?: Record<string, string>;
      };
    };

    const server = mcp.experienceengine;
    expect(server.command).toBe("node");
    expect(server.args).toEqual([
      "${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js",
      "mcp-server"
    ]);
    expect(server.env).toEqual(
      expect.objectContaining({
        NODE_PATH: "${CLAUDE_PLUGIN_DATA}/node_modules",
        EXPERIENCE_ENGINE_HOME: "${CLAUDE_PLUGIN_DATA}/experienceengine-home"
      })
    );
  });
});
