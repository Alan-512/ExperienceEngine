import { afterEach, describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "../../src/cli/commands/doctor.js";

const consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  consoleTableSpy.mockClear();
  consoleLogSpy.mockClear();
});

describe("doctor command", () => {
  it("reports remote package updates separately from host wiring upgrades", async () => {
    await runDoctorCommand("codex", {
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
        }) as never,
      fetchLatestGitHubReleaseStatus: async () => ({
        source: "github-releases",
        repository: "Alan-512/ExperienceEngine",
        latestVersion: "0.2.0",
        releaseUrl: "https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0",
        publishedAt: "2026-03-12T12:00:00Z",
        state: "update-available",
        updateAvailable: true
      })
    });

    expect(consoleTableSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Recommended next step: update local ExperienceEngine package to 0.2.0, then run ee upgrade codex"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Latest release: https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0"
    );
  });

  it("keeps doctor usable when remote release lookup is unavailable", async () => {
    await runDoctorCommand("claude-code", {
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
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        state: "unavailable",
        updateAvailable: false,
        error: "GitHub latest release lookup failed with HTTP 404."
      })
    });

    expect(consoleTableSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Remote release check unavailable: GitHub latest release lookup failed with HTTP 404."
    );
  });
});
