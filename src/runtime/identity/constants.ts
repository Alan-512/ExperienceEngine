export const RUNTIME_IDENTITY_CONTRACT_ID = "phase-0.5a.1-freeze-2026-07-11" as const;

export const RUNTIME_CONTROL_SCHEMA_VERSION = "runtime-control-v1" as const;
export const RUNTIME_HOME_LAYOUT_VERSION = "home-layout-v1" as const;
export const RUNTIME_HOME_PATH_NORMALIZATION_VERSION = "home-path-normalization-v1" as const;
export const RUNTIME_DATABASE_RELATIVE_PATH = "sqlite/experienceengine.db" as const;
export const MACHINE_INTEGRITY_KEY_SCHEMA_VERSION = "machine-integrity-key-v1" as const;
export const RUNTIME_CLOSURE_MANIFEST_VERSION = "runtime-closure-manifest-v1" as const;
export const RUNTIME_PACKAGE_GENERATION_SCHEMA_VERSION = "runtime-package-generation-v1" as const;

export const MACHINE_INTEGRITY_KEY_RELATIVE_PATH = "machine-secrets/integrity-key.json" as const;

export const INTEGRITY_HMAC_DOMAINS = [
  "manifest-secret-file-v1",
  "validation-identity-v1",
  "resolved-secret-material-v1",
  "diagnostic-identity-v1",
  "home-path-v1"
] as const;

export type IntegrityHmacDomain = (typeof INTEGRITY_HMAC_DOMAINS)[number];

export const FIXED_CONTROL_BOOTSTRAP_WRITERS = [
  "package_local_initializer",
  "gateway_service_controller",
  "supervisor"
] as const;

export type FixedControlBootstrapWriter = (typeof FIXED_CONTROL_BOOTSTRAP_WRITERS)[number];

export const RUNTIME_IDENTITY_FOUNDATION_STAGE = "identity_foundation_only" as const;
