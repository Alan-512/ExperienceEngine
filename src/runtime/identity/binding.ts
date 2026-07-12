import {
  RUNTIME_IDENTITY_CONTRACT_ID
} from "./constants.js";
import { RuntimeIdentityError } from "./errors.js";
import type {
  CanonicalRuntimeHomeResolution,
  GatewayRuntimeIdentityEnvelope,
  RuntimeIdentityResult,
  RuntimePackageGenerationIdentity,
  RuntimeParticipantIdentity,
  RuntimeHomeIdentity
} from "./types.js";

export const createGatewayRuntimeIdentityEnvelope = (options: {
  resolution: CanonicalRuntimeHomeResolution;
  home: RuntimeHomeIdentity;
  package: RuntimePackageGenerationIdentity;
}): GatewayRuntimeIdentityEnvelope => {
  const envelope: GatewayRuntimeIdentityEnvelope = {
    envelope_schema_version: "gateway-runtime-identity-envelope-v1",
    canonical_home_resolution: {
      contract_id: options.resolution.contractId,
      resolution_mode: options.resolution.resolutionMode,
      resolved_home: options.resolution.resolvedHome,
      home_layout_version: options.resolution.homeLayoutVersion,
      path_normalization_version: options.resolution.pathNormalizationVersion,
      database_relative_path: options.resolution.databaseRelativePath
    },
    home: options.home,
    package: options.package
  };
  const binding = validateGatewayEnvelopeHomeBinding(envelope);
  if (!binding.ok) {
    throw new RuntimeIdentityError(
      binding.code,
      `Gateway runtime identity envelope has an inconsistent ${binding.field} binding.`
    );
  }
  return envelope;
};

const mismatch = (
  code: Exclude<RuntimeIdentityResult<never>, { ok: true }>["code"],
  field: string,
  expected: string,
  observed: string
): RuntimeIdentityResult<never> => ({
  ok: false,
  code,
  field,
  expected,
  observed
});

const validateGatewayEnvelopeHomeBinding = (
  envelope: GatewayRuntimeIdentityEnvelope
): RuntimeIdentityResult<GatewayRuntimeIdentityEnvelope> => {
  const resolution = envelope.canonical_home_resolution;
  if (resolution.contract_id !== RUNTIME_IDENTITY_CONTRACT_ID) {
    return mismatch(
      "EE_HOME_IDENTITY_MISMATCH",
      "contract_id",
      RUNTIME_IDENTITY_CONTRACT_ID,
      resolution.contract_id
    );
  }

  const comparisons: Array<[string, string, string]> = [
    ["home_layout_version", envelope.home.home_layout_version, resolution.home_layout_version],
    [
      "path_normalization_version",
      envelope.home.path_normalization_version,
      resolution.path_normalization_version
    ],
    [
      "database_relative_path",
      envelope.home.database_relative_path,
      resolution.database_relative_path
    ]
  ];
  for (const [field, expected, observed] of comparisons) {
    if (expected !== observed) {
      return mismatch("EE_HOME_IDENTITY_MISMATCH", field, expected, observed);
    }
  }
  if (resolution.resolved_home.trim().length === 0) {
    return mismatch(
      "EE_HOME_IDENTITY_MISMATCH",
      "resolved_home",
      "non_empty_canonical_home",
      "empty_canonical_home"
    );
  }
  return { ok: true, value: envelope };
};

export const consumeGatewayRuntimeIdentityEnvelope = (
  envelope: GatewayRuntimeIdentityEnvelope,
  participant: RuntimeParticipantIdentity
): RuntimeIdentityResult<GatewayRuntimeIdentityEnvelope> => {
  const envelopeBinding = validateGatewayEnvelopeHomeBinding(envelope);
  if (!envelopeBinding.ok) {
    return envelopeBinding;
  }
  const homeComparisons: Array<[keyof RuntimeParticipantIdentity, keyof RuntimeHomeIdentity]> = [
    ["home_id", "home_id"],
    ["home_layout_version", "home_layout_version"],
    ["path_normalization_version", "path_normalization_version"],
    ["normalized_path_fingerprint", "normalized_path_fingerprint"],
    ["database_relative_path", "database_relative_path"]
  ];

  for (const [participantField, envelopeField] of homeComparisons) {
    const expected = envelope.home[envelopeField];
    const observed = participant[participantField];
    if (expected !== observed) {
      return mismatch("EE_HOME_IDENTITY_MISMATCH", participantField, expected, observed);
    }
  }

  if (envelope.package.package_generation_id !== participant.package_generation_id) {
    return mismatch(
      "EE_PACKAGE_GENERATION_MISMATCH",
      "package_generation_id",
      envelope.package.package_generation_id,
      participant.package_generation_id
    );
  }
  if (envelope.package.artifact_integrity !== participant.artifact_integrity) {
    return mismatch(
      "EE_ARTIFACT_INTEGRITY_MISMATCH",
      "artifact_integrity",
      envelope.package.artifact_integrity,
      participant.artifact_integrity
    );
  }

  return { ok: true, value: envelope };
};
