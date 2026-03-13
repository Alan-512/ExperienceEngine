import { describe, expect, it } from "vitest";
import { ExperienceOperationalService } from "../../src/interaction/operational-service.js";

describe("ExperienceOperationalService", () => {
  it("returns structured doctor state for codex", async () => {
    const service = new ExperienceOperationalService({
      inspectCodexInstall: () =>
        ({
          adapter: "codex",
          installed: true,
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          serverName: "experienceengine",
          hostWiring: {
            wired: true,
            enabled: true,
            transport: "stdio",
            command: "node dist/cli/index.js codex-mcp-server"
          },
          captureDir: "/tmp/.experienceengine/adapters/codex/captures"
        }) as never
    });

    const result = await service.inspectDoctor("codex");
    expect(result).toMatchObject({
      adapter: "codex"
    });
    expect(result.local).toMatchObject({
      installed: true,
      serverName: "experienceengine"
    });
  });

  it("returns adapter-aware update state and next step", async () => {
    const service = new ExperienceOperationalService({
      inspectClaudeCodeInstall: () =>
        ({
          adapter: "claude-code",
          installed: true,
          versionStatus: {
            recordedVersion: "0.1.0",
            currentVersion: "0.1.0",
            state: "current",
            updateAvailable: false
          },
          projectDir: "/tmp/project",
          settingsPath: "/tmp/project/.claude/settings.local.json",
          captureDir: "/tmp/.experienceengine/adapters/claude-code/captures",
          hooksPresent: {
            userPromptSubmit: true,
            preToolUse: true,
            postToolUse: true,
            postToolUseFailure: true,
            sessionEnd: true
          }
        }) as never,
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.2.0",
        releaseUrl: "https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0",
        publishedAt: "2026-03-13T00:00:00Z",
        state: "update-available",
        updateAvailable: true
      })
    });

    const result = await service.checkUpdate("claude-code");
    expect(result).toMatchObject({
      adapter: "claude-code",
      currentVersion: "0.1.0",
      recommendedNextStep: "update local package, then run ee upgrade claude-code"
    });
    expect(result.remote).toMatchObject({
      latestVersion: "0.2.0",
      updateAvailable: true
    });
  });
});
