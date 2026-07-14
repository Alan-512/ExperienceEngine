import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RuntimeClosureManifest } from "../identity/types.js";
import {
  RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH
} from "../package/closure-manifest.js";
import {
  canonicalJson,
  sha256Text
} from "../package/package-generation.js";
import {
  deriveInstalledDependencyClosure,
  createRuntimeDistributionAttestation,
  inspectPublishedArtifactClosure,
  type PublishedArtifactClosureInspection
} from "./artifact-inspector.js";
import {
  installMaterializedPublishedArtifact,
  materializeExactNpmArtifact,
  type MaterializedPublishedArtifact,
  type PublishedArtifactInstaller
} from "./artifact-materializer.js";
import {
  createPendingArtifactValidationSequence,
  PublishedRuntimeClosureError
} from "./contract.js";
import type {
  PublishedDistributionChannel
} from "./constants.js";
import {
  createNpmPublishedArtifactInstaller
} from "./npm-artifact-installer.js";
import {
  validatePublishedEntrypointImports,
  type PublishedEntrypointImportReport
} from "./entrypoint-import-validator.js";
import type {
  ArtifactValidationStepRecord,
  InstalledArtifactRuntimeEvidence,
  PublishedLiveActivationEvidence,
  RuntimeDistributionAttestation
} from "./types.js";

export type PublishedNpmClosureAttemptStatus =
  | "closure_passed_live_pending"
  | "installed_artifact_validated_live_host_pending"
  | "artifact_runtime_validated"
  | "live_host_failed"
  | "live_smoke_failed"
  | "closure_failed"
  | "infrastructure_failed";

export type PublishedNpmClosureValidationAttempt = {
  validation_schema_version: string;
  published_channel: PublishedDistributionChannel;
  package_name: string;
  package_version: string;
  status: PublishedNpmClosureAttemptStatus;
  artifact_path_fingerprint: string | null;
  package_root_fingerprint: string | null;
  artifact_integrity: string | null;
  artifact_size: number | null;
  registry_record_identity: string | null;
  distribution_attestation: RuntimeDistributionAttestation | null;
  closure_inspection: PublishedArtifactClosureInspection | null;
  entrypoint_import_report: PublishedEntrypointImportReport | null;
  installed_artifact_runtime_evidence: InstalledArtifactRuntimeEvidence | null;
  live_activation_evidence: PublishedLiveActivationEvidence | null;
  installed_artifact_runtime_smoke_passed: boolean;
  artifact_runtime_validated: boolean;
  validation_steps: ArtifactValidationStepRecord[];
  support_claim_allowed: boolean;
  failure_code: string | null;
  issues: string[];
  created_at: string;
};

export type PublishedArtifactClosureValidationAttempt =
  PublishedNpmClosureValidationAttempt;

type MaterializeNpm = typeof materializeExactNpmArtifact;
type InstallArtifact = typeof installMaterializedPublishedArtifact;
type ReadManifest = (packageRoot: string) => Promise<RuntimeClosureManifest>;
type DeriveDependencies = typeof deriveInstalledDependencyClosure;
type InspectClosure = typeof inspectPublishedArtifactClosure;
type ValidateEntrypointImports = typeof validatePublishedEntrypointImports;
type RunInstalledArtifactSmoke = (input: {
  artifact: MaterializedPublishedArtifact;
  packageRoot: string;
}) => Promise<InstalledArtifactRuntimeEvidence>;
type RunLiveHost = (input: {
  artifact: MaterializedPublishedArtifact;
  packageRoot: string;
}) => Promise<PublishedLiveActivationEvidence>;

const pathFingerprint = (value: string): string =>
  sha256Text(resolve(value).replace(/\\/gu, "/").toLowerCase());

const readEmbeddedManifest: ReadManifest = async (packageRoot) =>
  JSON.parse(await readFile(
    join(
      packageRoot,
      ...RUNTIME_CLOSURE_MANIFEST_RELATIVE_PATH.split("/")
    ),
    "utf8"
  )) as RuntimeClosureManifest;

const blockRemainingSteps = (
  sequence: ArtifactValidationStepRecord[],
  afterIndex: number,
  completedAt: string
): void => {
  for (let index = afterIndex + 1; index < sequence.length; index += 1) {
    sequence[index] = {
      ...sequence[index],
      status: "blocked",
      failure_code: "EE_PUBLISHED_VALIDATION_SEQUENCE_INVALID",
      completed_at: completedAt
    };
  }
};

const failFirstStep = (options: {
  sequence: ArtifactValidationStepRecord[];
  status: "failed" | "infrastructure_failed";
  failureCode: string;
  completedAt: string;
  evidence?: unknown;
}): void => {
  options.sequence[0] = {
    ...options.sequence[0],
    status: options.status,
    failure_code: options.failureCode,
    started_at: options.completedAt,
    completed_at: options.completedAt,
    evidence_digest: options.evidence === undefined
      ? null
      : sha256Text(canonicalJson(options.evidence))
  };
  blockRemainingSteps(options.sequence, 0, options.completedAt);
};

const errorCode = (error: unknown): string =>
  error instanceof PublishedRuntimeClosureError
    ? error.code
    : "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID";

const infrastructureFailure = (error: unknown): boolean =>
  error instanceof PublishedRuntimeClosureError &&
  [
    "EE_PUBLISHED_ARTIFACT_DOWNLOAD_FAILED",
    "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID"
  ].includes(error.code);

type PublishedNpmValidationStage =
  | "materialize"
  | "install"
  | "read_embedded_manifest"
  | "derive_dependency_closure"
  | "inspect_closure"
  | "validate_entrypoint_imports"
  | "run_live_smoke";

const stableIssue = (
  stage: PublishedNpmValidationStage,
  error: unknown
): string => {
  if (error instanceof PublishedRuntimeClosureError) {
    return `${stage}:${error.code}`;
  }
  const code = (error as NodeJS.ErrnoException)?.code;
  if (typeof code === "string" && code.length > 0) {
    return `${stage}:${code}`;
  }
  return `${stage}:unexpected_error`;
};

export const validateExactPublishedNpmArtifactClosure = async (options: {
  packageName: string;
  packageVersion: string;
  validationRoot: string;
  registryBaseUrl?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  publishedChannel?: PublishedDistributionChannel;
  validationSchemaVersion?: string;
  materializeArtifact?: () => Promise<MaterializedPublishedArtifact>;
  installer?: PublishedArtifactInstaller;
  materialize?: MaterializeNpm;
  install?: InstallArtifact;
  manifestReader?: ReadManifest;
  dependencyClosureDeriver?: DeriveDependencies;
  closureInspector?: InspectClosure;
  entrypointImportValidator?: ValidateEntrypointImports;
  installedArtifactSmokeRunner?: RunInstalledArtifactSmoke;
  liveHostRunner?: RunLiveHost;
  qualityPublicationGatePassed?: boolean;
  now?: () => Date;
}): Promise<PublishedNpmClosureValidationAttempt> => {
  const now = options.now ?? (() => new Date());
  const publishedChannel = options.publishedChannel ?? "npm";
  const validationSchemaVersion = options.validationSchemaVersion ??
    "published-npm-closure-attempt-v1";
  const createdAt = now().toISOString();
  const validationRoot = resolve(options.validationRoot);
  const validationSteps = createPendingArtifactValidationSequence();
  let artifact: MaterializedPublishedArtifact | undefined;
  let packageRoot: string | undefined;
  let attestation: RuntimeDistributionAttestation | null = null;
  let inspection: PublishedArtifactClosureInspection | null = null;
  let entrypointImportReport: PublishedEntrypointImportReport | null = null;
  let stage: PublishedNpmValidationStage = "materialize";
  try {
    artifact = options.materializeArtifact
      ? await options.materializeArtifact()
      : await (options.materialize ?? materializeExactNpmArtifact)({
        packageName: options.packageName,
        packageVersion: options.packageVersion,
        destinationDirectory: join(validationRoot, "download"),
        registryBaseUrl: options.registryBaseUrl,
        fetchImpl: options.fetchImpl,
        now
      });
    if (artifact.published_channel !== publishedChannel) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_CHANNEL_MISMATCH",
        "Materialized artifact channel does not match the requested validation channel."
      );
    }
    if (
      artifact.package_name !== options.packageName ||
      artifact.package_version !== options.packageVersion
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_PUBLISHED_ARTIFACT_VERSION_INVALID",
        "Materialized artifact identity does not match the exact requested package version."
      );
    }
    stage = "install";
    packageRoot = (
      await (options.install ?? installMaterializedPublishedArtifact)({
        artifact,
        installRoot: join(validationRoot, "install"),
        installer: options.installer ?? createNpmPublishedArtifactInstaller(),
        cleanExisting: true
      })
    ).packageRoot;
    stage = "read_embedded_manifest";
    const manifest = await (
      options.manifestReader ?? readEmbeddedManifest
    )(packageRoot);
    stage = "derive_dependency_closure";
    const dependencyClosure = await (
      options.dependencyClosureDeriver ?? deriveInstalledDependencyClosure
    )(packageRoot);
    attestation = createRuntimeDistributionAttestation({
      artifact,
      manifest,
      dependencyClosureDigest: dependencyClosure.digest,
      createdAt
    });
    stage = "inspect_closure";
    inspection = await (
      options.closureInspector ?? inspectPublishedArtifactClosure
    )({
      artifact,
      packageRoot,
      attestation,
      manifestReader: async () => manifest,
      dependencyClosureDeriver: async () => dependencyClosure
    });
    if (!inspection.valid) {
      const failureCode = "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID";
      failFirstStep({
        sequence: validationSteps,
        status: "failed",
        failureCode,
        completedAt: now().toISOString(),
        evidence: inspection
      });
      return {
        validation_schema_version: validationSchemaVersion,
        published_channel: publishedChannel,
        package_name: options.packageName,
        package_version: options.packageVersion,
        status: "closure_failed",
        artifact_path_fingerprint: pathFingerprint(artifact.artifact_path),
        package_root_fingerprint: pathFingerprint(packageRoot),
        artifact_integrity: artifact.artifact_integrity,
        artifact_size: artifact.artifact_size,
        registry_record_identity: artifact.registry_record_identity,
        distribution_attestation: attestation,
        closure_inspection: inspection,
        entrypoint_import_report: null,
        installed_artifact_runtime_evidence: null,
        live_activation_evidence: null,
        installed_artifact_runtime_smoke_passed: false,
        artifact_runtime_validated: false,
        validation_steps: validationSteps,
        support_claim_allowed: false,
        failure_code: failureCode,
        issues: [...inspection.issues],
        created_at: createdAt
      };
    }
    stage = "validate_entrypoint_imports";
    entrypointImportReport = await (
      options.entrypointImportValidator ?? validatePublishedEntrypointImports
    )({
      packageRoot,
      manifest
    });
    if (!entrypointImportReport.valid) {
      const failureCode =
        entrypointImportReport.records.find((record) =>
          record.status === "failed"
        )?.failure_code ?? "EE_PUBLISHED_ENTRYPOINT_IMPORT_FAILED";
      const completedAt = now().toISOString();
      validationSteps[0] = {
        ...validationSteps[0],
        status: "passed",
        evidence_digest: sha256Text(canonicalJson({ attestation, inspection })),
        started_at: createdAt,
        completed_at: completedAt
      };
      validationSteps[1] = {
        ...validationSteps[1],
        status: "passed",
        evidence_digest: sha256Text(canonicalJson({
          closure_manifest_digest: inspection.closure_manifest_digest
        })),
        started_at: completedAt,
        completed_at: completedAt
      };
      validationSteps[2] = {
        ...validationSteps[2],
        status: "failed",
        evidence_digest: sha256Text(canonicalJson(entrypointImportReport)),
        failure_code: failureCode,
        started_at: completedAt,
        completed_at: completedAt
      };
      blockRemainingSteps(validationSteps, 2, completedAt);
      return {
        validation_schema_version: validationSchemaVersion,
        published_channel: publishedChannel,
        package_name: options.packageName,
        package_version: options.packageVersion,
        status: "closure_failed",
        artifact_path_fingerprint: pathFingerprint(artifact.artifact_path),
        package_root_fingerprint: pathFingerprint(packageRoot),
        artifact_integrity: artifact.artifact_integrity,
        artifact_size: artifact.artifact_size,
        registry_record_identity: artifact.registry_record_identity,
        distribution_attestation: attestation,
        closure_inspection: inspection,
        entrypoint_import_report: entrypointImportReport,
        installed_artifact_runtime_evidence: null,
        live_activation_evidence: null,
        installed_artifact_runtime_smoke_passed: false,
        artifact_runtime_validated: false,
        validation_steps: validationSteps,
        support_claim_allowed: false,
        failure_code: failureCode,
        issues: [...entrypointImportReport.issues],
        created_at: createdAt
      };
    }
    const completedAt = now().toISOString();
    validationSteps[0] = {
      ...validationSteps[0],
      status: "passed",
      evidence_digest: sha256Text(canonicalJson({ attestation, inspection })),
      started_at: createdAt,
      completed_at: completedAt
    };
    validationSteps[1] = {
      ...validationSteps[1],
      status: "passed",
      evidence_digest: sha256Text(canonicalJson({
        closure_manifest_digest: inspection.closure_manifest_digest
      })),
      started_at: completedAt,
      completed_at: completedAt
    };
    validationSteps[2] = {
      ...validationSteps[2],
      status: "passed",
      evidence_digest: sha256Text(canonicalJson(entrypointImportReport)),
      started_at: completedAt,
      completed_at: completedAt
    };
    validationSteps[3] = {
      ...validationSteps[3],
      status: "passed",
      evidence_digest: sha256Text(canonicalJson({
        dependency_closure_digest: inspection.dependency_closure_digest
      })),
      started_at: completedAt,
      completed_at: completedAt
    };
    if (options.installedArtifactSmokeRunner) {
      stage = "run_live_smoke";
      let installedArtifactRuntimeEvidence: InstalledArtifactRuntimeEvidence;
      try {
        installedArtifactRuntimeEvidence = await options.installedArtifactSmokeRunner({
          artifact,
          packageRoot
        });
      } catch (error) {
        const failureCode = errorCode(error);
        const issue = stableIssue(stage, error);
        const failedAt = now().toISOString();
        validationSteps[4] = {
          ...validationSteps[4],
          status: infrastructureFailure(error)
            ? "infrastructure_failed"
            : "failed",
          evidence_digest: sha256Text(canonicalJson({ issue })),
          failure_code: failureCode,
          started_at: failedAt,
          completed_at: failedAt
        };
        blockRemainingSteps(validationSteps, 4, failedAt);
        return {
          validation_schema_version: validationSchemaVersion,
          published_channel: publishedChannel,
          package_name: options.packageName,
          package_version: options.packageVersion,
          status: infrastructureFailure(error)
            ? "infrastructure_failed"
            : "live_smoke_failed",
          artifact_path_fingerprint: pathFingerprint(artifact.artifact_path),
          package_root_fingerprint: pathFingerprint(packageRoot),
          artifact_integrity: artifact.artifact_integrity,
          artifact_size: artifact.artifact_size,
          registry_record_identity: artifact.registry_record_identity,
          distribution_attestation: attestation,
          closure_inspection: inspection,
          entrypoint_import_report: entrypointImportReport,
          installed_artifact_runtime_evidence: null,
          live_activation_evidence: null,
          installed_artifact_runtime_smoke_passed: false,
          artifact_runtime_validated: false,
          validation_steps: validationSteps,
          support_claim_allowed: false,
          failure_code: failureCode,
          issues: [issue],
          created_at: createdAt
        };
      }
      const liveCompletedAt = now().toISOString();
      validationSteps[4] = {
        ...validationSteps[4],
        status: "passed",
        evidence_digest: sha256Text(canonicalJson({
          supervisor_owner_id:
            installedArtifactRuntimeEvidence.activation.supervisor_owner_id,
          worker_fencing_token:
            installedArtifactRuntimeEvidence.activation.worker_fencing_token
        })),
        started_at: liveCompletedAt,
        completed_at: liveCompletedAt
      };
      validationSteps[5] = {
        ...validationSteps[5],
        status: "passed",
        evidence_digest: sha256Text(canonicalJson({
          profile_registry_digest: attestation.profile_registry_digest,
          compatibility_metadata_digest:
            attestation.compatibility_metadata_digest
        })),
        started_at: liveCompletedAt,
        completed_at: liveCompletedAt
      };
      validationSteps[6] = {
        ...validationSteps[6],
        status: "passed",
        evidence_digest: sha256Text(canonicalJson({
          artifact_integrity: artifact.artifact_integrity,
          registry_record_identity: artifact.registry_record_identity
        })),
        started_at: liveCompletedAt,
        completed_at: liveCompletedAt
      };
      if (!options.liveHostRunner) {
        validationSteps[7] = {
          ...validationSteps[7],
          status: "pending",
          evidence_digest: null,
          failure_code: null,
          started_at: null,
          completed_at: null
        };
        return {
          validation_schema_version: validationSchemaVersion,
          published_channel: publishedChannel,
          package_name: options.packageName,
          package_version: options.packageVersion,
          status: "installed_artifact_validated_live_host_pending",
          artifact_path_fingerprint: pathFingerprint(artifact.artifact_path),
          package_root_fingerprint: pathFingerprint(packageRoot),
          artifact_integrity: artifact.artifact_integrity,
          artifact_size: artifact.artifact_size,
          registry_record_identity: artifact.registry_record_identity,
          distribution_attestation: attestation,
          closure_inspection: inspection,
          entrypoint_import_report: entrypointImportReport,
          installed_artifact_runtime_evidence: installedArtifactRuntimeEvidence,
          live_activation_evidence: null,
          installed_artifact_runtime_smoke_passed: true,
          artifact_runtime_validated: false,
          validation_steps: validationSteps,
          support_claim_allowed: false,
          failure_code: null,
          issues: ["real_openclaw_live_host_validation_pending"],
          created_at: createdAt
        };
      }
      let liveActivationEvidence: PublishedLiveActivationEvidence;
      try {
        liveActivationEvidence = await options.liveHostRunner({ artifact, packageRoot });
      } catch (error) {
        const failureCode = errorCode(error);
        const issue = stableIssue(stage, error);
        const failedAt = now().toISOString();
        validationSteps[7] = {
          ...validationSteps[7],
          status: infrastructureFailure(error) ? "infrastructure_failed" : "failed",
          evidence_digest: sha256Text(canonicalJson({ issue })),
          failure_code: failureCode,
          started_at: failedAt,
          completed_at: failedAt
        };
        return {
          validation_schema_version: validationSchemaVersion,
          published_channel: publishedChannel,
          package_name: options.packageName,
          package_version: options.packageVersion,
          status: "live_host_failed",
          artifact_path_fingerprint: pathFingerprint(artifact.artifact_path),
          package_root_fingerprint: pathFingerprint(packageRoot),
          artifact_integrity: artifact.artifact_integrity,
          artifact_size: artifact.artifact_size,
          registry_record_identity: artifact.registry_record_identity,
          distribution_attestation: attestation,
          closure_inspection: inspection,
          entrypoint_import_report: entrypointImportReport,
          installed_artifact_runtime_evidence: installedArtifactRuntimeEvidence,
          live_activation_evidence: null,
          installed_artifact_runtime_smoke_passed: true,
          artifact_runtime_validated: false,
          validation_steps: validationSteps,
          support_claim_allowed: false,
          failure_code: failureCode,
          issues: [issue],
          created_at: createdAt
        };
      }
      validationSteps[7] = {
        ...validationSteps[7],
        status: "passed",
        evidence_digest: sha256Text(canonicalJson(liveActivationEvidence)),
        started_at: liveCompletedAt,
        completed_at: now().toISOString()
      };
      const supportClaimAllowed =
        liveActivationEvidence.production_learning_ready === true &&
        options.qualityPublicationGatePassed === true;
      return {
        validation_schema_version: validationSchemaVersion,
        published_channel: publishedChannel,
        package_name: options.packageName,
        package_version: options.packageVersion,
        status: "artifact_runtime_validated",
        artifact_path_fingerprint: pathFingerprint(artifact.artifact_path),
        package_root_fingerprint: pathFingerprint(packageRoot),
        artifact_integrity: artifact.artifact_integrity,
        artifact_size: artifact.artifact_size,
        registry_record_identity: artifact.registry_record_identity,
        distribution_attestation: attestation,
        closure_inspection: inspection,
        entrypoint_import_report: entrypointImportReport,
        installed_artifact_runtime_evidence: installedArtifactRuntimeEvidence,
        live_activation_evidence: liveActivationEvidence,
        installed_artifact_runtime_smoke_passed: true,
        artifact_runtime_validated: true,
        validation_steps: validationSteps,
        support_claim_allowed: supportClaimAllowed,
        failure_code: null,
        issues: supportClaimAllowed
          ? []
          : [
              liveActivationEvidence.production_learning_ready === true
                ? "quality_publication_gate_pending"
                : "production_learning_ready_false"
            ],
        created_at: createdAt
      };
    }
    for (let index = 4; index < validationSteps.length; index += 1) {
      validationSteps[index] = {
        ...validationSteps[index],
        status: index === 4 ? "pending" : "blocked",
        failure_code: index === 4
          ? null
          : "EE_PUBLISHED_VALIDATION_SEQUENCE_INVALID",
        completed_at: index === 4 ? null : completedAt
      };
    }
    return {
      validation_schema_version: validationSchemaVersion,
      published_channel: publishedChannel,
      package_name: options.packageName,
      package_version: options.packageVersion,
      status: "closure_passed_live_pending",
      artifact_path_fingerprint: pathFingerprint(artifact.artifact_path),
      package_root_fingerprint: pathFingerprint(packageRoot),
      artifact_integrity: artifact.artifact_integrity,
      artifact_size: artifact.artifact_size,
      registry_record_identity: artifact.registry_record_identity,
      distribution_attestation: attestation,
      closure_inspection: inspection,
      entrypoint_import_report: entrypointImportReport,
      installed_artifact_runtime_evidence: null,
      live_activation_evidence: null,
      installed_artifact_runtime_smoke_passed: false,
      artifact_runtime_validated: false,
      validation_steps: validationSteps,
      support_claim_allowed: false,
      failure_code: null,
      issues: [
        "package_local_spawn_and_live_activation_not_run"
      ],
      created_at: createdAt
    };
  } catch (error) {
    const failureCode = errorCode(error);
    const issue = stableIssue(stage, error);
    const completedAt = now().toISOString();
    failFirstStep({
      sequence: validationSteps,
      status: infrastructureFailure(error)
        ? "infrastructure_failed"
        : "failed",
      failureCode,
      completedAt,
      evidence: {
        issue,
        published_channel: publishedChannel,
        package_name: options.packageName,
        package_version: options.packageVersion,
        artifact_integrity: artifact?.artifact_integrity ?? null,
        registry_record_identity:
          artifact?.registry_record_identity ?? null
      }
    });
    return {
      validation_schema_version: validationSchemaVersion,
      published_channel: publishedChannel,
      package_name: options.packageName,
      package_version: options.packageVersion,
      status: infrastructureFailure(error)
        ? "infrastructure_failed"
        : "closure_failed",
      artifact_path_fingerprint: artifact
        ? pathFingerprint(artifact.artifact_path)
        : null,
      package_root_fingerprint: packageRoot
        ? pathFingerprint(packageRoot)
        : null,
      artifact_integrity: artifact?.artifact_integrity ?? null,
      artifact_size: artifact?.artifact_size ?? null,
      registry_record_identity: artifact?.registry_record_identity ?? null,
      distribution_attestation: attestation,
      closure_inspection: inspection,
      entrypoint_import_report: entrypointImportReport,
      installed_artifact_runtime_evidence: null,
      live_activation_evidence: null,
      installed_artifact_runtime_smoke_passed: false,
      artifact_runtime_validated: false,
      validation_steps: validationSteps,
      support_claim_allowed: false,
      failure_code: failureCode,
      issues: [issue],
      created_at: createdAt
    };
  }
};

export const PUBLISHED_NPM_CLOSURE_ATTEMPT_CONTRACT = Object.freeze({
  exact_registry_version_required: true,
  registry_sri_verified_before_install: true,
  isolated_install_required: true,
  embedded_manifest_required_before_attestation: true,
  clean_environment_entrypoint_import_required: true,
  installed_artifact_runtime_smoke_supported: true,
  installed_artifact_smoke_satisfies_live_host: false,
  real_openclaw_live_host_required_for_artifact_runtime_validation: true,
  source_repo_runtime_fallback_allowed: false,
  support_claim_allowed_without_live_activation: false
});

export const validateExactPublishedArtifactClosure =
  validateExactPublishedNpmArtifactClosure;
