import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  recoverCurrentRuntimeConfigurationRouteAuthority,
  RECOVERED_CONFIGURATION_ROUTE_AUTHORITY_CONTRACT
} from "../../src/runtime/activation/configuration-route-authority.js";
import {
  RuntimeConfigurationGenerationRepository
} from "../../src/runtime/configuration/generation.js";
import {
  RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH
} from "../../src/runtime/package/closure-manifest.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  runRuntimeImmediateTransaction
} from "../../src/runtime/schema/sqlite-policy.js";
import {
  CONFIGURATION_FIXTURE_PACKAGE_BUILD_ID,
  CONFIGURATION_FIXTURE_PROFILE_SELECTION_CONTEXT,
  CONFIGURATION_FIXTURE_START,
  createConfigurationFixtureCandidate,
  createRuntimeConfigurationHome
} from "../fixtures/runtime-configuration-authority-fixture.js";

const temporaryPaths: string[] = [];

const makeTempDir = (prefix: string): string => {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaryPaths.push(path);
  return path;
};

afterEach(() => {
  while (temporaryPaths.length > 0) {
    rmSync(temporaryPaths.pop()!, { recursive: true, force: true });
  }
});

describe("current S4 configuration route recovery", () => {
  it("recovers only one verified pointer-selected generation and invalidates on pointer change", async () => {
    const home = makeTempDir("ee-runtime-route-recovery-home-");
    const packageRoot = makeTempDir("ee-runtime-route-recovery-package-");
    const fixture = await createRuntimeConfigurationHome(home);
    try {
      const prepared = createConfigurationFixtureCandidate({
        homeId: fixture.homeId,
        integrityKey: fixture.integrityKey
      });
      const registryPath = join(
        packageRoot,
        ...RUNTIME_PROFILE_REGISTRY_RELATIVE_PATH.split("/")
      );
      mkdirSync(dirname(registryPath), { recursive: true });
      writeFileSync(
        registryPath,
        `${JSON.stringify(prepared.registry, null, 2)}\n`,
        "utf8"
      );
      const repository = new RuntimeConfigurationGenerationRepository(
        fixture.db,
        fixture.canonicalHome,
        fixture.homeId
      );
      await repository.publish({
        candidate: prepared.candidate,
        expectedPointerRevision: 0,
        expectedGenerationId: null,
        commitId: "commit-route-recovery-test",
        committedAt: CONFIGURATION_FIXTURE_START
      });

      const recovered = await recoverCurrentRuntimeConfigurationRouteAuthority({
        db: fixture.db,
        canonicalHome: fixture.canonicalHome,
        homeId: fixture.homeId,
        packageRoot,
        packageBuildId: CONFIGURATION_FIXTURE_PACKAGE_BUILD_ID,
        packageIdentity: prepared.packageIdentity,
        integrityKey: fixture.integrityKey,
        clock: createFixedProcessAuthorityClock(CONFIGURATION_FIXTURE_START)
      });
      expect(recovered).toBeDefined();
      expect(recovered?.handshakeContextProvider()).toEqual({
        configurationGenerationId: prepared.candidate.generationId,
        effectiveRouteSetId: prepared.effectiveRouteSetId
      });
      expect(recovered?.qualityProjection).toMatchObject({
        quality_profile: "custom",
        validation_state: "valid",
        benchmark_assurance: "unbenchmarked",
        core_learning_quality: "contract_valid_quality_unbenchmarked",
        production_ready: false
      });
      const evidence = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => recovered!.routeAuthorityProvider
          .getCapabilityRouteAuthorityInTransaction({
            db: fixture.db,
            homeId: fixture.homeId,
            configurationGenerationId: prepared.candidate.generationId,
            packageGenerationId:
              prepared.packageIdentity.package_generation_id,
            effectiveRouteSetId: prepared.effectiveRouteSetId,
            capability: "distillation",
            observedAt: CONFIGURATION_FIXTURE_START
          })
      });
      expect(evidence).toMatchObject({
        available: true,
        fresh: true,
        configuration_generation_id: prepared.candidate.generationId,
        package_generation_id: prepared.packageIdentity.package_generation_id,
        effective_route_set_id: prepared.effectiveRouteSetId,
        capability: "distillation",
        validation_current: true
      });
      expect(recovered?.snapshotRouteAuthorities()).toHaveLength(3);

      fixture.db.prepare(
        `UPDATE configuration_pointer
         SET pointer_revision = pointer_revision + 1,
             generation_id = NULL,
             manifest_digest = NULL,
             commit_id = NULL,
             committed_at = NULL
         WHERE home_id = ?`
      ).run(fixture.homeId);
      expect(recovered?.handshakeContextProvider()).toBeUndefined();
      expect(recovered?.snapshotRouteAuthorities()).toEqual([]);
      const stale = runRuntimeImmediateTransaction(fixture.db, {
        category: "lease",
        operation: () => recovered!.routeAuthorityProvider
          .getCapabilityRouteAuthorityInTransaction({
            db: fixture.db,
            homeId: fixture.homeId,
            configurationGenerationId: prepared.candidate.generationId,
            packageGenerationId:
              prepared.packageIdentity.package_generation_id,
            effectiveRouteSetId: prepared.effectiveRouteSetId,
            capability: "distillation",
            observedAt: CONFIGURATION_FIXTURE_START
          })
      });
      expect(stale).toEqual({
        available: false,
        fresh: false,
        authority_contract_version: "s6-capability-route-authority-v1",
        reason: "route_authority_not_current"
      });
    } finally {
      fixture.db.close();
    }
  });

  it("freezes the recovery boundary without promoting custom quality", () => {
    expect(RECOVERED_CONFIGURATION_ROUTE_AUTHORITY_CONTRACT).toEqual({
      pointer_selected_generation_only: true,
      immutable_generation_verification_reused: true,
      profile_registry_digest_required: true,
      exact_validation_record_required: true,
      pointer_change_invalidates_evidence: true,
      route_evidence_ttl_ms: 60_000
    });
    expect(CONFIGURATION_FIXTURE_PROFILE_SELECTION_CONTEXT).toMatchObject({
      hostApiVersion: "2026.4.1",
      gatewayVersion: "2026.4.1"
    });
  });
});
