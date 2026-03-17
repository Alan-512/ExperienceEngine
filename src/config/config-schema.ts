import { z } from "zod";

export const configSchema = z.object({
  dataDir: z.string().default("./data"),
  sqlitePath: z.string().default("./data/sqlite/experienceengine.db"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  noticesInline: z.boolean().default(true),
  captureRawPayloads: z.boolean().default(false),
  captureDir: z.string().default("./data/runtime-captures"),
  maxHints: z.number().int().min(1).max(3).default(3),
  triggerThreshold: z.number().min(0).max(1).default(0.6),
  embeddingProvider: z.enum(["local", "legacy"]).default("local"),
  embeddingModel: z.string().default("Xenova/multilingual-e5-small"),
  embeddingDtype: z.enum(["q8", "fp32"]).default("q8"),
  embeddingCacheDir: z.string().default("./data/models/embeddings"),
  distillerProfile: z.enum(["fast", "balanced", "high_quality"]).default("balanced"),
  distillationAllowPassthrough: z.boolean().default(false),
  distillationMaxRetries: z.number().int().min(0).max(10).default(2),
  distillationBatchSize: z.number().int().min(1).max(20).default(5),
  distillationAutoDrain: z.boolean().default(true)
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
    embeddingProvider: {
      type: "string",
      enum: ["local", "legacy"],
      description: "Embedding provider used for retrieval. `local` manages a local model, `legacy` keeps hash fallback only."
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
  embeddingProvider: {
    label: "Embedding Provider"
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
  }
} as const;
