import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  bindInstalledOpenClawProductionRuntime
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
  createS6ConfigurationActivationInvalidationProvider
} from "../../dist/runtime/activation/configuration-invalidation.js";
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
  createOrAdoptRuntimeInstallAttestation,
  fingerprintRuntimeInstallPath
} from "../../dist/runtime/package/install-attestation.js";
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
import {
  FencedLearningQueueRepository
} from "../../dist/runtime/learning-queue/repository.js";
import {
  createSemanticOriginReference
} from "../../dist/runtime/learning-queue/provenance.js";
import {
  CandidateRepository
} from "../../dist/store/sqlite/repositories/candidate-repo.js";

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
const evidenceClass = (() => {
  const requested = process.env.EXPERIENCE_ENGINE_VALIDATION_EVIDENCE_CLASS?.trim() ||
    "local_pack";
  if (!["local_pack", "published_npm", "published_clawhub"].includes(requested)) {
    throw new Error("Unsupported runtime validation evidence class.");
  }
  return requested;
})();
const publishedChannel = evidenceClass === "published_npm"
  ? "npm"
  : evidenceClass === "published_clawhub"
    ? "clawhub"
    : "local_test";
const installOrigin = evidenceClass === "published_npm"
  ? "published_npm_attested"
  : evidenceClass === "published_clawhub"
    ? "published_clawhub_attested"
    : "local_pack";
const registryArtifactIntegrity =
  process.env.EXPERIENCE_ENGINE_VALIDATION_ARTIFACT_INTEGRITY?.trim() || null;
const registryRecordIdentity =
  process.env.EXPERIENCE_ENGINE_VALIDATION_REGISTRY_RECORD_IDENTITY?.trim() || null;

let distillationRequestCount = 0;
let releaseCompletionDistillation;
let observeCompletionDistillation;
const completionDistillationObserved = new Promise((resolveObserved) => {
  observeCompletionDistillation = resolveObserved;
});
const completionDistillationRelease = new Promise((resolveRelease) => {
  releaseCompletionDistillation = resolveRelease;
});
let releaseDelayedDistillation;
let observeDelayedDistillation;
const delayedDistillationObserved = new Promise((resolveObserved) => {
  observeDelayedDistillation = resolveObserved;
});
const delayedDistillationRelease = new Promise((resolveRelease) => {
  releaseDelayedDistillation = resolveRelease;
});

const providerServer = createServer(async (request, response) => {
  const requestUrl = new URL(
    request.url ?? "/",
    "http://127.0.0.1"
  );
  if (requestUrl.pathname === "/distillation/v1/chat/completions") {
    distillationRequestCount += 1;
    if (distillationRequestCount === 1) {
      observeCompletionDistillation();
      await completionDistillationRelease;
    }
    if (distillationRequestCount === 2) {
      observeDelayedDistillation();
      await delayedDistillationRelease;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            compact_hint: distillationRequestCount === 1
              ? "Complete local-pack semantic work through the fenced queue."
              : "Reject semantic output after configuration authority changes.",
            trigger_conditions: "A deterministic local-pack queue candidate is claimed.",
            success_criteria: "The fenced completion or interruption contract is observed.",
            risk_level: "low",
            goal: "Validate package-local production semantic execution.",
            recommended_steps: [
              "Claim through S5 authority.",
              "Run provider work outside SQLite authority.",
              "Commit only through fenced semantic completion."
            ],
            avoid_steps: ["Bypass the fenced queue repository."],
            evidence_summary: "Deterministic local-pack provider fixture."
          })
        }
      }]
    }));
    return;
  }
  if (requestUrl.pathname === "/embedding") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    }));
    return;
  }
  response.writeHead(204);
  response.end();
});

await new Promise((resolveListen, rejectListen) => {
  providerServer.once("error", rejectListen);
  providerServer.listen(0, "127.0.0.1", () => resolveListen());
});
const providerAddress = providerServer.address();
if (!providerAddress || typeof providerAddress === "string") {
  throw new Error("Local-pack provider fixture did not bind a TCP address.");
}
const providerBaseUrl = `http://127.0.0.1:${providerAddress.port}`;

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
    endpoint_identity: `${providerBaseUrl}/${capability === "distillation" ? "distillation" : capability}`,
    auth_mode: authMode,
    secret_refs: authMode === "api_key" ? [secretRef] : [],
    provider_adapter_version: routeSpec.provider_adapter_version,
    request_schema_version: `${capability}-request-v1`,
    response_schema_version: `${capability}-response-v1`
  };
};

const publishCurrentConfiguration = async ({
  installState,
  observedAt,
  parentGenerationId = null,
  expectedPointerRevision = 0,
  activationInvalidationProvider
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
  const artifactIntegrity =
    registryArtifactIntegrity ?? `sha256:${closureManifestDigest}`;
  if (
    (installOrigin === "published_npm_attested" ||
      installOrigin === "published_clawhub_attested") &&
    !registryRecordIdentity
  ) {
    throw new Error("Published installed-artifact smoke requires registry identity.");
  }
  const installAttestation = await createOrAdoptRuntimeInstallAttestation({
    canonicalHome: initialized.resolution.resolvedHome,
    integrityKey: initialized.integrityKey,
    content: {
      install_origin: installOrigin,
      package_name: manifest.package_name,
      package_version: manifest.package_version,
      package_build_id: packageBuildId,
      closure_manifest_digest: closureManifestDigest,
      installed_root_fingerprint: fingerprintRuntimeInstallPath(packageRoot),
      host_state_dir_fingerprint: fingerprintRuntimeInstallPath(stateDir),
      home_id: initialized.homeIdentity.home_id,
      database_path_fingerprint: fingerprintRuntimeInstallPath(sqlitePath),
      openclaw_version: null,
      node_version: process.version,
      artifact_integrity: artifactIntegrity,
      registry_record_identity: registryRecordIdentity,
      security_approval: {
        scan_status: "not_run",
        scan_summary_digest: null,
        approval_method: null,
        approved_at: null
      },
      issued_by: installOrigin === "local_pack"
        ? "ee_installer"
        : "published_validator",
      issued_at: observedAt
    }
  });
  const packageIdentity = createRuntimePackageGenerationIdentity({
    manifest,
    artifactIntegrity,
    installRecordIdentity: installAttestation.attestation_identity,
    installOrigin,
    publishedChannel,
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
  const generationId = `config_local_pack_${Date.now()}_${expectedPointerRevision}`;
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
      initialized.homeIdentity.home_id,
      activationInvalidationProvider
    ).publish({
      candidate: {
        generationId,
        parentGenerationId,
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
      expectedPointerRevision,
      expectedGenerationId: parentGenerationId,
      commitId: `commit-local-pack-validation-${expectedPointerRevision}`,
      committedAt: observedAt
    });
  } finally {
    db.close();
  }
  return {
    homeId: initialized.homeIdentity.home_id,
    generationId,
    effectiveRouteSetId,
    packageGenerationId: packageIdentity.package_generation_id,
    packageIdentity,
    packageBuildId,
    profileEntry,
    routes,
    validationRecords
  };
};

const registerQueueCandidate = ({
  configured,
  candidateId,
  jobId,
  observedAt,
  triggerPattern
}) => {
  const validationFor = (capability) => {
    const record = configured.validationRecords.find((entry) =>
      entry.capability === capability
    );
    if (!record) {
      throw new Error(`Missing ${capability} validation for queue candidate.`);
    }
    return record;
  };
  const learningGate = validationFor("learning_gate");
  const distillation = validationFor("distillation");
  const db = new DatabaseSync(sqlitePath);
  try {
    configureRuntimeSqlitePolicy(db, {
      accessMode: "read_write",
      role: "plugin"
    });
    bootstrapDatabase(db);
    new CandidateRepository(db).upsert({
      id: candidateId,
      task_run_id: `taskrun-${candidateId}`,
      candidate_kind: "successful_fix",
      source_record_id: `input-${candidateId}`,
      scope_id: "scope-local-pack-production",
      task_type: "test_debug",
      node_type: "strategy",
      trigger_pattern: triggerPattern,
      compact_hint: "Use the package-local fenced semantic worker.",
      success_signal: "The local-pack queue contract passes.",
      evidence_summary: "A deterministic local-pack fixture produced this candidate.",
      source_kind: "system_derived",
      source_outcome_signal: "success",
      source_signal: {
        task_summary: "Validate package-local fenced semantic execution",
        outcome_signal: "success",
        tool_events: [],
        evidence: ["local-pack-runtime"],
        retry_count: 0,
        correction_signals: [],
        tool_event_summary: []
      },
      lifecycle_state: "pending",
      retry_count: 0,
      created_at: observedAt,
      updated_at: observedAt
    });
    const semanticOrigin = createSemanticOriginReference({
      configuration_generation_id: configured.generationId,
      package_generation_id: configured.packageGenerationId,
      generation_profile_id: configured.profileEntry.profile_id,
      generation_profile_version: configured.profileEntry.profile_version,
      generation_profile_status: configured.profileEntry.entry_status,
      quality_profile: configured.profileEntry.quality_profile,
      stage_routes: {
        learning_gate: {
          route_fingerprint: learningGate.route_fingerprint,
          validation_record_id: learningGate.validation_record_id,
          benchmark_assurance: learningGate.benchmark_assurance,
          contract_version: learningGate.contract_version
        },
        distillation: {
          route_fingerprint: distillation.route_fingerprint,
          validation_record_id: distillation.validation_record_id,
          benchmark_assurance: distillation.benchmark_assurance,
          contract_version: distillation.contract_version
        },
        merge_decision: {
          route_kind: "deterministic",
          route_fingerprint: "deterministic-merge-local-pack-v1",
          validation_record_id: "validation-local-pack-deterministic-merge",
          benchmark_assurance: "unbenchmarked",
          contract_version: "merge-contract-v1"
        }
      },
      createdAt: observedAt
    });
    new FencedLearningQueueRepository(
      db,
      configured.homeId
    ).registerPendingJob({
      jobId,
      candidateId,
      extractorProfile: "balanced",
      routeFingerprint: distillation.route_fingerprint,
      semanticOrigin,
      createdAt: observedAt
    });
  } finally {
    db.close();
  }
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
    installMode: `${evidenceClass}-validation`,
    installOrigin,
    artifactIntegrity:
      registryArtifactIntegrity ?? `sha256:${
        assertRuntimeClosureManifest(packageRoot).closureManifestDigest
      }`,
    registryRecordIdentity,
    openClawVersion: null,
    securityApproval: {
      scan_status: "not_run",
      scan_summary_digest: null,
      approval_method: null,
      approved_at: null
    },
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
  registerQueueCandidate({
    configured,
    candidateId: "candidate-local-pack-complete",
    jobId: "job-local-pack-complete",
    observedAt,
    triggerPattern: "Complete one package-local semantic queue job."
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
  await Promise.race([
    completionDistillationObserved,
    sleep(waitTimeoutMs).then(() => {
      throw new Error("Timed out waiting for semantic completion provider work.");
    })
  ]);
  const claimedSemanticJob = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT status, claim_id, claim_owner_id, claim_fencing_token
       FROM distillation_jobs
       WHERE id = 'job-local-pack-complete'`
    ).get(),
    (row) => row.status === "processing" &&
      Boolean(row.claim_id) &&
      Boolean(row.claim_owner_id) &&
      Number.isSafeInteger(row.claim_fencing_token),
    "package-local fenced semantic claim"
  );
  releaseCompletionDistillation();
  const completedSemanticJob = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT status, system_attempt_count, interruption_count,
              content_retry_count, distillation_source, claim_id
       FROM distillation_jobs
       WHERE id = 'job-local-pack-complete'`
    ).get(),
    (row) => row.status === "succeeded" &&
      row.system_attempt_count === 1 &&
      row.interruption_count === 0 &&
      row.content_retry_count === 0 &&
      row.claim_id === null,
    "package-local fenced semantic completion"
  );
  const completedCandidate = inspectionDb.prepare(
    `SELECT lifecycle_state, distilled_node_id, content_retry_count
     FROM experience_candidates
     WHERE id = 'candidate-local-pack-complete'`
  ).get();
  if (
    completedCandidate?.lifecycle_state !== "distilled" ||
    !completedCandidate.distilled_node_id ||
    completedCandidate.content_retry_count !== 0
  ) {
    throw new Error(
      `Unexpected completed candidate evidence: ${JSON.stringify(completedCandidate)}.`
    );
  }
  const completedNodeBeforeStaleWork = inspectionDb.prepare(
    `SELECT id, support_count, updated_at
     FROM experience_nodes
     WHERE id = ?`
  ).get(completedCandidate.distilled_node_id);
  if (!completedNodeBeforeStaleWork) {
    throw new Error("Package-local semantic completion did not persist its node.");
  }
  const completeHandshakes = inspectionDb.prepare(
    `SELECT activation_id, handshake_purpose, status, worker_fencing_token,
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

  const staleCandidateObservedAt = new Date().toISOString();
  registerQueueCandidate({
    configured,
    candidateId: "candidate-local-pack-stale",
    jobId: "job-local-pack-stale",
    observedAt: staleCandidateObservedAt,
    triggerPattern: "Reject stale package-local semantic output."
  });
  await Promise.race([
    delayedDistillationObserved,
    sleep(waitTimeoutMs).then(() => {
      throw new Error("Timed out waiting for delayed semantic provider work.");
    })
  ]);
  const replacementObservedAt = new Date().toISOString();
  const replacementConfiguration = await publishCurrentConfiguration({
    installState,
    observedAt: replacementObservedAt,
    parentGenerationId: configured.generationId,
    expectedPointerRevision: 1,
    activationInvalidationProvider:
      createS6ConfigurationActivationInvalidationProvider()
  });
  releaseDelayedDistillation();
  const interruptedSemanticJob = await waitForRow(
    inspectionDb,
    (db) => db.prepare(
      `SELECT status, system_attempt_count, interruption_count,
              content_retry_count, failure_code, claim_id
       FROM distillation_jobs
       WHERE id = 'job-local-pack-stale'`
    ).get(),
    (row) => row.status === "pending" &&
      row.system_attempt_count === 1 &&
      row.interruption_count === 1 &&
      row.content_retry_count === 0 &&
      row.claim_id === null,
    "package-local authority-loss interruption recovery"
  );
  const interruptedCandidate = inspectionDb.prepare(
    `SELECT lifecycle_state, distilled_node_id, content_retry_count,
            failure_class
     FROM experience_candidates
     WHERE id = 'candidate-local-pack-stale'`
  ).get();
  if (
    interruptedCandidate?.lifecycle_state !== "pending" ||
    interruptedCandidate.distilled_node_id !== null ||
    interruptedCandidate.content_retry_count !== 0 ||
    interruptedCandidate.failure_class !== "interruption"
  ) {
    throw new Error(
      `Unexpected interrupted candidate evidence: ${JSON.stringify(interruptedCandidate)}.`
    );
  }
  const completedNodeAfterStaleWork = inspectionDb.prepare(
    `SELECT id, support_count, updated_at
     FROM experience_nodes
     WHERE id = ?`
  ).get(completedCandidate.distilled_node_id);
  if (
    JSON.stringify(completedNodeAfterStaleWork) !==
      JSON.stringify(completedNodeBeforeStaleWork)
  ) {
    throw new Error(
      "Stale semantic output mutated the previously completed node."
    );
  }

  const stopped = await binding.service.stop({ stateDir });
  const expectedStaleStop =
    !stopped.ok &&
    stopped.code === "EE_PACKAGE_ACTIVATION_STALE" &&
    stopped.detail.supervisor_signal_sent === true;
  const expectedNormalStop =
    stopped.ok &&
    [
      "deliberate_runtime_drain_requested",
      "supervisor_stop_signalled",
      "runtime_already_stopped"
    ].includes(stopped.code);
  if (!expectedStaleStop && !expectedNormalStop) {
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
  const productionHandshake = completeHandshakes.find((row) =>
    row.handshake_purpose === "production_activation"
  );
  if (!productionHandshake) {
    throw new Error("Production activation handshake evidence is missing.");
  }
  console.log(JSON.stringify({
    ok: true,
    validation: "openclaw_package_local_configured_production_activation",
    start_code: started.code,
    package_activation_state: activeActivation.activation_state,
    package_activation_revision: activeActivation.activation_revision,
    home_id: configured.homeId,
    gateway_instance_id: status.result.gateway_instance_id,
    active_package_generation_id: configured.packageGenerationId,
    production_activation_id: productionHandshake.activation_id,
    schema_version: status.result.schema_version,
    package_name: packageJson.name,
    package_version: packageJson.version,
    artifact_integrity:
      registryArtifactIntegrity ?? configured.packageIdentity.artifact_integrity,
    registry_record_identity: registryRecordIdentity,
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
    semantic_completion_job_status: completedSemanticJob.status,
    semantic_completion_job_id: "job-local-pack-complete",
    semantic_completion_candidate_id: "candidate-local-pack-complete",
    semantic_completion_claim_id: claimedSemanticJob.claim_id,
    semantic_completion_claim_owner_id: claimedSemanticJob.claim_owner_id,
    semantic_completion_claim_fencing_token:
      claimedSemanticJob.claim_fencing_token,
    semantic_completion_node_id: completedCandidate.distilled_node_id,
    semantic_completion_distillation_source:
      completedSemanticJob.distillation_source,
    stale_output_job_status: interruptedSemanticJob.status,
    stale_output_failure_code: interruptedSemanticJob.failure_code,
    stale_output_interruption_count:
      interruptedSemanticJob.interruption_count,
    stale_output_content_retry_count:
      interruptedSemanticJob.content_retry_count,
    replacement_configuration_generation_id:
      replacementConfiguration.generationId,
    learning_runtime_active: status.result.learning_runtime_active,
    production_learning_ready: status.result.production_learning_ready,
    interaction_active: status.result.interaction_active,
    worker_terminal_state: releasedWorker.state,
    supervisor_terminal_state: releasedLease.state,
    stop_code: stopped.code,
    terminal_reason: releasedLease.lease_terminal_reason,
    attempt_terminal_code: attempt.terminal_code,
    evidence_class: evidenceClass
  }));
} finally {
  releaseCompletionDistillation?.();
  releaseDelayedDistillation?.();
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
  const providerClose = new Promise((resolveClose) =>
    providerServer.close(() => resolveClose())
  );
  providerServer.closeIdleConnections?.();
  providerServer.closeAllConnections?.();
  await Promise.race([providerClose, sleep(1_000)]);
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 50,
    retryDelay: 200
  });
}

process.exit(0);
