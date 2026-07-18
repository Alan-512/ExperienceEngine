import { describe, expect, it } from "vitest";
import {
  assertExactDiagnosticArchiveEntries,
  assertPublishedDiagnosticManifestBoundary,
  digestPublishedDiagnosticsRecord
} from "../../scripts/validation/lib/published-diagnostics-acceptance.mjs";

const manifest = () => ({
  diagnostic_manifest_schema_version: "diagnostic-manifest-v1",
  collection_policy_version: "diagnostic-collection-policy-v1",
  error_aggregation_version: "diagnostic-error-aggregation-v1",
  product: {
    package_name: "@alan512/experienceengine",
    package_version: "0.5.2"
  },
  provider: { exact_model_id: null },
  privacy: {
    raw_database_included: false,
    raw_content_included: false,
    absolute_paths_included: false,
    credentials_included: false,
    provider_payloads_included: false,
    exact_model_id_included: false
  }
});

describe("published diagnostics acceptance contract", () => {
  it("accepts the exact package and privacy boundary", () => {
    const value = manifest();
    expect(assertPublishedDiagnosticManifestBoundary(value, {
      packageName: "@alan512/experienceengine",
      packageVersion: "0.5.2",
      forbiddenValues: ["secret-marker"]
    })).toBe(value);
    expect(assertExactDiagnosticArchiveEntries(["manifest.json"])).toEqual([
      "manifest.json"
    ]);
  });

  it("rejects privacy drift, path leakage, and extra archive entries", () => {
    const unsafe = manifest();
    unsafe.privacy.credentials_included = true;
    expect(() => assertPublishedDiagnosticManifestBoundary(unsafe, {
      packageName: "@alan512/experienceengine",
      packageVersion: "0.5.2"
    })).toThrow("credentials_included");

    const leaked = { ...manifest(), note: "secret-marker" };
    expect(() => assertPublishedDiagnosticManifestBoundary(leaked, {
      packageName: "@alan512/experienceengine",
      packageVersion: "0.5.2",
      forbiddenValues: ["secret-marker"]
    })).toThrow("forbidden runtime value");
    expect(() => assertExactDiagnosticArchiveEntries([
      "manifest.json",
      "extra.log"
    ])).toThrow("exactly manifest.json");
  });

  it("produces a stable canonical validation digest", () => {
    expect(digestPublishedDiagnosticsRecord({ b: 2, a: { d: 4, c: 3 } })).toBe(
      digestPublishedDiagnosticsRecord({ a: { c: 3, d: 4 }, b: 2 })
    );
  });
});
