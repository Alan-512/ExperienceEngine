import { describe, expect, it } from "vitest";
import {
  createDefaultInstalledOpenClawRuntimeService,
  deriveOpenClawInstallRecordIdentity,
  OPENCLAW_INSTALLED_PRODUCTION_BINDING_CONTRACT
} from "../../src/plugin/openclaw-production-runtime.js";
import { defaultConfig } from "../../src/config/default-config.js";
import type {
  PersistedOpenClawInstallState
} from "../../src/plugin/openclaw-install-state.js";

const installState = (): PersistedOpenClawInstallState => ({
  adapter: "openclaw",
  installedAt: "2026-07-13T00:00:00.000Z",
  installedVersion: "0.4.8",
  installMode: "packaged-plugin",
  installSource: "local-package.tgz",
  hostWiring: { wired: true, restartRecommended: true },
  dataDir: "runtime-home",
  sqlitePath: "runtime-home/sqlite/experienceengine.db"
});

describe("default installed OpenClaw production runtime binding", () => {
  it("derives install generation identity from install record, package root, host state, and closure", () => {
    const base = deriveOpenClawInstallRecordIdentity({
      installState: installState(),
      packageRoot: "package-root",
      stateDir: "host-state",
      closureManifestDigest: "closure-a",
      packageBuildId: "build-a"
    });
    expect(base).toMatch(/^install_[a-f0-9]{64}$/u);
    expect(deriveOpenClawInstallRecordIdentity({
      installState: installState(),
      packageRoot: "package-root",
      stateDir: "host-state",
      closureManifestDigest: "closure-a",
      packageBuildId: "build-a"
    })).toBe(base);
    expect(deriveOpenClawInstallRecordIdentity({
      installState: installState(),
      packageRoot: "package-root",
      stateDir: "different-host-state",
      closureManifestDigest: "closure-a",
      packageBuildId: "build-a"
    })).not.toBe(base);
    expect(deriveOpenClawInstallRecordIdentity({
      installState: installState(),
      packageRoot: "package-root",
      stateDir: "host-state",
      closureManifestDigest: "closure-b",
      packageBuildId: "build-a"
    })).not.toBe(base);
  });

  it("remains unavailable before start and rejects missing host state before touching closure or install authority", async () => {
    const service = createDefaultInstalledOpenClawRuntimeService({
      packageRoot: "package-root",
      config: defaultConfig
    });
    await expect(service.execute({ operation: "status" })).resolves.toMatchObject({
      ok: true,
      code: "runtime_service_unavailable",
      result: {
        interaction_active: true,
        learning_runtime_active: false,
        production_learning_ready: false
      }
    });
    await expect(service.start()).resolves.toMatchObject({
      ok: false,
      code: "EE_OPENCLAW_RUNTIME_STATE_DIR_REQUIRED"
    });
  });

  it("freezes conservative local evidence semantics", () => {
    expect(OPENCLAW_INSTALLED_PRODUCTION_BINDING_CONTRACT).toEqual({
      requires_verified_closure: true,
      mutable_install_state_is_runtime_authority: false,
      host_native_signed_attestation_bootstrap: true,
      requires_host_state_dir: true,
      canonical_database_path_required: true,
      install_origin_without_registry_evidence: "host_native_unattested",
      default_quality_projection: "not_production_ready",
      handshake_request_requires_verified_route_authority: true,
      default_current_configuration_recovery: true,
      commands_share_deferred_service_object: true
    });
  });
});
