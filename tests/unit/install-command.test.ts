import { afterEach, describe, expect, it, vi } from "vitest";
import { runInstallCommand } from "../../src/cli/commands/install.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleLogSpy.mockClear();
});

describe("install command", () => {
  it("prints first-value guidance after a successful install", () => {
    runInstallCommand("codex", {
      installCodexAdapter: () =>
        ({
          adapter: "codex",
          installedVersion: "0.1.0",
          packageRoot: "/tmp/experienceengine",
          serverName: "experienceengine",
          serverCommand: "node dist/cli/index.js codex-mcp-server",
          captureDir: "/tmp/.experienceengine/adapters/codex/captures"
        }) as never,
      readRegistryHealth: () => ({
        checks: [],
        hasNonOfficialRegistry: false,
        warnings: []
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Setup state: Installed."],
        [
          "[ExperienceEngine] Next step: Start a new Codex session in this repo. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
        ],
        ["[ExperienceEngine] Capture is now active for this host."],
        [
          "[ExperienceEngine] First value usually appears after a few similar tasks in the same repo, once repeated evidence is strong enough to promote a formal hint."
        ]
      ])
    );
  });

  it("warns when npm or pnpm uses a non-official registry", () => {
    runInstallCommand("codex", {
      installCodexAdapter: () =>
        ({
          adapter: "codex",
          installedVersion: "0.1.0",
          packageRoot: "/tmp/experienceengine",
          serverName: "experienceengine",
          serverCommand: "node dist/cli/index.js codex-mcp-server",
          captureDir: "/tmp/.experienceengine/adapters/codex/captures"
        }) as never,
      readRegistryHealth: () => ({
        checks: [
          {
            tool: "npm",
            registry: "https://registry.npmmirror.com",
            official: false
          },
          {
            tool: "pnpm",
            registry: "https://registry.npmmirror.com",
            official: false
          }
        ],
        hasNonOfficialRegistry: true,
        warnings: [
          "npm registry is set to https://registry.npmmirror.com. Managed installs are most reliable with https://registry.npmjs.org/.",
          "pnpm registry is set to https://registry.npmmirror.com. Managed installs are most reliable with https://registry.npmjs.org/."
        ]
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Registry advisory: npm registry is set to https://registry.npmmirror.com. Managed installs are most reliable with https://registry.npmjs.org/."],
        ["[ExperienceEngine] Registry advisory: pnpm registry is set to https://registry.npmmirror.com. Managed installs are most reliable with https://registry.npmjs.org/."],
        ["[ExperienceEngine] Recommended next step: npm config set registry https://registry.npmjs.org --global"],
        ["[ExperienceEngine] Recommended next step: pnpm config set registry https://registry.npmjs.org --global"]
      ])
    );
  });
});
