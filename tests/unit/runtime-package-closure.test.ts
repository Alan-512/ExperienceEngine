import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectRuntimeIdentityFoundation } from "../../src/runtime/identity/inspection.js";
import type { RuntimeHomeIdentity } from "../../src/runtime/identity/types.js";
import {
  RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH,
  RUNTIME_CLOSURE_REQUIRED_ENTRYPOINTS,
  RUNTIME_CLOSURE_REQUIRED_RUNTIME_FILES,
  RUNTIME_CLOSURE_REQUIRED_SCHEMA_AND_MIGRATIONS,
  RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH,
  RUNTIME_PROCESS_AUTHORITY_REGISTRY_RELATIVE_PATH,
  assertRuntimeClosureManifest,
  validateRuntimeClosureManifest,
  writeRuntimePackageIdentityAssets
} from "../../src/runtime/package/closure-manifest.js";
import {
  canonicalJson,
  createRuntimePackageGenerationIdentity,
  sha256Text
} from "../../src/runtime/package/package-generation.js";
import {
  PACKAGE_LOCAL_SUPERVISOR_ENTRYPOINT
} from "../../src/runtime/package/supervisor-entrypoint.js";
import {
  PACKAGE_LOCAL_WORKER_ENTRYPOINT
} from "../../src/runtime/package/worker-entrypoint.js";
import {
  inspectRuntimeProcessAuthority
} from "../../src/runtime/process/inspection.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-runtime-closure-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const writeAsset = (root: string, relativePath: string, content: string): void => {
  const path = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
};

const createPackageFixture = (): string => {
  const root = makeTempDir();
  writeFileSync(join(root, "package.json"), `${JSON.stringify({
    name: "@alan512/experienceengine",
    version: "0.4.8",
    type: "module",
    engines: { node: ">=20.0.0" },
    dependencies: { zod: "^3.25.76" },
    openclaw: {
      extensions: ["./dist/plugin/openclaw-plugin.js"],
      compat: { pluginApi: ">=2026.4.1", minGatewayVersion: "2026.4.1" }
    }
  }, null, 2)}\n`, "utf8");

  const assets = [
    ...RUNTIME_CLOSURE_REQUIRED_ENTRYPOINTS,
    ...RUNTIME_CLOSURE_REQUIRED_RUNTIME_FILES,
    ...RUNTIME_CLOSURE_REQUIRED_SCHEMA_AND_MIGRATIONS
  ];
  for (const asset of assets) {
    writeAsset(root, asset.path, `${asset.role}\n`);
  }
  return root;
};

const compatibility = {
  supervisor_protocol_version: "runtime-supervisor-v1",
  worker_protocol_version: "runtime-worker-v1",
  control_protocol_version: "runtime-control-v1",
  min_read_schema_version: "pending-s2",
  max_read_schema_version: "pending-s2",
  min_write_schema_version: "pending-s2",
  max_write_schema_version: "pending-s2",
  target_schema_version: "pending-s2"
} as const;

const homeIdentity: RuntimeHomeIdentity = {
  home_id: "home-1",
  home_layout_version: "home-layout-v1",
  path_normalization_version: "home-path-normalization-v1",
  normalized_path_fingerprint: "home-fingerprint",
  home_path_fingerprint_key_id: "ik_test",
  database_relative_path: "sqlite/experienceengine.db",
  created_at: "2026-07-11T00:00:00.000Z"
};

describe("runtime package closure", () => {
  it("captures the current package plugin entrypoint baseline without claiming the target runtime is active", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      openclaw?: { extensions?: string[] };
    };
    expect(packageJson.openclaw?.extensions).toEqual(["./dist/plugin/openclaw-plugin.js"]);
    expect(RUNTIME_CLOSURE_REQUIRED_ENTRYPOINTS).toEqual([
      { role: "openclaw_plugin", path: "dist/plugin/openclaw-plugin.js" },
      {
        role: "package_local_supervisor",
        path: "dist/runtime/package/supervisor-entrypoint.js"
      },
      { role: "package_local_worker", path: "dist/runtime/package/worker-entrypoint.js" }
    ]);
  });

  it("generates a deterministic, exhaustive, package-relative embedded closure manifest", () => {
    const root = createPackageFixture();
    const first = writeRuntimePackageIdentityAssets(root);
    const second = writeRuntimePackageIdentityAssets(root);
    const report = validateRuntimeClosureManifest(root);
    const manifestText = readFileSync(
      join(root, ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/")),
      "utf8"
    );

    expect(first).toEqual(second);
    expect(report).toMatchObject({
      valid: true,
      issues: [],
      closureManifestDigest: first.closure_manifest_digest,
      packageBuildId: first.package_build_id
    });
    expect(first.required_entrypoints).toHaveLength(3);
    expect(first.required_runtime_files.length).toBeGreaterThan(0);
    expect(first.required_runtime_files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "runtime_sqlite_policy",
        path: "dist/runtime/schema/sqlite-policy.js"
      }),
      expect.objectContaining({
        role: "runtime_schema_compatibility",
        path: "dist/runtime/schema/compatibility.js"
      }),
      expect.objectContaining({
        role: "runtime_migration_authority",
        path: "dist/runtime/schema/migration-authority.js"
      }),
      expect.objectContaining({
        role: "runtime_fresh_supervisor_authority",
        path: "dist/runtime/process/fresh-supervisor-authority.js"
      }),
      expect.objectContaining({
        role: "runtime_supervisor_authority",
        path: "dist/runtime/process/supervisor-authority.js"
      }),
      expect.objectContaining({
        role: "runtime_worker_authority",
        path: "dist/runtime/process/worker-authority.js"
      }),
      expect.objectContaining({
        role: "runtime_configuration_generation",
        path: "dist/runtime/configuration/generation.js"
      }),
      expect.objectContaining({
        role: "runtime_configuration_validation",
        path: "dist/runtime/configuration/validation.js"
      }),
      expect.objectContaining({
        role: "runtime_route_authority",
        path: "dist/runtime/configuration/route-authority.js"
      }),
      expect.objectContaining({
        role: "fenced_learning_queue_authority",
        path: "dist/runtime/learning-queue/authority.js"
      }),
      expect.objectContaining({
        role: "fenced_learning_queue_repository",
        path: "dist/runtime/learning-queue/repository.js"
      }),
      expect.objectContaining({
        role: "semantic_origin_provenance",
        path: "dist/runtime/learning-queue/provenance.js"
      })
    ]));
    expect(first.required_runtime_files).toContainEqual(expect.objectContaining({
      role: "runtime_identity_errors",
      path: "dist/runtime/identity/errors.js"
    }));
    expect(first.required_schema_and_migrations).toHaveLength(3);
    expect(manifestText).not.toContain("machine-secrets/integrity-key.json");
    expect(manifestText).not.toContain("key_material");
    expect(manifestText).not.toContain("artifact_integrity");
    expect(manifestText).not.toContain("package_generation_id");
    const profileRegistry = JSON.parse(readFileSync(
      join(root, ...RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH.split("/")),
      "utf8"
    )) as {
      package_build_id: string;
      registry_digest: string;
      entries: Array<{
        quality_profile: string;
        benchmark_evidence: unknown;
        capability_contracts: Record<string, { benchmark_assurance: string }>;
      }>;
    };
    expect(profileRegistry.package_build_id).toBe(first.package_build_id);
    expect(profileRegistry.registry_digest).toBe(first.profile_registry_digest);
    expect(profileRegistry.entries).toHaveLength(1);
    expect(profileRegistry.entries[0]).toMatchObject({
      quality_profile: "custom",
      benchmark_evidence: null
    });
    expect(Object.values(profileRegistry.entries[0].capability_contracts).every(
      (contract) => contract.benchmark_assurance === "unbenchmarked"
    )).toBe(true);
    for (const asset of [
      ...first.required_entrypoints,
      ...first.required_runtime_files,
      ...first.required_schema_and_migrations
    ]) {
      expect(asset.path).not.toMatch(/^[A-Za-z]:[\\/]|^\//u);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("packages the S2 registry as authority foundation while runtime acquisition remains blocked on S3", () => {
    const root = createPackageFixture();
    writeAsset(root, "dist/runtime/package/assets/migrations/registry.json", `${JSON.stringify({
      migration_registry_schema_version: "runtime-migration-registry-v1",
      migration_authority_state: "foundation_ready_runtime_acquisition_blocked_until_s3",
      schema_contract_version: "runtime-schema-contract-v1",
      sqlite_runtime_policy: {
        sqlite_runtime_policy_version: "sqlite-runtime-v1",
        journal_mode: "WAL",
        synchronous: "FULL",
        foreign_keys: "ON",
        busy_timeout_ms: 5000
      },
      schema_version_order: ["legacy-learning-v0", "runtime-schema-v1"],
      sqlite_user_version_by_schema: {
        "legacy-learning-v0": 0,
        "runtime-schema-v1": 1
      },
      runtime_acquisition_requires: "fresh_supervisor_authority",
      migrations: []
    }, null, 2)}\n`);
    const manifest = writeRuntimePackageIdentityAssets(root);
    const migrationAsset = manifest.required_schema_and_migrations.find(
      (asset) => asset.role === "migration_registry"
    );
    expect(migrationAsset).toBeDefined();
    expect(validateRuntimeClosureManifest(root)).toMatchObject({ valid: true, issues: [] });
    const registry = JSON.parse(readFileSync(
      join(root, ...migrationAsset!.path.split("/")),
      "utf8"
    )) as Record<string, unknown>;
    expect(registry).toMatchObject({
      migration_authority_state: "foundation_ready_runtime_acquisition_blocked_until_s3",
      schema_contract_version: "runtime-schema-contract-v1",
      schema_version_order: ["legacy-learning-v0", "runtime-schema-v1"],
      sqlite_user_version_by_schema: {
        "legacy-learning-v0": 0,
        "runtime-schema-v1": 1
      },
      runtime_acquisition_requires: "fresh_supervisor_authority",
      migrations: []
    });
  });

  it("packages S3 process authority while every S6 and production surface remains disabled", () => {
    const root = createPackageFixture();
    const processRegistry = readFileSync(
      "src/runtime/package/assets/process/registry.json",
      "utf8"
    );
    writeAsset(root, RUNTIME_PROCESS_AUTHORITY_REGISTRY_RELATIVE_PATH, processRegistry);
    const manifest = writeRuntimePackageIdentityAssets(root);
    expect(validateRuntimeClosureManifest(root)).toMatchObject({ valid: true, issues: [] });
    const processAsset = manifest.required_runtime_files.find(
      (asset) => asset.role === "runtime_process_registry"
    );
    expect(processAsset?.path).toBe(RUNTIME_PROCESS_AUTHORITY_REGISTRY_RELATIVE_PATH);
    const registry = JSON.parse(readFileSync(
      join(root, ...RUNTIME_PROCESS_AUTHORITY_REGISTRY_RELATIVE_PATH.split("/")),
      "utf8"
    )) as Record<string, unknown>;
    expect(registry).toMatchObject({
      process_authority_stage: "process_authority_foundation_s3",
      package_authorization_issuer: "s6-package-authorization-mutation-v1",
      worker_acquisition_authority: "s6-worker-acquisition-authority-v1",
      production_write_authority: "s6-production-write-authority-v1",
      queue_claiming_enabled: false,
      semantic_writes_enabled: false,
      production_learning_ready: false,
      learning_runtime_active: false
    });
    expect(PACKAGE_LOCAL_SUPERVISOR_ENTRYPOINT).toEqual({
      role: "package_local_supervisor",
      stage: "fenced_learning_queue_s5",
      processAuthorityStage: "process_authority_foundation_s3",
      processAuthorityImplemented: true,
      migrationAuthorityProviderImplemented: true,
      fencedQueueMaintenanceConsumerImplemented: true,
      productionActivationAuthorityPackaged: true,
      activationHandshakeOrchestratorPackaged: true,
      nativeControlServicePackaged: true,
      productionWriteAuthorityProviderConnected: false,
      packageAuthorizationIssuerConnected: false,
      executableLeaseLifecycleConnected: true,
      productionActivationImplemented: false
    });
    expect(PACKAGE_LOCAL_WORKER_ENTRYPOINT).toEqual({
      role: "package_local_worker",
      stage: "fenced_learning_queue_s5",
      processAuthorityStage: "process_authority_foundation_s3",
      workerLeaseImplemented: true,
      executableLeaseLifecycleConnected: true,
      workerAcquisitionAuthorityConnected: true,
      fencedQueueSemanticsImplemented: true,
      separateRetryCountersImplemented: true,
      semanticOriginProvenanceImplemented: true,
      productionWriteAuthorityProviderPackaged: true,
      activationHandshakeAcknowledgementConnected: true,
      productionWriteAuthorityConnected: false,
      productionQueueImplemented: false,
      semanticWritesImplemented: false
    });
    expect(inspectRuntimeProcessAuthority({
      supervisorAuthority: {
        available: false,
        fresh: false,
        authority_contract_version: "runtime-supervisor-authority-v1",
        reason: "supervisor_not_current",
        observed_at: "2026-07-12T00:00:00.000Z"
      }
    })).toMatchObject({
      stage: "process_authority_foundation_s3",
      worker_authority_present: false,
      package_authorization_issuer_connected: false,
      worker_acquisition_authority_connected: false,
      production_activation_connected: false,
      queue_claiming_enabled: false,
      semantic_writes_enabled: false,
      production_learning_ready: false,
      learning_runtime_active: false
    });
  });

  it("rejects a missing declared runtime asset", () => {
    const root = createPackageFixture();
    const manifest = writeRuntimePackageIdentityAssets(root);
    const worker = manifest.required_entrypoints.find((asset) => asset.role === "package_local_worker");
    expect(worker).toBeDefined();
    rmSync(join(root, ...worker!.path.split("/")));

    expect(validateRuntimeClosureManifest(root)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.stringMatching(/^asset_missing:package_local_worker:/u)])
    });
    expect(() => assertRuntimeClosureManifest(root)).toThrowError(
      expect.objectContaining({ code: "EE_RUNTIME_CLOSURE_INVALID" })
    );
  });

  it("rejects digest changes and manifest self-digest changes", () => {
    const root = createPackageFixture();
    const manifest = writeRuntimePackageIdentityAssets(root);
    const plugin = manifest.required_entrypoints.find((asset) => asset.role === "openclaw_plugin");
    writeAsset(root, plugin!.path, "altered-plugin\n");
    expect(validateRuntimeClosureManifest(root).issues).toContain(
      "asset_digest_mismatch:openclaw_plugin"
    );

    writeRuntimePackageIdentityAssets(root);
    const manifestPath = join(root, ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/"));
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    parsed.package_build_id = "build_tampered";
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    expect(validateRuntimeClosureManifest(root).issues).toContain(
      "closure_manifest_digest_mismatch"
    );
  });

  it("rejects self-consistent manifest metadata that differs from the package", () => {
    const root = createPackageFixture();
    writeRuntimePackageIdentityAssets(root);
    const manifestPath = join(root, ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/"));
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    parsed.package_name = "@example/tampered";
    parsed.package_version = "99.0.0";
    parsed.package_build_id = "build_tampered";
    const { closure_manifest_digest: _discardedDigest, ...content } = parsed;
    parsed.closure_manifest_digest = sha256Text(canonicalJson(content));
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    expect(validateRuntimeClosureManifest(root)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        "package_name_mismatch",
        "package_version_mismatch",
        "package_build_id_mismatch",
        "manifest_generation_mismatch"
      ])
    });
  });

  it("fails closed on malformed asset groups instead of throwing", () => {
    const root = createPackageFixture();
    writeRuntimePackageIdentityAssets(root);
    const manifestPath = join(root, ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/"));
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    parsed.required_runtime_files = { invalid: true };
    const { closure_manifest_digest: _discardedDigest, ...content } = parsed;
    parsed.closure_manifest_digest = sha256Text(canonicalJson(content));
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    expect(() => validateRuntimeClosureManifest(root)).not.toThrow();
    expect(validateRuntimeClosureManifest(root)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        "invalid_asset_group:required_runtime_files",
        "asset_set_not_exhaustive"
      ])
    });
  });

  it("rejects Windows absolute asset paths on every host platform", () => {
    const root = createPackageFixture();
    writeRuntimePackageIdentityAssets(root);
    const manifestPath = join(root, ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/"));
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      required_runtime_files: Array<Record<string, unknown>>;
      closure_manifest_digest: string;
      [key: string]: unknown;
    };
    parsed.required_runtime_files[0].path = "C:\\escaped-runtime.js";
    const { closure_manifest_digest: _discardedDigest, ...content } = parsed;
    parsed.closure_manifest_digest = sha256Text(canonicalJson(content));
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    expect(validateRuntimeClosureManifest(root)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.stringMatching(/^asset_missing:runtime_identity_constants:/u),
        "required_role_mismatch:runtime_identity_constants"
      ])
    });
  });

  it("returns a fail-closed report when package metadata is unreadable", () => {
    const root = createPackageFixture();
    writeRuntimePackageIdentityAssets(root);
    writeFileSync(join(root, "package.json"), "{not-json", "utf8");

    expect(() => validateRuntimeClosureManifest(root)).not.toThrow();
    expect(validateRuntimeClosureManifest(root)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.stringMatching(/^expected_manifest_unavailable:/u)
      ])
    });
  });

  it("derives package generation from install identity and artifact integrity, not version alone", () => {
    const root = createPackageFixture();
    const manifest = writeRuntimePackageIdentityAssets(root);
    const first = createRuntimePackageGenerationIdentity({
      manifest,
      artifactIntegrity: "sha256:artifact-a",
      installRecordIdentity: "install-a",
      publishedChannel: "local_test",
      compatibility
    });
    const same = createRuntimePackageGenerationIdentity({
      manifest,
      artifactIntegrity: "sha256:artifact-a",
      installRecordIdentity: "install-a",
      publishedChannel: "local_test",
      compatibility
    });
    const otherArtifact = createRuntimePackageGenerationIdentity({
      manifest,
      artifactIntegrity: "sha256:artifact-b",
      installRecordIdentity: "install-a",
      publishedChannel: "local_test",
      compatibility
    });
    const otherInstall = createRuntimePackageGenerationIdentity({
      manifest,
      artifactIntegrity: "sha256:artifact-a",
      installRecordIdentity: "install-b",
      publishedChannel: "local_test",
      compatibility
    });

    expect(first).toEqual(same);
    expect(first.package_generation_id).toMatch(/^pkg_[a-f0-9]{64}$/u);
    expect(otherArtifact.package_generation_id).not.toBe(first.package_generation_id);
    expect(otherInstall.package_generation_id).not.toBe(first.package_generation_id);
    expect(first).toMatchObject({
      plugin_entrypoint: "dist/plugin/openclaw-plugin.js",
      supervisor_entrypoint: "dist/runtime/package/supervisor-entrypoint.js",
      worker_entrypoint: "dist/runtime/package/worker-entrypoint.js",
      published_channel: "local_test"
    });
  });

  it("reports only identity-foundation readiness and never activation readiness", () => {
    const root = createPackageFixture();
    writeRuntimePackageIdentityAssets(root);
    const closure = validateRuntimeClosureManifest(root);

    expect(inspectRuntimeIdentityFoundation({ closure, homeIdentity })).toEqual({
      projection_schema_version: "runtime-identity-foundation-inspection-v1",
      identity_foundation_state: "ready_for_next_dependency",
      package_closure_state: "valid",
      home_identity_state: "committed",
      home_id: "home-1",
      path_normalization_version: "home-path-normalization-v1",
      normalized_path_fingerprint: "home-fingerprint",
      package_build_id: closure.packageBuildId,
      closure_manifest_digest: closure.closureManifestDigest,
      production_learning_ready: false,
      learning_runtime_active: false,
      activation_evaluated: false,
      issues: []
    });
  });
});
