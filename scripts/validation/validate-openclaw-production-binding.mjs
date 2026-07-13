import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  bindInstalledOpenClawProductionRuntime,
  deriveOpenClawInstallRecordIdentity
} from "../../dist/plugin/openclaw-production-runtime.js";
import { defaultConfig } from "../../dist/config/default-config.js";
import {
  RUNTIME_CONFIGURATION_CAPABILITIES,
  CONFIGURATION_SECRETS_SCHEMA_VERSION,
  CONFIGURATION_SETTINGS_SCHEMA_VERSION,
  VALIDATION_STATE_SCHEMA_VERSION
} from "../../dist/runtime/configuration/constants.js";
import {
  RuntimeConfigurationGenerationRepository
} from "../../dist/runtime/configuration/generation.js";
import {
  computeEffectiveRouteSetId,
  createSupportedRouteOverrideSnapshot
} from "../../dist/runtime/configuration/route-authority.js";
import {
  loadPackagedProfileRegistry
} from "../../dist/runtime/configuration/registry.js";
import {
  createCapabilityValidationRecord
} from "../../dist/runtime/configuration/validation.js";
import {
  RUNTIME_CONTROL_SCHEMA_VERSION
} from "../../dist/runtime/identity/constants.js";
import {
  initializeRuntimeHomeIdentity
} from "../../dist/runtime/identity/control-plane-bootstrap.js";
import {
  RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH,
  assertRuntimeClosureManifest,
  createRuntimeClosureManifest
} from "../../dist/runtime/package/closure-manifest.js";
import {
  createRuntimePackageGenerationIdentity
} from "../../dist/runtime/package/package-generation.js";
import {
  RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
  RUNTIME_WORKER_PROTOCOL_VERSION
} from "../../dist/runtime/process/constants.js";
import {
  configureRuntimeSqlitePolicy
} from "../../dist/runtime/schema/sqlite-policy.js";
import {
  RUNTIME_SCHEMA_VERSION_ORDER
} from "../../dist/runtime/schema/constants.js";
import { bootstrapDatabase } from "../../dist/store/sqlite/db.js";

const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const packageJson = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8")
);
const temporaryRoot = await mkdtemp(
  join(tmpdir(), "ee-openclaw-production-binding-")
);
const productHome = join(temporaryRoot, "product-home");
const runtimeHome = join(temporaryRoot, "runtime-home");
const stateDir = join(temporaryRoot, "openclaw-state");
const sqlitePath = join(runtimeHome, "sqlite", "experienceengine.db");
const captureDir = join(runtimeHome, "captures");
const installStatePath = join(
  productHome,
  "adapters",
  "openclaw",
  "install.json"
);
const originalProductHome = process.env.EXPERIENCE_ENGINE_HOME;
const waitTimeoutMs = 45_000;

const sleep = (milliseconds) => new Promise((resolveSleep) =>
  setTimeout(resolveSleep, milliseconds)
);

const waitForRow = async (db, query, predicate, label) => {
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    const row = query(db);
    if (row && predicate(row)) {
      return row;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
};

const processExists = (processId) => {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
};

const waitForProcessExit = async (processId, label) => {
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    if (!processExists(processId)) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label} process ${processId} to exit.`);
};

const assertNonEmpty = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required by the local-pack validation gate.`);
  }
  return value;
};

const profileSelectionContext = (packageIdentity) => ({
  currentEeVersion: packageIdentity.package_version,
  nodeVersion: process.versions.node,
  platform: process.platform,
  architecture: process.arch,
  hostApiVersion: "2026.4.1",
  gatewayVersion: "2026.4.1"
});

const createConfiguredRoute = ({
  capability,
  profileEntry,
  secretRef
}) => {
  const capabilityContract = profileEntry.capability_contracts[capability];
  const routeSpec = profileEntry.route_specs[capabilityContract.route_spec_id];
  if (!routeSpec) {
    throw new Error(`Missing packaged route spec for ${capability}.`);
  }
  const authMode = routeSpec.auth_modes.includes("api_key")
    ? "api_key"
    : routeSpec.auth_modes[0];
  return {
    route_id: `${capability}-local-pack-primary`,
    provider_family: routeSpec.provider_family,
    model_or_deployment_identity: `${capability}-local-pack-deployment`,
    endpoint_identity: `https://local-pack-validation.invalid/${capability}`,
    auth_mode: authMode,
    secret_refs: authMode === "api_key" ? [secretRef] : [],
    provider_adapter_version: routeSpec.provider_adapter_version,
    request_schema_version: `${capability}-request-v1`,
    response_schema_version: `${capability}-response-v1`
  };
};

const publishCurrentConfiguration = async ({
  installState,
  observedAt
}) => {
  const initialized = await initializeRuntimeHomeIdentity({
    writer: "package_local_initializer",
    explicitOpenClawHome: runtimeHome,
    now: () => new Date(observedAt)
  });
  const closure = assertRuntimeClosureManifest(packageRoot);
  const closureManifestDigest = assertNonEmpty(
    closure.closureManifestDigest,
    "closure manifest digest"
  );
  const packageBuildId = assertNonEmpty(
    closure.packageBuildId,
    "package build id"
  );
  const manifest = createRuntimeClosureManifest(packageRoot);
  const packageIdentity = createRuntimePackageGenerationIdentity({
    manifest,
    artifactIntegrity: `sha256:${closureManifestDigest}`,
    installRecordIdentity: deriveOpenClawInstallRecordIdentity({
      installState,
      packageRoot,
      stateDir,
      closureManifestDigest,
      packageBuildId
    }),
    publishedChannel: "local_test",
    compatibility: {
      supervisor_protocol_version: RUNTIME_SUPERVISOR_PROTOCOL_VERSION,
      worker_protocol_version: RUNTIME_WORKER_PROTOCOL_VERSION,
      control_protocol_version: RUNTIME_CONTROL_SCHEMA_VERSION,
      min_read_schema_version: RUNTIME_SCHEMA_VERSION_ORDER[0],
      max_read_schema_version:
        RUNTIME_SCHEMA_VERSION_ORDER[RUNTIME_SCHEMA_VERSION_ORDER.length - 1],
      min_write_schema_version: RUNTIME_SCHEMA_VERSION_ORDER[0],
      max_write_schema_version:
        RUNTIME_SCHEMA_VERSION_ORDER[RUNTIME_SCHEMA_VERSION_ORDER.length - 1],
      target_schema_version: RUNTIME_SCHEMA_VERSION_ORDER[0]
    }
  });
  const profileRegistry = loadPackagedProfileRegistry({
    path: join(
      packageRoot,
      ...RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH.split("/")
    ),
    expectedPackageName: packageIdentity.package_name,
    expectedPackageVersion: packageIdentity.package_version,
    expectedPackageBuildId: packageBuildId
  });
  if (profileRegistry.registry_digest !== packageIdentity.profile_registry_digest) {
    throw new Error("Packaged profile registry does not match local-pack identity.");
  }
  const profileEntry = profileRegistry.entries.find((entry) =>
    entry.entry_status === "active" && entry.quality_profile === "custom"
  );
  if (!profileEntry) {
    throw new Error("Local-pack validation requires one active custom profile entry.");
  }
  const secretRefs = {
    learning_gate: "EE_LOCAL_PACK_LEARNING_GATE_KEY",
    distillation: "EE_LOCAL_PACK_DISTILLATION_KEY",
    embedding: "EE_LOCAL_PACK_EMBEDDING_KEY"
  };
  const requiredCapabilities = [
    "learning_gate",
    "distillation",
    "embedding"
  ];
  const routes = Object.fromEntries(requiredCapabilities.map((capability) => [
    capability,
    createConfiguredRoute({
      capability,
      profileEntry,
      secretRef: secretRefs[capability]
    })
  ]));
  const settings = {
    settings_schema_version: CONFIGURATION_SETTINGS_SCHEMA_VERSION,
    quality_profile: profileEntry.quality_profile,
    profile_id: profileEntry.profile_id,
    profile_version: profileEntry.profile_version,
    custom_profile_acknowledged: true,
    legacy_rule_mode: {
      enabled: false,
      label: "legacy_rule_compatibility"
    },
    capability_routes: Object.fromEntries(
      RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => {
        const contract = profileEntry.capability_contracts[capability];
        const route = routes[capability] ?? null;
        return [capability, {
          enabled: Boolean(route),
          required_for_production: contract.required_for_production,
          contract_version: contract.contract_version,
          primary_route: route,
          fallback_routes: [],
          fallback_trigger_codes: []
        }];
      })
    )
  };
  const secrets = {
    secrets_schema_version: CONFIGURATION_SECRETS_SCHEMA_VERSION,
    values: Object.fromEntries(requiredCapabilities.map((capability) => [
      secretRefs[capability],
      `local-pack-validation-${capability}`
    ]))
  };
  const overrideSnapshot = createSupportedRouteOverrideSnapshot({
    env: {},
    integrityKey: initialized.integrityKey
  });
  const generationId = `config_local_pack_${Date.now()}`;
  const selectionContext = profileSelectionContext(packageIdentity);
  const effectiveRouteSetId = computeEffectiveRouteSetId({
    homeId: initialized.homeIdentity.home_id,
    configurationGenerationId: generationId,
    packageGenerationId: packageIdentity.package_generation_id,
    overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
    settings,
    secrets,
    integrityKey: initialized.integrityKey
  });
  const validationRecords = requiredCapabilities.map((capability) => {
    const route = routes[capability];
    return createCapabilityValidationRecord({
      validationRecordId: `validation-local-pack-${capability}`,
      configurationGenerationId: generationId,
      homeId: initialized.homeIdentity.home_id,
      packageGenerationId: packageIdentity.package_generation_id,
      capability,
      route,
      effectiveRouteSetId,
      overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
      qualityProfile: settings.quality_profile,
      profileId: settings.profile_id,
      profileVersion: settings.profile_version,
      profileRegistry,
      profileEntry,
      secrets,
      integrityKey: initialized.integrityKey,
      probe: {
        reachable: true,
        contract_valid: true,
        response_schema_valid: true,
        latency_ms: 10,
        response_size_bytes: 64,
        embedding_vector: capability === "embedding" ? [0.1, 0.2, 0.3] : null,
        failure_code: null
      },
      validatedAt: observedAt
    });
  });
  const db = new DatabaseSync(sqlitePath);
  try {
    configureRuntimeSqlitePolicy(db, {
      accessMode: "read_write",
      role: "plugin"
    });
    bootstrapDatabase(db);
    await new RuntimeConfigurationGenerationRepository(
      db,
      runtimeHome,
      initialized.homeIdentity.home_id
    ).publish({
      candidate: {
        generationId,
        parentGenerationId: null,
        settings,
        secrets,
        validationState: {
          validation_schema_version: VALIDATION_STATE_SCHEMA_VERSION,
          records: validationRecords
        },
        packageIdentity,
        profileRegistry,
        profileSelectionContext: selectionContext,
        overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
        createdByInstanceId: "local-pack-validation",
        createdAt: observedAt
      },
      expectedPointerRevision: 0,
      expectedGenerationId: null,
      commitId: "commit-local-pack-validation",
      committedAt: observedAt
    });
  } finally {
    db.close();
  }
  return {
    generationId,
    effectiveRouteSetId,
    packageGenerationId: packageIdentity.package_generation_id
  };
};

let binding;
let inspectionDb;
let stoppedCleanly = false;
try {
  process.env.EXPERIENCE_ENGINE_HOME = productHome;
  await mkdir(dirname(installStatePath), { recursive: true });
  await mkdir(stateDir, { recursive: true });
  const observedAt = new Date().toISOString();
  const installState = {
    adapter: "openclaw",
    installedAt: observedAt,
    installedVersion: packageJson.version,
    packageRoot,
    installSource: packageRoot,
    installMode: "local-pack-validation",
    hostWiring: {
      wired: true,
      restartRecommended: false
    },
    dataDir: runtimeHome,
    sqlitePath,
    captureDir
  };
  await writeFile(
    installStatePath,
    `${JSON.stringify(installState, null, 2)}\n`,
    "utf8"
  );
  const configured = await publishCurrentConfiguration({
    installState,
    observedAt
  });

  binding = await bindInstalledOpenClawProductionRuntime({
    packageRoot,
    config: {
      ...defaultConfig,
      dataDir: runtimeHome,
      sqlitePath,
      captureDir
    },
    lifecycleContext: { stateDir },
    interactionActive: true
  });
  const started = await binding.service.start({ stateDir });
  if (!started.ok || started.code !== "supervisor_launch_reserved_and_bound") {
    throw new Error(
      `Unexpected production binding start result: ${JSON.stringify(started)}.`
    );
  }

  inspectionDb = new DatabaseSync(sqlitePath);
  const activeLease = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT owner_id, owner_process_id, lease_epoch, state
       FROM supervisor_leases LIMIT 1`
    ).get(),
    (row) => row.state === "active",
    "package-local supervisor active lease"
  );
  const activationWorker = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT owner_id, owner_process_id, fencing_token, worker_mode, state
       FROM worker_leases LIMIT 1`
    ).get(),
    (row) => row.state === "active" && row.worker_mode === "activation_only",
    "package-local activation worker fence"
  );
  const activeActivation = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT activation_state, activation_revision,
              active_package_generation_id,
              preactivation_handshake_id,
              production_activation_handshake_id
       FROM package_activation_state LIMIT 1`
    ).get(),
    (row) => row.activation_state === "active" &&
      row.active_package_generation_id === configured.packageGenerationId &&
      Boolean(row.preactivation_handshake_id) &&
      Boolean(row.production_activation_handshake_id),
    "complete package activation"
  );
  const productionWorker = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT owner_id, owner_process_id, fencing_token, worker_mode, state
       FROM worker_leases LIMIT 1`
    ).get(),
    (row) => row.state === "active" && row.worker_mode === "production",
    "package-local production worker fence"
  );
  const completeHandshakes = inspectionDb.prepare(
    `SELECT handshake_purpose, status, worker_fencing_token,
            configuration_generation_id, effective_route_set_id
     FROM activation_handshakes
     WHERE status = 'complete'
     ORDER BY requested_at, activation_id`
  ).all();
  if (
    completeHandshakes.length !== 2 ||
    completeHandshakes[0]?.handshake_purpose !==
      "preactivation_verification" ||
    completeHandshakes[1]?.handshake_purpose !== "production_activation" ||
    completeHandshakes.some((handshake) =>
      handshake.configuration_generation_id !== configured.generationId ||
      handshake.effective_route_set_id !== configured.effectiveRouteSetId
    )
  ) {
    throw new Error(
      `Unexpected activation handshake evidence: ${JSON.stringify(completeHandshakes)}.`
    );
  }
  const status = await binding.service.execute({ operation: "status" });
  if (
    !status.ok ||
    status.code !== "runtime_status_projected" ||
    status.result?.learning_runtime_active !== true ||
    status.result?.production_learning_ready !== false ||
    status.result?.package_activation_state !== "active"
  ) {
    throw new Error(
      `Unexpected truthful runtime status projection: ${JSON.stringify(status)}.`
    );
  }

  const stopped = await binding.service.stop({ stateDir });
  if (
    !stopped.ok ||
    stopped.code !== "deliberate_runtime_drain_requested"
  ) {
    throw new Error(
      `Unexpected production binding stop result: ${JSON.stringify(stopped)}.`
    );
  }
  stoppedCleanly = true;
  const releasedWorker = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT state, fencing_token, worker_mode
       FROM worker_leases LIMIT 1`
    ).get(),
    (row) => row.state === "stopped",
    "package-local worker release"
  );
  const releasedLease = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT state, lease_terminal_reason
       FROM supervisor_leases LIMIT 1`
    ).get(),
    (row) => row.state === "stopped" &&
      row.lease_terminal_reason === "graceful_release",
    "package-local supervisor graceful release"
  );
  const attempt = inspectionDb.prepare(
    `SELECT attempt_state, terminal_code
     FROM supervisor_launch_attempts
     ORDER BY reserved_at DESC
     LIMIT 1`
  ).get();
  if (
    attempt?.attempt_state !== "terminated" ||
    attempt?.terminal_code !== "supervisor_graceful_release"
  ) {
    throw new Error(
      `Unexpected launch-attempt terminal evidence: ${JSON.stringify(attempt)}.`
    );
  }
  await waitForProcessExit(
    activationWorker.owner_process_id,
    "package-local activation worker"
  );
  await waitForProcessExit(
    productionWorker.owner_process_id,
    "package-local production worker"
  );
  await waitForProcessExit(
    activeLease.owner_process_id,
    "package-local supervisor"
  );
  console.log(JSON.stringify({
    ok: true,
    validation: "openclaw_package_local_configured_production_activation",
    start_code: started.code,
    package_activation_state: activeActivation.activation_state,
    package_activation_revision: activeActivation.activation_revision,
    configuration_generation_id: configured.generationId,
    effective_route_set_id: configured.effectiveRouteSetId,
    supervisor_owner_id: activeLease.owner_id,
    supervisor_process_id: activeLease.owner_process_id,
    supervisor_lease_epoch: activeLease.lease_epoch,
    activation_worker_fencing_token: activationWorker.fencing_token,
    production_worker_owner_id: productionWorker.owner_id,
    production_worker_process_id: productionWorker.owner_process_id,
    production_worker_fencing_token: productionWorker.fencing_token,
    completed_handshakes: completeHandshakes.map((row) =>
      row.handshake_purpose
    ),
    learning_runtime_active: status.result.learning_runtime_active,
    production_learning_ready: status.result.production_learning_ready,
    worker_terminal_state: releasedWorker.state,
    stop_code: stopped.code,
    terminal_reason: releasedLease.lease_terminal_reason,
    attempt_terminal_code: attempt.terminal_code,
    evidence_class: "local_pack"
  }));
} finally {
  inspectionDb?.close();
  if (binding && !stoppedCleanly) {
    await binding.service.stop({ stateDir }).catch(() => undefined);
  }
  await binding?.dispose?.();
  if (originalProductHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalProductHome;
  }
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 50,
    retryDelay: 200
  });
}
