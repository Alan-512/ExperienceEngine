import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, readCurrentPackageVersion } from "./package-version.js";
import { resolveExperienceEnginePackageRoot } from "../install/openclaw-cli.js";

type PackageManifest = {
  repository?: string | { url?: string };
};

type FetchLike = typeof fetch;

type GitHubLatestReleasePayload = {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
};

export type RemoteReleaseStatus = {
  source: "github-releases";
  repository: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  state: "current" | "update-available" | "local-ahead" | "unconfigured" | "unavailable";
  updateAvailable: boolean;
  error?: string;
};

export const readRepositoryUrl = (packageRoot = resolveExperienceEnginePackageRoot()): string | null => {
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageManifest;
  if (!manifest.repository) {
    return null;
  }

  if (typeof manifest.repository === "string") {
    return manifest.repository;
  }

  return manifest.repository.url ?? null;
};

export const parseGitHubRepository = (repositoryUrl: string): { owner: string; repo: string } | null => {
  const normalized = repositoryUrl
    .trim()
    .replace(/^git\+/, "")
    .replace(/\.git$/i, "");

  const httpsMatch = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const sshUrlMatch = normalized.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+)$/i);
  if (sshUrlMatch) {
    return { owner: sshUrlMatch[1], repo: sshUrlMatch[2] };
  }

  return null;
};

const normalizeReleaseVersion = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  return value.replace(/^v/i, "").trim() || null;
};

export const fetchLatestGitHubReleaseStatus = async (options: {
  packageRoot?: string;
  currentVersion?: string;
  repositoryUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
} = {}): Promise<RemoteReleaseStatus> => {
  const repositoryUrl = options.repositoryUrl ?? readRepositoryUrl(options.packageRoot);
  if (!repositoryUrl) {
    return {
      source: "github-releases",
      repository: null,
      latestVersion: null,
      releaseUrl: null,
      publishedAt: null,
      state: "unconfigured",
      updateAvailable: false
    };
  }

  const parsedRepo = parseGitHubRepository(repositoryUrl);
  if (!parsedRepo) {
    return {
      source: "github-releases",
      repository: repositoryUrl,
      latestVersion: null,
      releaseUrl: null,
      publishedAt: null,
      state: "unconfigured",
      updateAvailable: false,
      error: "Repository URL is not a supported GitHub repository reference."
    };
  }

  const currentVersion = options.currentVersion ?? readCurrentPackageVersion(options.packageRoot);
  const timeoutMs = options.timeoutMs ?? 2500;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "ExperienceEngine/doctor"
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      return {
        source: "github-releases",
        repository: `${parsedRepo.owner}/${parsedRepo.repo}`,
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        state: "unavailable",
        updateAvailable: false,
        error: `GitHub latest release lookup failed with HTTP ${response.status}.`
      };
    }

    const payload = (await response.json()) as GitHubLatestReleasePayload;
    const latestVersion = normalizeReleaseVersion(payload.tag_name);
    if (!latestVersion) {
      return {
        source: "github-releases",
        repository: `${parsedRepo.owner}/${parsedRepo.repo}`,
        latestVersion: null,
        releaseUrl: payload.html_url ?? null,
        publishedAt: payload.published_at ?? null,
        state: "unavailable",
        updateAvailable: false,
        error: "GitHub latest release payload did not contain a tag_name."
      };
    }

    const comparison = compareVersions(latestVersion, currentVersion);
    return {
      source: "github-releases",
      repository: `${parsedRepo.owner}/${parsedRepo.repo}`,
      latestVersion,
      releaseUrl: payload.html_url ?? null,
      publishedAt: payload.published_at ?? null,
      state: comparison > 0 ? "update-available" : comparison < 0 ? "local-ahead" : "current",
      updateAvailable: comparison > 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      source: "github-releases",
      repository: `${parsedRepo.owner}/${parsedRepo.repo}`,
      latestVersion: null,
      releaseUrl: null,
      publishedAt: null,
      state: "unavailable",
      updateAvailable: false,
      error: message
    };
  } finally {
    clearTimeout(timeout);
  }
};
