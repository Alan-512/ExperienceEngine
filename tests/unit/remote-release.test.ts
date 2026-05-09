import { describe, expect, it, vi } from "vitest";
import {
  fetchLatestGitHubReleaseStatus,
  parseGitHubRepository,
  readRepositoryUrl
} from "../../src/version/remote-release.js";

describe("remote release resolver", () => {
  it("parses common GitHub repository URL formats", () => {
    expect(parseGitHubRepository("https://github.com/Alan-512/ExperienceEngine.git")).toEqual({
      owner: "Alan-512",
      repo: "ExperienceEngine"
    });
    expect(parseGitHubRepository("git@github.com:Alan-512/ExperienceEngine.git")).toEqual({
      owner: "Alan-512",
      repo: "ExperienceEngine"
    });
    expect(parseGitHubRepository("ssh://git@github.com/Alan-512/ExperienceEngine.git")).toEqual({
      owner: "Alan-512",
      repo: "ExperienceEngine"
    });
  });

  it("reads the repository URL from package metadata", () => {
    expect(readRepositoryUrl()).toBe("git+https://github.com/Alan-512/ExperienceEngine.git");
  });

  it("reports remote update availability from the latest GitHub release", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: "v0.2.0",
          html_url: "https://github.com/Alan-512/ExperienceEngine/releases/tag/v0.2.0",
          published_at: "2026-03-12T12:00:00Z"
        }),
        { status: 200 }
      )
    );

    const result = await fetchLatestGitHubReleaseStatus({
      currentVersion: "0.1.0",
      repositoryUrl: "https://github.com/Alan-512/ExperienceEngine.git",
      fetchImpl
    });

    expect(result.state).toBe("update-available");
    expect(result.latestVersion).toBe("0.2.0");
    expect(result.updateAvailable).toBe(true);
  });

  it("degrades gracefully when the latest release lookup fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 404 }));

    const result = await fetchLatestGitHubReleaseStatus({
      currentVersion: "0.1.0",
      repositoryUrl: "https://github.com/Alan-512/ExperienceEngine.git",
      fetchImpl
    });

    expect(result.state).toBe("unavailable");
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("HTTP 404");
  });
});
