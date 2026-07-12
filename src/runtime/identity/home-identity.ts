import { createHmac } from "node:crypto";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import {
  RUNTIME_DATABASE_RELATIVE_PATH,
  RUNTIME_HOME_LAYOUT_VERSION,
  RUNTIME_HOME_PATH_NORMALIZATION_VERSION,
  RUNTIME_IDENTITY_CONTRACT_ID
} from "./constants.js";
import type {
  CanonicalRuntimeHomeResolution,
  MachineIntegrityKey,
  RuntimeHomeIdentity
} from "./types.js";

type NormalizeHomePathOptions = {
  platform?: NodeJS.Platform;
  cwd?: string;
};

type ResolveCanonicalRuntimeHomeOptions = NormalizeHomePathOptions & {
  explicitOpenClawHome?: string;
  env?: NodeJS.ProcessEnv;
  defaultHome?: string;
};

const pathApiForPlatform = (platform: NodeJS.Platform) => platform === "win32" ? win32 : posix;

const stripTrailingSeparator = (value: string, root: string): string => {
  if (value === root) {
    return value;
  }
  return value.replace(/\/+$/u, "");
};

export const normalizeHomePathForFingerprint = (
  homePath: string,
  options: NormalizeHomePathOptions = {}
): string => {
  const platform = options.platform ?? process.platform;
  const pathApi = pathApiForPlatform(platform);
  const cwd = options.cwd ?? process.cwd();
  const resolved = pathApi.resolve(cwd, homePath);
  const resolvedWithForwardSeparators = resolved.replace(/\\/gu, "/").normalize("NFC");
  const root = pathApi.parse(resolved).root.replace(/\\/gu, "/").normalize("NFC");
  const withoutTrailingSeparator = stripTrailingSeparator(resolvedWithForwardSeparators, root);

  if (platform !== "win32") {
    return withoutTrailingSeparator;
  }

  const driveMatch = /^([a-zA-Z]):(\/.*)?$/u.exec(withoutTrailingSeparator);
  if (driveMatch) {
    const drive = driveMatch[1].toUpperCase();
    const remainder = (driveMatch[2] ?? "").toLowerCase();
    return `${drive}:${remainder}`;
  }

  if (withoutTrailingSeparator.startsWith("//")) {
    return `//${withoutTrailingSeparator.slice(2).toLowerCase()}`;
  }

  return withoutTrailingSeparator.toLowerCase();
};

export const resolveCanonicalRuntimeHome = (
  options: ResolveCanonicalRuntimeHomeOptions = {}
): CanonicalRuntimeHomeResolution => {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathApi = pathApiForPlatform(platform);
  const defaultHome = options.defaultHome ?? pathApi.join(homedir(), ".experienceengine");
  const explicitHome = options.explicitOpenClawHome?.trim();
  const inheritedHome = env.EXPERIENCE_ENGINE_HOME?.trim();
  const selectedHome = explicitHome || inheritedHome || defaultHome;
  const resolutionMode = explicitHome
    ? "openclaw_explicit"
    : inheritedHome
      ? "environment"
      : "product_default";
  const cwd = options.cwd ?? process.cwd();
  const resolvedHome = pathApi.resolve(cwd, selectedHome);
  const normalizedHomePath = normalizeHomePathForFingerprint(resolvedHome, { platform, cwd });

  return {
    contractId: RUNTIME_IDENTITY_CONTRACT_ID,
    resolutionMode,
    resolvedHome,
    displayHome: selectedHome,
    normalizedHomePath,
    homeLayoutVersion: RUNTIME_HOME_LAYOUT_VERSION,
    pathNormalizationVersion: RUNTIME_HOME_PATH_NORMALIZATION_VERSION,
    databaseRelativePath: RUNTIME_DATABASE_RELATIVE_PATH,
    databasePath: pathApi.join(resolvedHome, ...RUNTIME_DATABASE_RELATIVE_PATH.split("/"))
  };
};

const decodeKeyMaterial = (key: MachineIntegrityKey): Buffer =>
  Buffer.from(key.key_material, "base64url");

export const createDomainSeparatedHmac = (
  key: MachineIntegrityKey,
  domain: string,
  value: string | Uint8Array
): string => {
  const hmac = createHmac("sha256", decodeKeyMaterial(key));
  hmac.update(domain, "utf8");
  hmac.update(Buffer.from([0]));
  hmac.update(typeof value === "string" ? Buffer.from(value, "utf8") : value);
  return hmac.digest("hex");
};

export const deriveNormalizedHomePathFingerprint = (
  resolution: CanonicalRuntimeHomeResolution,
  key: MachineIntegrityKey
): string => createDomainSeparatedHmac(key, "home-path-v1", resolution.normalizedHomePath);

export const createRuntimeHomeIdentity = (options: {
  homeId: string;
  resolution: CanonicalRuntimeHomeResolution;
  integrityKey: MachineIntegrityKey;
  createdAt: string;
}): RuntimeHomeIdentity => ({
  home_id: options.homeId,
  home_layout_version: options.resolution.homeLayoutVersion,
  path_normalization_version: options.resolution.pathNormalizationVersion,
  normalized_path_fingerprint: deriveNormalizedHomePathFingerprint(
    options.resolution,
    options.integrityKey
  ),
  home_path_fingerprint_key_id: options.integrityKey.integrity_key_id,
  database_relative_path: options.resolution.databaseRelativePath,
  created_at: options.createdAt
});
