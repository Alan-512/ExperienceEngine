import type {
  RuntimeClosureValidationReport
} from "../package/closure-manifest.js";
import type { RuntimeHomeIdentity } from "./types.js";

export type RuntimeIdentityFoundationInspection = {
  projection_schema_version: "runtime-identity-foundation-inspection-v1";
  identity_foundation_state: "ready_for_next_dependency" | "uninitialized" | "blocked";
  package_closure_state: "valid" | "invalid";
  home_identity_state: "committed" | "uninitialized";
  home_id: string | null;
  path_normalization_version: string | null;
  normalized_path_fingerprint: string | null;
  package_build_id: string | null;
  closure_manifest_digest: string | null;
  production_learning_ready: false;
  learning_runtime_active: false;
  activation_evaluated: false;
  issues: string[];
};

export const inspectRuntimeIdentityFoundation = (options: {
  closure: RuntimeClosureValidationReport;
  homeIdentity?: RuntimeHomeIdentity;
}): RuntimeIdentityFoundationInspection => {
  const homeReady = Boolean(options.homeIdentity);
  const ready = options.closure.valid && homeReady;
  return {
    projection_schema_version: "runtime-identity-foundation-inspection-v1",
    identity_foundation_state: ready
      ? "ready_for_next_dependency"
      : options.closure.valid
        ? "uninitialized"
        : "blocked",
    package_closure_state: options.closure.valid ? "valid" : "invalid",
    home_identity_state: homeReady ? "committed" : "uninitialized",
    home_id: options.homeIdentity?.home_id ?? null,
    path_normalization_version: options.homeIdentity?.path_normalization_version ?? null,
    normalized_path_fingerprint: options.homeIdentity?.normalized_path_fingerprint ?? null,
    package_build_id: options.closure.packageBuildId ?? null,
    closure_manifest_digest: options.closure.closureManifestDigest ?? null,
    production_learning_ready: false,
    learning_runtime_active: false,
    activation_evaluated: false,
    issues: [...options.closure.issues]
  };
};
