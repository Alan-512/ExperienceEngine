import { z } from "zod";
import {
  DIAGNOSTIC_COLLECTION_POLICY_VERSION,
  DIAGNOSTIC_ERROR_AGGREGATION_VERSION,
  DIAGNOSTIC_MANIFEST_SCHEMA_VERSION,
  DIAGNOSTIC_WARNING_CODES
} from "./constants.js";

const nullableString = z.string().min(1).nullable();
const nullableNumber = z.number().int().nonnegative().nullable();
const boundedCount = z.number().int().nonnegative();

const hostSchema = z.object({
  host: z.enum(["openclaw", "claude-code", "codex", "antigravity"]),
  installed: z.boolean(),
  wiring_state: z.enum(["ready", "partial", "missing", "unavailable"]),
  version: nullableString
}).strict();

const stateCountsSchema = z.object({
  total: boundedCount,
  primary: z.record(z.string().min(1), boundedCount),
  secondary: z.record(z.string().min(1), boundedCount).optional()
}).strict();

const timeRangeSchema = z.object({
  oldest: nullableString,
  newest: nullableString
}).strict();

const capabilitySchema = z.object({
  capability: z.string().min(1),
  assurance: z.enum(["recommended", "supported", "unbenchmarked", "unavailable"]),
  route_classification: z.enum(["primary", "fallback", "disabled", "blocked", "unavailable"]),
  health: z.enum(["healthy", "degraded", "paused", "disabled", "unavailable"])
}).strict();

const diagnosticErrorSchema = z.object({
  error_code: z.string().min(1).max(160),
  failure_class: nullableString,
  failure_scope: nullableString,
  component: z.string().min(1).max(80),
  latest_timestamp: nullableString,
  occurrence_count: z.number().int().positive(),
  retryable: z.boolean().nullable(),
  home_id_prefix: nullableString,
  package_generation_id_prefix: nullableString,
  configuration_generation_id_prefix: nullableString,
  supervisor_lease_epoch: nullableNumber,
  worker_fencing_token: nullableNumber,
  claim_id_prefix: nullableString
}).strict();

export const diagnosticManifestSchema = z.object({
  diagnostic_manifest_schema_version: z.literal(DIAGNOSTIC_MANIFEST_SCHEMA_VERSION),
  collection_policy_version: z.literal(DIAGNOSTIC_COLLECTION_POLICY_VERSION),
  error_aggregation_version: z.literal(DIAGNOSTIC_ERROR_AGGREGATION_VERSION),
  generated_at: z.string().datetime(),
  product: z.object({
    package_name: z.literal("@alan512/experienceengine"),
    package_version: z.string().min(1),
    distribution_channel: z.enum([
      "local_pack",
      "host_native_unattested",
      "published_npm_attested",
      "published_clawhub_attested",
      "unknown"
    ])
  }).strict(),
  environment: z.object({
    os_family: z.string().min(1),
    architecture: z.string().min(1),
    node_major_version: z.number().int().positive(),
    hosts: z.array(hostSchema).max(4)
  }).strict(),
  setup: z.object({
    setup_state: z.enum(["not_initialized", "installed", "initialized", "ready", "unavailable"]),
    value_state: z.enum(["warming_up", "first_value_reached", "unavailable"]),
    quality_profile: z.enum(["evaluated_recommended", "custom", "unavailable"]),
    core_learning_quality: z.enum([
      "production",
      "contract_valid_quality_unbenchmarked",
      "not_production_ready",
      "unavailable"
    ]),
    learning_health: z.enum(["healthy", "degraded", "paused", "explicitly_disabled", "unavailable"])
  }).strict(),
  runtime: z.object({
    home_id_prefix: nullableString,
    home_path_fingerprint_prefix: nullableString,
    package_activation_state: nullableString,
    package_activation_revision: nullableNumber,
    package_generation_id_prefix: nullableString,
    configuration_generation_id_prefix: nullableString,
    supervisor_state: nullableString,
    supervisor_lease_epoch: nullableNumber,
    worker_state: nullableString,
    worker_fencing_token: nullableNumber,
    migration_status: nullableString,
    schema_version: nullableString,
    queue_state: z.enum(["idle", "running", "blocked", "failed", "unavailable"])
  }).strict(),
  capabilities: z.array(capabilitySchema),
  provider: z.object({
    family: z.string().min(1),
    exact_model_id: nullableString
  }).strict(),
  database: z.object({
    present: z.boolean(),
    integrity: z.enum(["passed", "failed", "unavailable"]),
    schema_version: nullableString,
    migration_status: nullableString
  }).strict(),
  counts: z.object({
    task_runs: stateCountsSchema,
    candidates: stateCountsSchema,
    nodes: stateCountsSchema,
    queue: stateCountsSchema,
    attributions: stateCountsSchema
  }).strict(),
  time_ranges: z.object({
    task_runs: timeRangeSchema,
    candidates: timeRangeSchema,
    nodes: timeRangeSchema,
    queue: timeRangeSchema,
    attributions: timeRangeSchema
  }).strict(),
  errors: z.array(diagnosticErrorSchema).max(200),
  warnings: z.array(z.enum(DIAGNOSTIC_WARNING_CODES)).max(DIAGNOSTIC_WARNING_CODES.length),
  privacy: z.object({
    raw_database_included: z.literal(false),
    raw_content_included: z.literal(false),
    absolute_paths_included: z.literal(false),
    credentials_included: z.literal(false),
    provider_payloads_included: z.literal(false),
    exact_model_id_included: z.boolean()
  }).strict()
}).strict().superRefine((manifest, context) => {
  const exactModelIncluded = manifest.provider.exact_model_id !== null;
  if (manifest.privacy.exact_model_id_included !== exactModelIncluded) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["privacy", "exact_model_id_included"],
      message: "Exact-model privacy assertion does not match manifest content."
    });
  }
});

export type SafeDiagnosticManifest = z.infer<typeof diagnosticManifestSchema>;

export const assertSafeDiagnosticManifest = (value: unknown): SafeDiagnosticManifest =>
  diagnosticManifestSchema.parse(value);
