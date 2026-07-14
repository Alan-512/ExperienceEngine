import { chmod, mkdir, open, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  RUNTIME_INSTALL_ATTESTATION_DIRECTORY_RELATIVE_PATH,
  RUNTIME_INSTALL_ATTESTATION_SCHEMA_VERSION
} from "../identity/constants.js";
import { RuntimeIdentityError } from "../identity/errors.js";
import { hmacMachineIntegrityInput } from "../identity/integrity-key.js";
import type {
  MachineIntegrityKey,
  RuntimeInstallAttestation,
  RuntimeInstallAttestationContent,
  RuntimeInstallOrigin,
  RuntimeInstallSecurityApproval
} from "../identity/types.js";
import { canonicalJson, sha256Text } from "./package-generation.js";

const normalizePathForFingerprint = (value: string): string =>
  resolve(value).replaceAll("\\", "/").toLowerCase();

export const fingerprintRuntimeInstallPath = (value: string): string =>
  sha256Text(normalizePathForFingerprint(value));

export const resolveRuntimeInstallAttestationDirectory = (canonicalHome: string): string =>
  join(
    canonicalHome,
    ...RUNTIME_INSTALL_ATTESTATION_DIRECTORY_RELATIVE_PATH.split("/")
  );

export const resolveRuntimeInstallAttestationPath = (
  canonicalHome: string,
  attestationIdentity: string
): string => join(
  resolveRuntimeInstallAttestationDirectory(canonicalHome),
  `${attestationIdentity}.json`
);

const publishedOrigin = (origin: RuntimeInstallOrigin): boolean =>
  origin === "published_npm_attested" || origin === "published_clawhub_attested";

const validateSecurityApproval = (
  value: RuntimeInstallSecurityApproval
): RuntimeInstallSecurityApproval => {
  const validStatus = [
    "not_run",
    "not_required",
    "approval_required",
    "approved"
  ].includes(value.scan_status);
  const validMethod = value.approval_method === null ||
    value.approval_method === "explicit_cli" ||
    value.approval_method === "host_policy";
  if (
    !validStatus ||
    !validMethod ||
    (value.scan_summary_digest !== null && !/^[a-f0-9]{64}$/u.test(value.scan_summary_digest)) ||
    (value.approved_at !== null && Number.isNaN(Date.parse(value.approved_at))) ||
    (value.scan_status === "approved" && (!value.approval_method || !value.approved_at)) ||
    (value.scan_status !== "approved" && (value.approval_method !== null || value.approved_at !== null))
  ) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Install security approval does not match the v1 attestation contract."
    );
  }
  return value;
};

const contentFromUnknown = (value: unknown): RuntimeInstallAttestationContent => {
  if (!value || typeof value !== "object") {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Install attestation content is not an object."
    );
  }
  const record = value as Partial<RuntimeInstallAttestationContent>;
  const origins: RuntimeInstallOrigin[] = [
    "local_pack",
    "host_native_unattested",
    "published_npm_attested",
    "published_clawhub_attested"
  ];
  if (
    record.attestation_schema_version !== RUNTIME_INSTALL_ATTESTATION_SCHEMA_VERSION ||
    !record.install_origin ||
    !origins.includes(record.install_origin) ||
    typeof record.package_name !== "string" ||
    typeof record.package_version !== "string" ||
    typeof record.package_build_id !== "string" ||
    typeof record.closure_manifest_digest !== "string" ||
    typeof record.installed_root_fingerprint !== "string" ||
    typeof record.host_state_dir_fingerprint !== "string" ||
    typeof record.home_id !== "string" ||
    typeof record.database_path_fingerprint !== "string" ||
    (record.openclaw_version !== null && typeof record.openclaw_version !== "string") ||
    typeof record.node_version !== "string" ||
    typeof record.artifact_integrity !== "string" ||
    (record.registry_record_identity !== null && typeof record.registry_record_identity !== "string") ||
    !record.security_approval ||
    !["gateway_service_controller", "ee_installer", "published_validator"].includes(
      String(record.issued_by)
    ) ||
    typeof record.issued_at !== "string" ||
    Number.isNaN(Date.parse(record.issued_at)) ||
    typeof record.integrity_key_id !== "string"
  ) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Install attestation does not match the v1 schema."
    );
  }
  if (
    publishedOrigin(record.install_origin) &&
    (!record.registry_record_identity || !record.artifact_integrity)
  ) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Published install origin requires exact artifact and registry evidence."
    );
  }
  if (
    !publishedOrigin(record.install_origin) &&
    record.registry_record_identity !== null
  ) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Unattested or local install origin cannot carry registry identity."
    );
  }
  return {
    ...(record as RuntimeInstallAttestationContent),
    security_approval: validateSecurityApproval(record.security_approval)
  };
};

const signAttestationContent = (
  key: MachineIntegrityKey,
  content: RuntimeInstallAttestationContent
): RuntimeInstallAttestation => {
  if (content.integrity_key_id !== key.integrity_key_id) {
    throw new RuntimeIdentityError(
      "EE_INTEGRITY_KEY_MISMATCH",
      "Install attestation integrity-key id does not match the current machine key."
    );
  }
  const attestationHmac = hmacMachineIntegrityInput(
    key,
    "install-attestation-v1",
    canonicalJson(content)
  );
  return {
    ...content,
    attestation_identity: storageIdentity(content),
    attestation_hmac: attestationHmac
  };
};

const validateSignedAttestation = (
  key: MachineIntegrityKey,
  value: unknown
): RuntimeInstallAttestation => {
  if (!value || typeof value !== "object") {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Install attestation is not an object."
    );
  }
  const record = value as Partial<RuntimeInstallAttestation>;
  const {
    attestation_identity: observedIdentity,
    attestation_hmac: observedHmac,
    ...rawContent
  } = record;
  const content = contentFromUnknown(rawContent);
  const expected = signAttestationContent(key, content);
  if (
    observedIdentity !== expected.attestation_identity ||
    observedHmac !== expected.attestation_hmac
  ) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Install attestation signature or identity is invalid."
    );
  }
  return expected;
};

const readRuntimeInstallAttestationPath = async (options: {
  path: string;
  integrityKey: MachineIntegrityKey;
}): Promise<RuntimeInstallAttestation> => {
  let raw: string;
  try {
    raw = await readFile(options.path, "utf8");
  } catch (error) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      `Install attestation is unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  try {
    return validateSignedAttestation(options.integrityKey, JSON.parse(raw));
  } catch (error) {
    if (error instanceof RuntimeIdentityError) {
      throw error;
    }
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      "Install attestation JSON is invalid."
    );
  }
};

export const readRuntimeInstallAttestations = async (options: {
  canonicalHome: string;
  integrityKey: MachineIntegrityKey;
}): Promise<RuntimeInstallAttestation[]> => {
  const directory = resolveRuntimeInstallAttestationDirectory(options.canonicalHome);
  let filenames: string[];
  try {
    filenames = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
      `Install attestation directory is unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const attestations: RuntimeInstallAttestation[] = [];
  for (const filename of filenames.sort()) {
    if (!/^install_[a-f0-9]{64}\.json$/u.test(filename)) {
      continue;
    }
    const attestation = await readRuntimeInstallAttestationPath({
      path: join(directory, filename),
      integrityKey: options.integrityKey
    });
    if (`${attestation.attestation_identity}.json` !== filename) {
      throw new RuntimeIdentityError(
        "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
        "Install attestation filename does not match its signed identity."
      );
    }
    attestations.push(attestation);
  }
  return attestations;
};

export const readRuntimeInstallAttestation = async (options: {
  canonicalHome: string;
  integrityKey: MachineIntegrityKey;
  attestationIdentity: string;
}): Promise<RuntimeInstallAttestation | null> => {
  const path = resolveRuntimeInstallAttestationPath(
    options.canonicalHome,
    options.attestationIdentity
  );
  try {
    return await readRuntimeInstallAttestationPath({
      path,
      integrityKey: options.integrityKey
    });
  } catch (error) {
    if (
      error instanceof RuntimeIdentityError &&
      error.message.includes("ENOENT")
    ) {
      return null;
    }
    throw error;
  }
};

const immutableBinding = (attestation: RuntimeInstallAttestation): string =>
  canonicalJson({
    install_origin: attestation.install_origin,
    package_name: attestation.package_name,
    package_version: attestation.package_version,
    package_build_id: attestation.package_build_id,
    closure_manifest_digest: attestation.closure_manifest_digest,
    installed_root_fingerprint: attestation.installed_root_fingerprint,
    host_state_dir_fingerprint: attestation.host_state_dir_fingerprint,
    home_id: attestation.home_id,
    database_path_fingerprint: attestation.database_path_fingerprint,
    openclaw_version: attestation.openclaw_version,
    node_version: attestation.node_version,
    artifact_integrity: attestation.artifact_integrity,
    registry_record_identity: attestation.registry_record_identity,
    security_approval: attestation.security_approval,
    issued_by: attestation.issued_by,
    integrity_key_id: attestation.integrity_key_id
  });

const storageBinding = (
  content: RuntimeInstallAttestationContent
): string => canonicalJson({
  install_origin: content.install_origin,
  package_name: content.package_name,
  package_version: content.package_version,
  package_build_id: content.package_build_id,
  closure_manifest_digest: content.closure_manifest_digest,
  installed_root_fingerprint: content.installed_root_fingerprint,
  host_state_dir_fingerprint: content.host_state_dir_fingerprint,
  home_id: content.home_id,
  database_path_fingerprint: content.database_path_fingerprint,
  openclaw_version: content.openclaw_version,
  node_version: content.node_version,
  artifact_integrity: content.artifact_integrity,
  registry_record_identity: content.registry_record_identity,
  security_approval: content.security_approval,
  issued_by: content.issued_by,
  integrity_key_id: content.integrity_key_id
});

const storageIdentity = (content: RuntimeInstallAttestationContent): string =>
  `install_${sha256Text(storageBinding(content))}`;

export const findRuntimeInstallAttestation = async (options: {
  canonicalHome: string;
  integrityKey: MachineIntegrityKey;
  packageName: string;
  packageVersion: string;
  packageBuildId: string;
  closureManifestDigest: string;
  installedRoot: string;
  hostStateDir: string;
  homeId: string;
  databasePath: string;
  installOrigin?: RuntimeInstallOrigin;
}): Promise<RuntimeInstallAttestation | null> => {
  const installedRootFingerprint = fingerprintRuntimeInstallPath(options.installedRoot);
  const hostStateDirFingerprint = fingerprintRuntimeInstallPath(options.hostStateDir);
  const databasePathFingerprint = fingerprintRuntimeInstallPath(options.databasePath);
  const matches = (await readRuntimeInstallAttestations(options)).filter((attestation) =>
    attestation.package_name === options.packageName &&
    attestation.package_version === options.packageVersion &&
    attestation.package_build_id === options.packageBuildId &&
    attestation.closure_manifest_digest === options.closureManifestDigest &&
    attestation.installed_root_fingerprint === installedRootFingerprint &&
    attestation.host_state_dir_fingerprint === hostStateDirFingerprint &&
    attestation.home_id === options.homeId &&
    attestation.database_path_fingerprint === databasePathFingerprint &&
    (!options.installOrigin || attestation.install_origin === options.installOrigin)
  );
  if (matches.length === 0) {
    return null;
  }
  const originPriority: Record<RuntimeInstallOrigin, number> = {
    published_clawhub_attested: 4,
    published_npm_attested: 3,
    local_pack: 2,
    host_native_unattested: 1
  };
  return matches.sort((left, right) =>
    originPriority[right.install_origin] - originPriority[left.install_origin] ||
    left.attestation_identity.localeCompare(right.attestation_identity)
  )[0];
};

export const createOrAdoptRuntimeInstallAttestation = async (options: {
  canonicalHome: string;
  integrityKey: MachineIntegrityKey;
  content: Omit<RuntimeInstallAttestationContent, "attestation_schema_version" | "integrity_key_id">;
}): Promise<RuntimeInstallAttestation> => {
  const content = contentFromUnknown({
    ...options.content,
    attestation_schema_version: RUNTIME_INSTALL_ATTESTATION_SCHEMA_VERSION,
    integrity_key_id: options.integrityKey.integrity_key_id
  });
  const candidate = signAttestationContent(options.integrityKey, content);
  const recordIdentity = storageIdentity(content);
  const directory = resolveRuntimeInstallAttestationDirectory(options.canonicalHome);
  const path = join(directory, `${recordIdentity}.json`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(path, 0o600).catch(() => undefined);
    return candidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new RuntimeIdentityError(
        "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID",
        `Unable to create install attestation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const existing = await readRuntimeInstallAttestationPath({
    path,
    integrityKey: options.integrityKey
  });
  if (!existing || immutableBinding(existing) !== immutableBinding(candidate)) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_CONFLICT",
      "Existing install attestation conflicts with the current package, host, home, or origin."
    );
  }
  return existing;
};

export const assertRuntimeInstallAttestationBinding = (options: {
  attestation: RuntimeInstallAttestation;
  packageName: string;
  packageVersion: string;
  packageBuildId: string;
  closureManifestDigest: string;
  installedRoot: string;
  hostStateDir: string;
  homeId: string;
  databasePath: string;
}): void => {
  const attestation = options.attestation;
  if (
    attestation.package_name !== options.packageName ||
    attestation.package_version !== options.packageVersion ||
    attestation.package_build_id !== options.packageBuildId ||
    attestation.closure_manifest_digest !== options.closureManifestDigest ||
    attestation.installed_root_fingerprint !== fingerprintRuntimeInstallPath(options.installedRoot) ||
    attestation.host_state_dir_fingerprint !== fingerprintRuntimeInstallPath(options.hostStateDir) ||
    attestation.home_id !== options.homeId ||
    attestation.database_path_fingerprint !== fingerprintRuntimeInstallPath(options.databasePath)
  ) {
    throw new RuntimeIdentityError(
      "EE_OPENCLAW_INSTALL_ATTESTATION_MISMATCH",
      "Install attestation does not match the loaded package and canonical runtime authority."
    );
  }
};

export const RUNTIME_INSTALL_ATTESTATION_CONTRACT = Object.freeze({
  mutable_installer_state_is_authority: false,
  hmac_domain: "install-attestation-v1",
  immutable_generation_records: true,
  multiple_package_generations_may_coexist: true,
  origins: [
    "local_pack",
    "host_native_unattested",
    "published_npm_attested",
    "published_clawhub_attested"
  ],
  published_origin_requires_registry_identity: true,
  conflicting_attestation_overwrite_allowed: false
});
