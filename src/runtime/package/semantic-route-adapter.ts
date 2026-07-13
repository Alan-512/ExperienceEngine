import { configSchema, type ExperienceEngineConfig } from "../../config/config-schema.js";
import { DistillationExecutionError } from "../../distillation/errors.js";
import type {
  SemanticMergeDecision,
  SemanticProcessorRuntimeOptions
} from "../../distillation/semantic-processor.js";
import type { EmbeddingResult } from "../../store/vector/embeddings.js";
import type {
  RuntimeCapabilityRouteAuthorityEvidence
} from "../activation/types.js";
import type {
  RuntimeConfigurationCapability
} from "../configuration/constants.js";
import type {
  RuntimeRouteDefinition,
  VerifiedRuntimeConfigurationGeneration
} from "../configuration/types.js";

const SUPPORTED_REASONING_PROVIDER_FAMILIES = [
  "openai_compatible",
  "custom"
] as const;
const SUPPORTED_REASONING_ADAPTER_VERSION = "runtime-provider-adapter-v1";
const SUPPORTED_EMBEDDING_PROVIDER_FAMILIES = [
  "embedding_api",
  "custom_embedding"
] as const;
const SUPPORTED_EMBEDDING_ADAPTER_VERSION = "runtime-embedding-adapter-v1";

export type PackageWorkerSemanticRouteBinding = {
  config: ExperienceEngineConfig;
  processorOptions: Pick<
    SemanticProcessorRuntimeOptions,
    "env" | "fetchImpl" | "embedPassage" | "mergeDecider"
  >;
  distillationRouteFingerprint: string;
  embeddingRouteFingerprint: string;
};

const nonEmpty = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new DistillationExecutionError(
      "provider_configuration_invalid",
      `${field} must not be empty.`,
      "EE_PROVIDER_CONFIGURATION_INVALID",
      "setup"
    );
  }
  return normalized;
};

const currentRouteAuthority = (options: {
  authorities: RuntimeCapabilityRouteAuthorityEvidence[];
  capability: RuntimeConfigurationCapability;
  generation: VerifiedRuntimeConfigurationGeneration;
  route: RuntimeRouteDefinition;
}): RuntimeCapabilityRouteAuthorityEvidence => {
  const authority = options.authorities.find(
    (entry) => entry.capability === options.capability
  );
  const validation = options.generation.validationState.records.find(
    (record) =>
      record.capability === options.capability &&
      record.route_id === options.route.route_id &&
      record.route_fingerprint === authority?.route_fingerprint &&
      record.configuration_generation_id ===
        options.generation.manifest.generation_id &&
      record.validation_status === "valid"
  );
  if (
    !authority ||
    !authority.available ||
    !authority.fresh ||
    authority.configuration_generation_id !==
      options.generation.manifest.generation_id ||
    authority.package_generation_id !==
      options.generation.manifest.package_generation_id ||
    !validation
  ) {
    throw new DistillationExecutionError(
      "provider_configuration_invalid",
      `Current ${options.capability} route authority is unavailable or stale.`,
      options.capability === "embedding"
        ? "EE_EMBEDDING_CONFIGURATION_INVALID"
        : "EE_PROVIDER_CONFIGURATION_INVALID",
      "setup"
    );
  }
  return authority;
};

const exactSecret = (options: {
  generation: VerifiedRuntimeConfigurationGeneration;
  route: RuntimeRouteDefinition;
  failureCode:
    | "EE_PROVIDER_CONFIGURATION_INVALID"
    | "EE_EMBEDDING_CONFIGURATION_INVALID";
}): string => {
  if (options.route.secret_refs.length !== 1) {
    throw new DistillationExecutionError(
      "provider_configuration_invalid",
      `Route ${options.route.route_id} requires exactly one mechanically mappable secret reference.`,
      options.failureCode,
      "setup"
    );
  }
  const secretRef = options.route.secret_refs[0];
  const secret = options.generation.secrets.values[secretRef]?.trim();
  if (!secret) {
    throw new DistillationExecutionError(
      "provider_configuration_invalid",
      `Route ${options.route.route_id} secret ${secretRef} is missing.`,
      options.failureCode,
      "setup"
    );
  }
  return secret;
};

const classifyEmbeddingHttpFailure = (
  status: number
): DistillationExecutionError => {
  if (status === 401 || status === 403) {
    return new DistillationExecutionError(
      "embedding_auth_invalid",
      `Embedding route authentication failed with HTTP ${status}.`,
      "EE_EMBEDDING_CONFIGURATION_INVALID",
      "embedding_execution"
    );
  }
  if (status === 429 || status >= 500) {
    return new DistillationExecutionError(
      "embedding_transient",
      `Embedding route failed transiently with HTTP ${status}.`,
      "EE_EMBEDDING_TRANSIENT",
      "embedding_execution"
    );
  }
  return new DistillationExecutionError(
    "embedding_contract_invalid",
    `Embedding route failed with HTTP ${status}.`,
    "EE_EMBEDDING_CONFIGURATION_INVALID",
    "embedding_execution"
  );
};

const createStrictEmbeddingExecutor = (options: {
  route: RuntimeRouteDefinition;
  secret: string;
  fetchImpl: typeof fetch;
}): ((text: string) => Promise<EmbeddingResult>) => async (text) => {
  let response: Response;
  try {
    response = await options.fetchImpl(options.route.endpoint_identity, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.secret}`
      },
      body: JSON.stringify({
        model: options.route.model_or_deployment_identity,
        input: text
      })
    });
  } catch (error) {
    throw new DistillationExecutionError(
      "embedding_transient",
      error instanceof Error ? error.message : String(error),
      "EE_EMBEDDING_TRANSIENT",
      "embedding_execution",
      error instanceof Error ? { cause: error } : undefined
    );
  }
  if (!response.ok) {
    throw classifyEmbeddingHttpFailure(response.status);
  }
  const payload = await response.json() as {
    data?: Array<{ embedding?: unknown }>;
  };
  const embedding = payload.data?.[0]?.embedding;
  if (
    !Array.isArray(embedding) ||
    embedding.length === 0 ||
    embedding.some(
      (value) => typeof value !== "number" || !Number.isFinite(value)
    )
  ) {
    throw new DistillationExecutionError(
      "embedding_contract_invalid",
      "Embedding route returned an invalid vector payload.",
      "EE_EMBEDDING_CONFIGURATION_INVALID",
      "embedding_execution"
    );
  }
  return {
    embedding: embedding as number[],
    space: {
      provider: options.route.provider_family,
      model: options.route.model_or_deployment_identity,
      version: options.route.response_schema_version,
      dimensions: embedding.length
    }
  };
};

const deterministicMergeDecider = Object.freeze({
  async decide(
    _candidate: unknown,
    _distilled: unknown,
    _existingNodes: unknown,
    fallback: SemanticMergeDecision
  ): Promise<SemanticMergeDecision> {
    return fallback;
  }
});

export const createPackageWorkerSemanticRouteBinding = (options: {
  generation: VerifiedRuntimeConfigurationGeneration;
  routeAuthorities: RuntimeCapabilityRouteAuthorityEvidence[];
  fetchImpl?: typeof fetch;
}): PackageWorkerSemanticRouteBinding => {
  const distillation =
    options.generation.settings.capability_routes.distillation;
  const embedding = options.generation.settings.capability_routes.embedding;
  const distillationRoute = distillation.primary_route;
  const embeddingRoute = embedding.primary_route;
  if (
    !distillation.enabled ||
    !distillation.required_for_production ||
    !distillationRoute ||
    options.generation.settings.legacy_rule_mode.enabled
  ) {
    throw new DistillationExecutionError(
      "provider_configuration_invalid",
      "Production semantic execution requires an enabled primary distillation route with legacy rule mode disabled.",
      "EE_PROVIDER_CONFIGURATION_INVALID",
      "setup"
    );
  }
  if (!embedding.enabled || !embedding.required_for_production || !embeddingRoute) {
    throw new DistillationExecutionError(
      "embedding_configuration_invalid",
      "Production semantic execution requires an enabled primary embedding route.",
      "EE_EMBEDDING_CONFIGURATION_INVALID",
      "setup"
    );
  }
  if (
    !SUPPORTED_REASONING_PROVIDER_FAMILIES.includes(
      distillationRoute.provider_family as
        typeof SUPPORTED_REASONING_PROVIDER_FAMILIES[number]
    ) ||
    distillationRoute.provider_adapter_version !==
      SUPPORTED_REASONING_ADAPTER_VERSION ||
    distillationRoute.auth_mode !== "api_key"
  ) {
    throw new DistillationExecutionError(
      "provider_configuration_invalid",
      `Unsupported production reasoning adapter ${distillationRoute.provider_family}@${distillationRoute.provider_adapter_version}.`,
      "EE_PROVIDER_CONFIGURATION_INVALID",
      "setup"
    );
  }
  if (
    !SUPPORTED_EMBEDDING_PROVIDER_FAMILIES.includes(
      embeddingRoute.provider_family as
        typeof SUPPORTED_EMBEDDING_PROVIDER_FAMILIES[number]
    ) ||
    embeddingRoute.provider_adapter_version !==
      SUPPORTED_EMBEDDING_ADAPTER_VERSION ||
    embeddingRoute.auth_mode !== "api_key"
  ) {
    throw new DistillationExecutionError(
      "embedding_configuration_invalid",
      `Unsupported production embedding adapter ${embeddingRoute.provider_family}@${embeddingRoute.provider_adapter_version}.`,
      "EE_EMBEDDING_CONFIGURATION_INVALID",
      "setup"
    );
  }
  const distillationAuthority = currentRouteAuthority({
    authorities: options.routeAuthorities,
    capability: "distillation",
    generation: options.generation,
    route: distillationRoute
  });
  const embeddingAuthority = currentRouteAuthority({
    authorities: options.routeAuthorities,
    capability: "embedding",
    generation: options.generation,
    route: embeddingRoute
  });
  const distillationSecret = exactSecret({
    generation: options.generation,
    route: distillationRoute,
    failureCode: "EE_PROVIDER_CONFIGURATION_INVALID"
  });
  const embeddingSecret = exactSecret({
    generation: options.generation,
    route: embeddingRoute,
    failureCode: "EE_EMBEDDING_CONFIGURATION_INVALID"
  });
  const env: NodeJS.ProcessEnv = {
    EXPERIENCE_ENGINE_DISTILLER_MODEL: nonEmpty(
      distillationRoute.model_or_deployment_identity,
      "distillation model identity"
    ),
    EXPERIENCE_ENGINE_DISTILLER_BASE_URL: nonEmpty(
      distillationRoute.endpoint_identity,
      "distillation endpoint identity"
    ),
    EXPERIENCE_ENGINE_DISTILLER_API_KEY: distillationSecret
  };
  const config = configSchema.parse({
    distillerProvider: "openai_compatible",
    distillerModel: distillationRoute.model_or_deployment_identity,
    distillationAuthMode: "api_key",
    distillationMode: "llm",
    distillationAllowPassthrough: false,
    distillationFallbackChain: "",
    embeddingProvider: "api",
    embeddingApiProvider: "openai",
    embeddingModel: embeddingRoute.model_or_deployment_identity
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    config,
    processorOptions: {
      env,
      fetchImpl,
      mergeDecider: deterministicMergeDecider,
      embedPassage: createStrictEmbeddingExecutor({
        route: embeddingRoute,
        secret: embeddingSecret,
        fetchImpl
      })
    },
    distillationRouteFingerprint: distillationAuthority.route_fingerprint,
    embeddingRouteFingerprint: embeddingAuthority.route_fingerprint
  };
};

export const PACKAGE_WORKER_SEMANTIC_ROUTE_ADAPTER_CONTRACT = Object.freeze({
  reasoning_provider_families: SUPPORTED_REASONING_PROVIDER_FAMILIES,
  reasoning_adapter_version: SUPPORTED_REASONING_ADAPTER_VERSION,
  embedding_provider_families: SUPPORTED_EMBEDDING_PROVIDER_FAMILIES,
  embedding_adapter_version: SUPPORTED_EMBEDDING_ADAPTER_VERSION,
  unknown_provider_family_fails_closed: true,
  legacy_rule_fallback_allowed: false,
  merge_decision_mode: "deterministic"
});
