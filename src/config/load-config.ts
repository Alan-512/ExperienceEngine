import { join } from "node:path";
import { defaultConfig } from "./default-config.js";
import { configSchema, type ExperienceEngineConfig } from "./config-schema.js";
import { isolatePathEnvForHomeDir, resolveExperienceEnginePaths } from "./path-resolver.js";
import { resolveExperienceEngineRuntimeEnv } from "./runtime-env.js";
import { readExperienceEngineSettings } from "./settings-store.js";

type LoadConfigOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

const parseStringList = (value: string | undefined): string[] | undefined =>
  value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const loadConfig = (
  overrides: Partial<ExperienceEngineConfig> = {},
  options: LoadConfigOptions = {}
): ExperienceEngineConfig => {
  const baseEnv = options.env ?? (options.homeDir ? isolatePathEnvForHomeDir(process.env) : process.env);
  const env = resolveExperienceEngineRuntimeEnv({
    env: baseEnv,
    homeDir: options.homeDir,
    overrides
  });
  const paths = resolveExperienceEnginePaths({ overrides, env, homeDir: options.homeDir });
  const settings = readExperienceEngineSettings({ env, homeDir: options.homeDir, overrides });
  const captureRawPayloads =
    env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS !== undefined
      ? env.EXPERIENCE_ENGINE_CAPTURE_RAW_PAYLOADS === "true"
      : overrides.captureRawPayloads ?? defaultConfig.captureRawPayloads;
  const noticesInline =
    env.EXPERIENCE_ENGINE_INLINE_NOTICES !== undefined
      ? env.EXPERIENCE_ENGINE_INLINE_NOTICES === "true"
      : overrides.noticesInline ?? settings.notices?.inline ?? defaultConfig.noticesInline;

  const traceMetadataOnly =
    env.EXPERIENCE_ENGINE_TRACE_METADATA_ONLY !== undefined
      ? env.EXPERIENCE_ENGINE_TRACE_METADATA_ONLY === "true"
      : overrides.traceMetadataOnly ?? defaultConfig.traceMetadataOnly;
  const traceFullCaptureHosts =
    parseStringList(env.EXPERIENCE_ENGINE_TRACE_FULL_CAPTURE_HOSTS) ??
    overrides.traceFullCaptureHosts ??
    defaultConfig.traceFullCaptureHosts;
  const traceFullCaptureScopes =
    parseStringList(env.EXPERIENCE_ENGINE_TRACE_FULL_CAPTURE_SCOPES) ??
    overrides.traceFullCaptureScopes ??
    defaultConfig.traceFullCaptureScopes;
  const traceDiagnosticSnapshotHosts =
    parseStringList(env.EXPERIENCE_ENGINE_TRACE_DIAGNOSTIC_SNAPSHOT_HOSTS) ??
    overrides.traceDiagnosticSnapshotHosts ??
    traceFullCaptureHosts ??
    defaultConfig.traceDiagnosticSnapshotHosts;
  const traceDiagnosticSnapshotScopes =
    parseStringList(env.EXPERIENCE_ENGINE_TRACE_DIAGNOSTIC_SNAPSHOT_SCOPES) ??
    overrides.traceDiagnosticSnapshotScopes ??
    traceFullCaptureScopes ??
    defaultConfig.traceDiagnosticSnapshotScopes;
  const explicitDiagnosticSnapshotPersistence =
    env.EXPERIENCE_ENGINE_TRACE_PERSIST_DIAGNOSTIC_SNAPSHOTS !== undefined
      ? env.EXPERIENCE_ENGINE_TRACE_PERSIST_DIAGNOSTIC_SNAPSHOTS === "true"
      : overrides.tracePersistDiagnosticSnapshots;
  const legacyDiagnosticSnapshotPersistence =
    traceMetadataOnly === false && (traceFullCaptureHosts.length > 0 || traceFullCaptureScopes.length > 0);

  const parsed = configSchema.parse({
    dataDir: paths.dataDir,
    sqlitePath: paths.sqlitePath,
    logLevel: env.EXPERIENCE_ENGINE_LOG_LEVEL ?? overrides.logLevel ?? defaultConfig.logLevel,
    noticesInline,
    evaluationMode:
      (env.EXPERIENCE_ENGINE_EVALUATION_MODE as ExperienceEngineConfig["evaluationMode"] | undefined) ??
      overrides.evaluationMode ??
      defaultConfig.evaluationMode,
    repoExperienceMode:
      (env.EXPERIENCE_ENGINE_REPO_EXPERIENCE_MODE as ExperienceEngineConfig["repoExperienceMode"] | undefined) ??
      overrides.repoExperienceMode ??
      defaultConfig.repoExperienceMode,
    holdoutRate: env.EXPERIENCE_ENGINE_HOLDOUT_RATE
      ? Number(env.EXPERIENCE_ENGINE_HOLDOUT_RATE)
      : overrides.holdoutRate ?? defaultConfig.holdoutRate,
    captureRawPayloads,
    captureDir: paths.captureDir,
    maxHints: env.EXPERIENCE_ENGINE_MAX_HINTS
      ? Number(env.EXPERIENCE_ENGINE_MAX_HINTS)
      : overrides.maxHints ?? defaultConfig.maxHints,
    triggerThreshold: env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD
      ? Number(env.EXPERIENCE_ENGINE_TRIGGER_THRESHOLD)
      : overrides.triggerThreshold ?? defaultConfig.triggerThreshold,
    embeddingProvider:
      (env.EXPERIENCE_ENGINE_EMBEDDING_PROVIDER as ExperienceEngineConfig["embeddingProvider"] | undefined) ??
      overrides.embeddingProvider ??
      (settings.embedding?.provider as ExperienceEngineConfig["embeddingProvider"] | undefined) ??
      defaultConfig.embeddingProvider,
    embeddingApiProvider:
      (env.EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER as ExperienceEngineConfig["embeddingApiProvider"] | undefined) ??
      overrides.embeddingApiProvider ??
      (settings.embedding?.api_provider as ExperienceEngineConfig["embeddingApiProvider"] | undefined) ??
      defaultConfig.embeddingApiProvider,
    embeddingModel:
      env.EXPERIENCE_ENGINE_EMBEDDING_MODEL ??
      overrides.embeddingModel ??
      settings.embedding?.model ??
      defaultConfig.embeddingModel,
    embeddingDtype:
      (env.EXPERIENCE_ENGINE_EMBEDDING_DTYPE as ExperienceEngineConfig["embeddingDtype"] | undefined) ??
      overrides.embeddingDtype ??
      (settings.embedding?.dtype as ExperienceEngineConfig["embeddingDtype"] | undefined) ??
      defaultConfig.embeddingDtype,
    embeddingCacheDir:
      env.EXPERIENCE_ENGINE_EMBEDDING_CACHE_DIR ??
      overrides.embeddingCacheDir ??
      join(paths.productHome, "models", "embeddings"),
    retrievalRerankerMode:
      (env.EXPERIENCE_ENGINE_RETRIEVAL_RERANKER_MODE as ExperienceEngineConfig["retrievalRerankerMode"] | undefined) ??
      overrides.retrievalRerankerMode ??
      defaultConfig.retrievalRerankerMode,
    retrievalRerankerModel:
      env.EXPERIENCE_ENGINE_RETRIEVAL_RERANKER_MODEL ??
      overrides.retrievalRerankerModel ??
      defaultConfig.retrievalRerankerModel,
    syncSecondOpinionMode:
      (env.EXPERIENCE_ENGINE_SYNC_SECOND_OPINION_MODE as ExperienceEngineConfig["syncSecondOpinionMode"] | undefined) ??
      overrides.syncSecondOpinionMode ??
      defaultConfig.syncSecondOpinionMode,
    syncSecondOpinionModel:
      env.EXPERIENCE_ENGINE_SYNC_SECOND_OPINION_MODEL ??
      overrides.syncSecondOpinionModel ??
      defaultConfig.syncSecondOpinionModel,
    distillerProvider:
      (env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER as ExperienceEngineConfig["distillerProvider"] | undefined) ??
      overrides.distillerProvider ??
      (settings.distillation?.provider as ExperienceEngineConfig["distillerProvider"] | undefined) ??
      defaultConfig.distillerProvider,
    distillationAuthMode:
      (env.EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE as ExperienceEngineConfig["distillationAuthMode"] | undefined) ??
      overrides.distillationAuthMode ??
      (settings.distillation?.auth_mode as ExperienceEngineConfig["distillationAuthMode"] | undefined) ??
      defaultConfig.distillationAuthMode,
    distillerModel:
      env.EXPERIENCE_ENGINE_DISTILLER_MODEL ??
      overrides.distillerModel ??
      settings.distillation?.model ??
      defaultConfig.distillerModel,
    distillationMode:
      (env.EXPERIENCE_ENGINE_DISTILLATION_MODE as ExperienceEngineConfig["distillationMode"] | undefined) ??
      overrides.distillationMode ??
      defaultConfig.distillationMode,
    distillerProfile:
      (env.EXPERIENCE_ENGINE_DISTILLER_PROFILE as ExperienceEngineConfig["distillerProfile"] | undefined) ??
      overrides.distillerProfile ??
      defaultConfig.distillerProfile,
    distillationAllowPassthrough:
      env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH !== undefined
        ? env.EXPERIENCE_ENGINE_DISTILLATION_ALLOW_PASSTHROUGH === "true"
        : overrides.distillationAllowPassthrough ?? defaultConfig.distillationAllowPassthrough,
    distillationFallbackChain:
      env.EXPERIENCE_ENGINE_DISTILLER_FALLBACK_CHAIN ??
      overrides.distillationFallbackChain ??
      settings.distillation?.fallback_chain ??
      defaultConfig.distillationFallbackChain,
    distillationFallbackCodes: env.EXPERIENCE_ENGINE_DISTILLATION_FALLBACK_CODES
      ? env.EXPERIENCE_ENGINE_DISTILLATION_FALLBACK_CODES.split(",").map(Number).filter(n => !isNaN(n))
      : overrides.distillationFallbackCodes ??
        settings.distillation?.fallback_codes ??
        defaultConfig.distillationFallbackCodes,
    distillationMaxRetries: env.EXPERIENCE_ENGINE_DISTILLATION_MAX_RETRIES
      ? Number(env.EXPERIENCE_ENGINE_DISTILLATION_MAX_RETRIES)
      : overrides.distillationMaxRetries ?? defaultConfig.distillationMaxRetries,
    distillationBatchSize: env.EXPERIENCE_ENGINE_DISTILLATION_BATCH_SIZE
      ? Number(env.EXPERIENCE_ENGINE_DISTILLATION_BATCH_SIZE)
      : overrides.distillationBatchSize ?? defaultConfig.distillationBatchSize,
    distillationAutoDrain:
      env.EXPERIENCE_ENGINE_DISTILLATION_AUTO_DRAIN !== undefined
        ? env.EXPERIENCE_ENGINE_DISTILLATION_AUTO_DRAIN === "true"
        : overrides.distillationAutoDrain ?? defaultConfig.distillationAutoDrain,
    hybridEnabled:
      env.EXPERIENCE_ENGINE_HYBRID_ENABLED !== undefined
        ? env.EXPERIENCE_ENGINE_HYBRID_ENABLED === "true"
        : overrides.hybridEnabled ?? settings.hybrid?.enabled ?? defaultConfig.hybridEnabled,
    hybridSyncExplainEnabled:
      env.EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED !== undefined
        ? env.EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED === "true"
        : overrides.hybridSyncExplainEnabled ??
          settings.hybrid?.sync_explain_enabled ??
          defaultConfig.hybridSyncExplainEnabled,
    hybridAsyncPostmortemEnabled:
      env.EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED !== undefined
        ? env.EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED === "true"
        : overrides.hybridAsyncPostmortemEnabled ??
          settings.hybrid?.async_postmortem_enabled ??
          defaultConfig.hybridAsyncPostmortemEnabled,
    hybridRolloutMode:
      env.EXPERIENCE_ENGINE_HYBRID_ROLLOUT_MODE ??
      overrides.hybridRolloutMode ??
      (settings.hybrid?.rollout_mode as ExperienceEngineConfig["hybridRolloutMode"] | undefined) ??
      defaultConfig.hybridRolloutMode,
    hybridCanaryRate:
      env.EXPERIENCE_ENGINE_HYBRID_CANARY_RATE !== undefined
        ? Number(env.EXPERIENCE_ENGINE_HYBRID_CANARY_RATE)
        : overrides.hybridCanaryRate ?? settings.hybrid?.canary_rate ?? defaultConfig.hybridCanaryRate,
    hybridKillSwitch:
      env.EXPERIENCE_ENGINE_HYBRID_KILL_SWITCH !== undefined
        ? env.EXPERIENCE_ENGINE_HYBRID_KILL_SWITCH === "true"
        : overrides.hybridKillSwitch ?? settings.hybrid?.kill_switch ?? defaultConfig.hybridKillSwitch,
    hybridRoutePolicyVersion:
      env.EXPERIENCE_ENGINE_HYBRID_ROUTE_POLICY_VERSION ??
      overrides.hybridRoutePolicyVersion ??
      settings.hybrid?.route_policy_version ??
      defaultConfig.hybridRoutePolicyVersion,
    hybridCapsuleSchemaVersion:
      env.EXPERIENCE_ENGINE_HYBRID_CAPSULE_SCHEMA_VERSION ??
      overrides.hybridCapsuleSchemaVersion ??
      settings.hybrid?.capsule_schema_version ??
      defaultConfig.hybridCapsuleSchemaVersion,
    hybridExplainDecisionProfileVersion:
      env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_PROFILE_VERSION ??
      overrides.hybridExplainDecisionProfileVersion ??
      settings.hybrid?.explain_profile_version ??
      defaultConfig.hybridExplainDecisionProfileVersion,
    hybridPostmortemReviewProfileVersion:
      env.EXPERIENCE_ENGINE_HYBRID_POSTMORTEM_PROFILE_VERSION ??
      overrides.hybridPostmortemReviewProfileVersion ??
      settings.hybrid?.postmortem_profile_version ??
      defaultConfig.hybridPostmortemReviewProfileVersion,
    hybridExplainLlmEnabled:
      env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED !== undefined
        ? env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED === "true"
        : overrides.hybridExplainLlmEnabled ??
          settings.hybrid?.explain_llm_enabled ??
          defaultConfig.hybridExplainLlmEnabled,
    hybridExplainProviderMode:
      (env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_PROVIDER_MODE as ExperienceEngineConfig["hybridExplainProviderMode"] | undefined) ??
      overrides.hybridExplainProviderMode ??
      (settings.hybrid?.explain_provider_mode as
        | ExperienceEngineConfig["hybridExplainProviderMode"]
        | undefined) ??
      defaultConfig.hybridExplainProviderMode,
    hybridExplainModelProfileVersion:
      env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_MODEL_PROFILE_VERSION ??
      overrides.hybridExplainModelProfileVersion ??
      settings.hybrid?.explain_model_profile_version ??
      defaultConfig.hybridExplainModelProfileVersion,
    hybridAsyncPostmortemLlmEnabled:
      env.EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_LLM_ENABLED !== undefined
        ? env.EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_LLM_ENABLED === "true"
        : overrides.hybridAsyncPostmortemLlmEnabled ??
          settings.hybrid?.async_postmortem_llm_enabled ??
          defaultConfig.hybridAsyncPostmortemLlmEnabled,
    hybridPostmortemProviderMode:
      (env.EXPERIENCE_ENGINE_HYBRID_POSTMORTEM_PROVIDER_MODE as ExperienceEngineConfig["hybridPostmortemProviderMode"] | undefined) ??
      overrides.hybridPostmortemProviderMode ??
      (settings.hybrid?.postmortem_provider_mode as
        | ExperienceEngineConfig["hybridPostmortemProviderMode"]
        | undefined) ??
      defaultConfig.hybridPostmortemProviderMode,
    hybridPostmortemModelProfileVersion:
      env.EXPERIENCE_ENGINE_HYBRID_POSTMORTEM_MODEL_PROFILE_VERSION ??
      overrides.hybridPostmortemModelProfileVersion ??
      settings.hybrid?.postmortem_model_profile_version ??
      defaultConfig.hybridPostmortemModelProfileVersion,
    traceCaptureEnabled:
      env.EXPERIENCE_ENGINE_TRACE_CAPTURE_ENABLED !== undefined
        ? env.EXPERIENCE_ENGINE_TRACE_CAPTURE_ENABLED === "true"
        : overrides.traceCaptureEnabled ?? defaultConfig.traceCaptureEnabled,
    traceMetadataOnly,
    traceCaptureHosts:
      parseStringList(env.EXPERIENCE_ENGINE_TRACE_CAPTURE_HOSTS) ??
      overrides.traceCaptureHosts ??
      defaultConfig.traceCaptureHosts,
    traceCaptureScopes:
      parseStringList(env.EXPERIENCE_ENGINE_TRACE_CAPTURE_SCOPES) ??
      overrides.traceCaptureScopes ??
      defaultConfig.traceCaptureScopes,
    traceFullCaptureHosts,
    traceFullCaptureScopes,
    tracePersistDiagnosticSnapshots:
      explicitDiagnosticSnapshotPersistence ??
      legacyDiagnosticSnapshotPersistence ??
      defaultConfig.tracePersistDiagnosticSnapshots,
    traceDiagnosticSnapshotHosts,
    traceDiagnosticSnapshotScopes,
    traceRetentionDays: env.EXPERIENCE_ENGINE_TRACE_RETENTION_DAYS
      ? Number(env.EXPERIENCE_ENGINE_TRACE_RETENTION_DAYS)
      : overrides.traceRetentionDays ?? defaultConfig.traceRetentionDays,
    traceMaxEvents: env.EXPERIENCE_ENGINE_TRACE_MAX_EVENTS
      ? Number(env.EXPERIENCE_ENGINE_TRACE_MAX_EVENTS)
      : overrides.traceMaxEvents ?? defaultConfig.traceMaxEvents,
    traceMaxEvidenceRefs: env.EXPERIENCE_ENGINE_TRACE_MAX_EVIDENCE_REFS
      ? Number(env.EXPERIENCE_ENGINE_TRACE_MAX_EVIDENCE_REFS)
      : overrides.traceMaxEvidenceRefs ?? defaultConfig.traceMaxEvidenceRefs
  });

  return parsed;
};
