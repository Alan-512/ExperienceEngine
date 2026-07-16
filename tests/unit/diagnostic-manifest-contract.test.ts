import { describe, expect, it } from "vitest";
import {
  assertSafeDiagnosticManifest,
  diagnosticManifestSchema,
  type SafeDiagnosticManifest
} from "../../src/diagnostics/contract.js";

const fixture = (): SafeDiagnosticManifest => ({
  diagnostic_manifest_schema_version: "diagnostic-manifest-v1",
  collection_policy_version: "diagnostic-collection-policy-v1",
  error_aggregation_version: "diagnostic-error-aggregation-v1",
  generated_at: "2026-07-16T20:00:00.000Z",
  product: {
    package_name: "@alan512/experienceengine",
    package_version: "0.5.1",
    distribution_channel: "unknown"
  },
  environment: {
    os_family: "win32",
    architecture: "x64",
    node_major_version: 24,
    hosts: []
  },
  setup: {
    setup_state: "not_initialized",
    value_state: "unavailable",
    quality_profile: "unavailable",
    core_learning_quality: "unavailable",
    learning_health: "unavailable"
  },
  runtime: {
    home_id_prefix: null,
    home_path_fingerprint_prefix: null,
    package_activation_state: null,
    package_activation_revision: null,
    package_generation_id_prefix: null,
    configuration_generation_id_prefix: null,
    supervisor_state: null,
    supervisor_lease_epoch: null,
    worker_state: null,
    worker_fencing_token: null,
    migration_status: null,
    schema_version: null,
    queue_state: "unavailable"
  },
  capabilities: [],
  provider: {
    family: "legacy",
    exact_model_id: null
  },
  database: {
    present: false,
    integrity: "unavailable",
    schema_version: null,
    migration_status: null
  },
  counts: {
    task_runs: { total: 0, primary: {} },
    candidates: { total: 0, primary: {} },
    nodes: { total: 0, primary: {} },
    queue: { total: 0, primary: {} },
    attributions: { total: 0, primary: {} }
  },
  time_ranges: {
    task_runs: { oldest: null, newest: null },
    candidates: { oldest: null, newest: null },
    nodes: { oldest: null, newest: null },
    queue: { oldest: null, newest: null },
    attributions: { oldest: null, newest: null }
  },
  errors: [],
  warnings: ["EE_DIAGNOSTIC_DATABASE_UNAVAILABLE"],
  privacy: {
    raw_database_included: false,
    raw_content_included: false,
    absolute_paths_included: false,
    credentials_included: false,
    provider_payloads_included: false,
    exact_model_id_included: false
  }
});

describe("safe diagnostic manifest contract", () => {
  it("accepts the exhaustive v1 safe shape", () => {
    expect(assertSafeDiagnosticManifest(fixture())).toEqual(fixture());
  });

  it("rejects unknown fields instead of copying arbitrary content", () => {
    const value = {
      ...fixture(),
      raw_prompt: "do not share me"
    };
    expect(() => diagnosticManifestSchema.parse(value)).toThrow();
  });

  it("requires exact-model privacy consent to match content", () => {
    const value = fixture();
    value.provider.exact_model_id = "openrouter/example/model";
    expect(() => diagnosticManifestSchema.parse(value)).toThrow(
      "Exact-model privacy assertion does not match manifest content"
    );

    value.privacy.exact_model_id_included = true;
    expect(diagnosticManifestSchema.parse(value).provider.exact_model_id).toBe("openrouter/example/model");
  });
});
