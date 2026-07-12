import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectRuntimeConfigurationAuthority
} from "../../src/runtime/configuration/inspection.js";
import {
  computeEffectiveRouteSetId,
  consumeRuntimeRouteEnvelope,
  createRuntimeRouteEnvelope,
  createSupportedRouteOverrideSnapshot,
  readRuntimeRouteProjection,
  resolveEffectiveRuntimeConfigurationRoutes
} from "../../src/runtime/configuration/route-authority.js";
import {
  RuntimeConfigurationGenerationRepository
} from "../../src/runtime/configuration/generation.js";
import {
  CONFIGURATION_INVALIDATION_BINDINGS,
  RUNTIME_CONFIGURATION_CAPABILITIES,
  RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH
} from "../../src/runtime/configuration/constants.js";
import {
  RuntimeCapabilityValidator,
  deriveRouteIdentityFingerprints,
  evaluateValidationRecordCurrent
} from "../../src/runtime/configuration/validation.js";
import {
  createConfigurationFixtureCandidate,
  createConfigurationFixtureSecrets,
  createRuntimeConfigurationHome
} from "../fixtures/runtime-configuration-authority-fixture.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-runtime-route-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("runtime configuration routes", () => {
  it("captures allowlisted overrides and changes effective route identity deterministically", async () => {
    const fixture = await createRuntimeConfigurationHome(makeTempDir());
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const first = createSupportedRouteOverrideSnapshot({
        env: {
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "model-a",
          UNDECLARED_ROUTE_OVERRIDE: "ignored"
        },
        integrityKey: fixture.integrityKey
      });
      const second = createSupportedRouteOverrideSnapshot({
        env: {
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "model-b",
          UNDECLARED_ROUTE_OVERRIDE: "different-but-ignored"
        },
        integrityKey: fixture.integrityKey
      });
      expect(first.values).toEqual({
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "model-a"
      });
      expect(first.fingerprint).not.toBe(second.fingerprint);
      const firstRouteSet = computeEffectiveRouteSetId({
        homeId: fixture.homeId,
        configurationGenerationId: generated.candidate.generationId,
        packageGenerationId: generated.packageIdentity.package_generation_id,
        overrideSnapshotFingerprint: first.fingerprint,
        settings: generated.candidate.settings,
        secrets: generated.candidate.secrets,
        integrityKey: fixture.integrityKey
      });
      const secondRouteSet = computeEffectiveRouteSetId({
        homeId: fixture.homeId,
        configurationGenerationId: generated.candidate.generationId,
        packageGenerationId: generated.packageIdentity.package_generation_id,
        overrideSnapshotFingerprint: second.fingerprint,
        settings: generated.candidate.settings,
        secrets: generated.candidate.secrets,
        integrityKey: fixture.integrityKey
      });
      expect(firstRouteSet).not.toBe(secondRouteSet);

      const record = generated.validationRecords[0];
      expect(evaluateValidationRecordCurrent(record, {
        ...record,
        effective_route_set_id: secondRouteSet,
        override_snapshot_fingerprint: second.fingerprint
      })).toBe("stale");
    } finally {
      fixture.db.close();
    }
  });

  it("allows only initializer/supervisor route resolution and binds captured overrides into actual routes", async () => {
    const fixture = await createRuntimeConfigurationHome(makeTempDir());
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const overrideSnapshot = createSupportedRouteOverrideSnapshot({
        env: {
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "override-model"
        },
        integrityKey: fixture.integrityKey
      });
      const resolveCapabilityRoute = ({
        capability,
        configured,
        overrides
      }: Parameters<typeof resolveEffectiveRuntimeConfigurationRoutes>[0]["resolveCapabilityRoute"] extends
        (input: infer T) => unknown ? T : never) => {
        if (capability === "distillation") {
          const model = overrides.EXPERIENCE_ENGINE_DISTILLER_MODEL;
          if (model) {
            if (configured.primary_route) {
              configured.primary_route.model_or_deployment_identity = model;
            }
            for (const route of configured.fallback_routes) {
              route.model_or_deployment_identity = model;
            }
          }
        }
        return configured;
      };
      for (const writerKind of ["plugin", "worker"] as const) {
        expect(() => resolveEffectiveRuntimeConfigurationRoutes({
          writerKind,
          settings: generated.candidate.settings,
          overrideSnapshot,
          integrityKey: fixture.integrityKey,
          resolveCapabilityRoute
        })).toThrowError(/cannot resolve effective runtime routes/u);
      }
      const resolved = resolveEffectiveRuntimeConfigurationRoutes({
        writerKind: "supervisor",
        settings: generated.candidate.settings,
        overrideSnapshot,
        integrityKey: fixture.integrityKey,
        resolveCapabilityRoute
      });
      expect(
        resolved.capability_routes.distillation.primary_route
          ?.model_or_deployment_identity
      ).toBe("override-model");
      expect(Object.isFrozen(resolved)).toBe(true);
      expect(Object.isFrozen(resolved.capability_routes.distillation)).toBe(true);
      const baseRouteSet = computeEffectiveRouteSetId({
        homeId: fixture.homeId,
        configurationGenerationId: generated.candidate.generationId,
        packageGenerationId: generated.packageIdentity.package_generation_id,
        overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
        settings: generated.candidate.settings,
        secrets: generated.candidate.secrets,
        integrityKey: fixture.integrityKey
      });
      const resolvedRouteSet = computeEffectiveRouteSetId({
        homeId: fixture.homeId,
        configurationGenerationId: generated.candidate.generationId,
        packageGenerationId: generated.packageIdentity.package_generation_id,
        overrideSnapshotFingerprint: overrideSnapshot.fingerprint,
        settings: resolved,
        secrets: generated.candidate.secrets,
        integrityKey: fixture.integrityKey
      });
      expect(resolvedRouteSet).not.toBe(baseRouteSet);
      expect(() => resolveEffectiveRuntimeConfigurationRoutes({
        writerKind: "supervisor",
        settings: generated.candidate.settings,
        overrideSnapshot: {
          ...overrideSnapshot,
          values: {
            ...overrideSnapshot.values,
            UNDECLARED_OVERRIDE: "forged"
          }
        },
        integrityKey: fixture.integrityKey,
        resolveCapabilityRoute
      })).toThrowError(/not allowlisted and integrity-bound/u);
    } finally {
      fixture.db.close();
    }
  });

  it("invalidates route and validation identity when resolved secret material changes under the same reference", async () => {
    const fixture = await createRuntimeConfigurationHome(makeTempDir());
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const route = generated.candidate.settings.capability_routes.distillation.primary_route!;
      const first = deriveRouteIdentityFingerprints({
        capability: "distillation",
        route,
        secrets: generated.candidate.secrets,
        integrityKey: fixture.integrityKey
      });
      const changedSecrets = createConfigurationFixtureSecrets();
      changedSecrets.values.EXPERIENCE_ENGINE_DISTILLER_API_KEY = "rotated-secret";
      const second = deriveRouteIdentityFingerprints({
        capability: "distillation",
        route,
        secrets: changedSecrets,
        integrityKey: fixture.integrityKey
      });
      expect(first.secretRefSetFingerprint).toBe(second.secretRefSetFingerprint);
      expect(first.resolvedSecretMaterialFingerprint).not.toBe(
        second.resolvedSecretMaterialFingerprint
      );
      expect(first.routeFingerprint).not.toBe(second.routeFingerprint);
      expect(JSON.stringify(first)).not.toContain("fixture-distiller-secret");
      expect(JSON.stringify(second)).not.toContain("rotated-secret");
    } finally {
      fixture.db.close();
    }
  });

  it("invalidates every frozen binding and runs capability probes outside authority transactions", async () => {
    const fixture = await createRuntimeConfigurationHome(makeTempDir());
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const record = generated.validationRecords.find((candidate) =>
        candidate.capability === "embedding"
      )!;
      for (const field of CONFIGURATION_INVALIDATION_BINDINGS) {
        const expected = { ...record };
        const currentValue = expected[field];
        (expected as Record<string, unknown>)[field] = currentValue === null
          ? "changed"
          : `${String(currentValue)}-changed`;
        expect(
          evaluateValidationRecordCurrent(record, expected),
          field
        ).toBe("stale");
      }

      let probeCalls = 0;
      const route = generated.candidate.settings.capability_routes.embedding.primary_route!;
      const validated = await new RuntimeCapabilityValidator().validate({
        validationRecordId: "validation-embedding-orchestrated",
        configurationGenerationId: generated.candidate.generationId,
        homeId: fixture.homeId,
        packageGenerationId: generated.packageIdentity.package_generation_id,
        capability: "embedding",
        route,
        effectiveRouteSetId: generated.effectiveRouteSetId,
        overrideSnapshotFingerprint: generated.candidate.overrideSnapshotFingerprint,
        qualityProfile: generated.candidate.settings.quality_profile,
        profileId: generated.candidate.settings.profile_id,
        profileVersion: generated.candidate.settings.profile_version,
        profileRegistry: generated.registry,
        profileEntry: generated.registry.entries[0],
        secrets: generated.candidate.secrets,
        integrityKey: fixture.integrityKey,
        validatedAt: "2026-07-12T12:00:00.000Z",
        async probe() {
          probeCalls += 1;
          await Promise.resolve();
          return {
            reachable: true,
            contract_valid: true,
            response_schema_valid: true,
            latency_ms: 9,
            response_size_bytes: 48,
            embedding_vector: [0.5, 0.25],
            failure_code: null
          };
        }
      });
      expect(probeCalls).toBe(1);
      expect(validated).toMatchObject({
        capability: "embedding",
        validation_status: "valid",
        embedding_vector_dimensions: 2,
        benchmark_assurance: "unbenchmarked"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("emits one immutable normalized envelope and prevents worker reinterpretation", async () => {
    const fixture = await createRuntimeConfigurationHome(makeTempDir());
    try {
      const generated = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const envelope = createRuntimeRouteEnvelope({
        homeId: fixture.homeId,
        configurationGenerationId: generated.candidate.generationId,
        packageGenerationId: generated.packageIdentity.package_generation_id,
        overrideSnapshotFingerprint: generated.candidate.overrideSnapshotFingerprint,
        settings: generated.candidate.settings,
        secrets: generated.candidate.secrets,
        validationRecords: generated.validationRecords,
        profileRegistry: generated.registry,
        profileSelectionContext: generated.candidate.profileSelectionContext,
        integrityKey: fixture.integrityKey,
        createdAt: "2026-07-12T12:00:00.000Z"
      });
      expect(Object.keys(envelope.capabilities).sort()).toEqual(
        [...RUNTIME_CONFIGURATION_CAPABILITIES].sort()
      );
      expect(envelope.effective_route_set_id).toBe(generated.effectiveRouteSetId);
      expect(Object.isFrozen(envelope)).toBe(true);
      expect(Object.isFrozen(envelope.capabilities.distillation)).toBe(true);
      const serialized = JSON.stringify(envelope);
      expect(serialized).not.toContain("fixture.invalid");
      expect(serialized).not.toContain("fixture-distiller-secret");
      expect(serialized).not.toContain("fixture-embedding-secret");

      expect(consumeRuntimeRouteEnvelope({
        envelope,
        expectedHomeId: fixture.homeId,
        expectedConfigurationGenerationId: generated.candidate.generationId,
        expectedPackageGenerationId: generated.packageIdentity.package_generation_id,
        expectedEffectiveRouteSetId: generated.effectiveRouteSetId
      })).toEqual(envelope);
      expect(() => consumeRuntimeRouteEnvelope({
        envelope,
        expectedHomeId: fixture.homeId,
        expectedConfigurationGenerationId: generated.candidate.generationId,
        expectedPackageGenerationId: generated.packageIdentity.package_generation_id,
        expectedEffectiveRouteSetId: "routes-worker-reinterpreted"
      })).toThrowError(/does not match supervisor-provided/u);

      const forgedRecords = structuredClone(generated.validationRecords);
      forgedRecords[0].route_fingerprint = "forged-route-fingerprint";
      expect(() => createRuntimeRouteEnvelope({
        homeId: fixture.homeId,
        configurationGenerationId: generated.candidate.generationId,
        packageGenerationId: generated.packageIdentity.package_generation_id,
        overrideSnapshotFingerprint: generated.candidate.overrideSnapshotFingerprint,
        settings: generated.candidate.settings,
        secrets: generated.candidate.secrets,
        validationRecords: forgedRecords,
        profileRegistry: generated.registry,
        profileSelectionContext: generated.candidate.profileSelectionContext,
        integrityKey: fixture.integrityKey,
        createdAt: "2026-07-12T12:00:00.000Z"
      })).toThrowError(/mismatches route_fingerprint/u);
    } finally {
      fixture.db.close();
    }
  });

  it("reports configuration complete only when the pointer-selected generation verifies", async () => {
    const fixture = await createRuntimeConfigurationHome(makeTempDir());
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
        commitId: "inspection-commit",
        committedAt: "2026-07-12T12:01:00.000Z"
      });
      expect(inspectRuntimeConfigurationAuthority({ pointer })).toMatchObject({
        current_configuration_state: "incomplete"
      });
      const verifiedGeneration = await repository.loadCurrent({
        expectedPackageGenerationId: generated.packageIdentity.package_generation_id,
        profileRegistry: generated.registry,
        profileSelectionContext: generated.candidate.profileSelectionContext
      });
      expect(inspectRuntimeConfigurationAuthority({
        pointer,
        verifiedGeneration
      })).toMatchObject({
        current_configuration_state: "complete"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("projects missing, malformed, and authority-mismatched state as unknown/warming, never healthy", async () => {
    const canonicalHome = makeTempDir();
    const missing = await readRuntimeRouteProjection({ canonicalHome });
    expect(missing.status).toBe("missing");
    expect(Object.values(missing.capabilities).every((state) =>
      state.runtime_health === "unknown_warming"
    )).toBe(true);

    const projectionPath = join(
      canonicalHome,
      ...RUNTIME_ROUTE_PROJECTION_RELATIVE_PATH.split("/")
    );
    mkdirSync(dirname(projectionPath), { recursive: true });
    writeFileSync(projectionPath, "{\"projection_schema_version\":", "utf8");
    const malformed = await readRuntimeRouteProjection({ canonicalHome });
    expect(malformed.status).toBe("invalid");
    expect(Object.values(malformed.capabilities).some((state) =>
      state.runtime_health === "healthy"
    )).toBe(false);

    const impossibleProjection = {
      projection_schema_version: "runtime-route-projection-v1",
      projection_revision: 1,
      home_id: "home-a",
      configuration_generation_id: "config-a",
      package_generation_id: "pkg-a",
      effective_route_set_id: "routes-a",
      supervisor_owner_id: "supervisor-a",
      supervisor_lease_epoch: 1,
      worker_owner_id: "worker-a",
      worker_fencing_token: 1,
      writer_instance_id: "writer-a",
      written_at: "2026-07-12T12:00:00+00:00",
      capabilities: Object.fromEntries(RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => [
        capability,
        {
          capability_revision: 1,
          active_route_id: null,
          active_route_kind: "none",
          runtime_health: "healthy",
          failure_code: null,
          checked_at: "2026-07-12T12:00:00.000Z"
        }
      ]))
    };
    writeFileSync(
      projectionPath,
      `${JSON.stringify(impossibleProjection, null, 2)}\n`,
      "utf8"
    );
    const impossible = await readRuntimeRouteProjection({ canonicalHome });
    expect(impossible.status).toBe("invalid");
    expect(Object.values(impossible.capabilities).every((state) =>
      state.runtime_health === "unknown_warming"
    )).toBe(true);

    writeFileSync(projectionPath, `${JSON.stringify({
      projection_schema_version: "runtime-route-projection-v1",
      projection_revision: 1,
      home_id: "home-a",
      configuration_generation_id: "config-a",
      package_generation_id: "pkg-a",
      effective_route_set_id: "routes-a",
      supervisor_owner_id: "supervisor-a",
      supervisor_lease_epoch: 1,
      worker_owner_id: "worker-a",
      worker_fencing_token: 1,
      writer_instance_id: "writer-a",
      written_at: "2026-07-12T12:00:00.000Z",
      capabilities: Object.fromEntries(RUNTIME_CONFIGURATION_CAPABILITIES.map((capability) => [
        capability,
        {
          capability_revision: 1,
          active_route_id: `${capability}-route`,
          active_route_kind: "primary",
          runtime_health: "healthy",
          failure_code: null,
          checked_at: "2026-07-12T12:00:00.000Z"
        }
      ]))
    }, null, 2)}\n`, "utf8");
    const mismatch = await readRuntimeRouteProjection({
      canonicalHome,
      expected: {
        homeId: "home-b",
        configurationGenerationId: "config-a",
        packageGenerationId: "pkg-a",
        effectiveRouteSetId: "routes-a"
      }
    });
    expect(mismatch.status).toBe("authority_mismatch");
    expect(Object.values(mismatch.capabilities).every((state) =>
      state.runtime_health === "unknown_warming"
    )).toBe(true);
    expect(inspectRuntimeConfigurationAuthority({
      routeProjection: mismatch
    })).toMatchObject({
      runtime_route_projection_state: "authority_mismatch",
      mutable_route_projection_authority_connected: false,
      queue_claiming_enabled: false,
      semantic_production_writes_enabled: false,
      production_learning_ready: false,
      learning_runtime_active: false
    });
  });
});
