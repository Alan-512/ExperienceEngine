import { describe, expect, it, vi } from "vitest";
import { runDiagnoseCommand } from "../../src/cli/commands/diagnose.js";
import type { SafeDiagnosticManifest } from "../../src/diagnostics/contract.js";

const manifest = (): SafeDiagnosticManifest => ({
  diagnostic_manifest_schema_version: "diagnostic-manifest-v1",
  collection_policy_version: "diagnostic-collection-policy-v1",
  error_aggregation_version: "diagnostic-error-aggregation-v1",
  generated_at: "2026-07-16T20:00:00.000Z",
  product: {
    package_name: "@alan512/experienceengine",
    package_version: "0.5.1",
    distribution_channel: "unknown"
  },
  environment: { os_family: "win32", architecture: "x64", node_major_version: 24, hosts: [] },
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
  provider: { family: "legacy", exact_model_id: null },
  database: { present: false, integrity: "unavailable", schema_version: null, migration_status: null },
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
  warnings: [],
  privacy: {
    raw_database_included: false,
    raw_content_included: false,
    absolute_paths_included: false,
    credentials_included: false,
    provider_payloads_included: false,
    exact_model_id_included: false
  }
});

describe("diagnose command", () => {
  it("renders a local-only summary without preparing files", async () => {
    const collect = vi.fn(async () => manifest());
    const prepare = vi.fn();
    const log = vi.fn();
    await runDiagnoseCommand([], { collect, prepare, log });

    expect(collect).toHaveBeenCalledWith({ includeModelId: false });
    expect(prepare).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join("\n")).toContain("no files were uploaded");
  });

  it("prepares an exact review directory only when explicitly requested", async () => {
    const collect = vi.fn(async () => manifest());
    const prepare = vi.fn(() => ({
      review_directory_version: "diagnostic-review-directory-v1" as const,
      review_directory: "review-dir",
      manifest_path: "review-dir/manifest.json"
    }));
    const log = vi.fn();
    await runDiagnoseCommand([
      "--prepare-bundle",
      "--include-model-id",
      "--output-dir",
      "reviews"
    ], { collect, prepare, log });

    expect(collect).toHaveBeenCalledWith({ includeModelId: true });
    expect(prepare).toHaveBeenCalledWith({
      manifest: expect.any(Object),
      outputRoot: "reviews"
    });
    expect(log.mock.calls.flat().join("\n")).toContain("No archive or upload was created");
  });

  it("archives a reviewed directory without recollecting diagnostics", async () => {
    const collect = vi.fn(async () => manifest());
    const archive = vi.fn(async () => ({
      diagnostic_archive_version: "diagnostic-archive-v1" as const,
      archive_path: "review.tar.gz",
      archive_sha256: "a".repeat(64),
      archive_size: 123,
      manifest_schema_version: "diagnostic-manifest-v1" as const,
      uploaded: false as const
    }));
    const log = vi.fn();

    await runDiagnoseCommand([
      "--archive",
      "review-dir",
      "--output",
      "review.tar.gz"
    ], { collect, archive, log });

    expect(collect).not.toHaveBeenCalled();
    expect(archive).toHaveBeenCalledWith({
      reviewDirectory: "review-dir",
      outputPath: "review.tar.gz"
    });
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("review.tar.gz");
    expect(output).toContain("no files were uploaded or submitted");
  });

  it("rejects conflicting preparation and archive flags", async () => {
    await expect(runDiagnoseCommand([
      "--prepare-bundle",
      "--archive",
      "review-dir"
    ])).rejects.toThrow("mutually exclusive");
  });
});
