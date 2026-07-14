import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  initializeRuntimeHomeIdentity
} from "../../src/runtime/identity/control-plane-bootstrap.js";
import {
  assertRuntimeInstallAttestationBinding,
  createOrAdoptRuntimeInstallAttestation,
  fingerprintRuntimeInstallPath,
  readRuntimeInstallAttestation,
  readRuntimeInstallAttestations,
  resolveRuntimeInstallAttestationPath
} from "../../src/runtime/package/install-attestation.js";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-install-attestation-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  while (roots.length > 0) {
    await rm(roots.pop()!, { recursive: true, force: true });
  }
});

const createFixture = async (root: string) => {
  const home = join(root, "runtime-home");
  const initialized = await initializeRuntimeHomeIdentity({
    writer: "gateway_service_controller",
    explicitOpenClawHome: home,
    now: () => new Date("2026-07-14T12:00:00.000Z")
  });
  const installedRoot = join(root, "installed-package");
  const stateDir = join(root, "openclaw-state");
  return { home, initialized, installedRoot, stateDir };
};

describe("runtime install attestation", () => {
  it("creates and adopts one HMAC-bound host-native attestation", async () => {
    const root = await makeRoot();
    const fixture = await createFixture(root);
    const content = {
      install_origin: "host_native_unattested" as const,
      package_name: "@alan512/experienceengine",
      package_version: "0.4.9",
      package_build_id: "build-fixture",
      closure_manifest_digest: "closure-fixture",
      installed_root_fingerprint: fingerprintRuntimeInstallPath(fixture.installedRoot),
      host_state_dir_fingerprint: fingerprintRuntimeInstallPath(fixture.stateDir),
      home_id: fixture.initialized.homeIdentity.home_id,
      database_path_fingerprint: fingerprintRuntimeInstallPath(
        fixture.initialized.resolution.databasePath
      ),
      openclaw_version: "OpenClaw 2026.4.1",
      node_version: "v22.21.0",
      artifact_integrity: "sha256:closure-fixture",
      registry_record_identity: null,
      security_approval: {
        scan_status: "not_required" as const,
        scan_summary_digest: null,
        approval_method: null,
        approved_at: null
      },
      issued_by: "gateway_service_controller" as const,
      issued_at: "2026-07-14T12:00:00.000Z"
    };
    const first = await createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content
    });
    const adopted = await createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content
    });
    expect(adopted).toEqual(first);
    expect(first.attestation_identity).toMatch(/^install_[a-f0-9]{64}$/u);
    expect(JSON.stringify(first)).not.toContain(fixture.installedRoot);
    assertRuntimeInstallAttestationBinding({
      attestation: first,
      packageName: content.package_name,
      packageVersion: content.package_version,
      packageBuildId: content.package_build_id,
      closureManifestDigest: content.closure_manifest_digest,
      installedRoot: fixture.installedRoot,
      hostStateDir: fixture.stateDir,
      homeId: content.home_id,
      databasePath: fixture.initialized.resolution.databasePath
    });
  });

  it("adopts the first immutable generation record across later lifecycle timestamps", async () => {
    const root = await makeRoot();
    const fixture = await createFixture(root);
    const base = {
      install_origin: "host_native_unattested" as const,
      package_name: "@alan512/experienceengine",
      package_version: "0.4.9",
      package_build_id: "build-fixture",
      closure_manifest_digest: "closure-fixture",
      installed_root_fingerprint: fingerprintRuntimeInstallPath(fixture.installedRoot),
      host_state_dir_fingerprint: fingerprintRuntimeInstallPath(fixture.stateDir),
      home_id: fixture.initialized.homeIdentity.home_id,
      database_path_fingerprint: fingerprintRuntimeInstallPath(
        fixture.initialized.resolution.databasePath
      ),
      openclaw_version: null,
      node_version: process.version,
      artifact_integrity: "sha256:closure-fixture",
      registry_record_identity: null,
      security_approval: {
        scan_status: "not_run" as const,
        scan_summary_digest: null,
        approval_method: null,
        approved_at: null
      },
      issued_by: "gateway_service_controller" as const,
      issued_at: "2026-07-14T12:00:00.000Z"
    };
    const first = await createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content: base
    });
    const adopted = await createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content: {
        ...base,
        issued_at: "2026-07-14T13:00:00.000Z"
      }
    });
    expect(adopted).toEqual(first);
    expect(adopted.issued_at).toBe("2026-07-14T12:00:00.000Z");
  });

  it("rejects published origin without registry evidence", async () => {
    const root = await makeRoot();
    const fixture = await createFixture(root);
    await expect(createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content: {
        install_origin: "published_npm_attested",
        package_name: "@alan512/experienceengine",
        package_version: "0.4.9",
        package_build_id: "build-fixture",
        closure_manifest_digest: "closure-fixture",
        installed_root_fingerprint: fingerprintRuntimeInstallPath(fixture.installedRoot),
        host_state_dir_fingerprint: fingerprintRuntimeInstallPath(fixture.stateDir),
        home_id: fixture.initialized.homeIdentity.home_id,
        database_path_fingerprint: fingerprintRuntimeInstallPath(
          fixture.initialized.resolution.databasePath
        ),
        openclaw_version: "2026.4.1",
        node_version: process.version,
        artifact_integrity: "sha512-fixture",
        registry_record_identity: null,
        security_approval: {
          scan_status: "not_required",
          scan_summary_digest: null,
          approval_method: null,
          approved_at: null
        },
        issued_by: "published_validator",
        issued_at: "2026-07-14T12:00:00.000Z"
      }
    })).rejects.toMatchObject({
      code: "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID"
    });
  });

  it("rejects HMAC tampering", async () => {
    const root = await makeRoot();
    const fixture = await createFixture(root);
    await createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content: {
        install_origin: "local_pack",
        package_name: "@alan512/experienceengine",
        package_version: "0.4.9",
        package_build_id: "build-fixture",
        closure_manifest_digest: "closure-fixture",
        installed_root_fingerprint: fingerprintRuntimeInstallPath(fixture.installedRoot),
        host_state_dir_fingerprint: fingerprintRuntimeInstallPath(fixture.stateDir),
        home_id: fixture.initialized.homeIdentity.home_id,
        database_path_fingerprint: fingerprintRuntimeInstallPath(
          fixture.initialized.resolution.databasePath
        ),
        openclaw_version: null,
        node_version: process.version,
        artifact_integrity: "sha256:closure-fixture",
        registry_record_identity: null,
        security_approval: {
          scan_status: "not_run",
          scan_summary_digest: null,
          approval_method: null,
          approved_at: null
        },
        issued_by: "ee_installer",
        issued_at: "2026-07-14T12:00:00.000Z"
      }
    });
    const created = await readRuntimeInstallAttestations({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey
    });
    const path = resolveRuntimeInstallAttestationPath(
      fixture.home,
      created[0].attestation_identity
    );
    const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    parsed.package_build_id = "tampered";
    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await expect(readRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      attestationIdentity: created[0].attestation_identity
    })).rejects.toMatchObject({
      code: "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID"
    });
  });

  it("keeps immutable attestations for multiple package generations", async () => {
    const root = await makeRoot();
    const fixture = await createFixture(root);
    const base = {
      install_origin: "local_pack" as const,
      package_name: "@alan512/experienceengine",
      package_version: "0.4.9",
      closure_manifest_digest: "closure-fixture",
      installed_root_fingerprint: fingerprintRuntimeInstallPath(fixture.installedRoot),
      host_state_dir_fingerprint: fingerprintRuntimeInstallPath(fixture.stateDir),
      home_id: fixture.initialized.homeIdentity.home_id,
      database_path_fingerprint: fingerprintRuntimeInstallPath(
        fixture.initialized.resolution.databasePath
      ),
      openclaw_version: null,
      node_version: process.version,
      registry_record_identity: null,
      security_approval: {
        scan_status: "not_run" as const,
        scan_summary_digest: null,
        approval_method: null,
        approved_at: null
      },
      issued_by: "ee_installer" as const,
      issued_at: "2026-07-14T12:00:00.000Z"
    };
    const first = await createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content: {
        ...base,
        package_build_id: "build-one",
        artifact_integrity: "sha256:one"
      }
    });
    const second = await createOrAdoptRuntimeInstallAttestation({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey,
      content: {
        ...base,
        package_version: "0.5.0",
        package_build_id: "build-two",
        closure_manifest_digest: "closure-two",
        artifact_integrity: "sha256:two"
      }
    });
    expect(second.attestation_identity).not.toBe(first.attestation_identity);
    expect(await readRuntimeInstallAttestations({
      canonicalHome: fixture.home,
      integrityKey: fixture.initialized.integrityKey
    })).toHaveLength(2);
  });
});
