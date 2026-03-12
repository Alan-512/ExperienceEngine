import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveExperienceEnginePackageRoot } from "../install/openclaw-cli.js";

type PackageManifest = {
  version?: string;
};

export type VersionStatus = {
  currentVersion: string;
  recordedVersion: string | null;
  state: "not-installed" | "unknown" | "current" | "upgrade-available" | "local-older";
  updateAvailable: boolean;
};

const parseVersion = (value: string): { core: number[]; preRelease: string | null } => {
  const [corePart, preReleasePart] = value.trim().split("-", 2);
  return {
    core: corePart
      .split(".")
      .map((segment) => Number.parseInt(segment, 10))
      .map((segment) => (Number.isFinite(segment) ? segment : 0)),
    preRelease: preReleasePart ?? null
  };
};

export const compareVersions = (left: string, right: string): number => {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  const length = Math.max(parsedLeft.core.length, parsedRight.core.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = parsedLeft.core[index] ?? 0;
    const rightValue = parsedRight.core[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  if (parsedLeft.preRelease === parsedRight.preRelease) {
    return 0;
  }

  if (parsedLeft.preRelease === null) {
    return 1;
  }

  if (parsedRight.preRelease === null) {
    return -1;
  }

  return parsedLeft.preRelease.localeCompare(parsedRight.preRelease);
};

export const readCurrentPackageVersion = (packageRoot = resolveExperienceEnginePackageRoot()): string => {
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found under ${packageRoot}`);
  }

  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageManifest;
  if (!manifest.version) {
    throw new Error(`package.json under ${packageRoot} is missing a version field`);
  }

  return manifest.version;
};

export const buildVersionStatus = (
  installed: boolean,
  recordedVersion?: string | null,
  currentVersion = readCurrentPackageVersion()
): VersionStatus => {
  if (!installed) {
    return {
      currentVersion,
      recordedVersion: null,
      state: "not-installed",
      updateAvailable: false
    };
  }

  if (!recordedVersion) {
    return {
      currentVersion,
      recordedVersion: null,
      state: "unknown",
      updateAvailable: true
    };
  }

  const comparison = compareVersions(currentVersion, recordedVersion);
  if (comparison > 0) {
    return {
      currentVersion,
      recordedVersion,
      state: "upgrade-available",
      updateAvailable: true
    };
  }

  if (comparison < 0) {
    return {
      currentVersion,
      recordedVersion,
      state: "local-older",
      updateAvailable: false
    };
  }

  return {
    currentVersion,
    recordedVersion,
    state: "current",
    updateAvailable: false
  };
};
