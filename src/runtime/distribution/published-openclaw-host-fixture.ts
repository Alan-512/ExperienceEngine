import { createServer, type Server } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  MaterializedPublishedArtifact
} from "./artifact-materializer.js";
import type {
  RuntimeInstallOrigin,
  RuntimePublishedChannel
} from "../identity/types.js";
import type {
  OpenClawHostValidationFixtureStarter
} from "./sqlite-openclaw-host-authority-collector.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";

type InstalledModuleSet = {
  constants: Record<string, unknown>;
  configurationGeneration: Record<string, unknown>;
  configurationInvalidation: Record<string, unknown>;
  routeAuthority: Record<string, unknown>;
  registry: Record<string, unknown>;
  validation: Record<string, unknown>;
  identityBootstrap: Record<string, unknown>;
  identityConstants: Record<string, unknown>;
  installAttestation: Record<string, unknown>;
  closureManifest: Record<string, unknown>;
  packageGeneration: Record<string, unknown>;
  processConstants: Record<string, unknown>;
  schemaConstants: Record<string, unknown>;
  sqlitePolicy: Record<string, unknown>;
  databaseBootstrap: Record<string, unknown>;
  queueRepository: Record<string, unknown>;
  provenance: Record<string, unknown>;
  candidateRepository: Record<string, unknown>;
};

type ConfiguredFixture = {
  installedRoot: string;
  stateDir: string;
  runtimeHome: string;
  sqlitePath: string;
  artifact: MaterializedPublishedArtifact;
  openclawVersion: string;
  modules: InstalledModuleSet;
  homeId: string;
  generationId: string;
  effectiveRouteSetId: string;
  packageGenerationId: string;
  packageIdentity: Record<string, unknown>;
  packageBuildId: string;
  profileEntry: Record<string, any>;
  validationRecords: Array<Record<string, any>>;
  providerBaseUrl: string;
};

const importInstalled = async (
  installedRoot: string,
  packageRelativePath: string
): Promise<Record<string, unknown>> => import(
  pathToFileURL(join(installedRoot, ...packageRelativePath.split("/"))).href
) as Promise<Record<string, unknown>>;

const loadInstalledModules = async (
  installedRoot: string
): Promise<InstalledModuleSet> => ({
  constants: await importInstalled(
    installedRoot,
    "dist/runtime/configuration/constants.js"
  ),
  configurationGeneration: await importInstalled(
    installedRoot,
    "dist/runtime/configuration/generation.js"
  ),
  configurationInvalidation: await importInstalled(
    installedRoot,
    "dist/runtime/activation/configuration-invalidation.js"
  ),
  routeAuthority: await importInstalled(
    installedRoot,
    "dist/runtime/configuration/route-authority.js"
  ),
  registry: await importInstalled(
    installedRoot,
    "dist/runtime/configuration/registry.js"
  ),
  validation: await importInstalled(
    installedRoot,
    "dist/runtime/configuration/validation.js"
  ),
  identityBootstrap: await importInstalled(
    installedRoot,
    "dist/runtime/identity/control-plane-bootstrap.js"
  ),
  identityConstants: await importInstalled(
    installedRoot,
    "dist/runtime/identity/constants.js"
  ),
  installAttestation: await importInstalled(
    installedRoot,
    "dist/runtime/package/install-attestation.js"
  ),
  closureManifest: await importInstalled(
    installedRoot,
    "dist/runtime/package/closure-manifest.js"
  ),
  packageGeneration: await importInstalled(
    installedRoot,
    "dist/runtime/package/package-generation.js"
  ),
  processConstants: await importInstalled(
    installedRoot,
    "dist/runtime/process/constants.js"
  ),
  schemaConstants: await importInstalled(
    installedRoot,
    "dist/runtime/schema/constants.js"
  ),
  sqlitePolicy: await importInstalled(
    installedRoot,
    "dist/runtime/schema/sqlite-policy.js"
  ),
  databaseBootstrap: await importInstalled(
    installedRoot,
    "dist/store/sqlite/db.js"
  ),
  queueRepository: await importInstalled(
    installedRoot,
    "dist/runtime/learning-queue/repository.js"
  ),
  provenance: await importInstalled(
    installedRoot,
    "dist/runtime/learning-queue/provenance.js"
  ),
  candidateRepository: await importInstalled(
    installedRoot,
    "dist/store/sqlite/repositories/candidate-repo.js"
  )
});

const requireFunction = <T extends (...args: any[]) => any>(
  module: Record<string, unknown>,
  name: string
): T => {
  const value = module[name];
  if (typeof value !== "function") {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `Installed runtime module does not export ${name}.`
    );
  }
  return value as T;
};

const requireArray = <T>(module: Record<string, unknown>, name: string): T[] => {
  const value = module[name];
  if (!Array.isArray(value)) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `Installed runtime module does not export ${name} as an array.`
    );
  }
  return value as T[];
};

const requireString = (module: Record<string, unknown>, name: string): string => {
  const value = module[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `Installed runtime module does not export ${name} as a string.`
    );
  }
  return value;
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolveSleep) => {
    const timer = setTimeout(resolveSleep, milliseconds);
    timer.unref();
  });

const normalizeComparableOpenClawVersion = (value: string): string => {
  const match = value.match(/\b(\d+\.\d+\.\d+)\b/u);
  if (!match?.[1]) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `OpenClaw version output does not contain a comparable semantic version: ${value}`
    );
  }
  return match[1];
};

const waitForJob = async (options: {
  sqlitePath: string;
  jobId: string;
  predicate: (row: Record<string, unknown>) => boolean;
  timeoutMs: number;
  label: string;
}): Promise<Record<string, unknown>> => {
  const deadline = Date.now() + options.timeoutMs;
  const db = new DatabaseSync(options.sqlitePath, { readOnly: true });
  try {
    while (Date.now() < deadline) {
      try {
        const row = db.prepare(
          "SELECT * FROM distillation_jobs WHERE id = ? LIMIT 1"
        ).get(options.jobId) as Record<string, unknown> | undefined;
        if (row && options.predicate(row)) {
          return row;
        }
      } catch {
        // The real worker may be in the middle of a transaction.
      }
      await sleep(25);
    }
  } finally {
    db.close();
  }
  throw new PublishedRuntimeClosureError(
    "EE_OPENCLAW_LIVE_HOST_AUTHORITY_TIMEOUT",
    `Timed out waiting for ${options.label}.`
  );
};

const listen = async (server: Server): Promise<number> => new Promise(
  (resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(new Error("Provider fixture did not bind a TCP port."));
        return;
      }
      resolveListen(address.port);
    });
  }
);

const closeServer = async (server: Server): Promise<void> => new Promise(
  (resolveClose) => server.close(() => resolveClose())
);

export const createPublishedOpenClawHostFixture = async (options: {
  timeoutMs?: number;
  installOrigin?: RuntimeInstallOrigin;
  runtimePublishedChannel?: RuntimePublishedChannel;
} = {}): Promise<{
  prepareRuntimeAuthority: (input: {
    installedRoot: string;
    stateDir: string;
    runtimeHome: string;
    sqlitePath: string;
    artifact: MaterializedPublishedArtifact;
    openclawVersion: string;
  }) => Promise<void>;
  startFixture: OpenClawHostValidationFixtureStarter;
  cleanup: () => Promise<void>;
}> => {
  let requestCount = 0;
  const releaseRequest: Array<() => void> = [];
  const requestObserved: Array<Promise<void>> = [];
  const observeRequest: Array<() => void> = [];
  for (let index = 0; index < 2; index += 1) {
    requestObserved.push(new Promise((resolveObserved) => {
      observeRequest[index] = resolveObserved;
    }));
  }
  const requestRelease: Array<Promise<void>> = [];
  for (let index = 0; index < 2; index += 1) {
    requestRelease.push(new Promise((resolveRelease) => {
      releaseRequest[index] = resolveRelease;
    }));
  }

  const providerServer = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/distillation/v1/chat/completions") {
      const index = requestCount++;
      if (index < 2) {
        observeRequest[index]?.();
        await requestRelease[index];
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              compact_hint: index === 0
                ? "Complete real-host semantic work through the fenced queue."
                : "Reject semantic output after configuration authority changes.",
              trigger_conditions: "A deterministic real-host queue candidate is claimed.",
              success_criteria: "The fenced completion or interruption contract is observed.",
              risk_level: "low",
              goal: "Validate real OpenClaw production semantic execution.",
              recommended_steps: [
                "Claim through S5 authority.",
                "Run provider work outside SQLite authority.",
                "Commit only through fenced semantic completion."
              ],
              avoid_steps: ["Bypass the fenced queue repository."],
              evidence_summary: "Deterministic real-host provider fixture."
            })
          }
        }]
      }));
      return;
    }
    if (url.pathname === "/embedding") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
      return;
    }
    response.writeHead(204);
    response.end();
  });
  const port = await listen(providerServer);
  const providerBaseUrl = `http://127.0.0.1:${port}`;
  const installOrigin = options.installOrigin;
  const runtimePublishedChannel = options.runtimePublishedChannel;
  let configured: ConfiguredFixture | null = null;
  let backgroundFailure: unknown = null;

  const publishConfiguration = async (input: {
    installedRoot: string;
    stateDir: string;
    runtimeHome: string;
    sqlitePath: string;
    artifact: MaterializedPublishedArtifact;
    openclawVersion: string;
    parentGenerationId?: string | null;
    expectedPointerRevision?: number;
    invalidateActivation?: boolean;
  }): Promise<ConfiguredFixture> => {
    const modules = configured?.modules ?? await loadInstalledModules(input.installedRoot);
    const initializeRuntimeHomeIdentity = requireFunction<any>(
      modules.identityBootstrap,
      "initializeRuntimeHomeIdentity"
    );
    const initialized = await initializeRuntimeHomeIdentity({
      writer: "package_local_initializer",
      explicitOpenClawHome: input.runtimeHome
    });
    const assertRuntimeClosureManifest = requireFunction<any>(
      modules.closureManifest,
      "assertRuntimeClosureManifest"
    );
    const createRuntimeClosureManifest = requireFunction<any>(
      modules.closureManifest,
      "createRuntimeClosureManifest"
    );
    const closure = assertRuntimeClosureManifest(input.installedRoot);
    const manifest = createRuntimeClosureManifest(input.installedRoot);
    const findRuntimeInstallAttestation = requireFunction<any>(
      modules.installAttestation,
      "findRuntimeInstallAttestation"
    );
    const attestation = await findRuntimeInstallAttestation({
      canonicalHome: input.runtimeHome,
      integrityKey: initialized.integrityKey,
      packageName: manifest.package_name,
      packageVersion: manifest.package_version,
      packageBuildId: closure.packageBuildId,
      closureManifestDigest: closure.closureManifestDigest,
      installedRoot: input.installedRoot,
      hostStateDir: input.stateDir,
      homeId: initialized.homeIdentity.home_id,
      databasePath: input.sqlitePath,
      installOrigin: installOrigin ?? (
        input.artifact.published_channel === "npm"
          ? "published_npm_attested"
          : "published_clawhub_attested"
      )
    });
    if (!attestation) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
        "Published host fixture requires the signed install attestation before configuration publication."
      );
    }
    const schemaVersions = requireArray<string>(
      modules.schemaConstants,
      "RUNTIME_SCHEMA_VERSION_ORDER"
    );
    const createRuntimePackageGenerationIdentity = requireFunction<any>(
      modules.packageGeneration,
      "createRuntimePackageGenerationIdentity"
    );
    const packageIdentity = createRuntimePackageGenerationIdentity({
      manifest,
      artifactIntegrity: input.artifact.artifact_integrity,
      installRecordIdentity: attestation.attestation_identity,
      installOrigin: attestation.install_origin,
      publishedChannel: runtimePublishedChannel ?? input.artifact.published_channel,
      compatibility: {
        supervisor_protocol_version: requireString(
          modules.processConstants,
          "RUNTIME_SUPERVISOR_PROTOCOL_VERSION"
        ),
        worker_protocol_version: requireString(
          modules.processConstants,
          "RUNTIME_WORKER_PROTOCOL_VERSION"
        ),
        control_protocol_version: requireString(
          modules.identityConstants,
          "RUNTIME_CONTROL_SCHEMA_VERSION"
        ),
        min_read_schema_version: schemaVersions[0],
        max_read_schema_version: schemaVersions.at(-1),
        min_write_schema_version: schemaVersions[0],
        max_write_schema_version: schemaVersions.at(-1),
        target_schema_version: schemaVersions[0]
      }
    });
    const profilePath = join(
      input.installedRoot,
      ...requireString(
        modules.closureManifest,
        "RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH"
      ).split("/")
    );
    const loadPackagedProfileRegistry = requireFunction<any>(
      modules.registry,
      "loadPackagedProfileRegistry"
    );
    const profileRegistry = loadPackagedProfileRegistry({
      path: profilePath,
      expectedPackageName: packageIdentity.package_name,
      expectedPackageVersion: packageIdentity.package_version,
      expectedPackageBuildId: closure.packageBuildId
    });
    const profileEntry = profileRegistry.entries.find((entry: Record<string, unknown>) =>
      entry.entry_status === "active" && entry.quality_profile === "custom"
    );
    if (!profileEntry) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
        "Published host fixture requires one active custom profile entry."
      );
    }
    const capabilities = requireArray<string>(
      modules.constants,
      "RUNTIME_CONFIGURATION_CAPABILITIES"
    );
    const requiredCapabilities = ["learning_gate", "distillation", "embedding"];
    const secretRefs: Record<string, string> = {
      learning_gate: "EE_HOST_FIXTURE_LEARNING_GATE_KEY",
      distillation: "EE_HOST_FIXTURE_DISTILLATION_KEY",
      embedding: "EE_HOST_FIXTURE_EMBEDDING_KEY"
    };
    const routes = Object.fromEntries(requiredCapabilities.map((capability) => {
      const contract = profileEntry.capability_contracts[capability];
      const routeSpec = profileEntry.route_specs[contract.route_spec_id];
      const authMode = routeSpec.auth_modes.includes("api_key")
        ? "api_key"
        : routeSpec.auth_modes[0];
      return [capability, {
        route_id: `${capability}-real-host-primary`,
        provider_family: routeSpec.provider_family,
        model_or_deployment_identity: `${capability}-real-host-deployment`,
        endpoint_identity: `${providerBaseUrl}/${
          capability === "distillation" ? "distillation" : capability
        }`,
        auth_mode: authMode,
        secret_refs: authMode === "api_key" ? [secretRefs[capability]] : [],
        provider_adapter_version: routeSpec.provider_adapter_version,
        request_schema_version: `${capability}-request-v1`,
        response_schema_version: `${capability}-response-v1`
      }];
    }));
    const settings = {
      settings_schema_version: requireString(
        modules.constants,
        "CONFIGURATION_SETTINGS_SCHEMA_VERSION"
      ),
      quality_profile: profileEntry.quality_profile,
      profile_id: profileEntry.profile_id,
      profile_version: profileEntry.profile_version,
      custom_profile_acknowledged: true,
      legacy_rule_mode: { enabled: false, label: "legacy_rule_compatibility" },
      capability_routes: Object.fromEntries(capabilities.map((capability) => {
        const contract = profileEntry.capability_contracts[capability];
        const route = (routes as Record<string, unknown>)[capability] ?? null;
        return [capability, {
          enabled: Boolean(route),
          required_for_production: contract.required_for_production,
          contract_version: contract.contract_version,
          primary_route: route,
          fallback_routes: [],
          fallback_trigger_codes: []
        }];
      }))
    };
    const secrets = {
      secrets_schema_version: requireString(
        modules.constants,
        "CONFIGURATION_SECRETS_SCHEMA_VERSION"
      ),
      values: Object.fromEntries(requiredCapabilities.map((capability) => [
        secretRefs[capability],
        `real-host-validation-${capability}`
      ]))
    };
    const createSupportedRouteOverrideSnapshot = requireFunction<any>(
      modules.routeAuthority,
      "createSupportedRouteOverrideSnapshot"
    );
    const computeEffectiveRouteSetId = requireFunction<any>(
      modules.routeAuthority,
      "computeEffectiveRouteSetId"
    );
    const overrideSnapshot = createSupportedRouteOverrideSnapshot({
      env: {},
      integrityKey: initialized.integrityKey
    });
    const pointerRevision = input.expectedPointerRevision ?? 0;
    const comparableOpenClawVersion = normalizeComparableOpenClawVersion(
      input.openclawVersion
    );
    const generationId = `config_real_host_${Date.now()}_${pointerRevision}`;
    const effectiveRouteSetId = computeEffectiveRouteSetId({
      homeId: initialized.homeIdentity.home_id,
      configurationGenerationId: generationId,
      packageGenerationId: packageIdentity.package_generation_id,
      overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
      settings,
      secrets,
      integrityKey: initialized.integrityKey
    });
    const createCapabilityValidationRecord = requireFunction<any>(
      modules.validation,
      "createCapabilityValidationRecord"
    );
    const validationRecords = requiredCapabilities.map((capability) =>
      createCapabilityValidationRecord({
        validationRecordId: `validation-real-host-${pointerRevision}-${capability}`,
        configurationGenerationId: generationId,
        homeId: initialized.homeIdentity.home_id,
        packageGenerationId: packageIdentity.package_generation_id,
        capability,
        route: (routes as Record<string, unknown>)[capability],
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
        validatedAt: new Date().toISOString()
      })
    );
    const db = new DatabaseSync(input.sqlitePath);
    try {
      requireFunction<any>(modules.sqlitePolicy, "configureRuntimeSqlitePolicy")(
        db,
        { accessMode: "read_write", role: "plugin" }
      );
      requireFunction<any>(modules.databaseBootstrap, "bootstrapDatabase")(db);
      const Repository = requireFunction<any>(
        modules.configurationGeneration,
        "RuntimeConfigurationGenerationRepository"
      );
      const invalidationProvider = input.invalidateActivation
        ? requireFunction<any>(
            modules.configurationInvalidation,
            "createS6ConfigurationActivationInvalidationProvider"
          )()
        : undefined;
      await new Repository(
        db,
        input.runtimeHome,
        initialized.homeIdentity.home_id,
        invalidationProvider
      ).publish({
        candidate: {
          generationId,
          parentGenerationId: input.parentGenerationId ?? null,
          settings,
          secrets,
          validationState: {
            validation_schema_version: requireString(
              modules.constants,
              "VALIDATION_STATE_SCHEMA_VERSION"
            ),
            records: validationRecords
          },
          packageIdentity,
          profileRegistry,
          profileSelectionContext: {
            currentEeVersion: packageIdentity.package_version,
            nodeVersion: process.versions.node,
            platform: process.platform,
            architecture: process.arch,
            hostApiVersion: comparableOpenClawVersion,
            gatewayVersion: comparableOpenClawVersion
          },
          overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
          createdByInstanceId: "real-openclaw-host-validation",
          createdAt: new Date().toISOString()
        },
        expectedPointerRevision: pointerRevision,
        expectedGenerationId: input.parentGenerationId ?? null,
        commitId: `commit-real-host-validation-${pointerRevision}`,
        committedAt: new Date().toISOString()
      });
    } finally {
      db.close();
    }
    return {
      installedRoot: input.installedRoot,
      stateDir: input.stateDir,
      runtimeHome: input.runtimeHome,
      sqlitePath: input.sqlitePath,
      artifact: input.artifact,
      openclawVersion: input.openclawVersion,
      modules,
      homeId: initialized.homeIdentity.home_id,
      generationId,
      effectiveRouteSetId,
      packageGenerationId: packageIdentity.package_generation_id,
      packageIdentity,
      packageBuildId: closure.packageBuildId,
      profileEntry,
      validationRecords,
      providerBaseUrl
    };
  };

  const registerCandidate = (options: {
    configured: ConfiguredFixture;
    candidateId: string;
    jobId: string;
    triggerPattern: string;
  }): void => {
    const validationFor = (capability: string): Record<string, any> => {
      const record = options.configured.validationRecords.find((entry) =>
        entry.capability === capability
      );
      if (!record) {
        throw new Error(`Missing ${capability} validation record.`);
      }
      return record;
    };
    const observedAt = new Date().toISOString();
    const db = new DatabaseSync(options.configured.sqlitePath);
    try {
      requireFunction<any>(
        options.configured.modules.sqlitePolicy,
        "configureRuntimeSqlitePolicy"
      )(db, { accessMode: "read_write", role: "plugin" });
      const CandidateRepository = requireFunction<any>(
        options.configured.modules.candidateRepository,
        "CandidateRepository"
      );
      new CandidateRepository(db).upsert({
        id: options.candidateId,
        task_run_id: `taskrun-${options.candidateId}`,
        candidate_kind: "successful_fix",
        source_record_id: `input-${options.candidateId}`,
        scope_id: "scope-real-openclaw-host-validation",
        task_type: "test_debug",
        node_type: "strategy",
        trigger_pattern: options.triggerPattern,
        compact_hint: "Use the real OpenClaw package-local fenced semantic worker.",
        success_signal: "The real-host queue contract passes.",
        evidence_summary: "A deterministic real-host fixture produced this candidate.",
        source_kind: "system_derived",
        source_outcome_signal: "success",
        source_signal: {
          task_summary: "Validate real OpenClaw fenced semantic execution",
          outcome_signal: "success",
          tool_events: [],
          evidence: ["real-openclaw-host-runtime"],
          retry_count: 0,
          correction_signals: [],
          tool_event_summary: []
        },
        lifecycle_state: "pending",
        retry_count: 0,
        created_at: observedAt,
        updated_at: observedAt
      });
      const learningGate = validationFor("learning_gate");
      const distillation = validationFor("distillation");
      const semanticOrigin = requireFunction<any>(
        options.configured.modules.provenance,
        "createSemanticOriginReference"
      )({
        configuration_generation_id: options.configured.generationId,
        package_generation_id: options.configured.packageGenerationId,
        generation_profile_id: options.configured.profileEntry.profile_id,
        generation_profile_version: options.configured.profileEntry.profile_version,
        generation_profile_status: options.configured.profileEntry.entry_status,
        quality_profile: options.configured.profileEntry.quality_profile,
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
            route_fingerprint: "deterministic-merge-real-host-v1",
            validation_record_id: "validation-real-host-deterministic-merge",
            benchmark_assurance: "unbenchmarked",
            contract_version: "merge-contract-v1"
          }
        },
        createdAt: observedAt
      });
      const QueueRepository = requireFunction<any>(
        options.configured.modules.queueRepository,
        "FencedLearningQueueRepository"
      );
      new QueueRepository(db, options.configured.homeId).registerPendingJob({
        jobId: options.jobId,
        candidateId: options.candidateId,
        extractorProfile: "balanced",
        routeFingerprint: distillation.route_fingerprint,
        semanticOrigin,
        createdAt: observedAt
      });
    } finally {
      db.close();
    }
  };

  return {
    async prepareRuntimeAuthority(input) {
      configured = await publishConfiguration({
        installedRoot: resolve(input.installedRoot),
        stateDir: resolve(input.stateDir),
        runtimeHome: resolve(input.runtimeHome),
        sqlitePath: resolve(input.sqlitePath),
        artifact: input.artifact,
        openclawVersion: input.openclawVersion
      });
    },

    async startFixture(input) {
      if (!configured || configured.homeId !== input.homeId) {
        throw new PublishedRuntimeClosureError(
          "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
          "Real-host validation fixture was not prepared for the current home."
        );
      }
      const completionJobId = "job-real-host-complete";
      const staleOutputJobId = "job-real-host-stale";
      registerCandidate({
        configured,
        candidateId: "candidate-real-host-complete",
        jobId: completionJobId,
        triggerPattern: "Complete one real-host semantic queue job."
      });
      void (async () => {
        try {
          await Promise.race([
            requestObserved[0],
            sleep(options.timeoutMs ?? 90_000).then(() => {
              throw new Error("First provider request was not observed.");
            })
          ]);
          await waitForJob({
            sqlitePath: configured!.sqlitePath,
            jobId: completionJobId,
            predicate: (row) => row.status === "processing" &&
              typeof row.claim_id === "string",
            timeoutMs: options.timeoutMs ?? 90_000,
            label: "real-host completion claim"
          });
          releaseRequest[0]();
          await waitForJob({
            sqlitePath: configured!.sqlitePath,
            jobId: completionJobId,
            predicate: (row) => row.status === "succeeded",
            timeoutMs: options.timeoutMs ?? 90_000,
            label: "real-host semantic completion"
          });
          registerCandidate({
            configured: configured!,
            candidateId: "candidate-real-host-stale",
            jobId: staleOutputJobId,
            triggerPattern: "Reject stale real-host semantic output."
          });
          await Promise.race([
            requestObserved[1],
            sleep(options.timeoutMs ?? 90_000).then(() => {
              throw new Error("Second provider request was not observed.");
            })
          ]);
          await waitForJob({
            sqlitePath: configured!.sqlitePath,
            jobId: staleOutputJobId,
            predicate: (row) => row.status === "processing" &&
              typeof row.claim_id === "string",
            timeoutMs: options.timeoutMs ?? 90_000,
            label: "real-host stale-output claim"
          });
          configured = await publishConfiguration({
            installedRoot: configured!.installedRoot,
            stateDir: configured!.stateDir,
            runtimeHome: configured!.runtimeHome,
            sqlitePath: configured!.sqlitePath,
            artifact: configured!.artifact,
            openclawVersion: configured!.openclawVersion,
            parentGenerationId: configured!.generationId,
            expectedPointerRevision: 1,
            invalidateActivation: true
          });
          releaseRequest[1]();
        } catch (error) {
          backgroundFailure = error;
          releaseRequest[0]?.();
          releaseRequest[1]?.();
        }
      })();
      return { completionJobId, staleOutputJobId };
    },

    async cleanup() {
      await closeServer(providerServer);
      if (backgroundFailure) {
        throw backgroundFailure;
      }
    }
  };
};

export const PUBLISHED_OPENCLAW_HOST_FIXTURE_CONTRACT = Object.freeze({
  starts_supervisor_or_worker: false,
  publishes_verified_configuration_before_gateway: true,
  injects_deterministic_queue_work_after_real_host_start: true,
  provider_work_delayed_for_claim_capture: true,
  configuration_change_occurs_while_second_request_in_flight: true,
  imports_runtime_modules_from_installed_artifact: true
});
