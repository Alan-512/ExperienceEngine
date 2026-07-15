import { rm } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type {
  RuntimeCapabilityRouteAuthorityEvidence
} from "../../src/runtime/activation/types.js";
import type {
  RuntimeConfigurationCapability
} from "../../src/runtime/configuration/constants.js";
import type {
  VerifiedRuntimeConfigurationGeneration
} from "../../src/runtime/configuration/types.js";
import {
  createPackageWorkerSemanticRouteBinding
} from "../../src/runtime/package/semantic-route-adapter.js";
import {
  CONFIGURATION_FIXTURE_START,
  createConfigurationFixtureCandidate,
  createRuntimeConfigurationHome
} from "../fixtures/runtime-configuration-authority-fixture.js";

const createVerifiedGeneration = async () => {
  const homePath =
    `${process.cwd()}/.tmp/package-worker-route-adapter-${Date.now()}`;
  try {
    const home = await createRuntimeConfigurationHome(homePath);
    const fixture = createConfigurationFixtureCandidate({
      homeId: home.homeId,
      integrityKey: home.integrityKey
    });
    const generation = {
      directoryPath: "fixture-generation",
      settings: fixture.candidate.settings,
      secrets: fixture.candidate.secrets,
      validationState: fixture.candidate.validationState,
      manifest: {
        generation_id: fixture.candidate.generationId,
        package_generation_id:
          fixture.candidate.packageIdentity.package_generation_id
      } as VerifiedRuntimeConfigurationGeneration["manifest"],
      manifestDigest: "fixture-manifest-digest",
      profileRegistry: fixture.registry,
      profileSelectionContext: fixture.candidate.profileSelectionContext
    } satisfies VerifiedRuntimeConfigurationGeneration;
    return { home, fixture, generation };
  } catch (error) {
    await rm(homePath, { recursive: true, force: true });
    throw error;
  }
};

const authority = (options: {
  generation: VerifiedRuntimeConfigurationGeneration;
  effectiveRouteSetId: string;
  capability: RuntimeConfigurationCapability;
}): RuntimeCapabilityRouteAuthorityEvidence => {
  const route = options.generation.settings.capability_routes[
    options.capability
  ].primary_route!;
  const record = options.generation.validationState.records.find(
    (entry) =>
      entry.capability === options.capability &&
      entry.route_id === route.route_id
  )!;
  return {
    available: true,
    fresh: true,
    authority_contract_version: "s6-capability-route-authority-v1",
    home_id: options.generation.manifest.home_id ?? "fixture-home",
    configuration_generation_id:
      options.generation.manifest.generation_id,
    package_generation_id:
      options.generation.manifest.package_generation_id,
    effective_route_set_id: options.effectiveRouteSetId,
    effective_route_revision:
      options.capability === "distillation" ? 2 : 3,
    capability: options.capability,
    route_fingerprint: record.route_fingerprint,
    validation_current: true,
    observed_at: CONFIGURATION_FIXTURE_START,
    expires_at: "2026-07-12T12:10:00.000Z"
  };
};

describe("package worker semantic route adapter", () => {
  it("maps the verified deterministic provider fixture without legacy fallback", async () => {
    const { home, fixture, generation } = await createVerifiedGeneration();
    try {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })) as unknown as typeof fetch;
      const binding = createPackageWorkerSemanticRouteBinding({
        generation,
        routeAuthorities: [
          authority({
            generation,
            effectiveRouteSetId: fixture.effectiveRouteSetId,
            capability: "distillation"
          }),
          authority({
            generation,
            effectiveRouteSetId: fixture.effectiveRouteSetId,
            capability: "embedding"
          })
        ],
        fetchImpl
      });
      expect(binding.config).toMatchObject({
        distillerProvider: "openai_compatible",
        distillationMode: "llm",
        distillationAllowPassthrough: false
      });
      expect(binding.processorOptions.env).toMatchObject({
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "fixture-reasoning-model",
        EXPERIENCE_ENGINE_DISTILLER_BASE_URL:
          "https://fixture.invalid/v1/chat/completions",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "fixture-distiller-secret"
      });
      const embedding = await binding.processorOptions.embedPassage!(
        "fixture passage"
      );
      expect(embedding).toMatchObject({
        embedding: [0.1, 0.2, 0.3],
        space: {
          provider: "embedding_api",
          model: "fixture-embedding-model",
          dimensions: 3
        }
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://fixture.invalid/v1/embeddings",
        expect.objectContaining({ method: "POST" })
      );
    } finally {
      home.db.close();
      await rm(home.canonicalHome, { recursive: true, force: true });
    }
  });

  it("fails closed for an unknown S4 provider family", async () => {
    const { home, fixture, generation } = await createVerifiedGeneration();
    try {
      const distillation =
        generation.settings.capability_routes.distillation;
      const unknownGeneration = {
        ...generation,
        settings: {
          ...generation.settings,
          capability_routes: {
            ...generation.settings.capability_routes,
            distillation: {
              ...distillation,
              primary_route: {
                ...distillation.primary_route!,
                provider_family: "unknown-provider-family"
              }
            }
          }
        }
      } satisfies VerifiedRuntimeConfigurationGeneration;
      expect(() => createPackageWorkerSemanticRouteBinding({
        generation: unknownGeneration,
        routeAuthorities: [
          authority({
            generation,
            effectiveRouteSetId: fixture.effectiveRouteSetId,
            capability: "distillation"
          }),
          authority({
            generation,
            effectiveRouteSetId: fixture.effectiveRouteSetId,
            capability: "embedding"
          })
        ]
      })).toThrowError(/Unsupported production reasoning adapter/u);
    } finally {
      home.db.close();
      await rm(home.canonicalHome, { recursive: true, force: true });
    }
  });
});
