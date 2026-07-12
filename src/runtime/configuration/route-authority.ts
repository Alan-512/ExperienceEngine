import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { MachineIntegrityKey } from "../identity/types.js";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import {
  readWorkerLease
} from "../process/database.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import type {
  ExpectedSupervisorAuthority,
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  ROUTE_ENVELOPE_SCHEMA_VERSION,
  RUNTIME_CONFIGURATION_CAPABILITIES,
  RUNTIME_ROUTE_PROJECTION_AUTHORITY_VERSION,
  RUNTIME_ROUTE_PROJECTION_BACKUP_RELATIVE_PATH,
  RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH,
  RUNTIME_ROUTE_PROJECTION_SCHEMA_VERSION,
  SUPPORTED_ROUTE_OVERRIDE_KEYS,
  VALIDATION_STATE_SCHEMA_VERSION,
  WORKER_CAPABILITY_HEALTH_OBSERVATION_SCHEMA_VERSION
} from "./constants.js";
import { RuntimeConfigurationError } from "./errors.js";
import {
  fingerprintValidationIdentity
} from "./integrity.js";
import type {
  MutableRouteProjectionAuthorityProvider,
  PackagedProfileRegistry,
  RuntimeCapabilityRouteConfiguration,
  RuntimeCapabilityProjection,
  RuntimeConfigurationSecrets,
  RuntimeConfigurationSettings,
  RuntimeProfileSelectionContext,
  RuntimeRouteEnvelope,
  RuntimeRouteOverrideSnapshot,
  RuntimeRouteProjection,
  RuntimeValidationRecord,
  WorkerCapabilityHealthObservation
} from "./types.js";
import {
  assertExactConfigurationValidationState,
  deriveRouteIdentityFingerprints
} from "./validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertCanonicalIsoTimestamp = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${field} must be a canonical ISO timestamp.`
    );
  }
  let epochMs: number;
  try {
    epochMs = toProcessAuthorityEpochMs(value);
  } catch {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${field} must be a canonical ISO timestamp.`
    );
  }
  if (new Date(epochMs).toISOString() !== value) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${field} must use canonical UTC ISO representation.`
    );
  }
  return value;
};

const assertNonEmptyIdentity = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${field} must be a non-empty normalized identity.`
    );
  }
  return value;
};

const assertPositiveSafeInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${field} must be a positive safe integer.`
    );
  }
  return Number(value);
};

const activeProjectionWrites = new Set<string>();

const withProjectionWriteLock = async <T>(
  lockKey: string,
  operation: () => Promise<T>
): Promise<T> => {
  if (activeProjectionWrites.has(lockKey)) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      "Another current-supervisor route projection update is already in progress."
    );
  }
  activeProjectionWrites.add(lockKey);
  try {
    return await operation();
  } finally {
    activeProjectionWrites.delete(lockKey);
  }
};

const exactCapabilityKeys = (value: Record<string, unknown>): boolean => {
  const observed = Object.keys(value).sort();
  const expected = [...RUNTIME_CONFIGURATION_CAPABILITIES].sort();
  return canonicalJson(observed) === canonicalJson(expected);
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
};

export type RuntimeRouteResolutionWriter =
  | "package_local_initializer"
  | "supervisor"
  | "plugin"
  | "worker";

export const resolveEffectiveRuntimeConfigurationRoutes = (options: {
  writerKind: RuntimeRouteResolutionWriter;
  settings: RuntimeConfigurationSettings;
  overrideSnapshot: RuntimeRouteOverrideSnapshot;
  integrityKey: MachineIntegrityKey;
  resolveCapabilityRoute: (input: {
    capability: typeof RUNTIME_CONFIGURATION_CAPABILITIES[number];
    configured: RuntimeCapabilityRouteConfiguration;
    overrides: Readonly<Record<string, string>>;
  }) => RuntimeCapabilityRouteConfiguration;
}): RuntimeConfigurationSettings => {
  if (
    options.writerKind !== "package_local_initializer" &&
    options.writerKind !== "supervisor"
  ) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_PROJECTION_WRITE_FORBIDDEN",
      `${options.writerKind} cannot resolve effective runtime routes.`
    );
  }
  const observedOverrideKeys = Object.keys(options.overrideSnapshot.values).sort();
  if (
    observedOverrideKeys.some((key) =>
      !SUPPORTED_ROUTE_OVERRIDE_KEYS.includes(
        key as typeof SUPPORTED_ROUTE_OVERRIDE_KEYS[number]
      )
    ) ||
    Object.values(options.overrideSnapshot.values).some((value) =>
      !value || value.trim() !== value
    ) ||
    options.overrideSnapshot.fingerprint !== fingerprintValidationIdentity(
      options.integrityKey,
      canonicalJson(options.overrideSnapshot.values)
    )
  ) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      "Captured runtime route overrides are not allowlisted and integrity-bound."
    );
  }
  const overrides = Object.freeze({ ...options.overrideSnapshot.values });
  const capabilityRoutes = Object.fromEntries(
    RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => [
      capability,
      options.resolveCapabilityRoute({
        capability,
        configured: structuredClone(options.settings.capability_routes[capability]),
        overrides
      })
    ])
  ) as RuntimeConfigurationSettings["capability_routes"];
  if (!exactCapabilityKeys(capabilityRoutes)) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      "Effective runtime route resolution is not capability-exhaustive."
    );
  }
  return deepFreeze({
    ...structuredClone(options.settings),
    capability_routes: capabilityRoutes
  });
};

export const createSupportedRouteOverrideSnapshot = (options: {
  env: NodeJS.ProcessEnv;
  integrityKey: MachineIntegrityKey;
}): RuntimeRouteOverrideSnapshot => {
  const values: Record<string, string> = {};
  for (const key of SUPPORTED_ROUTE_OVERRIDE_KEYS) {
    const value = options.env[key]?.trim();
    if (value) {
      values[key] = value;
    }
  }
  return {
    values,
    fingerprint: fingerprintValidationIdentity(
      options.integrityKey,
      canonicalJson(values)
    )
  };
};

const normalizedRouteSetCapabilities = (options: {
  settings: RuntimeConfigurationSettings;
  secrets: RuntimeConfigurationSecrets;
  integrityKey: MachineIntegrityKey;
}): Record<string, unknown> => {
  if (!exactCapabilityKeys(options.settings.capability_routes)) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      "Configuration capability routes are not exhaustive."
    );
  }
  return Object.fromEntries(RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => {
    const configured = options.settings.capability_routes[capability];
    if (
      configured.enabled &&
      !configured.primary_route &&
      configured.fallback_routes.length === 0
    ) {
      throw new RuntimeConfigurationError(
        "EE_ROUTE_AUTHORITY_INVALID",
        `Enabled capability ${capability} has no configured route.`
      );
    }
    const primary = configured.primary_route
      ? deriveRouteIdentityFingerprints({
          capability,
          route: configured.primary_route,
          secrets: options.secrets,
          integrityKey: options.integrityKey
        })
      : null;
    const fallbacks = configured.fallback_routes.map((route) =>
      deriveRouteIdentityFingerprints({
        capability,
        route,
        secrets: options.secrets,
        integrityKey: options.integrityKey
      })
    );
    return [capability, {
      enabled: configured.enabled,
      required_for_production: configured.required_for_production,
      contract_version: configured.contract_version,
      primary_route_fingerprint: primary?.routeFingerprint ?? null,
      fallback_route_fingerprints: fallbacks.map((entry) => entry.routeFingerprint),
      fallback_trigger_codes: [...configured.fallback_trigger_codes]
    }];
  }));
};

export const computeEffectiveRouteSetId = (options: {
  homeId: string;
  configurationGenerationId: string;
  packageGenerationId: string;
  overrideSnapshotFingerprint: string;
  settings: RuntimeConfigurationSettings;
  secrets: RuntimeConfigurationSecrets;
  integrityKey: MachineIntegrityKey;
}): string => `routes_${sha256Text(canonicalJson({
  home_id: options.homeId,
  configuration_generation_id: options.configurationGenerationId,
  package_generation_id: options.packageGenerationId,
  override_snapshot_fingerprint: options.overrideSnapshotFingerprint,
  capabilities: normalizedRouteSetCapabilities(options)
}))}`;

export const createRuntimeRouteEnvelope = (options: {
  homeId: string;
  configurationGenerationId: string;
  packageGenerationId: string;
  overrideSnapshotFingerprint: string;
  settings: RuntimeConfigurationSettings;
  secrets: RuntimeConfigurationSecrets;
  validationRecords: readonly RuntimeValidationRecord[];
  profileRegistry: PackagedProfileRegistry;
  profileSelectionContext: RuntimeProfileSelectionContext;
  integrityKey: MachineIntegrityKey;
  createdAt: string;
}): RuntimeRouteEnvelope => {
  const effectiveRouteSetId = computeEffectiveRouteSetId(options);
  assertExactConfigurationValidationState({
    validationState: {
      validation_schema_version: VALIDATION_STATE_SCHEMA_VERSION,
      records: [...options.validationRecords]
    },
    settings: options.settings,
    secrets: options.secrets,
    profileRegistry: options.profileRegistry,
    integrityKey: options.integrityKey,
    homeId: options.homeId,
    packageGenerationId: options.packageGenerationId,
    configurationGenerationId: options.configurationGenerationId,
    effectiveRouteSetId,
    overrideSnapshotFingerprint: options.overrideSnapshotFingerprint,
    selectionMode: "existing_generation",
    profileSelectionContext: options.profileSelectionContext
  });
  const capabilities = Object.fromEntries(
    RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => {
      const configured = options.settings.capability_routes[capability];
      const routes = [
        ...(configured.primary_route ? [configured.primary_route] : []),
        ...configured.fallback_routes
      ];
      const identities = routes.map((route) => ({
        route,
        fingerprints: deriveRouteIdentityFingerprints({
          capability,
          route,
          secrets: options.secrets,
          integrityKey: options.integrityKey
        })
      }));
      const validationRecordIds: string[] = [];
      for (const identity of identities) {
        const records = options.validationRecords.filter((record) =>
          record.home_id === options.homeId &&
          record.configuration_generation_id === options.configurationGenerationId &&
          record.package_generation_id === options.packageGenerationId &&
          record.capability === capability &&
          record.route_id === identity.route.route_id &&
          record.route_fingerprint === identity.fingerprints.routeFingerprint &&
          record.effective_route_set_id === effectiveRouteSetId &&
          record.override_snapshot_fingerprint === options.overrideSnapshotFingerprint &&
          record.validation_status === "valid"
        );
        if (configured.enabled && records.length !== 1) {
          throw new RuntimeConfigurationError(
            "EE_ROUTE_AUTHORITY_INVALID",
            `Capability ${capability} route ${identity.route.route_id} lacks one exact valid record.`
          );
        }
        if (records[0]) {
          validationRecordIds.push(records[0].validation_record_id);
        }
      }
      const primary = identities[0];
      return [capability, {
        enabled: configured.enabled,
        primary_route_fingerprint: configured.primary_route
          ? primary?.fingerprints.routeFingerprint ?? null
          : null,
        ordered_fallback_route_fingerprints: identities
          .slice(configured.primary_route ? 1 : 0)
          .map((entry) => entry.fingerprints.routeFingerprint),
        contract_version: configured.contract_version,
        validation_record_ids: validationRecordIds,
        auth_identity_fingerprint: primary?.fingerprints.authIdentityFingerprint ??
          identities[0]?.fingerprints.authIdentityFingerprint ?? null
      }];
    })
  ) as RuntimeRouteEnvelope["capabilities"];
  return deepFreeze({
    route_envelope_schema_version: ROUTE_ENVELOPE_SCHEMA_VERSION,
    home_id: options.homeId,
    configuration_generation_id: options.configurationGenerationId,
    package_generation_id: options.packageGenerationId,
    effective_route_set_id: effectiveRouteSetId,
    override_snapshot_fingerprint: options.overrideSnapshotFingerprint,
    capabilities,
    created_at: options.createdAt
  });
};

export const consumeRuntimeRouteEnvelope = (options: {
  envelope: RuntimeRouteEnvelope;
  expectedHomeId: string;
  expectedConfigurationGenerationId: string;
  expectedPackageGenerationId: string;
  expectedEffectiveRouteSetId: string;
}): RuntimeRouteEnvelope => {
  if (
    options.envelope.route_envelope_schema_version !== ROUTE_ENVELOPE_SCHEMA_VERSION ||
    options.envelope.home_id !== options.expectedHomeId ||
    options.envelope.configuration_generation_id !==
      options.expectedConfigurationGenerationId ||
    options.envelope.package_generation_id !== options.expectedPackageGenerationId ||
    options.envelope.effective_route_set_id !== options.expectedEffectiveRouteSetId ||
    !exactCapabilityKeys(options.envelope.capabilities)
  ) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      "Worker route envelope does not match supervisor-provided current authority."
    );
  }
  return deepFreeze(JSON.parse(JSON.stringify(options.envelope)) as RuntimeRouteEnvelope);
};

const emptyCapabilityProjection = (checkedAt: string): RuntimeCapabilityProjection => ({
  capability_revision: 0,
  active_route_id: null,
  active_route_kind: "none",
  runtime_health: "unknown_warming",
  failure_code: "EE_ROUTE_PROJECTION_UNAVAILABLE",
  checked_at: checkedAt
});

const emptyCapabilityProjectionSet = (
  checkedAt: string
): RuntimeRouteProjection["capabilities"] => ({
  learning_gate: emptyCapabilityProjection(checkedAt),
  distillation: emptyCapabilityProjection(checkedAt),
  embedding: emptyCapabilityProjection(checkedAt),
  sync_second_opinion: emptyCapabilityProjection(checkedAt),
  hybrid_postmortem: emptyCapabilityProjection(checkedAt)
});

const assertCapabilityRuntimeState = (options: {
  value: unknown;
  field: string;
  requireRevision: boolean;
}): {
  capabilityRevision?: number;
  activeRouteId: string | null;
  activeRouteKind: RuntimeCapabilityProjection["active_route_kind"];
  runtimeHealth: RuntimeCapabilityProjection["runtime_health"];
  failureCode: string | null;
  checkedAt: string;
} => {
  if (!isRecord(options.value)) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${options.field} must be an object.`
    );
  }
  const value = options.value;
  const capabilityRevision = options.requireRevision
    ? assertPositiveSafeInteger(value.capability_revision, `${options.field}.capability_revision`)
    : undefined;
  const activeRouteId = value.active_route_id === null
    ? null
    : assertNonEmptyIdentity(value.active_route_id, `${options.field}.active_route_id`);
  if (![
    "primary",
    "fallback",
    "none"
  ].includes(String(value.active_route_kind))) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${options.field}.active_route_kind is invalid.`
    );
  }
  const activeRouteKind = value.active_route_kind as RuntimeCapabilityProjection["active_route_kind"];
  if (![
    "healthy",
    "degraded_fallback",
    "blocked",
    "disabled",
    "unknown_warming"
  ].includes(String(value.runtime_health))) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${options.field}.runtime_health is invalid.`
    );
  }
  const runtimeHealth = value.runtime_health as RuntimeCapabilityProjection["runtime_health"];
  const failureCode = value.failure_code === null
    ? null
    : assertNonEmptyIdentity(value.failure_code, `${options.field}.failure_code`);
  const checkedAt = assertCanonicalIsoTimestamp(
    value.checked_at,
    `${options.field}.checked_at`
  );
  if (
    (activeRouteKind === "none") !== (activeRouteId === null) ||
    (runtimeHealth === "healthy" && (activeRouteKind !== "primary" || failureCode !== null)) ||
    (runtimeHealth === "degraded_fallback" && activeRouteKind !== "fallback") ||
    (runtimeHealth === "disabled" && (activeRouteKind !== "none" || failureCode !== null))
  ) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      `${options.field} contains a logically inconsistent route-health state.`
    );
  }
  return {
    capabilityRevision,
    activeRouteId,
    activeRouteKind,
    runtimeHealth,
    failureCode,
    checkedAt
  };
};

const parseProjection = (value: unknown): RuntimeRouteProjection => {
  if (
    !isRecord(value) ||
    value.projection_schema_version !== RUNTIME_ROUTE_PROJECTION_SCHEMA_VERSION ||
    !isRecord(value.capabilities) ||
    !exactCapabilityKeys(value.capabilities)
  ) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      "Runtime route projection shape is invalid."
    );
  }
  assertPositiveSafeInteger(value.projection_revision, "projection_revision");
  assertNonEmptyIdentity(value.home_id, "home_id");
  assertNonEmptyIdentity(value.configuration_generation_id, "configuration_generation_id");
  assertNonEmptyIdentity(value.package_generation_id, "package_generation_id");
  assertNonEmptyIdentity(value.effective_route_set_id, "effective_route_set_id");
  assertNonEmptyIdentity(value.supervisor_owner_id, "supervisor_owner_id");
  assertPositiveSafeInteger(value.supervisor_lease_epoch, "supervisor_lease_epoch");
  assertNonEmptyIdentity(value.worker_owner_id, "worker_owner_id");
  assertPositiveSafeInteger(value.worker_fencing_token, "worker_fencing_token");
  assertNonEmptyIdentity(value.writer_instance_id, "writer_instance_id");
  assertCanonicalIsoTimestamp(value.written_at, "written_at");
  for (const capability of RUNTIME_CONFIGURATION_CAPABILITIES) {
    assertCapabilityRuntimeState({
      value: value.capabilities[capability],
      field: `capabilities.${capability}`,
      requireRevision: true
    });
  }
  return value as unknown as RuntimeRouteProjection;
};

type ProjectionFileRead = {
  status: "valid" | "missing" | "invalid";
  projection: RuntimeRouteProjection | null;
};

const readProjectionFile = async (path: string): Promise<ProjectionFileRead> => {
  try {
    return {
      status: "valid",
      projection: parseProjection(JSON.parse(await readFile(path, "utf8")))
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing", projection: null };
    }
    if (error instanceof Error) {
      return { status: "invalid", projection: null };
    }
    throw error;
  }
};

const assertWorkerObservation = (
  observation: WorkerCapabilityHealthObservation
): void => {
  if (
    observation.observation_schema_version !==
      WORKER_CAPABILITY_HEALTH_OBSERVATION_SCHEMA_VERSION ||
    !exactCapabilityKeys(observation.capabilities)
  ) {
    throw new RuntimeConfigurationError(
      "EE_ROUTE_AUTHORITY_INVALID",
      "Worker route-health observation shape is invalid."
    );
  }
  assertNonEmptyIdentity(observation.home_id, "observation.home_id");
  assertNonEmptyIdentity(
    observation.configuration_generation_id,
    "observation.configuration_generation_id"
  );
  assertNonEmptyIdentity(
    observation.package_generation_id,
    "observation.package_generation_id"
  );
  assertNonEmptyIdentity(
    observation.effective_route_set_id,
    "observation.effective_route_set_id"
  );
  assertNonEmptyIdentity(observation.worker_owner_id, "observation.worker_owner_id");
  assertPositiveSafeInteger(
    observation.worker_fencing_token,
    "observation.worker_fencing_token"
  );
  assertNonEmptyIdentity(observation.schema_version, "observation.schema_version");
  const observedAt = assertCanonicalIsoTimestamp(
    observation.observed_at,
    "observation.observed_at"
  );
  const observedAtEpoch = toProcessAuthorityEpochMs(observedAt);
  for (const capability of RUNTIME_CONFIGURATION_CAPABILITIES) {
    const state = assertCapabilityRuntimeState({
      value: observation.capabilities[capability],
      field: `observation.capabilities.${capability}`,
      requireRevision: false
    });
    if (toProcessAuthorityEpochMs(state.checkedAt) > observedAtEpoch) {
      throw new RuntimeConfigurationError(
        "EE_ROUTE_AUTHORITY_INVALID",
        `Worker capability ${capability} was checked after its observation timestamp.`
      );
    }
  }
};

export type RuntimeRouteProjectionReadResult = {
  status: "current" | "missing" | "invalid" | "authority_mismatch";
  projection: RuntimeRouteProjection | null;
  capabilities: RuntimeRouteProjection["capabilities"];
  recoveryRevision: number;
};

export const readRuntimeRouteProjection = async (options: {
  canonicalHome: string;
  expected?: {
    homeId: string;
    configurationGenerationId: string;
    packageGenerationId: string;
    effectiveRouteSetId: string;
    supervisorOwnerId?: string;
    supervisorLeaseEpoch?: number;
    workerOwnerId?: string;
    workerFencingToken?: number;
  };
  now?: string;
}): Promise<RuntimeRouteProjectionReadResult> => {
  const currentPath = join(
    options.canonicalHome,
    ...RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH.split("/")
  );
  const backupPath = join(
    options.canonicalHome,
    ...RUNTIME_ROUTE_PROJECTION_BACKUP_RELATIVE_PATH.split("/")
  );
  const [current, backup] = await Promise.all([
    readProjectionFile(currentPath),
    readProjectionFile(backupPath)
  ]);
  const recoveryRevision = Math.max(
    current.projection?.projection_revision ?? 0,
    backup.projection?.projection_revision ?? 0
  );
  if (!current.projection) {
    return {
      status: current.status === "invalid" || recoveryRevision > 0 ? "invalid" : "missing",
      projection: null,
      capabilities: emptyCapabilityProjectionSet(options.now ?? new Date().toISOString()),
      recoveryRevision
    };
  }
  const expected = options.expected;
  if (
    expected &&
    (
      current.projection.home_id !== expected.homeId ||
      current.projection.configuration_generation_id !== expected.configurationGenerationId ||
      current.projection.package_generation_id !== expected.packageGenerationId ||
      current.projection.effective_route_set_id !== expected.effectiveRouteSetId ||
      (
        expected.supervisorOwnerId !== undefined &&
        current.projection.supervisor_owner_id !== expected.supervisorOwnerId
      ) ||
      (
        expected.supervisorLeaseEpoch !== undefined &&
        current.projection.supervisor_lease_epoch !== expected.supervisorLeaseEpoch
      ) ||
      (
        expected.workerOwnerId !== undefined &&
        current.projection.worker_owner_id !== expected.workerOwnerId
      ) ||
      (
        expected.workerFencingToken !== undefined &&
        current.projection.worker_fencing_token !== expected.workerFencingToken
      )
    )
  ) {
    return {
      status: "authority_mismatch",
      projection: null,
      capabilities: emptyCapabilityProjectionSet(options.now ?? new Date().toISOString()),
      recoveryRevision
    };
  }
  return {
    status: "current",
    projection: current.projection,
    capabilities: current.projection.capabilities,
    recoveryRevision
  };
};

const writeAtomicProjection = async (options: {
  canonicalHome: string;
  projection: RuntimeRouteProjection;
}): Promise<void> => {
  const currentPath = join(
    options.canonicalHome,
    ...RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH.split("/")
  );
  const backupPath = join(
    options.canonicalHome,
    ...RUNTIME_ROUTE_PROJECTION_BACKUP_RELATIVE_PATH.split("/")
  );
  const directory = dirname(currentPath);
  const tempPath = `${currentPath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await open(tempPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(options.projection, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await copyFile(currentPath, backupPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await rm(tempPath, { force: true });
      throw error;
    }
  }
  try {
    await rename(tempPath, currentPath);
    await syncDirectoryWhereSupported(directory);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
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

export const UNAVAILABLE_MUTABLE_ROUTE_PROJECTION_AUTHORITY_PROVIDER:
MutableRouteProjectionAuthorityProvider = Object.freeze({
  getMutableRouteProjectionAuthorityInTransaction() {
    return {
      available: false,
      fresh: false,
      authority_contract_version: RUNTIME_ROUTE_PROJECTION_AUTHORITY_VERSION,
      reason: "authority_provider_unavailable"
    };
  }
});

export class RuntimeRouteProjectionRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly canonicalHome: string,
    private readonly homeId: string,
    private readonly clock: RuntimeProcessAuthorityClock = SYSTEM_PROCESS_AUTHORITY_CLOCK
  ) {}

  read(options: Parameters<typeof readRuntimeRouteProjection>[0]["expected"] = undefined) {
    return readRuntimeRouteProjection({
      canonicalHome: this.canonicalHome,
      expected: options
    });
  }

  async replaceFromWorkerObservation(options: {
    writerKind: "supervisor" | "plugin" | "worker";
    writerInstanceId: string;
    expectedProjectionRevision: number;
    expectedSupervisor: ExpectedSupervisorAuthority;
    envelope: RuntimeRouteEnvelope;
    observation: WorkerCapabilityHealthObservation;
    authorityProvider?: MutableRouteProjectionAuthorityProvider;
  }): Promise<RuntimeRouteProjection> {
    const lockKey = join(
      this.canonicalHome,
      ...RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH.split("/")
    );
    return withProjectionWriteLock(lockKey, () =>
      this.replaceFromWorkerObservationUnlocked(options)
    );
  }

  private async replaceFromWorkerObservationUnlocked(options: {
    writerKind: "supervisor" | "plugin" | "worker";
    writerInstanceId: string;
    expectedProjectionRevision: number;
    expectedSupervisor: ExpectedSupervisorAuthority;
    envelope: RuntimeRouteEnvelope;
    observation: WorkerCapabilityHealthObservation;
    authorityProvider?: MutableRouteProjectionAuthorityProvider;
  }): Promise<RuntimeRouteProjection> {
    if (options.writerKind !== "supervisor") {
      throw new RuntimeConfigurationError(
        "EE_ROUTE_PROJECTION_WRITE_FORBIDDEN",
        `${options.writerKind} cannot persist runtime route projection.`
      );
    }
    assertNonEmptyIdentity(options.writerInstanceId, "writerInstanceId");
    assertPositiveSafeInteger(
      options.expectedProjectionRevision + 1,
      "nextProjectionRevision"
    );
    assertWorkerObservation(options.observation);
    if (
      options.envelope.home_id !== this.homeId ||
      options.observation.home_id !== this.homeId ||
      options.observation.configuration_generation_id !==
        options.envelope.configuration_generation_id ||
      options.observation.package_generation_id !== options.envelope.package_generation_id ||
      options.observation.effective_route_set_id !== options.envelope.effective_route_set_id ||
      !exactCapabilityKeys(options.observation.capabilities)
    ) {
      throw new RuntimeConfigurationError(
        "EE_ROUTE_AUTHORITY_INVALID",
        "Worker route-health observation does not match the immutable route envelope."
      );
    }
    const existing = await readRuntimeRouteProjection({
      canonicalHome: this.canonicalHome
    });
    if (existing.recoveryRevision !== options.expectedProjectionRevision) {
      throw new RuntimeConfigurationError(
        "EE_ROUTE_AUTHORITY_INVALID",
        `Runtime route projection revision changed from expected ${options.expectedProjectionRevision}.`
      );
    }
    const authorityProvider = options.authorityProvider ??
      UNAVAILABLE_MUTABLE_ROUTE_PROJECTION_AUTHORITY_PROVIDER;
    const authorityObservedAt = runRuntimeImmediateTransaction(this.db, {
      category: "configuration_commit",
      operation: () => {
        const observedAt = this.clock.captureObservedNowInTransaction(this.db);
        const supervisor = evaluateFreshSupervisorAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          observedAt
        });
        if (
          !supervisor.available ||
          !supervisor.fresh ||
          supervisor.supervisor_owner_id !== options.expectedSupervisor.owner_id ||
          supervisor.supervisor_owner_process_id !== options.expectedSupervisor.owner_process_id ||
          supervisor.supervisor_owner_process_start_token !==
            options.expectedSupervisor.owner_process_start_token ||
          supervisor.supervisor_lease_epoch !== options.expectedSupervisor.lease_epoch ||
          supervisor.supervisor_lease_state_revision !==
            options.expectedSupervisor.lease_state_revision ||
          supervisor.package_generation_id !== options.envelope.package_generation_id
        ) {
          throw new RuntimeConfigurationError(
            "EE_ROUTE_AUTHORITY_INVALID",
            "Runtime route projection writer is not the current fresh supervisor."
          );
        }
        const worker = readWorkerLease(this.db, this.homeId);
        if (
          !worker ||
          worker.owner_id !== options.observation.worker_owner_id ||
          worker.fencing_token !== options.observation.worker_fencing_token ||
          worker.supervisor_owner_id !== options.expectedSupervisor.owner_id ||
          worker.supervisor_lease_epoch !== options.expectedSupervisor.lease_epoch ||
          worker.package_generation_id !== options.envelope.package_generation_id ||
          worker.schema_version !== options.observation.schema_version ||
          worker.state !== "active" ||
          toProcessAuthorityEpochMs(options.observation.observed_at) >
            toProcessAuthorityEpochMs(observedAt) ||
          toProcessAuthorityEpochMs(worker.expires_at) <= toProcessAuthorityEpochMs(observedAt)
        ) {
          throw new RuntimeConfigurationError(
            "EE_ROUTE_AUTHORITY_INVALID",
            "Worker route-health observation is stale or incorrectly fenced."
          );
        }
        const authority = authorityProvider.getMutableRouteProjectionAuthorityInTransaction({
          db: this.db,
          homeId: this.homeId,
          configurationGenerationId: options.envelope.configuration_generation_id,
          packageGenerationId: options.envelope.package_generation_id,
          effectiveRouteSetId: options.envelope.effective_route_set_id,
          supervisorOwnerId: options.expectedSupervisor.owner_id,
          supervisorLeaseEpoch: options.expectedSupervisor.lease_epoch,
          workerOwnerId: worker.owner_id,
          workerFencingToken: worker.fencing_token,
          schemaVersion: worker.schema_version
        });
        if (
          !authority.available ||
          !authority.fresh ||
          authority.authority_contract_version !==
            RUNTIME_ROUTE_PROJECTION_AUTHORITY_VERSION ||
          authority.operation !== "mutable_route_projection" ||
          authority.home_id !== this.homeId ||
          authority.configuration_generation_id !==
            options.envelope.configuration_generation_id ||
          authority.package_generation_id !== options.envelope.package_generation_id ||
          authority.effective_route_set_id !== options.envelope.effective_route_set_id ||
          authority.supervisor_owner_id !== options.expectedSupervisor.owner_id ||
          authority.supervisor_lease_epoch !== options.expectedSupervisor.lease_epoch ||
          authority.worker_owner_id !== worker.owner_id ||
          authority.worker_fencing_token !== worker.fencing_token ||
          authority.schema_version !== worker.schema_version ||
          toProcessAuthorityEpochMs(authority.observed_at) > toProcessAuthorityEpochMs(observedAt) ||
          toProcessAuthorityEpochMs(authority.expires_at) <= toProcessAuthorityEpochMs(observedAt)
        ) {
          throw new RuntimeConfigurationError(
            "EE_ROUTE_PROJECTION_AUTHORITY_UNAVAILABLE",
            "S6 production authority does not authorize mutable route projection."
          );
        }
        return observedAt;
      }
    });
    const previous = existing.projection;
    const capabilities = Object.fromEntries(
      RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => {
        const observation = options.observation.capabilities[capability];
        return [capability, {
          capability_revision:
            Math.max(
              previous?.capabilities[capability].capability_revision ?? 0,
              existing.recoveryRevision
            ) + 1,
          active_route_id: observation.active_route_id,
          active_route_kind: observation.active_route_kind,
          runtime_health: observation.runtime_health,
          failure_code: observation.failure_code,
          checked_at: observation.checked_at
        }];
      })
    ) as RuntimeRouteProjection["capabilities"];
    const projection: RuntimeRouteProjection = {
      projection_schema_version: RUNTIME_ROUTE_PROJECTION_SCHEMA_VERSION,
      projection_revision: options.expectedProjectionRevision + 1,
      home_id: this.homeId,
      configuration_generation_id: options.envelope.configuration_generation_id,
      package_generation_id: options.envelope.package_generation_id,
      effective_route_set_id: options.envelope.effective_route_set_id,
      supervisor_owner_id: options.expectedSupervisor.owner_id,
      supervisor_lease_epoch: options.expectedSupervisor.lease_epoch,
      worker_owner_id: options.observation.worker_owner_id,
      worker_fencing_token: options.observation.worker_fencing_token,
      writer_instance_id: options.writerInstanceId,
      written_at: authorityObservedAt,
      capabilities
    };
    await writeAtomicProjection({
      canonicalHome: this.canonicalHome,
      projection
    });
    return projection;
  }
}
