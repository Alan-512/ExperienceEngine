import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { arch, platform } from "node:os";
import { loadConfig } from "../config/load-config.js";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { readMachineIntegrityKey, hmacMachineIntegrityInput } from "../runtime/identity/integrity-key.js";
import { readRuntimeInstallAttestations } from "../runtime/package/install-attestation.js";
import { readCurrentPackageVersion } from "../version/package-version.js";
import {
  DIAGNOSTIC_COLLECTION_POLICY_VERSION,
  DIAGNOSTIC_ERROR_AGGREGATION_VERSION,
  DIAGNOSTIC_HMAC_PREFIX_LENGTH,
  DIAGNOSTIC_IDENTIFIER_PREFIX_LENGTH,
  DIAGNOSTIC_MANIFEST_SCHEMA_VERSION,
  DIAGNOSTIC_RETRYABILITY,
  DIAGNOSTIC_RUNTIME_ERROR_CODES,
  type DiagnosticWarningCode
} from "./constants.js";
import {
  LEARNING_FAILURE_CLASSES,
  LEARNING_FAILURE_CODES,
  LEARNING_FAILURE_SCOPES
} from "../runtime/learning-queue/constants.js";
import { RUNTIME_CONFIGURATION_CAPABILITIES } from "../runtime/configuration/constants.js";
import { RUNTIME_SCHEMA_VERSION_ORDER } from "../runtime/schema/constants.js";
import { assertSafeDiagnosticManifest, type SafeDiagnosticManifest } from "./contract.js";
import {
  diagnosticColumnExists,
  diagnosticTableExists,
  openExistingReadOnlyDatabase
} from "./read-only-database.js";

type DiagnosticHost = SafeDiagnosticManifest["environment"]["hosts"][number];

export type SafeDiagnosticCollectorOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  includeModelId?: boolean;
  now?: () => string;
  packageVersion?: string;
  hosts?: DiagnosticHost[];
};

type CountDefinition = {
  table: string;
  primaryColumn: string;
  primaryValues: readonly string[];
  secondaryColumn?: string;
  secondaryValues?: readonly string[];
  oldestColumn: string;
  newestColumn: string;
};

type DiagnosticErrorSource = {
  table: string;
  codeColumn: string;
  component: string;
  timestampColumn?: string;
  classColumn?: string;
  scopeColumn?: string;
  homeIdColumn?: string;
  packageGenerationColumn?: string;
  configurationGenerationColumn?: string;
  supervisorEpochColumn?: string;
  workerFencingColumn?: string;
  claimIdColumn?: string;
};

const COUNT_DEFINITIONS = {
  task_runs: {
    table: "task_runs",
    primaryColumn: "learning_status",
    primaryValues: ["captured", "rejected", "not_applicable"],
    secondaryColumn: "final_status",
    secondaryValues: ["success", "failure", "unknown"],
    oldestColumn: "created_at",
    newestColumn: "updated_at"
  },
  candidates: {
    table: "experience_candidates",
    primaryColumn: "lifecycle_state",
    primaryValues: ["pending", "distilled", "failed", "discarded"],
    oldestColumn: "created_at",
    newestColumn: "updated_at"
  },
  nodes: {
    table: "experience_nodes",
    primaryColumn: "state",
    primaryValues: ["candidate", "priority_candidate", "active", "cooling", "retired"],
    secondaryColumn: "delivery_state",
    secondaryValues: [
      "shadow_only",
      "conservative_only",
      "eligible",
      "quarantined",
      "shadow_probe",
      "retired"
    ],
    oldestColumn: "created_at",
    newestColumn: "updated_at"
  },
  queue: {
    table: "distillation_jobs",
    primaryColumn: "status",
    primaryValues: ["pending", "processing", "blocked", "failed", "succeeded", "discarded"],
    oldestColumn: "created_at",
    newestColumn: "updated_at"
  },
  attributions: {
    table: "attribution_records",
    primaryColumn: "attribution_verdict",
    primaryValues: ["strong_helped", "weak_helped", "neutral", "weak_harmed", "strong_harmed", "unknown"],
    oldestColumn: "created_at",
    newestColumn: "created_at"
  }
} satisfies Record<string, CountDefinition>;

const ERROR_SOURCES: readonly DiagnosticErrorSource[] = [
  {
    table: "experience_candidates",
    codeColumn: "failure_code",
    component: "candidate",
    timestampColumn: "updated_at",
    classColumn: "failure_class",
    scopeColumn: "failure_scope"
  },
  {
    table: "experience_candidates",
    codeColumn: "terminal_reason_code",
    component: "candidate_terminal",
    timestampColumn: "updated_at"
  },
  {
    table: "distillation_jobs",
    codeColumn: "failure_code",
    component: "distillation_queue",
    timestampColumn: "updated_at",
    classColumn: "failure_class",
    scopeColumn: "failure_scope",
    homeIdColumn: "home_id",
    packageGenerationColumn: "claimed_package_generation_id",
    configurationGenerationColumn: "claimed_configuration_generation_id",
    supervisorEpochColumn: "claimed_supervisor_lease_epoch",
    workerFencingColumn: "claim_fencing_token",
    claimIdColumn: "claim_id"
  },
  {
    table: "distillation_jobs",
    codeColumn: "terminal_reason_code",
    component: "distillation_terminal",
    timestampColumn: "updated_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "claimed_package_generation_id",
    configurationGenerationColumn: "claimed_configuration_generation_id",
    supervisorEpochColumn: "claimed_supervisor_lease_epoch",
    workerFencingColumn: "claim_fencing_token",
    claimIdColumn: "claim_id"
  },
  {
    table: "package_activation_state",
    codeColumn: "last_failure_code",
    component: "package_activation",
    timestampColumn: "updated_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "active_package_generation_id",
    supervisorEpochColumn: "updated_by_supervisor_lease_epoch"
  },
  {
    table: "supervisor_launch_state",
    codeColumn: "last_failure_code",
    component: "supervisor_launch",
    timestampColumn: "last_process_exit_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "package_generation_id"
  },
  {
    table: "supervisor_launch_attempts",
    codeColumn: "terminal_code",
    component: "supervisor_launch_attempt",
    timestampColumn: "terminal_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "package_generation_id",
    supervisorEpochColumn: "supervisor_lease_epoch"
  },
  {
    table: "supervisor_leases",
    codeColumn: "last_failure_code",
    component: "supervisor",
    timestampColumn: "heartbeat_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "package_generation_id",
    supervisorEpochColumn: "lease_epoch"
  },
  {
    table: "worker_leases",
    codeColumn: "last_failure_code",
    component: "worker",
    timestampColumn: "heartbeat_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "package_generation_id",
    supervisorEpochColumn: "supervisor_lease_epoch",
    workerFencingColumn: "fencing_token"
  },
  {
    table: "migration_state",
    codeColumn: "last_error_code",
    component: "migration",
    timestampColumn: "migration_heartbeat_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "migration_package_generation_id",
    supervisorEpochColumn: "migration_supervisor_lease_epoch",
    workerFencingColumn: "migration_fencing_token"
  },
  {
    table: "activation_handshakes",
    codeColumn: "failure_code",
    component: "activation_handshake",
    timestampColumn: "requested_at",
    homeIdColumn: "home_id",
    packageGenerationColumn: "plugin_package_generation_id",
    configurationGenerationColumn: "configuration_generation_id",
    supervisorEpochColumn: "supervisor_lease_epoch",
    workerFencingColumn: "worker_fencing_token"
  }
];

const STABLE_ERROR_CODES = new Set<string>([
  ...LEARNING_FAILURE_CODES,
  ...DIAGNOSTIC_RUNTIME_ERROR_CODES
]);
const STABLE_FAILURE_CLASSES = new Set<string>(LEARNING_FAILURE_CLASSES);
const STABLE_FAILURE_SCOPES = new Set<string>(LEARNING_FAILURE_SCOPES);
const PACKAGE_ACTIVATION_STATES = [
  "uninitialized",
  "preparing",
  "draining_old",
  "migrating",
  "preactivation_verifying",
  "production_activating",
  "active",
  "blocked"
] as const;
const SUPERVISOR_STATES = ["starting", "active", "draining", "backoff", "blocked", "stopped", "expired"] as const;
const WORKER_STATES = ["starting", "active", "draining", "blocked", "stopped"] as const;
const MIGRATION_STATUSES = ["idle", "preparing", "migrating", "verifying", "ready", "failed"] as const;

const emptyCounts = (): SafeDiagnosticManifest["counts"][keyof SafeDiagnosticManifest["counts"]] => ({
  total: 0,
  primary: {}
});

const emptyTimeRange = (): SafeDiagnosticManifest["time_ranges"][keyof SafeDiagnosticManifest["time_ranges"]] => ({
  oldest: null,
  newest: null
});

const prefix = (value: unknown, length = DIAGNOSTIC_IDENTIFIER_PREFIX_LENGTH): string | null =>
  typeof value === "string" && value.length > 0 ? value.slice(0, length) : null;

const integerOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

const stableEnumOrNull = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null => typeof value === "string" && allowed.includes(value as T) ? value as T : null;

const tableCount = (database: DatabaseSync, table: string): number => {
  if (!diagnosticTableExists(database, table)) return 0;
  const row = database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number };
  return Number(row.count);
};

const groupedCounts = (
  database: DatabaseSync,
  table: string,
  column: string,
  allowedValues: readonly string[]
): Record<string, number> => {
  const result = Object.fromEntries(allowedValues.map((value) => [value, 0])) as Record<string, number>;
  result.other = 0;
  if (!diagnosticColumnExists(database, table, column)) return result;
  const rows = database.prepare(
    `SELECT "${column}" AS value, COUNT(*) AS count FROM "${table}" GROUP BY "${column}"`
  ).all() as Array<{ value: string | null; count: number }>;
  const allowed = new Set(allowedValues);
  for (const row of rows) {
    const key = row.value && allowed.has(row.value) ? row.value : "other";
    result[key] += Number(row.count);
  }
  return result;
};

const collectCountAndRange = (
  database: DatabaseSync,
  definition: CountDefinition
): {
  counts: SafeDiagnosticManifest["counts"][keyof SafeDiagnosticManifest["counts"]];
  range: SafeDiagnosticManifest["time_ranges"][keyof SafeDiagnosticManifest["time_ranges"]];
} => {
  if (!diagnosticTableExists(database, definition.table)) {
    return { counts: emptyCounts(), range: emptyTimeRange() };
  }
  const counts = {
    total: tableCount(database, definition.table),
    primary: groupedCounts(database, definition.table, definition.primaryColumn, definition.primaryValues),
    ...(definition.secondaryColumn && definition.secondaryValues
      ? {
          secondary: groupedCounts(
            database,
            definition.table,
            definition.secondaryColumn,
            definition.secondaryValues
          )
        }
      : {})
  };
  const oldestAvailable = diagnosticColumnExists(database, definition.table, definition.oldestColumn);
  const newestAvailable = diagnosticColumnExists(database, definition.table, definition.newestColumn);
  const row = database.prepare(
    `SELECT ${oldestAvailable ? `MIN("${definition.oldestColumn}")` : "NULL"} AS oldest,
            ${newestAvailable ? `MAX("${definition.newestColumn}")` : "NULL"} AS newest
     FROM "${definition.table}"`
  ).get() as { oldest: string | null; newest: string | null };
  return {
    counts,
    range: { oldest: row.oldest ?? null, newest: row.newest ?? null }
  };
};

const selectExistingColumns = (
  database: DatabaseSync,
  source: DiagnosticErrorSource
): Array<{ alias: string; column: string }> => {
  const candidates = [
    ["error_code", source.codeColumn],
    ["failure_class", source.classColumn],
    ["failure_scope", source.scopeColumn],
    ["latest_timestamp", source.timestampColumn],
    ["home_id", source.homeIdColumn],
    ["package_generation_id", source.packageGenerationColumn],
    ["configuration_generation_id", source.configurationGenerationColumn],
    ["supervisor_lease_epoch", source.supervisorEpochColumn],
    ["worker_fencing_token", source.workerFencingColumn],
    ["claim_id", source.claimIdColumn]
  ] as const;
  const result: Array<{ alias: string; column: string }> = [];
  for (const [alias, column] of candidates) {
    if (typeof column !== "string") continue;
    if (!diagnosticColumnExists(database, source.table, column)) continue;
    result.push({ alias, column });
  }
  return result;
};

const collectErrors = (database: DatabaseSync): SafeDiagnosticManifest["errors"] => {
  const aggregated = new Map<string, SafeDiagnosticManifest["errors"][number]>();
  for (const source of ERROR_SOURCES) {
    if (!diagnosticTableExists(database, source.table) ||
        !diagnosticColumnExists(database, source.table, source.codeColumn)) {
      continue;
    }
    const columns = selectExistingColumns(database, source);
    const select = columns.map(({ alias, column }) => `"${column}" AS "${alias}"`).join(", ");
    const rows = database.prepare(
      `SELECT ${select} FROM "${source.table}" WHERE "${source.codeColumn}" IS NOT NULL`
    ).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const errorCode = typeof row.error_code === "string" && STABLE_ERROR_CODES.has(row.error_code)
        ? row.error_code
        : null;
      if (!errorCode) continue;
      const failureClass = typeof row.failure_class === "string" && STABLE_FAILURE_CLASSES.has(row.failure_class)
        ? row.failure_class
        : null;
      const failureScope = typeof row.failure_scope === "string" && STABLE_FAILURE_SCOPES.has(row.failure_scope)
        ? row.failure_scope
        : null;
      const key = [errorCode, source.component, failureClass ?? "", failureScope ?? ""].join("\0");
      const timestamp = typeof row.latest_timestamp === "string" ? row.latest_timestamp : null;
      const current = aggregated.get(key);
      if (!current) {
        aggregated.set(key, {
          error_code: errorCode,
          failure_class: failureClass,
          failure_scope: failureScope,
          component: source.component,
          latest_timestamp: timestamp,
          occurrence_count: 1,
          retryable: DIAGNOSTIC_RETRYABILITY[errorCode] ?? null,
          home_id_prefix: prefix(row.home_id),
          package_generation_id_prefix: prefix(row.package_generation_id),
          configuration_generation_id_prefix: prefix(row.configuration_generation_id),
          supervisor_lease_epoch: integerOrNull(row.supervisor_lease_epoch),
          worker_fencing_token: integerOrNull(row.worker_fencing_token),
          claim_id_prefix: prefix(row.claim_id)
        });
        continue;
      }
      current.occurrence_count += 1;
      if (timestamp && (!current.latest_timestamp || timestamp > current.latest_timestamp)) {
        current.latest_timestamp = timestamp;
      }
    }
  }
  return [...aggregated.values()]
    .sort((left, right) =>
      left.error_code.localeCompare(right.error_code) || left.component.localeCompare(right.component)
    )
    .slice(0, 200);
};

const collectDefaultHosts = (
  env: NodeJS.ProcessEnv,
  homeDir?: string
): DiagnosticHost[] => ([
  ["openclaw", "openclaw"],
  ["claude-code", "claude-code"],
  ["codex", "codex"],
  ["antigravity", "antigravity"]
] as const).map(([host, adapter]) => {
  const installStatePath = resolveExperienceEnginePaths({ adapter, env, homeDir }).installStatePath;
  const installed = existsSync(installStatePath);
  return {
    host,
    installed,
    wiring_state: installed ? "unavailable" : "missing",
    version: null
  };
});

const inspectIntegrity = (database: DatabaseSync): "passed" | "failed" => {
  const row = database.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
  const value = row ? Object.values(row)[0] : null;
  return value === "ok" ? "passed" : "failed";
};

const firstRow = (database: DatabaseSync, table: string): Record<string, unknown> | null => {
  if (!diagnosticTableExists(database, table)) return null;
  return (database.prepare(`SELECT * FROM "${table}" LIMIT 1`).get() as Record<string, unknown> | undefined) ?? null;
};

const deriveQueueState = (
  queue: SafeDiagnosticManifest["counts"]["queue"]
): SafeDiagnosticManifest["runtime"]["queue_state"] => {
  if (queue.total === 0) return "idle";
  if ((queue.primary.failed ?? 0) > 0) return "failed";
  if ((queue.primary.blocked ?? 0) > 0) return "blocked";
  if ((queue.primary.processing ?? 0) > 0 || (queue.primary.pending ?? 0) > 0) return "running";
  return "idle";
};

export const collectSafeDiagnosticManifest = async (
  options: SafeDiagnosticCollectorOptions = {}
): Promise<SafeDiagnosticManifest> => {
  const env = options.env ?? process.env;
  const paths = resolveExperienceEnginePaths({ adapter: "openclaw", env, homeDir: options.homeDir });
  const config = loadConfig({}, { env, homeDir: options.homeDir });
  const warnings = new Set<DiagnosticWarningCode>();
  let hosts: DiagnosticHost[];
  try {
    hosts = options.hosts ?? collectDefaultHosts(env, options.homeDir);
  } catch {
    warnings.add("EE_DIAGNOSTIC_HOST_INSPECTION_FAILED");
    hosts = [];
  }

  let integrityKey = null;
  try {
    integrityKey = await readMachineIntegrityKey(paths.activeHome);
  } catch {
    warnings.add("EE_DIAGNOSTIC_IDENTITY_UNAVAILABLE");
  }

  let distributionChannel: SafeDiagnosticManifest["product"]["distribution_channel"] = "unknown";
  if (integrityKey) {
    try {
      const attestations = await readRuntimeInstallAttestations({
        canonicalHome: paths.activeHome,
        integrityKey
      });
      distributionChannel = attestations
        .sort((left, right) => right.issued_at.localeCompare(left.issued_at))[0]?.install_origin ?? "unknown";
    } catch {
      warnings.add("EE_DIAGNOSTIC_INSTALL_ATTESTATION_UNAVAILABLE");
    }
  }

  const counts = {
    task_runs: emptyCounts(),
    candidates: emptyCounts(),
    nodes: emptyCounts(),
    queue: emptyCounts(),
    attributions: emptyCounts()
  } satisfies SafeDiagnosticManifest["counts"];
  const timeRanges = {
    task_runs: emptyTimeRange(),
    candidates: emptyTimeRange(),
    nodes: emptyTimeRange(),
    queue: emptyTimeRange(),
    attributions: emptyTimeRange()
  } satisfies SafeDiagnosticManifest["time_ranges"];

  let databasePresent = false;
  let integrity: SafeDiagnosticManifest["database"]["integrity"] = "unavailable";
  let errors: SafeDiagnosticManifest["errors"] = [];
  let runtimeControl: Record<string, unknown> | null = null;
  let activation: Record<string, unknown> | null = null;
  let configurationPointer: Record<string, unknown> | null = null;
  let supervisor: Record<string, unknown> | null = null;
  let worker: Record<string, unknown> | null = null;
  let migration: Record<string, unknown> | null = null;
  let database: DatabaseSync | null = null;
  try {
    database = openExistingReadOnlyDatabase(config.sqlitePath);
    if (!database) {
      warnings.add("EE_DIAGNOSTIC_DATABASE_UNAVAILABLE");
    } else {
      databasePresent = true;
      integrity = inspectIntegrity(database);
      for (const [key, definition] of Object.entries(COUNT_DEFINITIONS)) {
        const collected = collectCountAndRange(database, definition);
        counts[key as keyof typeof counts] = collected.counts;
        timeRanges[key as keyof typeof timeRanges] = collected.range;
      }
      errors = collectErrors(database);
      runtimeControl = firstRow(database, "runtime_control_meta");
      activation = firstRow(database, "package_activation_state");
      configurationPointer = firstRow(database, "configuration_pointer");
      supervisor = firstRow(database, "supervisor_leases");
      worker = firstRow(database, "worker_leases");
      migration = firstRow(database, "migration_state");
    }
  } catch {
    warnings.add("EE_DIAGNOSTIC_DATABASE_INSPECTION_FAILED");
    integrity = "unavailable";
  } finally {
    database?.close();
  }

  const anyInstalled = hosts.some((host) => host.installed);
  const anyReady = hosts.some((host) => host.wiring_state === "ready");
  const setupState: SafeDiagnosticManifest["setup"]["setup_state"] = databasePresent
    ? anyReady ? "ready" : "initialized"
    : anyInstalled ? "installed" : "not_initialized";
  const valueState: SafeDiagnosticManifest["setup"]["value_state"] = databasePresent
    ? counts.task_runs.total > 0 && counts.nodes.total > 0 ? "first_value_reached" : "warming_up"
    : "unavailable";

  const homePathFingerprint = integrityKey
    ? hmacMachineIntegrityInput(integrityKey, "diagnostic-identity-v1", paths.activeHome)
        .slice(0, DIAGNOSTIC_HMAC_PREFIX_LENGTH)
    : null;
  const exactModelId = options.includeModelId && config.distillerModel.trim().length > 0
    ? config.distillerModel
    : null;

  return assertSafeDiagnosticManifest({
    diagnostic_manifest_schema_version: DIAGNOSTIC_MANIFEST_SCHEMA_VERSION,
    collection_policy_version: DIAGNOSTIC_COLLECTION_POLICY_VERSION,
    error_aggregation_version: DIAGNOSTIC_ERROR_AGGREGATION_VERSION,
    generated_at: (options.now ?? (() => new Date().toISOString()))(),
    product: {
      package_name: "@alan512/experienceengine",
      package_version: options.packageVersion ?? readCurrentPackageVersion(),
      distribution_channel: distributionChannel
    },
    environment: {
      os_family: platform(),
      architecture: arch(),
      node_major_version: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10),
      hosts
    },
    setup: {
      setup_state: setupState,
      value_state: valueState,
      quality_profile: "unavailable",
      core_learning_quality: "unavailable",
      learning_health: "unavailable"
    },
    runtime: {
      home_id_prefix: prefix(runtimeControl?.home_id),
      home_path_fingerprint_prefix: homePathFingerprint,
      package_activation_state: stableEnumOrNull(activation?.activation_state, PACKAGE_ACTIVATION_STATES),
      package_activation_revision: integerOrNull(activation?.activation_revision),
      package_generation_id_prefix: prefix(activation?.active_package_generation_id),
      configuration_generation_id_prefix: prefix(configurationPointer?.generation_id),
      supervisor_state: stableEnumOrNull(supervisor?.state, SUPERVISOR_STATES),
      supervisor_lease_epoch: integerOrNull(supervisor?.lease_epoch),
      worker_state: stableEnumOrNull(worker?.state, WORKER_STATES),
      worker_fencing_token: integerOrNull(worker?.fencing_token),
      migration_status: stableEnumOrNull(migration?.migration_status, MIGRATION_STATUSES),
      schema_version: stableEnumOrNull(migration?.current_schema_version, RUNTIME_SCHEMA_VERSION_ORDER),
      queue_state: databasePresent ? deriveQueueState(counts.queue) : "unavailable"
    },
    capabilities: RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => ({
      capability,
      assurance: "unavailable" as const,
      route_classification: "unavailable" as const,
      health: "unavailable" as const
    })),
    provider: {
      family: config.distillerProvider,
      exact_model_id: exactModelId
    },
    database: {
      present: databasePresent,
      integrity,
      schema_version: stableEnumOrNull(migration?.current_schema_version, RUNTIME_SCHEMA_VERSION_ORDER),
      migration_status: stableEnumOrNull(migration?.migration_status, MIGRATION_STATUSES)
    },
    counts,
    time_ranges: timeRanges,
    errors,
    warnings: [...warnings].sort(),
    privacy: {
      raw_database_included: false,
      raw_content_included: false,
      absolute_paths_included: false,
      credentials_included: false,
      provider_payloads_included: false,
      exact_model_id_included: exactModelId !== null
    }
  });
};
