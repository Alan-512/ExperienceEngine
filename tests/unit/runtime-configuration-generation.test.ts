import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RuntimeConfigurationError
} from "../../src/runtime/configuration/errors.js";
import {
  RuntimeConfigurationGenerationRepository,
  prepareRuntimeConfigurationGeneration,
  readRuntimeConfigurationPointer,
  resolveRuntimeConfigurationGenerationDirectory,
  verifyRuntimeConfigurationGeneration
} from "../../src/runtime/configuration/generation.js";
import {
  loadVerifiedConfigurationIntegrityAuthority
} from "../../src/runtime/configuration/integrity.js";
import {
  computeProfileEntryDigest,
  computeProfileRegistryDigest
} from "../../src/runtime/configuration/registry.js";
import {
  resolveMachineIntegrityKeyPath
} from "../../src/runtime/identity/integrity-key.js";
import {
  createConfigurationFixtureCandidate,
  createRuntimeConfigurationHome
} from "../fixtures/runtime-configuration-authority-fixture.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-runtime-configuration-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("runtime configuration generations", () => {
  it("prepares and atomically commits one complete immutable generation without exposing secrets", async () => {
    const home = makeTempDir();
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const repository = new RuntimeConfigurationGenerationRepository(
        fixture.db,
        fixture.canonicalHome,
        fixture.homeId
      );
      const prepared = await prepareRuntimeConfigurationGeneration({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId,
        candidate: generated.candidate
      });
      expect(readRuntimeConfigurationPointer(fixture.db, fixture.homeId)).toBeUndefined();
      expect(fixture.db.prepare(
        "SELECT COUNT(*) AS count FROM configuration_generations WHERE home_id = ?"
      ).get(fixture.homeId)).toEqual({ count: 0 });

      const pointer = await repository.commitPreparedGeneration({
        prepared,
        expectedPointerRevision: 0,
        expectedGenerationId: null,
        commitId: "commit-config-1",
        committedAt: "2026-07-12T12:01:00.000Z"
      });
      expect(pointer).toMatchObject({
        pointer_schema_version: "configuration-pointer-v1",
        pointer_revision: 1,
        generation_id: "config-generation-1",
        previous_generation_id: null,
        commit_id: "commit-config-1"
      });
      const loaded = await repository.loadCurrent({
        expectedPackageGenerationId: generated.packageIdentity.package_generation_id,
        profileRegistry: generated.registry,
        profileSelectionContext: generated.candidate.profileSelectionContext
      });
      expect(loaded?.manifestDigest).toBe(prepared.manifestDigest);
      expect(loaded?.settings).toEqual(generated.candidate.settings);
      expect(loaded?.validationState.records).toHaveLength(4);

      const manifestText = readFileSync(
        join(prepared.directoryPath, "manifest.json"),
        "utf8"
      );
      const validationText = readFileSync(
        join(prepared.directoryPath, "validation-state.json"),
        "utf8"
      );
      expect(manifestText).not.toContain("fixture-distiller-secret");
      expect(manifestText).not.toContain("fixture-embedding-secret");
      expect(validationText).not.toContain("fixture-distiller-secret");
      expect(validationText).not.toContain("fixture-embedding-secret");
      expect(prepared.manifest.secrets_file_hmac).toMatch(/^[a-f0-9]{64}$/u);
      expect(prepared.manifest.secret_ref_set_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    } finally {
      fixture.db.close();
    }
  }, 15_000);

  it("rejects a stale-base concurrent generation and retains the first winning pointer", async () => {
    const home = makeTempDir();
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const repository = new RuntimeConfigurationGenerationRepository(
        fixture.db,
        fixture.canonicalHome,
        fixture.homeId
      );
      const first = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-generation-1"
      });
      await repository.publish({
        candidate: first.candidate,
        expectedPointerRevision: 0,
        expectedGenerationId: null,
        commitId: "commit-1",
        committedAt: "2026-07-12T12:01:00.000Z"
      });
      const second = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-generation-2",
        parentGenerationId: "config-generation-1"
      });
      const stale = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-generation-stale",
        parentGenerationId: "config-generation-1"
      });
      const stalePrepared = await prepareRuntimeConfigurationGeneration({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId,
        candidate: stale.candidate
      });
      await repository.publish({
        candidate: second.candidate,
        expectedPointerRevision: 1,
        expectedGenerationId: "config-generation-1",
        commitId: "commit-2",
        committedAt: "2026-07-12T12:02:00.000Z"
      });
      await expect(repository.commitPreparedGeneration({
        prepared: stalePrepared,
        expectedPointerRevision: 1,
        expectedGenerationId: "config-generation-1",
        commitId: "commit-stale"
      })).rejects.toMatchObject({
        code: "EE_CONFIGURATION_POINTER_CONFLICT"
      });
      expect(repository.readPointer()).toMatchObject({
        pointer_revision: 2,
        generation_id: "config-generation-2",
        previous_generation_id: "config-generation-1"
      });
      expect(fixture.db.prepare(
        "SELECT generation_id FROM configuration_generations WHERE home_id = ? ORDER BY generation_id"
      ).all(fixture.homeId)).toEqual([
        { generation_id: "config-generation-1" },
        { generation_id: "config-generation-2" }
      ]);
    } finally {
      fixture.db.close();
    }
  }, 15_000);

  it("rejects an active-runtime configuration change when the S6 invalidation provider is absent", async () => {
    const home = makeTempDir();
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const repository = new RuntimeConfigurationGenerationRepository(
        fixture.db,
        fixture.canonicalHome,
        fixture.homeId
      );
      const first = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-active-runtime-1"
      });
      await repository.publish({
        candidate: first.candidate,
        expectedPointerRevision: 0,
        expectedGenerationId: null,
        committedAt: "2026-07-12T12:01:00.000Z"
      });
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_revision = 1,
             active_package_generation_id = ?,
             production_activation_handshake_id = NULL,
             activation_state = 'active',
             updated_by_kind = 'gateway_service_controller',
             updated_by_gateway_instance_id = ?,
             updated_at = ?
         WHERE home_id = ?`
      ).run(
        first.packageIdentity.package_generation_id,
        "gateway-active-runtime-configuration-test",
        "2026-07-12T12:01:00.000Z",
        fixture.homeId
      );
      const second = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-active-runtime-2",
        parentGenerationId: "config-active-runtime-1"
      });
      await expect(repository.publish({
        candidate: second.candidate,
        expectedPointerRevision: 1,
        expectedGenerationId: "config-active-runtime-1",
        committedAt: "2026-07-12T12:02:00.000Z"
      })).rejects.toMatchObject({
        code: "EE_CONFIGURATION_ACTIVATION_INVALIDATION_REQUIRED"
      });
      expect(repository.readPointer()).toMatchObject({
        pointer_revision: 1,
        generation_id: "config-active-runtime-1"
      });
      expect(fixture.db.prepare(
        `SELECT COUNT(*) AS count FROM configuration_generations
         WHERE home_id = ? AND generation_id = ?`
      ).get(fixture.homeId, "config-active-runtime-2")).toEqual({ count: 0 });
    } finally {
      fixture.db.close();
    }
  }, 15_000);

  it("treats prepared-but-uncommitted generation files as non-authoritative and accepts exact replay", async () => {
    const home = makeTempDir();
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const repository = new RuntimeConfigurationGenerationRepository(
        fixture.db,
        fixture.canonicalHome,
        fixture.homeId
      );
      const prepared = await prepareRuntimeConfigurationGeneration({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId,
        candidate: generated.candidate
      });
      expect(await repository.loadCurrent({
        expectedPackageGenerationId: generated.packageIdentity.package_generation_id,
        profileRegistry: generated.registry,
        profileSelectionContext: generated.candidate.profileSelectionContext
      })).toBeUndefined();
      const first = await repository.commitPreparedGeneration({
        prepared,
        expectedPointerRevision: 0,
        expectedGenerationId: null,
        commitId: "replay-commit",
        committedAt: "2026-07-12T12:01:00.000Z"
      });
      const replay = await repository.commitPreparedGeneration({
        prepared,
        expectedPointerRevision: 0,
        expectedGenerationId: null,
        commitId: "ignored-replay-commit",
        committedAt: "2026-07-12T12:02:00.000Z"
      });
      expect(replay).toEqual(first);
      expect(fixture.db.prepare(
        "SELECT COUNT(*) AS count FROM configuration_generations WHERE home_id = ?"
      ).get(fixture.homeId)).toEqual({ count: 1 });
    } finally {
      fixture.db.close();
    }
  }, 15_000);

  it("fails closed on missing or replaced S1 key and never repairs it", async () => {
    const missingHome = makeTempDir();
    const missing = await createRuntimeConfigurationHome(missingHome);
    try {
      const keyPath = resolveMachineIntegrityKeyPath(missing.canonicalHome);
      rmSync(keyPath, { force: true });
      await expect(loadVerifiedConfigurationIntegrityAuthority({
        db: missing.db,
        canonicalHome: missing.canonicalHome,
        homeId: missing.homeId
      })).rejects.toMatchObject({ code: "EE_INTEGRITY_KEY_INVALID" });
      expect(() => readFileSync(keyPath, "utf8")).toThrow();
    } finally {
      missing.db.close();
    }

    const replacedHome = makeTempDir();
    const replaced = await createRuntimeConfigurationHome(replacedHome);
    const donorHome = makeTempDir();
    const donor = await createRuntimeConfigurationHome(donorHome);
    try {
      const keyPath = resolveMachineIntegrityKeyPath(replaced.canonicalHome);
      const donorKeyText = readFileSync(
        resolveMachineIntegrityKeyPath(donor.canonicalHome),
        "utf8"
      );
      const donorKey = JSON.parse(donorKeyText) as { integrity_key_id: string };
      writeFileSync(keyPath, donorKeyText, "utf8");
      await expect(loadVerifiedConfigurationIntegrityAuthority({
        db: replaced.db,
        canonicalHome: replaced.canonicalHome,
        homeId: replaced.homeId
      })).rejects.toMatchObject({ code: "EE_INTEGRITY_KEY_MISMATCH" });
      expect(readFileSync(keyPath, "utf8")).toContain(donorKey.integrity_key_id);
    } finally {
      replaced.db.close();
      donor.db.close();
    }
  }, 15_000);

  it("rejects forged validation bindings and profile adapter drift before publication", async () => {
    const home = makeTempDir();
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const forgedBinding = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-forged-binding"
      });
      forgedBinding.candidate.validationState.records[0].endpoint_identity_fingerprint =
        "forged-endpoint-fingerprint";
      await expect(prepareRuntimeConfigurationGeneration({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId,
        candidate: forgedBinding.candidate
      })).rejects.toMatchObject({ code: "EE_VALIDATION_BINDING_INVALID" });

      const adapterDrift = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-adapter-drift"
      });
      adapterDrift.registry.entries[0].route_specs[
        "custom-reasoning-route-v1"
      ].provider_adapter_version = "runtime-provider-adapter-v2";
      adapterDrift.registry.entries[0].entry_digest = computeProfileEntryDigest(
        adapterDrift.registry.entries[0]
      );
      adapterDrift.registry.registry_digest = computeProfileRegistryDigest(
        adapterDrift.registry
      );
      adapterDrift.candidate.profileRegistry = adapterDrift.registry;
      adapterDrift.candidate.packageIdentity.profile_registry_digest =
        adapterDrift.registry.registry_digest;
      for (const record of adapterDrift.candidate.validationState.records) {
        record.profile_registry_digest = adapterDrift.registry.registry_digest;
      }
      await expect(prepareRuntimeConfigurationGeneration({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId,
        candidate: adapterDrift.candidate
      })).rejects.toMatchObject({ code: "EE_VALIDATION_BINDING_INVALID" });
    } finally {
      fixture.db.close();
    }
  }, 15_000);

  it("rejects profile selections that are incompatible with the current host or gateway", async () => {
    const home = makeTempDir();
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const incompatible = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey,
        generationId: "config-incompatible-profile"
      });
      incompatible.candidate.profileSelectionContext = {
        ...incompatible.candidate.profileSelectionContext,
        hostApiVersion: "2026.3.9"
      };
      await expect(prepareRuntimeConfigurationGeneration({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId,
        candidate: incompatible.candidate
      })).rejects.toMatchObject({ code: "EE_PROFILE_INCOMPATIBLE" });
    } finally {
      fixture.db.close();
    }
  }, 15_000);

  it("rejects secrets or manifest tampering after authority commit", async () => {
    const home = makeTempDir();
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const repository = new RuntimeConfigurationGenerationRepository(
        fixture.db,
        fixture.canonicalHome,
        fixture.homeId
      );
      const pointer = await repository.publish({
        candidate: generated.candidate,
        expectedPointerRevision: 0,
        expectedGenerationId: null,
        commitId: "commit-tamper",
        committedAt: "2026-07-12T12:01:00.000Z"
      });
      const directory = resolveRuntimeConfigurationGenerationDirectory(
        fixture.canonicalHome,
        pointer.generation_id!
      );
      const secretsPath = join(directory, "secrets.json");
      const secrets = JSON.parse(readFileSync(secretsPath, "utf8")) as {
        values: Record<string, string>;
      };
      secrets.values.OPENAI_API_KEY = "tampered-secret";
      writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, "utf8");
      const integrity = await loadVerifiedConfigurationIntegrityAuthority({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId
      });
      await expect(verifyRuntimeConfigurationGeneration({
        canonicalHome: fixture.canonicalHome,
        generationId: pointer.generation_id!,
        expectedHomeId: fixture.homeId,
        expectedPackageGenerationId: generated.packageIdentity.package_generation_id,
        profileRegistry: generated.registry,
        profileSelectionContext: generated.candidate.profileSelectionContext,
        integrity,
        expectedManifestDigest: pointer.manifest_digest!
      })).rejects.toBeInstanceOf(RuntimeConfigurationError);
    } finally {
      fixture.db.close();
    }
  }, 15_000);
});
