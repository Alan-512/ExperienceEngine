import { DatabaseSync } from "node:sqlite";
import {
  FIXED_CONTROL_PLANE_DDL
} from "../../src/runtime/identity/control-plane-contract.js";
import {
  RUNTIME_IDENTITY_CONTRACT_ID
} from "../../src/runtime/identity/constants.js";
import type {
  GatewayRuntimeIdentityEnvelope,
  RuntimePackageGenerationIdentity
} from "../../src/runtime/identity/types.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  GatewayHeartbeatRepository
} from "../../src/runtime/process/gateway-heartbeat.js";
import type {
  PackageActivationAuthorityRow,
  VerifiedPackageClosureEvidence
} from "../../src/runtime/activation/types.js";

export const ACTIVATION_FIXTURE_HOME_ID = "home-production-activation-test";
export const ACTIVATION_FIXTURE_PACKAGE_ID = "pkg-production-activation-test";
export const ACTIVATION_FIXTURE_GATEWAY_ID = "gateway-production-activation-test";
export const ACTIVATION_FIXTURE_GATEWAY_START = "gateway-start-production-activation-test";
export const ACTIVATION_FIXTURE_NOW = "2026-07-12T12:00:00.000Z";

export const ACTIVATION_FIXTURE_PACKAGE_IDENTITY: RuntimePackageGenerationIdentity = {
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID,
  artifact_integrity: "artifact-production-activation-test",
  install_record_identity: "install-production-activation-test",
  plugin_entrypoint: "dist/plugin/openclaw-plugin.js",
  supervisor_entrypoint: "dist/runtime/package/supervisor-entrypoint.js",
  worker_entrypoint: "dist/runtime/package/worker-entrypoint.js",
  supervisor_protocol_version: "runtime-supervisor-v1",
  worker_protocol_version: "runtime-worker-v1",
  control_protocol_version: "runtime-control-v1",
  profile_registry_digest: "profile-registry-production-activation-test",
  min_read_schema_version: "legacy-learning-v0",
  max_read_schema_version: "runtime-schema-v1",
  min_write_schema_version: "legacy-learning-v0",
  max_write_schema_version: "runtime-schema-v1",
  target_schema_version: "legacy-learning-v0",
  published_channel: "local_test"
};

export const ACTIVATION_FIXTURE_PACKAGE_CLOSURE: VerifiedPackageClosureEvidence = {
  verified: true,
  package_identity: ACTIVATION_FIXTURE_PACKAGE_IDENTITY,
  closure_manifest_digest: "closure-production-activation-test",
  evidence_class: "source_repo",
  verified_at: ACTIVATION_FIXTURE_NOW
};

export const createActivationFixtureRuntimeIdentityEnvelope = (
  packageIdentity: RuntimePackageGenerationIdentity =
    ACTIVATION_FIXTURE_PACKAGE_IDENTITY,
  home: {
    homeId?: string;
    normalizedPathFingerprint?: string;
    integrityKeyId?: string;
    createdAt?: string;
  } = {}
): GatewayRuntimeIdentityEnvelope => ({
  envelope_schema_version: "gateway-runtime-identity-envelope-v1",
  canonical_home_resolution: {
    contract_id: RUNTIME_IDENTITY_CONTRACT_ID,
    resolution_mode: "product_default",
    resolved_home: process.cwd(),
    home_layout_version: "home-layout-v1",
    path_normalization_version: "home-path-normalization-v1",
    database_relative_path: "sqlite/experienceengine.db"
  },
  home: {
    home_id: home.homeId ?? ACTIVATION_FIXTURE_HOME_ID,
    home_layout_version: "home-layout-v1",
    path_normalization_version: "home-path-normalization-v1",
    normalized_path_fingerprint:
      home.normalizedPathFingerprint ?? "home-production-activation-fingerprint",
    home_path_fingerprint_key_id:
      home.integrityKeyId ?? "integrity-production-activation-key",
    database_relative_path: "sqlite/experienceengine.db",
    created_at: home.createdAt ?? ACTIVATION_FIXTURE_NOW
  },
  package: packageIdentity
});

export const createRuntimeProductionActivationDatabase = (options: {
  includeActivationRow?: boolean;
  activationRevision?: number;
  launchAuthorizationRevision?: number;
} = {}): DatabaseSync => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(FIXED_CONTROL_PLANE_DDL);
  db.prepare(
    `INSERT INTO runtime_control_meta (
      control_schema_version,
      home_id,
      home_layout_version,
      path_normalization_version,
      normalized_path_fingerprint,
      integrity_key_id,
      home_path_fingerprint_key_id,
      database_relative_path,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "runtime-control-v1",
    ACTIVATION_FIXTURE_HOME_ID,
    "home-layout-v1",
    "home-path-normalization-v1",
    "home-production-activation-fingerprint",
    "integrity-production-activation-key",
    "integrity-production-activation-key",
    "sqlite/experienceengine.db",
    ACTIVATION_FIXTURE_NOW
  );
  if (options.includeActivationRow !== false) {
    const revision = options.activationRevision ?? 0;
    if (revision === 0) {
      db.prepare(
        "INSERT INTO package_activation_state (home_id, updated_at) VALUES (?, ?)"
      ).run(ACTIVATION_FIXTURE_HOME_ID, ACTIVATION_FIXTURE_NOW);
    } else {
      db.prepare(
        `INSERT INTO package_activation_state (
          home_id,
          activation_revision,
          launch_authorization_revision,
          updated_by_kind,
          updated_by_gateway_instance_id,
          updated_at
        ) VALUES (?, ?, ?, 'gateway_service_controller', ?, ?)`
      ).run(
        ACTIVATION_FIXTURE_HOME_ID,
        revision,
        options.launchAuthorizationRevision ?? 0,
        ACTIVATION_FIXTURE_GATEWAY_ID,
        ACTIVATION_FIXTURE_NOW
      );
    }
  }
  return db;
};

export const seedActivationGatewayHeartbeat = (
  db: DatabaseSync,
  observedAt = ACTIVATION_FIXTURE_NOW
): void => {
  new GatewayHeartbeatRepository(
    db,
    ACTIVATION_FIXTURE_HOME_ID,
    createFixedProcessAuthorityClock(observedAt)
  ).publish({
    gatewayInstanceId: ACTIVATION_FIXTURE_GATEWAY_ID,
    gatewayProcessId: 7101,
    gatewayProcessStartToken: ACTIVATION_FIXTURE_GATEWAY_START,
    packageGenerationId: ACTIVATION_FIXTURE_PACKAGE_ID,
    heartbeatDurationMs: 3_600_000
  });
};

export const readActivationFixtureRow = (
  db: DatabaseSync
): PackageActivationAuthorityRow | undefined => db.prepare(
  "SELECT * FROM package_activation_state WHERE home_id = ? LIMIT 1"
).get(ACTIVATION_FIXTURE_HOME_ID) as PackageActivationAuthorityRow | undefined;

export const activationGatewayWriter = () => ({
  kind: "gateway_service_controller" as const,
  gateway_instance_id: ACTIVATION_FIXTURE_GATEWAY_ID,
  gateway_process_start_token: ACTIVATION_FIXTURE_GATEWAY_START,
  plugin_package_generation_id: ACTIVATION_FIXTURE_PACKAGE_ID
});
