import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOpenClawInstallTarball
} from "../../dist/install/openclaw-installer.js";
import {
  resolveExperienceEnginePaths
} from "../../dist/config/path-resolver.js";
import {
  assertRuntimeClosureManifest
} from "../../dist/runtime/package/closure-manifest.js";
import {
  createOrAdoptRuntimeInstallAttestation,
  fingerprintRuntimeInstallPath
} from "../../dist/runtime/package/install-attestation.js";
import {
  initializeRuntimeHomeIdentity
} from "../../dist/runtime/identity/control-plane-bootstrap.js";
import {
  runOpenClawHostValidation
} from "../../dist/runtime/distribution/openclaw-host-validation-runner.js";
import {
  createSqliteOpenClawHostAuthorityCollector
} from "../../dist/runtime/distribution/sqlite-openclaw-host-authority-collector.js";
import {
  createPublishedOpenClawHostFixture
} from "../../dist/runtime/distribution/published-openclaw-host-fixture.js";

const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const openclawExecutable =
  process.env.EXPERIENCE_ENGINE_OPENCLAW_EXECUTABLE?.trim();
const seedConfigPath =
  process.env.EXPERIENCE_ENGINE_OPENCLAW_SEED_CONFIG?.trim();

if (!openclawExecutable) {
  throw new Error(
    "EXPERIENCE_ENGINE_OPENCLAW_EXECUTABLE is required for real-host local-pack validation."
  );
}
if (!seedConfigPath) {
  throw new Error(
    "EXPERIENCE_ENGINE_OPENCLAW_SEED_CONFIG is required so the real agent turn can use an existing isolated copy of valid host configuration."
  );
}

const validationRoot = await mkdtemp(
  join(tmpdir(), "ee-openclaw-live-host-local-pack-")
);
const runtimeHome = join(validationRoot, "runtime-home");
const sqlitePath = join(runtimeHome, "sqlite", "experienceengine.db");
const paths = resolveExperienceEnginePaths({
  adapter: "openclaw",
  env: {
    ...process.env,
    EXPERIENCE_ENGINE_HOME: runtimeHome
  }
});

try {
  await mkdir(paths.dataDir, { recursive: true });
  await mkdir(paths.captureDir, { recursive: true });
  await mkdir(join(runtimeHome, "adapters", "openclaw"), { recursive: true });
  await mkdir(join(runtimeHome, "sqlite"), { recursive: true });
  const tarballPath = createOpenClawInstallTarball(packageRoot, paths);
  const tarballBytes = await readFile(tarballPath);
  const artifactIntegrity = `sha256:${createHash("sha256")
    .update(tarballBytes)
    .digest("hex")}`;
  const artifactStat = await stat(tarballPath);
  const artifact = {
    // The runner's public channel type is deliberately not used in the final
    // result. Package identity and attestation are explicitly local_pack below.
    published_channel: "npm",
    package_name: "@alan512/experienceengine",
    package_version: JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8")
    ).version,
    artifact_path: tarballPath,
    artifact_integrity: artifactIntegrity,
    artifact_size: artifactStat.size,
    registry_record_identity: `local-pack:${artifactIntegrity.slice("sha256:".length)}`,
    materialized_at: new Date().toISOString()
  };
  const fixture = await createPublishedOpenClawHostFixture({
    installOrigin: "local_pack",
    runtimePublishedChannel: "local_test"
  });
  const collector = createSqliteOpenClawHostAuthorityCollector({
    startFixture: fixture.startFixture
  });
  const evidence = await runOpenClawHostValidation({
    artifact,
    openclawExecutable,
    validationRoot: join(validationRoot, "openclaw-host"),
    runtimeHome,
    sqlitePath,
    pluginConfig: {
      dataDir: runtimeHome,
      sqlitePath,
      captureDir: join(runtimeHome, "captures")
    },
    authorityCollector: collector,
    seedConfigPath,
    agentId:
      process.env.EXPERIENCE_ENGINE_OPENCLAW_AGENT_ID?.trim() || undefined,
    approveHostSecurityScan:
      process.env.EXPERIENCE_ENGINE_APPROVE_HOST_SECURITY_SCAN === "true",
    installedPackageVerifier: async (installedRoot) => {
      const closure = assertRuntimeClosureManifest(installedRoot);
      return {
        packageBuildId: closure.packageBuildId,
        closureManifestDigest: closure.closureManifestDigest
      };
    },
    publishedAttestationIssuer: async (input) => {
      const home = await initializeRuntimeHomeIdentity({
        writer: "gateway_service_controller",
        explicitOpenClawHome: input.runtimeHome,
        now: input.now
      });
      await createOrAdoptRuntimeInstallAttestation({
        canonicalHome: home.resolution.resolvedHome,
        integrityKey: home.integrityKey,
        content: {
          install_origin: "local_pack",
          package_name: input.artifact.package_name,
          package_version: input.artifact.package_version,
          package_build_id: input.packageBuildId,
          closure_manifest_digest: input.closureManifestDigest,
          installed_root_fingerprint: fingerprintRuntimeInstallPath(
            input.installedRoot
          ),
          host_state_dir_fingerprint: fingerprintRuntimeInstallPath(
            input.stateDir
          ),
          home_id: home.homeIdentity.home_id,
          database_path_fingerprint: fingerprintRuntimeInstallPath(
            input.sqlitePath
          ),
          openclaw_version: input.openclawVersion,
          node_version: process.version,
          artifact_integrity: input.artifact.artifact_integrity,
          registry_record_identity: null,
          security_approval:
            input.security.security_scan_status === "approved"
              ? {
                  scan_status: "approved",
                  scan_summary_digest:
                    input.security.security_scan_summary_digest,
                  approval_method: "explicit_cli",
                  approved_at: input.now().toISOString()
                }
              : {
                  scan_status: "not_required",
                  scan_summary_digest: null,
                  approval_method: null,
                  approved_at: null
                },
          issued_by: "ee_installer",
          issued_at: input.now().toISOString()
        }
      });
    },
    prepareRuntimeAuthority: fixture.prepareRuntimeAuthority,
    cleanupRuntimeFixture: fixture.cleanup
  });

  console.log(JSON.stringify({
    ok: true,
    evidence_class: "local_pack_live_host_preflight",
    package_name: evidence.package_name,
    package_version: evidence.package_version,
    artifact_integrity: evidence.artifact_integrity,
    closure_manifest_digest:
      assertRuntimeClosureManifest(packageRoot).closureManifestDigest,
    host_environment: evidence.host_environment,
    activation: evidence.activation,
    queue: evidence.queue,
    shutdown: evidence.shutdown,
    interaction_active: evidence.interaction_active,
    learning_runtime_active: evidence.learning_runtime_active,
    production_learning_ready: false,
    artifact_runtime_validated: false,
    support_claim_allowed: false,
    limitation:
      "This is a local-pack real-host preflight. It is not npm or ClawHub published evidence."
  }));
} finally {
  await rm(validationRoot, { recursive: true, force: true });
}
