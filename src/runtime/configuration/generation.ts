import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  CONFIGURATION_GENERATION_REQUIRED_FILES,
  CONFIGURATION_GENERATIONS_RELATIVE_DIRECTORY,
  CONFIGURATION_MANIFEST_SCHEMA_VERSION,
  CONFIGURATION_POINTER_SCHEMA_VERSION,
  CONFIGURATION_SECRETS_SCHEMA_VERSION,
  CONFIGURATION_SETTINGS_SCHEMA_VERSION,
  VALIDATION_STATE_SCHEMA_VERSION
} from "./constants.js";
import { RuntimeConfigurationError } from "./errors.js";
import {
  fingerprintValidationIdentity,
  hmacConfigurationSecretsFile,
  loadVerifiedConfigurationIntegrityAuthority,
  type VerifiedConfigurationIntegrityAuthority
} from "./integrity.js";
import { computeEffectiveRouteSetId } from "./route-authority.js";
import { assertExactConfigurationValidationState } from "./validation.js";
import type {
  PackagedProfileRegistry,
  RuntimeConfigurationCandidate,
  RuntimeConfigurationGenerationAuthorityRow,
  RuntimeConfigurationActivationInvalidationProvider,
  RuntimeConfigurationGenerationManifest,
  RuntimeConfigurationPointerRow,
  RuntimeConfigurationSecrets,
  RuntimeConfigurationSettings,
  RuntimeValidationState,
  VerifiedRuntimeConfigurationGeneration
} from "./types.js";

const UNAVAILABLE_CONFIGURATION_ACTIVATION_INVALIDATION_PROVIDER:
RuntimeConfigurationActivationInvalidationProvider = {
  invalidateForConfigurationCommitInTransaction(input) {
    if (!input.db.isTransaction) {
      throw new RuntimeConfigurationError(
        "EE_CONFIGURATION_ACTIVATION_INVALIDATION_REQUIRED",
        "Configuration activation invalidation requires the current commit transaction."
      );
    }
    const activation = input.db.prepare(
      `SELECT activation_state
       FROM package_activation_state
       WHERE home_id = ?`
    ).get(input.homeId) as { activation_state: string } | undefined;
    if (
      activation?.activation_state === "active" &&
      input.currentConfigurationGenerationId !==
        input.nextConfigurationGenerationId
    ) {
      throw new RuntimeConfigurationError(
        "EE_CONFIGURATION_ACTIVATION_INVALIDATION_REQUIRED",
        "Active production configuration changes require the S6 same-transaction invalidation provider."
      );
    }
  }
};

const GENERATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u;

const assertGenerationId = (generationId: string): void => {
  if (!GENERATION_ID_PATTERN.test(generationId)) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      `Unsafe configuration generation id ${generationId}.`
    );
  }
};

const stableJsonBytes = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

const writeSyncedFile = async (
  path: string,
  bytes: Uint8Array,
  mode: number
): Promise<void> => {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const syncDirectoryWhereSupported = async (path: string): Promise<void> => {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EPERM" && code !== "EISDIR") {
      throw error;
    }
  }
};

const uniqueSecretRefs = (settings: RuntimeConfigurationSettings): string[] => {
  const refs = new Set<string>();
  for (const capability of Object.values(settings.capability_routes)) {
    for (const route of [
      ...(capability.primary_route ? [capability.primary_route] : []),
      ...capability.fallback_routes
    ]) {
      for (const secretRef of route.secret_refs) {
        if (!secretRef || secretRef.trim() !== secretRef) {
          throw new RuntimeConfigurationError(
            "EE_CONFIGURATION_GENERATION_INVALID",
            "Secret references must be non-empty normalized identifiers."
          );
        }
        refs.add(secretRef);
      }
    }
  }
  return [...refs].sort();
};

const assertSecretReferencesResolve = (
  settings: RuntimeConfigurationSettings,
  secrets: RuntimeConfigurationSecrets
): string[] => {
  const refs = uniqueSecretRefs(settings);
  for (const ref of refs) {
    if (typeof secrets.values[ref] !== "string" || secrets.values[ref].length === 0) {
      throw new RuntimeConfigurationError(
        "EE_CONFIGURATION_GENERATION_INVALID",
        `Configured secret reference ${ref} is unresolved.`
      );
    }
  }
  return refs;
};

const configurationGenerationDirectory = (
  canonicalHome: string,
  generationId: string
): string => {
  assertGenerationId(generationId);
  return join(canonicalHome, CONFIGURATION_GENERATIONS_RELATIVE_DIRECTORY, generationId);
};

export const resolveRuntimeConfigurationGenerationDirectory =
  configurationGenerationDirectory;

const configurationFilePaths = (directoryPath: string): Record<
  typeof CONFIGURATION_GENERATION_REQUIRED_FILES[number],
  string
> => ({
  "settings.json": join(directoryPath, "settings.json"),
  "secrets.json": join(directoryPath, "secrets.json"),
  "validation-state.json": join(directoryPath, "validation-state.json"),
  "manifest.json": join(directoryPath, "manifest.json")
});

const assertCandidateSchemas = (candidate: RuntimeConfigurationCandidate): void => {
  if (
    candidate.settings.settings_schema_version !== CONFIGURATION_SETTINGS_SCHEMA_VERSION ||
    candidate.secrets.secrets_schema_version !== CONFIGURATION_SECRETS_SCHEMA_VERSION ||
    candidate.validationState.validation_schema_version !== VALIDATION_STATE_SCHEMA_VERSION
  ) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      "Configuration candidate schema versions do not match the frozen S4 contract."
    );
  }
  if (
    candidate.profileRegistry.package_name !== candidate.packageIdentity.package_name ||
    candidate.profileRegistry.package_version !== candidate.packageIdentity.package_version ||
    candidate.profileRegistry.registry_digest !== candidate.packageIdentity.profile_registry_digest
  ) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      "Profile registry identity does not match the selected package generation."
    );
  }
  if (
    candidate.validationState.records.some((record) =>
      record.configuration_generation_id !== candidate.generationId ||
      record.home_id.length === 0 ||
      record.package_generation_id !== candidate.packageIdentity.package_generation_id ||
      record.profile_registry_digest !== candidate.profileRegistry.registry_digest ||
      record.quality_profile !== candidate.settings.quality_profile ||
      record.profile_id !== candidate.settings.profile_id ||
      record.profile_version !== candidate.settings.profile_version
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      "Validation records are not bound to the candidate generation/profile/package."
    );
  }
};

const createManifest = (options: {
  candidate: RuntimeConfigurationCandidate;
  homeId: string;
  integrity: VerifiedConfigurationIntegrityAuthority;
  settingsBytes: Buffer;
  secretsBytes: Buffer;
  validationBytes: Buffer;
  secretRefs: string[];
}): RuntimeConfigurationGenerationManifest => ({
  manifest_schema_version: CONFIGURATION_MANIFEST_SCHEMA_VERSION,
  generation_id: options.candidate.generationId,
  parent_generation_id: options.candidate.parentGenerationId,
  home_id: options.homeId,
  package_generation_id: options.candidate.packageIdentity.package_generation_id,
  integrity_key_id: options.integrity.integrityKeyId,
  path_normalization_version: options.integrity.pathNormalizationVersion,
  settings_schema_version: options.candidate.settings.settings_schema_version,
  secrets_schema_version: options.candidate.secrets.secrets_schema_version,
  validation_schema_version: options.candidate.validationState.validation_schema_version,
  required_files: [...CONFIGURATION_GENERATION_REQUIRED_FILES],
  non_secret_file_digests: {
    "settings.json": sha256Text(options.settingsBytes.toString("utf8")),
    "validation-state.json": sha256Text(options.validationBytes.toString("utf8"))
  },
  secrets_file_hmac: hmacConfigurationSecretsFile(options.integrity.key, options.secretsBytes),
  secret_ref_set_fingerprint: fingerprintValidationIdentity(
    options.integrity.key,
    canonicalJson(options.secretRefs)
  ),
  profile_registry_digest: options.candidate.profileRegistry.registry_digest,
  override_snapshot_fingerprint: options.candidate.overrideSnapshotFingerprint,
  created_at: options.candidate.createdAt,
  created_by_instance_id: options.candidate.createdByInstanceId,
  generation_state: "complete"
});

const parseJson = <T>(bytes: Buffer, label: string): T => {
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      `${label} contains invalid JSON.`
    );
  }
};

const readGenerationBytes = async (directoryPath: string): Promise<{
  settingsBytes: Buffer;
  secretsBytes: Buffer;
  validationBytes: Buffer;
  manifestBytes: Buffer;
}> => {
  const paths = configurationFilePaths(directoryPath);
  try {
    const [settingsBytes, secretsBytes, validationBytes, manifestBytes] = await Promise.all([
      readFile(paths["settings.json"]),
      readFile(paths["secrets.json"]),
      readFile(paths["validation-state.json"]),
      readFile(paths["manifest.json"])
    ]);
    return { settingsBytes, secretsBytes, validationBytes, manifestBytes };
  } catch (error) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      `Configuration generation is incomplete: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const verifyRuntimeConfigurationGeneration = async (options: {
  canonicalHome: string;
  generationId: string;
  expectedHomeId: string;
  expectedPackageGenerationId: string;
  profileRegistry: PackagedProfileRegistry;
  profileSelectionContext: RuntimeConfigurationCandidate["profileSelectionContext"];
  integrity: VerifiedConfigurationIntegrityAuthority;
  expectedManifestDigest?: string;
}): Promise<VerifiedRuntimeConfigurationGeneration> => {
  const directoryPath = configurationGenerationDirectory(
    options.canonicalHome,
    options.generationId
  );
  const bytes = await readGenerationBytes(directoryPath);
  const settings = parseJson<RuntimeConfigurationSettings>(bytes.settingsBytes, "settings.json");
  const secrets = parseJson<RuntimeConfigurationSecrets>(bytes.secretsBytes, "secrets.json");
  const validationState = parseJson<RuntimeValidationState>(
    bytes.validationBytes,
    "validation-state.json"
  );
  const manifest = parseJson<RuntimeConfigurationGenerationManifest>(
    bytes.manifestBytes,
    "manifest.json"
  );
  const manifestDigest = sha256Text(bytes.manifestBytes.toString("utf8"));
  const requiredFiles = [...manifest.required_files].sort();
  if (
    manifest.manifest_schema_version !== CONFIGURATION_MANIFEST_SCHEMA_VERSION ||
    manifest.generation_id !== options.generationId ||
    manifest.home_id !== options.expectedHomeId ||
    manifest.package_generation_id !== options.expectedPackageGenerationId ||
    manifest.integrity_key_id !== options.integrity.integrityKeyId ||
    manifest.path_normalization_version !== options.integrity.pathNormalizationVersion ||
    manifest.profile_registry_digest !== options.profileRegistry.registry_digest ||
    manifest.generation_state !== "complete" ||
    canonicalJson(requiredFiles) !== canonicalJson([...CONFIGURATION_GENERATION_REQUIRED_FILES].sort()) ||
    settings.settings_schema_version !== CONFIGURATION_SETTINGS_SCHEMA_VERSION ||
    secrets.secrets_schema_version !== CONFIGURATION_SECRETS_SCHEMA_VERSION ||
    validationState.validation_schema_version !== VALIDATION_STATE_SCHEMA_VERSION ||
    manifest.settings_schema_version !== settings.settings_schema_version ||
    manifest.secrets_schema_version !== secrets.secrets_schema_version ||
    manifest.validation_schema_version !== validationState.validation_schema_version ||
    manifest.non_secret_file_digests["settings.json"] !==
      sha256Text(bytes.settingsBytes.toString("utf8")) ||
    manifest.non_secret_file_digests["validation-state.json"] !==
      sha256Text(bytes.validationBytes.toString("utf8")) ||
    manifest.secrets_file_hmac !==
      hmacConfigurationSecretsFile(options.integrity.key, bytes.secretsBytes) ||
    (
      options.expectedManifestDigest !== undefined &&
      manifestDigest !== options.expectedManifestDigest
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      `Configuration generation ${options.generationId} failed manifest verification.`
    );
  }
  const refs = assertSecretReferencesResolve(settings, secrets);
  if (
    manifest.secret_ref_set_fingerprint !==
    fingerprintValidationIdentity(options.integrity.key, canonicalJson(refs))
  ) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      "Configuration generation secret-reference fingerprint mismatch."
    );
  }
  if (
    validationState.records.some((record) =>
      record.configuration_generation_id !== options.generationId ||
      record.home_id !== options.expectedHomeId ||
      record.package_generation_id !== options.expectedPackageGenerationId ||
      record.profile_registry_digest !== options.profileRegistry.registry_digest ||
      record.override_snapshot_fingerprint !== manifest.override_snapshot_fingerprint
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_GENERATION_INVALID",
      "Configuration generation validation bindings are inconsistent."
    );
  }
  const effectiveRouteSetId = computeEffectiveRouteSetId({
    homeId: options.expectedHomeId,
    configurationGenerationId: options.generationId,
    packageGenerationId: options.expectedPackageGenerationId,
    overrideSnapshotFingerprint: manifest.override_snapshot_fingerprint,
    settings,
    secrets,
    integrityKey: options.integrity.key
  });
  assertExactConfigurationValidationState({
    validationState,
    settings,
    secrets,
    profileRegistry: options.profileRegistry,
    integrityKey: options.integrity.key,
    homeId: options.expectedHomeId,
    packageGenerationId: options.expectedPackageGenerationId,
    configurationGenerationId: options.generationId,
    effectiveRouteSetId,
    overrideSnapshotFingerprint: manifest.override_snapshot_fingerprint,
    selectionMode: "existing_generation",
    profileSelectionContext: options.profileSelectionContext
  });
  return {
    directoryPath,
    settings,
    secrets,
    validationState,
    manifest,
    manifestDigest,
    profileRegistry: options.profileRegistry,
    profileSelectionContext: options.profileSelectionContext
  };
};

export const prepareRuntimeConfigurationGeneration = async (options: {
  db: DatabaseSync;
  canonicalHome: string;
  homeId: string;
  candidate: RuntimeConfigurationCandidate;
}): Promise<VerifiedRuntimeConfigurationGeneration> => {
  assertGenerationId(options.candidate.generationId);
  assertCandidateSchemas(options.candidate);
  const integrity = await loadVerifiedConfigurationIntegrityAuthority({
    db: options.db,
    canonicalHome: options.canonicalHome,
    homeId: options.homeId
  });
  const effectiveRouteSetId = computeEffectiveRouteSetId({
    homeId: options.homeId,
    configurationGenerationId: options.candidate.generationId,
    packageGenerationId: options.candidate.packageIdentity.package_generation_id,
    overrideSnapshotFingerprint: options.candidate.overrideSnapshotFingerprint,
    settings: options.candidate.settings,
    secrets: options.candidate.secrets,
    integrityKey: integrity.key
  });
  assertExactConfigurationValidationState({
    validationState: options.candidate.validationState,
    settings: options.candidate.settings,
    secrets: options.candidate.secrets,
    profileRegistry: options.candidate.profileRegistry,
    integrityKey: integrity.key,
    homeId: options.homeId,
    packageGenerationId: options.candidate.packageIdentity.package_generation_id,
    configurationGenerationId: options.candidate.generationId,
    effectiveRouteSetId,
    overrideSnapshotFingerprint: options.candidate.overrideSnapshotFingerprint,
    selectionMode: "new_generation",
    profileSelectionContext: options.candidate.profileSelectionContext
  });
  const secretRefs = assertSecretReferencesResolve(
    options.candidate.settings,
    options.candidate.secrets
  );
  const settingsBytes = stableJsonBytes(options.candidate.settings);
  const secretsBytes = stableJsonBytes(options.candidate.secrets);
  const validationBytes = stableJsonBytes(options.candidate.validationState);
  const manifest = createManifest({
    candidate: options.candidate,
    homeId: options.homeId,
    integrity,
    settingsBytes,
    secretsBytes,
    validationBytes,
    secretRefs
  });
  const manifestBytes = stableJsonBytes(manifest);
  const generationRoot = join(
    options.canonicalHome,
    CONFIGURATION_GENERATIONS_RELATIVE_DIRECTORY
  );
  const finalDirectory = configurationGenerationDirectory(
    options.canonicalHome,
    options.candidate.generationId
  );
  const candidateDirectory = join(
    generationRoot,
    `.${options.candidate.generationId}.${process.pid}.${randomUUID()}.candidate`
  );
  await mkdir(generationRoot, { recursive: true, mode: 0o700 });
  try {
    await stat(finalDirectory);
    return verifyRuntimeConfigurationGeneration({
      canonicalHome: options.canonicalHome,
      generationId: options.candidate.generationId,
      expectedHomeId: options.homeId,
      expectedPackageGenerationId: options.candidate.packageIdentity.package_generation_id,
      profileRegistry: options.candidate.profileRegistry,
      profileSelectionContext: options.candidate.profileSelectionContext,
      integrity,
      expectedManifestDigest: sha256Text(manifestBytes.toString("utf8"))
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(candidateDirectory, { recursive: false, mode: 0o700 });
  const paths = configurationFilePaths(candidateDirectory);
  try {
    await writeSyncedFile(paths["settings.json"], settingsBytes, 0o600);
    await writeSyncedFile(paths["secrets.json"], secretsBytes, 0o600);
    await writeSyncedFile(paths["validation-state.json"], validationBytes, 0o600);
    await writeSyncedFile(paths["manifest.json"], manifestBytes, 0o600);
    await syncDirectoryWhereSupported(candidateDirectory);
    await rename(candidateDirectory, finalDirectory);
    await syncDirectoryWhereSupported(generationRoot);
  } catch (error) {
    await rm(candidateDirectory, { recursive: true, force: true });
    throw error;
  }
  return verifyRuntimeConfigurationGeneration({
    canonicalHome: options.canonicalHome,
    generationId: options.candidate.generationId,
    expectedHomeId: options.homeId,
    expectedPackageGenerationId: options.candidate.packageIdentity.package_generation_id,
    profileRegistry: options.candidate.profileRegistry,
    profileSelectionContext: options.candidate.profileSelectionContext,
    integrity,
    expectedManifestDigest: sha256Text(manifestBytes.toString("utf8"))
  });
};

export const readRuntimeConfigurationPointer = (
  db: DatabaseSync,
  homeId: string
): RuntimeConfigurationPointerRow | undefined => db.prepare(
  "SELECT * FROM configuration_pointer WHERE home_id = ?"
).get(homeId) as RuntimeConfigurationPointerRow | undefined;

const readGenerationAuthority = (
  db: DatabaseSync,
  homeId: string,
  generationId: string
): RuntimeConfigurationGenerationAuthorityRow | undefined => db.prepare(
  "SELECT * FROM configuration_generations WHERE home_id = ? AND generation_id = ?"
).get(homeId, generationId) as RuntimeConfigurationGenerationAuthorityRow | undefined;

export class RuntimeConfigurationGenerationRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly canonicalHome: string,
    private readonly homeId: string,
    private readonly activationInvalidationProvider:
      RuntimeConfigurationActivationInvalidationProvider =
        UNAVAILABLE_CONFIGURATION_ACTIVATION_INVALIDATION_PROVIDER
  ) {}

  readPointer(): RuntimeConfigurationPointerRow | undefined {
    return readRuntimeConfigurationPointer(this.db, this.homeId);
  }

  async commitPreparedGeneration(options: {
    prepared: VerifiedRuntimeConfigurationGeneration;
    expectedPointerRevision: number;
    expectedGenerationId: string | null;
    commitId?: string;
    committedAt?: string;
  }): Promise<RuntimeConfigurationPointerRow> {
    const integrity = await loadVerifiedConfigurationIntegrityAuthority({
      db: this.db,
      canonicalHome: this.canonicalHome,
      homeId: this.homeId
    });
    const verified = await verifyRuntimeConfigurationGeneration({
      canonicalHome: this.canonicalHome,
      generationId: options.prepared.manifest.generation_id,
      expectedHomeId: this.homeId,
      expectedPackageGenerationId: options.prepared.manifest.package_generation_id,
      profileRegistry: options.prepared.profileRegistry,
      profileSelectionContext: options.prepared.profileSelectionContext,
      integrity,
      expectedManifestDigest: options.prepared.manifestDigest
    });
    return runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const current = readRuntimeConfigurationPointer(this.db, this.homeId);
        if (
          current &&
          current.generation_id === verified.manifest.generation_id &&
          current.manifest_digest === verified.manifestDigest
        ) {
          const existing = readGenerationAuthority(
            this.db,
            this.homeId,
            verified.manifest.generation_id
          );
          if (
            !existing ||
            existing.generation_state !== "committed" ||
            existing.manifest_digest !== verified.manifestDigest
          ) {
            throw new RuntimeConfigurationError(
              "EE_CONFIGURATION_GENERATION_INVALID",
              "Current configuration pointer lacks matching committed generation authority."
            );
          }
          return current;
        }
        const observedRevision = current?.pointer_revision ?? 0;
        const observedGeneration = current?.generation_id ?? null;
        if (
          observedRevision !== options.expectedPointerRevision ||
          observedGeneration !== options.expectedGenerationId ||
          verified.manifest.parent_generation_id !== options.expectedGenerationId
        ) {
          throw new RuntimeConfigurationError(
            "EE_CONFIGURATION_POINTER_CONFLICT",
            `Configuration pointer changed from expected revision ${options.expectedPointerRevision}.`
          );
        }
        const existingGeneration = readGenerationAuthority(
          this.db,
          this.homeId,
          verified.manifest.generation_id
        );
        if (existingGeneration) {
          throw new RuntimeConfigurationError(
            "EE_CONFIGURATION_GENERATION_INVALID",
            `Configuration generation ${verified.manifest.generation_id} already has authority state.`
          );
        }
        const committedAt = options.committedAt ?? new Date().toISOString();
        const commitId = options.commitId ?? randomUUID();
        this.activationInvalidationProvider
          .invalidateForConfigurationCommitInTransaction({
            db: this.db,
            homeId: this.homeId,
            currentConfigurationGenerationId: observedGeneration,
            nextConfigurationGenerationId: verified.manifest.generation_id,
            committedAt
          });
        this.db.prepare(
          `INSERT INTO configuration_generations (
            generation_id,
            home_id,
            parent_generation_id,
            manifest_digest,
            integrity_key_id,
            profile_registry_digest,
            created_by_instance_id,
            created_at,
            committed_at,
            generation_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed')`
        ).run(
          verified.manifest.generation_id,
          this.homeId,
          verified.manifest.parent_generation_id,
          verified.manifestDigest,
          verified.manifest.integrity_key_id,
          verified.manifest.profile_registry_digest,
          verified.manifest.created_by_instance_id,
          verified.manifest.created_at,
          committedAt
        );
        if (!current) {
          if (options.expectedPointerRevision !== 0 || options.expectedGenerationId !== null) {
            throw new RuntimeConfigurationError(
              "EE_CONFIGURATION_POINTER_CONFLICT",
              "Initial configuration pointer commit requires absent revision zero authority."
            );
          }
          this.db.prepare(
            `INSERT INTO configuration_pointer (
              home_id,
              pointer_schema_version,
              pointer_revision,
              generation_id,
              previous_generation_id,
              manifest_digest,
              commit_id,
              committed_at
            ) VALUES (?, ?, 1, ?, NULL, ?, ?, ?)`
          ).run(
            this.homeId,
            CONFIGURATION_POINTER_SCHEMA_VERSION,
            verified.manifest.generation_id,
            verified.manifestDigest,
            commitId,
            committedAt
          );
        } else {
          const result = this.db.prepare(
            `UPDATE configuration_pointer
             SET pointer_revision = pointer_revision + 1,
                 generation_id = ?,
                 previous_generation_id = ?,
                 manifest_digest = ?,
                 commit_id = ?,
                 committed_at = ?
             WHERE home_id = ?
               AND pointer_schema_version = ?
               AND pointer_revision = ?
               AND generation_id IS ?`
          ).run(
            verified.manifest.generation_id,
            current.generation_id,
            verified.manifestDigest,
            commitId,
            committedAt,
            this.homeId,
            CONFIGURATION_POINTER_SCHEMA_VERSION,
            options.expectedPointerRevision,
            options.expectedGenerationId
          );
          if (Number(result.changes) !== 1) {
            throw new RuntimeConfigurationError(
              "EE_CONFIGURATION_POINTER_CONFLICT",
              "Configuration pointer CAS lost current authority."
            );
          }
        }
        return readRuntimeConfigurationPointer(this.db, this.homeId)!;
      }
    });
  }

  async publish(options: {
    candidate: RuntimeConfigurationCandidate;
    expectedPointerRevision: number;
    expectedGenerationId: string | null;
    commitId?: string;
    committedAt?: string;
  }): Promise<RuntimeConfigurationPointerRow> {
    const prepared = await prepareRuntimeConfigurationGeneration({
      db: this.db,
      canonicalHome: this.canonicalHome,
      homeId: this.homeId,
      candidate: options.candidate
    });
    return this.commitPreparedGeneration({
      prepared,
      expectedPointerRevision: options.expectedPointerRevision,
      expectedGenerationId: options.expectedGenerationId,
      commitId: options.commitId,
      committedAt: options.committedAt
    });
  }

  async loadCurrent(options: {
    expectedPackageGenerationId: string;
    profileRegistry: PackagedProfileRegistry;
    profileSelectionContext: RuntimeConfigurationCandidate["profileSelectionContext"];
  }): Promise<VerifiedRuntimeConfigurationGeneration | undefined> {
    const pointer = readRuntimeConfigurationPointer(this.db, this.homeId);
    if (!pointer?.generation_id || !pointer.manifest_digest) {
      return undefined;
    }
    if (pointer.pointer_schema_version !== CONFIGURATION_POINTER_SCHEMA_VERSION) {
      throw new RuntimeConfigurationError(
        "EE_CONFIGURATION_GENERATION_INVALID",
        `Unsupported configuration pointer schema ${pointer.pointer_schema_version}.`
      );
    }
    const authority = readGenerationAuthority(this.db, this.homeId, pointer.generation_id);
    if (
      !authority ||
      authority.generation_state !== "committed" ||
      authority.manifest_digest !== pointer.manifest_digest
    ) {
      throw new RuntimeConfigurationError(
        "EE_CONFIGURATION_GENERATION_INVALID",
        "Configuration pointer does not reference matching committed authority."
      );
    }
    const integrity = await loadVerifiedConfigurationIntegrityAuthority({
      db: this.db,
      canonicalHome: this.canonicalHome,
      homeId: this.homeId
    });
    return verifyRuntimeConfigurationGeneration({
      canonicalHome: this.canonicalHome,
      generationId: pointer.generation_id,
      expectedHomeId: this.homeId,
      expectedPackageGenerationId: options.expectedPackageGenerationId,
      profileRegistry: options.profileRegistry,
      profileSelectionContext: options.profileSelectionContext,
      integrity,
      expectedManifestDigest: pointer.manifest_digest
    });
  }
}
