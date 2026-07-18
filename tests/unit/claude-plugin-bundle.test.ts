import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const pluginRoot = join(repoRoot, "plugins", "claude-code-experienceengine");
const packageVersion = (
  JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  }
).version;

describe("Claude plugin bundle", () => {
  it("ships a self-contained plugin directory for marketplace installs", () => {
    const manifest = JSON.parse(
      readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8")
    ) as Record<string, unknown>;

    expect(manifest.name).toBe("experienceengine");
    expect(manifest.version).toBe(packageVersion);
  });

  it("uses plugin-local hooks and runtime scripts", () => {
    const hooks = JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(hooks.hooks.SessionStart?.[0]?.hooks[0]?.command).toContain("install-deps.sh");
    expect(hooks.hooks.UserPromptSubmit?.[0]?.hooks[0]?.command).toContain("claude-hook.sh");
  });

  it("runs MCP from the installed package inside plugin data", () => {
    const mcp = JSON.parse(readFileSync(join(pluginRoot, ".mcp.json"), "utf8")) as {
      mcpServers: Record<
        string,
        {
          command: string;
          args?: string[];
          env?: Record<string, string>;
        }
      >;
    };

    expect(mcp.mcpServers.experienceengine.command).toBe("bash");
    expect(mcp.mcpServers.experienceengine.args).toEqual(["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.sh"]);
    expect(mcp.mcpServers.experienceengine.env).toBeUndefined();
  });
});
