import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExperienceEnginePaths } from "../../src/config/path-resolver.js";
import {
  createGatewayRuntimeIdentityEnvelope,
  consumeGatewayRuntimeIdentityEnvelope
} from "../../src/runtime/identity/binding.js";
import {
  createRuntimeHomeIdentity,
  normalizeHomePathForFingerprint,
  resolveCanonicalRuntimeHome
} from "../../src/runtime/identity/home-identity.js";
import {
  consumeSupervisorIdentityEnvelope
} from "../../src/runtime/package/supervisor-entrypoint.js";
import {
  consumeWorkerIdentityEnvelope
} from "../../src/runtime/package/worker-entrypoint.js";
import type {
  MachineIntegrityKey,
  RuntimePackageGenerationIdentity,
  RuntimeParticipantIdentity
} from "../../src/runtime/identity/types.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-runtime-home-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const TEST_KEY: MachineIntegrityKey = {
  key_schema_version: "machine-integrity-key-v1",
  integrity_key_id: "ik_test",
  key_material: Buffer.alloc(32, 7).toString("base64url"),
  created_at: "2026-07-11T00:00:00.000Z"
};

const TEST_PACKAGE: RuntimePackageGenerationIdentity = {
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  package_generation_id: "pkg_generation",
  artifact_integrity: "sha256:artifact",
  install_record_identity: "install:test",
  plugin_entrypoint: "dist/plugin/openclaw-plugin.js",
  supervisor_entrypoint: "dist/runtime/package/supervisor-entrypoint.js",
  worker_entrypoint: "dist/runtime/package/worker-entrypoint.js",
  supervisor_protocol_version: "runtime-identity-v1",
  worker_protocol_version: "runtime-identity-v1",
  control_protocol_version: "runtime-control-v1",
  profile_registry_digest: "profile-digest",
  min_read_schema_version: "pending-s2",
  max_read_schema_version: "pending-s2",
  min_write_schema_version: "pending-s2",
  max_write_schema_version: "pending-s2",
  target_schema_version: "pending-s2",
  published_channel: "local_test"
};

describe("canonical runtime home identity", () => {
  it("uses the frozen explicit, environment, then product-default resolution order", () => {
    const root = makeTempDir();
    const explicit = join(root, "explicit");
    const inherited = join(root, "inherited");
    const productDefault = join(root, "default");

    expect(resolveCanonicalRuntimeHome({
      explicitOpenClawHome: explicit,
      env: { EXPERIENCE_ENGINE_HOME: inherited },
      defaultHome: productDefault
    })).toMatchObject({
      resolutionMode: "openclaw_explicit",
      resolvedHome: explicit
    });

    expect(resolveCanonicalRuntimeHome({
      env: { EXPERIENCE_ENGINE_HOME: inherited },
      defaultHome: productDefault
    })).toMatchObject({
      resolutionMode: "environment",
      resolvedHome: inherited
    });

    expect(resolveCanonicalRuntimeHome({ env: {}, defaultHome: productDefault })).toMatchObject({
      resolutionMode: "product_default",
      resolvedHome: productDefault,
      homeLayoutVersion: "home-layout-v1",
      pathNormalizationVersion: "home-path-normalization-v1",
      databaseRelativePath: "sqlite/experienceengine.db"
    });
  });

  it("does not use legacy OpenClaw data presence while preserving the existing path resolver baseline", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".openclaw", "experienceengine", "sqlite"), { recursive: true });

    const legacyPaths = resolveExperienceEnginePaths({ homeDir: root, env: {} });
    const canonical = resolveCanonicalRuntimeHome({
      env: {},
      defaultHome: join(root, ".experienceengine")
    });

    expect(legacyPaths.mode).toBe("openclaw-compat");
    expect(canonical.resolutionMode).toBe("product_default");
    expect(canonical.resolvedHome).toBe(join(root, ".experienceengine"));
  });

  it("freezes Windows drive, UNC, separator, dot-segment, casing, and NFC normalization", () => {
    expect(normalizeHomePathForFingerprint("c:\\Users\\ALICE\\Projects\\..\\EE\\", {
      platform: "win32",
      cwd: "C:\\"
    })).toBe("C:/users/alice/ee");

    expect(normalizeHomePathForFingerprint("\\\\Server\\Share\\Folder\\..\\EE\\", {
      platform: "win32",
      cwd: "C:\\"
    })).toBe("//server/share/ee");

    expect(normalizeHomePathForFingerprint("/tmp/e\u0301/./engine/", {
      platform: "linux",
      cwd: "/"
    })).toBe("/tmp/é/engine");
  });

  it("produces one stable fingerprint for equivalent path spellings", () => {
    const first = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: "C:\\Users\\ALICE\\EE\\",
      env: {},
      defaultHome: "C:\\unused",
      platform: "win32",
      cwd: "C:\\"
    });
    const second = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: "c:/users/alice/./EE",
      env: {},
      defaultHome: "C:\\unused",
      platform: "win32",
      cwd: "C:\\"
    });
    const firstIdentity = createRuntimeHomeIdentity({
      homeId: "home-1",
      resolution: first,
      integrityKey: TEST_KEY,
      createdAt: "2026-07-11T00:00:00.000Z"
    });
    const secondIdentity = createRuntimeHomeIdentity({
      homeId: "home-1",
      resolution: second,
      integrityKey: TEST_KEY,
      createdAt: "2026-07-11T00:00:00.000Z"
    });

    expect(first.normalizedHomePath).toBe(second.normalizedHomePath);
    expect(firstIdentity.normalized_path_fingerprint).toBe(
      secondIdentity.normalized_path_fingerprint
    );
  });

  it("makes supervisor and worker consume the gateway envelope without re-running precedence", () => {
    const resolution = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: makeTempDir(),
      env: { EXPERIENCE_ENGINE_HOME: makeTempDir() },
      defaultHome: makeTempDir()
    });
    const home = createRuntimeHomeIdentity({
      homeId: "home-1",
      resolution,
      integrityKey: TEST_KEY,
      createdAt: "2026-07-11T00:00:00.000Z"
    });
    const envelope = createGatewayRuntimeIdentityEnvelope({
      resolution,
      home,
      package: TEST_PACKAGE
    });
    const participant: RuntimeParticipantIdentity = {
      participant: "supervisor",
      home_id: home.home_id,
      home_layout_version: home.home_layout_version,
      path_normalization_version: home.path_normalization_version,
      normalized_path_fingerprint: home.normalized_path_fingerprint,
      database_relative_path: home.database_relative_path,
      package_generation_id: TEST_PACKAGE.package_generation_id,
      artifact_integrity: TEST_PACKAGE.artifact_integrity
    };

    const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
    process.env.EXPERIENCE_ENGINE_HOME = makeTempDir();
    try {
      expect(consumeSupervisorIdentityEnvelope(envelope, participant)).toEqual({
        ok: true,
        value: envelope
      });
      expect(consumeWorkerIdentityEnvelope(envelope, {
        ...participant,
        participant: "worker"
      })).toEqual({ ok: true, value: envelope });
      expect(envelope.canonical_home_resolution).toMatchObject({
        resolution_mode: "openclaw_explicit",
        resolved_home: resolution.resolvedHome,
        database_relative_path: "sqlite/experienceengine.db"
      });
    } finally {
      if (originalHome === undefined) {
        delete process.env.EXPERIENCE_ENGINE_HOME;
      } else {
        process.env.EXPERIENCE_ENGINE_HOME = originalHome;
      }
    }
  });

  it("fails closed on home, package generation, and artifact mismatches", () => {
    const resolution = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: makeTempDir(),
      env: {},
      defaultHome: makeTempDir()
    });
    const home = createRuntimeHomeIdentity({
      homeId: "home-1",
      resolution,
      integrityKey: TEST_KEY,
      createdAt: "2026-07-11T00:00:00.000Z"
    });
    const envelope = createGatewayRuntimeIdentityEnvelope({
      resolution,
      home,
      package: TEST_PACKAGE
    });
    const base: RuntimeParticipantIdentity = {
      participant: "worker",
      home_id: home.home_id,
      home_layout_version: home.home_layout_version,
      path_normalization_version: home.path_normalization_version,
      normalized_path_fingerprint: home.normalized_path_fingerprint,
      database_relative_path: home.database_relative_path,
      package_generation_id: TEST_PACKAGE.package_generation_id,
      artifact_integrity: TEST_PACKAGE.artifact_integrity
    };

    expect(consumeGatewayRuntimeIdentityEnvelope(envelope, {
      ...base,
      home_id: "other-home"
    })).toMatchObject({ ok: false, code: "EE_HOME_IDENTITY_MISMATCH" });
    expect(consumeGatewayRuntimeIdentityEnvelope(envelope, {
      ...base,
      home_layout_version: "other-layout"
    })).toMatchObject({ ok: false, code: "EE_HOME_IDENTITY_MISMATCH" });
    expect(consumeGatewayRuntimeIdentityEnvelope(envelope, {
      ...base,
      package_generation_id: "pkg_other"
    })).toMatchObject({ ok: false, code: "EE_PACKAGE_GENERATION_MISMATCH" });
    expect(consumeGatewayRuntimeIdentityEnvelope(envelope, {
      ...base,
      artifact_integrity: "sha256:other"
    })).toMatchObject({ ok: false, code: "EE_ARTIFACT_INTEGRITY_MISMATCH" });
  });

  it("rejects an internally inconsistent gateway-resolved home envelope", () => {
    const resolution = resolveCanonicalRuntimeHome({
      explicitOpenClawHome: makeTempDir(),
      env: {},
      defaultHome: makeTempDir()
    });
    const home = createRuntimeHomeIdentity({
      homeId: "home-1",
      resolution,
      integrityKey: TEST_KEY,
      createdAt: "2026-07-11T00:00:00.000Z"
    });

    expect(() => createGatewayRuntimeIdentityEnvelope({
      resolution: { ...resolution, homeLayoutVersion: "other-layout" },
      home,
      package: TEST_PACKAGE
    })).toThrowError(expect.objectContaining({ code: "EE_HOME_IDENTITY_MISMATCH" }));
  });
});
