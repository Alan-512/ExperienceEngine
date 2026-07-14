import type {
  FixedControlBootstrapWriter,
  IntegrityHmacDomain
} from "./constants.js";

export type RuntimeHomeResolutionMode =
  | "openclaw_explicit"
  | "environment"
  | "product_default";

export type RuntimePublishedChannel = "npm" | "clawhub" | "local_test";

export type RuntimeInstallOrigin =
  | "local_pack"
  | "host_native_unattested"
  | "published_npm_attested"
  | "published_clawhub_attested";

export type RuntimeInstallSecurityApproval = {
  scan_status: "not_run" | "not_required" | "approval_required" | "approved";
  scan_summary_digest: string | null;
  approval_method: "explicit_cli" | "host_policy" | null;
  approved_at: string | null;
};

export type RuntimeInstallAttestationContent = {
  attestation_schema_version: "runtime-install-attestation-v1";
  install_origin: RuntimeInstallOrigin;
  package_name: string;
  package_version: string;
  package_build_id: string;
  closure_manifest_digest: string;
  installed_root_fingerprint: string;
  host_state_dir_fingerprint: string;
  home_id: string;
  database_path_fingerprint: string;
  openclaw_version: string | null;
  node_version: string;
  artifact_integrity: string;
  registry_record_identity: string | null;
  security_approval: RuntimeInstallSecurityApproval;
  issued_by: "gateway_service_controller" | "ee_installer" | "published_validator";
  issued_at: string;
  integrity_key_id: string;
};

export type RuntimeInstallAttestation = RuntimeInstallAttestationContent & {
  attestation_identity: string;
  attestation_hmac: string;
};

export type CanonicalRuntimeHomeResolution = {
  contractId: string;
  resolutionMode: RuntimeHomeResolutionMode;
  resolvedHome: string;
  displayHome: string;
  normalizedHomePath: string;
  homeLayoutVersion: string;
  pathNormalizationVersion: string;
  databaseRelativePath: string;
  databasePath: string;
};

export type MachineIntegrityKey = {
  key_schema_version: string;
  integrity_key_id: string;
  key_material: string;
  created_at: string;
};

export type RuntimeHomeIdentity = {
  home_id: string;
  home_layout_version: string;
  path_normalization_version: string;
  normalized_path_fingerprint: string;
  home_path_fingerprint_key_id: string;
  database_relative_path: string;
  created_at: string;
};

export type RuntimeClosureAsset = {
  role: string;
  path: string;
  sha256: string;
};

export type RuntimeClosureManifestContent = {
  closure_manifest_version: string;
  package_name: string;
  package_version: string;
  package_build_id: string;
  required_entrypoints: RuntimeClosureAsset[];
  required_runtime_files: RuntimeClosureAsset[];
  required_schema_and_migrations: RuntimeClosureAsset[];
  profile_registry_digest: string;
  dependency_requirements_digest: string;
  compatibility_metadata_digest: string;
};

export type RuntimeClosureManifest = RuntimeClosureManifestContent & {
  closure_manifest_digest: string;
};

export type RuntimePackageGenerationIdentity = {
  package_name: string;
  package_version: string;
  package_generation_id: string;
  artifact_integrity: string;
  install_record_identity: string;
  plugin_entrypoint: string;
  supervisor_entrypoint: string;
  worker_entrypoint: string;
  supervisor_protocol_version: string;
  worker_protocol_version: string;
  control_protocol_version: string;
  profile_registry_digest: string;
  min_read_schema_version: string;
  max_read_schema_version: string;
  min_write_schema_version: string;
  max_write_schema_version: string;
  target_schema_version: string;
  install_origin: RuntimeInstallOrigin;
  published_channel: RuntimePublishedChannel;
};

export type GatewayResolvedRuntimeHome = {
  contract_id: string;
  resolution_mode: RuntimeHomeResolutionMode;
  resolved_home: string;
  home_layout_version: string;
  path_normalization_version: string;
  database_relative_path: string;
};

export type GatewayRuntimeIdentityEnvelope = {
  envelope_schema_version: "gateway-runtime-identity-envelope-v1";
  canonical_home_resolution: GatewayResolvedRuntimeHome;
  home: RuntimeHomeIdentity;
  package: RuntimePackageGenerationIdentity;
};

export type RuntimeParticipantIdentity = {
  participant: "plugin" | "supervisor" | "worker" | "operator";
  home_id: string;
  home_layout_version: string;
  path_normalization_version: string;
  normalized_path_fingerprint: string;
  database_relative_path: string;
  package_generation_id: string;
  artifact_integrity: string;
};

export type RuntimeIdentityMismatchCode =
  | "EE_HOME_IDENTITY_MISMATCH"
  | "EE_INTEGRITY_KEY_MISMATCH"
  | "EE_PACKAGE_GENERATION_MISMATCH"
  | "EE_ARTIFACT_INTEGRITY_MISMATCH"
  | "EE_CONTROL_SCHEMA_INCOMPATIBLE"
  | "EE_RUNTIME_CLOSURE_INVALID";

export type RuntimeIdentityMismatch = {
  ok: false;
  code: RuntimeIdentityMismatchCode;
  field: string;
  expected: string | number | null;
  observed: string | number | null;
};

export type RuntimeIdentityMatch<T> = {
  ok: true;
  value: T;
};

export type RuntimeIdentityResult<T> = RuntimeIdentityMatch<T> | RuntimeIdentityMismatch;

export type RuntimeHomeInitializationStage =
  | "home_resolved"
  | "integrity_key_adopted"
  | "database_opened"
  | "control_plane_ready";

export type RuntimeHomeInitializationOptions = {
  writer: FixedControlBootstrapWriter;
  explicitOpenClawHome?: string;
  env?: NodeJS.ProcessEnv;
  defaultHome?: string;
  platform?: NodeJS.Platform;
  cwd?: string;
  now?: () => Date;
  onStage?: (stage: RuntimeHomeInitializationStage) => void;
};

export type IntegrityHmacInput = {
  domain: IntegrityHmacDomain;
  value: string | Uint8Array;
};
