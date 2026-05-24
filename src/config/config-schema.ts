import { z } from "zod";
import { DISTILLER_PROVIDERS } from "../distillation/providers/types.js";

export const configSchema = z.object({
  dataDir: z.string().default("./data"),
  sqlitePath: z.string().default("./data/sqlite/experienceengine.db"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  noticesInline: z.boolean().default(true),
  evaluationMode: z.enum(["live", "shadow", "holdout"]).default("live"),
  repoExperienceMode: z.enum(["safe", "fast_learning", "strict"]).default("safe"),
  holdoutRate: z.number().min(0).max(1).default(0.2),
  captureRawPayloads: z.boolean().default(false),
  captureDir: z.string().default("./data/runtime-captures"),
  maxHints: z.number().int().min(1).max(3).default(3),
  triggerThreshold: z.number().min(0).max(1).default(0.6),
  embeddingProfile: z.enum(["standard", "local-download", "strict-offline"]).default("standard"),
  embeddingProvider: z.enum(["api", "local", "legacy"]).default("api"),
  embeddingApiProvider: z.enum(["auto", "openai", "gemini", "jina"]).default("auto"),
  embeddingModel: z.string().default("Xenova/multilingual-e5-small"),
  embeddingDtype: z.enum(["q8", "fp32"]).default("q8"),
  embeddingCacheDir: z.string().default("./data/models/embeddings"),
  retrievalRerankerMode: z.enum(["auto", "heuristic", "model", "disabled"]).default("auto"),
  retrievalRerankerModel: z.string().default(""),
  syncSecondOpinionMode: z.enum(["disabled", "selective"]).default("disabled"),
  syncSecondOpinionModel: z.string().default(""),
  distillerProvider: z.enum(DISTILLER_PROVIDERS).default("openai_compatible"),
  distillerModel: z.string().default(""),
  distillationAuthMode: z.enum(["api_key", "google_adc"]).default("api_key"),
  distillationMode: z.enum(["auto", "llm", "rule", "disabled"]).default("auto"),
  distillerProfile: z.enum(["fast", "balanced", "high_quality"]).default("balanced"),
  distillationAllowPassthrough: z.boolean().default(false),
  distillationMaxRetries: z.number().int().min(0).max(10).default(2),
  distillationBatchSize: z.number().int().min(1).max(20).default(5),
  distillationAutoDrain: z.boolean().default(true),
  hybridEnabled: z.boolean().default(false),
  hybridSyncExplainEnabled: z.boolean().default(false),
  hybridAsyncPostmortemEnabled: z.boolean().default(false),
  hybridRolloutMode: z.enum(["live", "shadow", "canary"]).default("live"),
  hybridCanaryRate: z.number().min(0).max(1).default(0.1),
  hybridKillSwitch: z.boolean().default(false),
  hybridRoutePolicyVersion: z.string().default("hybrid-phase1-v1"),
  hybridCapsuleSchemaVersion: z.string().default("hybrid-capsule-v1"),
  hybridExplainDecisionProfileVersion: z.string().default("hybrid-explain-v1"),
  hybridPostmortemReviewProfileVersion: z.string().default("hybrid-postmortem-v1"),
  hybridExplainLlmEnabled: z.boolean().default(false),
  hybridExplainProviderMode: z.enum(["shared_distiller"]).default("shared_distiller"),
  hybridExplainModelProfileVersion: z.string().default("hybrid-explain-llm-v1"),
  hybridAsyncPostmortemLlmEnabled: z.boolean().default(false),
  hybridPostmortemProviderMode: z.enum(["shared_distiller"]).default("shared_distiller"),
  hybridPostmortemModelProfileVersion: z.string().default("hybrid-postmortem-llm-v1"),
  traceCaptureEnabled: z.boolean().default(false),
  traceMetadataOnly: z.boolean().default(true),
  traceRetentionDays: z.number().int().min(1).default(30),
  traceMaxEvents: z.number().int().min(1).default(100),
  traceMaxEvidenceRefs: z.number().int().min(1).default(50)
});

export type ExperienceEngineConfig = z.infer<typeof configSchema>;

export const pluginConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    dataDir: {
      type: "string",
      description: "Base directory for ExperienceEngine runtime data."
    },
    sqlitePath: {
      type: "string",
      description: "SQLite file path for ExperienceEngine metadata."
    },
    logLevel: {
      type: "string",
      enum: ["debug", "info", "warn", "error"],
      description: "Plugin log verbosity."
    },
    noticesInline: {
      type: "boolean",
      description: "Emit one-line inline notices when ExperienceEngine injects guidance."
    },
    evaluationMode: {
      type: "string",
      enum: ["live", "shadow", "holdout"],
      description: "Controls whether ExperienceEngine delivers interventions live, suppresses them in shadow mode, or randomly withholds them for holdout evaluation."
    },
    repoExperienceMode: {
      type: "string",
      enum: ["safe", "fast_learning", "strict"],
      description: "Repo-level policy mode for diagnostic candidate aggressiveness. It does not override disabled scopes or delivery-state safety gates."
    },
    holdoutRate: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Fraction of eligible interventions withheld when evaluation mode is holdout."
    },
    captureRawPayloads: {
      type: "boolean",
      description: "Persist raw OpenClaw lifecycle payloads for local runtime validation."
    },
    captureDir: {
      type: "string",
      description: "Directory used to store raw runtime payload captures."
    },
    maxHints: {
      type: "integer",
      minimum: 1,
      maximum: 3,
      description: "Maximum number of experience hints injected per turn."
    },
    triggerThreshold: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Trigger threshold for intervention gating."
    },
    embeddingProfile: {
      type: "string",
      enum: ["standard", "local-download", "strict-offline"],
      description: "Embedding profile for local/offline execution. `standard` uses default behavior, `local-download` allows managed downloads, `strict-offline` blocks remote requests and requires staged model assets."
    },
    embeddingProvider: {
      type: "string",
      enum: ["api", "local", "legacy"],
      description:
        "Embedding provider used for retrieval. `api` prefers Jina/OpenAI embeddings, `local` manages a local model, `legacy` keeps hash fallback only."
    },
    embeddingApiProvider: {
      type: "string",
      enum: ["auto", "openai", "gemini", "jina"],
      description: "Preferred API embedding provider when embeddingProvider is `api`."
    },
    embeddingModel: {
      type: "string",
      description: "Embedding model identifier used by the managed local provider."
    },
    embeddingDtype: {
      type: "string",
      enum: ["q8", "fp32"],
      description: "Embedding model dtype. `q8` prefers the quantized ONNX artifact for smaller local downloads."
    },
    embeddingCacheDir: {
      type: "string",
      description: "Directory used to cache managed embedding model files."
    },
    retrievalRerankerMode: {
      type: "string",
      enum: ["auto", "heuristic", "model", "disabled"],
      description:
        "Retrieval reranker mode. `auto` prefers a model reranker when a distiller endpoint is available, otherwise falls back to the heuristic rerank stage."
    },
    retrievalRerankerModel: {
      type: "string",
      description:
        "Optional override model identifier for retrieval reranking. When empty, ExperienceEngine reuses the configured distillation model."
    },
    syncSecondOpinionMode: {
      type: "string",
      enum: ["disabled", "selective"],
      description:
        "Controls whether ExperienceEngine applies a selective synchronous LLM second-opinion gate before injecting high-risk live hints."
    },
    syncSecondOpinionModel: {
      type: "string",
      description:
        "Optional override model identifier for the selective synchronous LLM second-opinion gate. When empty, ExperienceEngine reuses the configured distillation model."
    },
    distillerProvider: {
      type: "string",
      enum: [...DISTILLER_PROVIDERS],
      description: "Distillation provider identifier. `openai_compatible` is the legacy generic provider; prefer a named provider when available."
    },
    distillerModel: {
      type: "string",
      description: "Selected distillation model identifier for the chosen provider."
    },
    distillationAuthMode: {
      type: "string",
      enum: ["api_key", "google_adc"],
      description: "Provider-specific distillation authentication mode. Currently used by Gemini."
    },
    distillationMode: {
      type: "string",
      enum: ["auto", "llm", "rule", "disabled"],
      description: "Controls whether ExperienceEngine uses explicit-provider LLM distillation, rule promotion, or disables candidate promotion."
    },
    distillerProfile: {
      type: "string",
      enum: ["fast", "balanced", "high_quality"],
      description: "Extractor profile used for asynchronous experience distillation."
    },
    distillationAllowPassthrough: {
      type: "boolean",
      description: "Allow rule-based passthrough when no LLM distiller endpoint is available."
    },
    distillationMaxRetries: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description: "Maximum retry count before a candidate is discarded."
    },
    distillationBatchSize: {
      type: "integer",
      minimum: 1,
      maximum: 20,
      description: "Maximum number of distillation jobs drained in one worker pass."
    },
    distillationAutoDrain: {
      type: "boolean",
      description: "Automatically drain asynchronous distillation jobs after finalize."
    },
    hybridEnabled: {
      type: "boolean",
      description: "Enable the phase 1 hybrid routing layer."
    },
    hybridSyncExplainEnabled: {
      type: "boolean",
      description: "Allow bounded sync escalation for explicit explanation requests."
    },
    hybridAsyncPostmortemEnabled: {
      type: "boolean",
      description: "Allow bounded async postmortem review for deterministic eligible completed runs."
    },
    hybridRolloutMode: {
      type: "string",
      enum: ["live", "shadow", "canary"],
      description: "Controls whether hybrid worker paths are live, shadow-only, or limited to a canary slice."
    },
    hybridCanaryRate: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Fraction of hybrid-eligible turns allowed into the canary slice when hybridRolloutMode is `canary`."
    },
    hybridKillSwitch: {
      type: "boolean",
      description: "Immediately disables hybrid worker paths without affecting the deterministic core."
    },
    hybridRoutePolicyVersion: {
      type: "string",
      description: "Version label for the active hybrid route policy."
    },
    hybridCapsuleSchemaVersion: {
      type: "string",
      description: "Version label for the active hybrid capsule schema."
    },
    hybridExplainDecisionProfileVersion: {
      type: "string",
      description: "Version label for the explain_decision worker profile."
    },
    hybridPostmortemReviewProfileVersion: {
      type: "string",
      description: "Version label for the postmortem_review worker profile."
    },
    hybridExplainLlmEnabled: {
      type: "boolean",
      description: "Enable the provider-backed explain_decision worker for phase 2."
    },
    hybridExplainProviderMode: {
      type: "string",
      enum: ["shared_distiller"],
      description: "Provider resolution mode for phase 2 explain_decision. `shared_distiller` reuses the existing EE distillation provider configuration."
    },
    hybridExplainModelProfileVersion: {
      type: "string",
      description: "Version label for the provider-backed explain_decision model profile."
    },
    hybridAsyncPostmortemLlmEnabled: {
      type: "boolean",
      description: "Enable the provider-backed postmortem_review worker for phase 3."
    },
    hybridPostmortemProviderMode: {
      type: "string",
      enum: ["shared_distiller"],
      description: "Provider resolution mode for phase 3 postmortem_review. `shared_distiller` reuses the existing EE distillation provider configuration."
    },
    hybridPostmortemModelProfileVersion: {
      type: "string",
      description: "Version label for the provider-backed postmortem_review model profile."
    },
    traceCaptureEnabled: {
      type: "boolean",
      description: "Enable capturing host execution trace capsules for debugging and advanced attribution."
    },
    traceMetadataOnly: {
      type: "boolean",
      description: "Capture trace metadata only (no full event or evidence refs payload persistence) to save storage."
    },
    traceRetentionDays: {
      type: "integer",
      minimum: 1,
      description: "Number of days to retain trace capsule rows in the local SQLite database."
    },
    traceMaxEvents: {
      type: "integer",
      minimum: 1,
      description: "Maximum number of events retained per trace capsule to prevent unbounded log growth."
    },
    traceMaxEvidenceRefs: {
      type: "integer",
      minimum: 1,
      description: "Maximum number of evidence refs retained per trace capsule."
    }
  }
} as const;

export const pluginUiHints = {
  dataDir: {
    label: "Data Directory",
    placeholder: "./data"
  },
  sqlitePath: {
    label: "SQLite Path",
    placeholder: "./data/sqlite/experienceengine.db"
  },
  logLevel: {
    label: "Log Level"
  },
  noticesInline: {
    label: "Inline Notices"
  },
  evaluationMode: {
    label: "Evaluation Mode"
  },
  holdoutRate: {
    label: "Holdout Rate"
  },
  captureRawPayloads: {
    label: "Capture Raw Payloads"
  },
  captureDir: {
    label: "Capture Directory",
    placeholder: "./data/runtime-captures"
  },
  maxHints: {
    label: "Max Hints"
  },
  triggerThreshold: {
    label: "Trigger Threshold"
  },
  embeddingProfile: {
    label: "Embedding Profile"
  },
  embeddingProvider: {
    label: "Embedding Provider"
  },
  embeddingApiProvider: {
    label: "Embedding API Provider"
  },
  embeddingModel: {
    label: "Embedding Model"
  },
  embeddingDtype: {
    label: "Embedding Dtype"
  },
  embeddingCacheDir: {
    label: "Embedding Cache Directory",
    placeholder: "./data/models/embeddings"
  },
  retrievalRerankerMode: {
    label: "Retrieval Reranker Mode"
  },
  retrievalRerankerModel: {
    label: "Retrieval Reranker Model"
  },
  syncSecondOpinionMode: {
    label: "Sync Second Opinion Mode"
  },
  syncSecondOpinionModel: {
    label: "Sync Second Opinion Model"
  },
  distillerProvider: {
    label: "Distiller Provider"
  },
  distillerModel: {
    label: "Distiller Model"
  },
  distillationAuthMode: {
    label: "Distillation Auth Mode"
  },
  distillationMode: {
    label: "Distillation Mode"
  },
  distillerProfile: {
    label: "Distiller Profile"
  },
  distillationAllowPassthrough: {
    label: "Distillation Allow Passthrough"
  },
  distillationMaxRetries: {
    label: "Distillation Max Retries"
  },
  distillationBatchSize: {
    label: "Distillation Batch Size"
  },
  distillationAutoDrain: {
    label: "Distillation Auto Drain"
  },
  hybridEnabled: {
    label: "Hybrid Enabled"
  },
  hybridSyncExplainEnabled: {
    label: "Hybrid Sync Explain Enabled"
  },
  hybridAsyncPostmortemEnabled: {
    label: "Hybrid Async Postmortem Enabled"
  },
  hybridRolloutMode: {
    label: "Hybrid Rollout Mode"
  },
  hybridCanaryRate: {
    label: "Hybrid Canary Rate"
  },
  hybridKillSwitch: {
    label: "Hybrid Kill Switch"
  },
  hybridRoutePolicyVersion: {
    label: "Hybrid Route Policy Version"
  },
  hybridCapsuleSchemaVersion: {
    label: "Hybrid Capsule Schema Version"
  },
  hybridExplainDecisionProfileVersion: {
    label: "Hybrid Explain Profile Version"
  },
  hybridPostmortemReviewProfileVersion: {
    label: "Hybrid Postmortem Profile Version"
  },
  hybridExplainLlmEnabled: {
    label: "Hybrid Explain LLM Enabled"
  },
  hybridExplainProviderMode: {
    label: "Hybrid Explain Provider Mode"
  },
  hybridExplainModelProfileVersion: {
    label: "Hybrid Explain Model Profile Version"
  },
  traceCaptureEnabled: {
    label: "Trace Capture Enabled"
  },
  traceMetadataOnly: {
    label: "Trace Metadata Only"
  },
  traceRetentionDays: {
    label: "Trace Retention Days"
  },
  traceMaxEvents: {
    label: "Trace Max Events"
  },
  traceMaxEvidenceRefs: {
    label: "Trace Max Evidence Refs"
  }
} as const;
