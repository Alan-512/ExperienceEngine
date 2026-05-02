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
    expect(manifest.version).toBe("0.2.1");
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

  it("ships hook scripts that can fall back to CLAUDE_PLUGIN_ROOT when CLAUDE_PLUGIN_DATA is absent", () => {
    const installScript = readFileSync(
      join(repoRoot, "plugins", "claude-code-experienceengine", "scripts", "install-deps.sh"),
      "utf8"
    );
    const hookScript = readFileSync(
      join(repoRoot, "plugins", "claude-code-experienceengine", "scripts", "claude-hook.sh"),
      "utf8"
    );

    expect(installScript).toContain("CLAUDE_PLUGIN_ROOT");
    expect(hookScript).toContain("CLAUDE_PLUGIN_ROOT");
    expect(installScript).not.toContain("CLAUDE_PLUGIN_DATA is required");
    expect(hookScript).not.toContain("CLAUDE_PLUGIN_DATA is required");
    expect(installScript).toContain("@alan512/experienceengine@${PACKAGE_VERSION}");
    expect(installScript).not.toContain("EXPERIENCE_ENGINE_PLUGIN_GIT_URL");
    expect(installScript).toContain('[[ -f "${PACKAGE_ENTRY}" ]]');
    expect(installScript).toContain("--ignore-scripts");
    expect(installScript).toContain("claude-marketplace-state.json");
    expect(hookScript).toContain("last_hook_seen_at");
    expect(hookScript).toContain("claude-marketplace-state.json");
  });

  it("defines an MCP server that uses the installed product launcher and shared EE home", () => {
    const mcp = JSON.parse(readFileSync(join(repoRoot, ".mcp.json"), "utf8")) as {
      mcpServers: Record<
        string,
        {
          command: string;
          args?: string[];
          env?: Record<string, string>;
        }
      >;
    };

    const server = mcp.mcpServers.experienceengine;
    expect(server.command).toContain("/.experienceengine/bin/experienceengine-mcp-server");
    expect(server.args).toEqual([]);
    expect(server.env).toEqual(
      expect.objectContaining({
        EXPERIENCE_ENGINE_HOME: "/home/seed/.experienceengine"
      })
    );
  });
});
