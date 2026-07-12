import type { DatabaseSync } from "node:sqlite";
import type { MachineIntegrityKey } from "../identity/types.js";
import {
  assertMachineIntegrityKeyId,
  hmacMachineIntegrityInput,
  readMachineIntegrityKey
} from "../identity/integrity-key.js";
import { RuntimeConfigurationError } from "./errors.js";

type RuntimeControlIntegrityRow = {
  home_id: string;
  integrity_key_id: string;
  path_normalization_version: string;
};

export type VerifiedConfigurationIntegrityAuthority = {
  key: MachineIntegrityKey;
  integrityKeyId: string;
  pathNormalizationVersion: string;
};

export const loadVerifiedConfigurationIntegrityAuthority = async (options: {
  db: DatabaseSync;
  canonicalHome: string;
  homeId: string;
}): Promise<VerifiedConfigurationIntegrityAuthority> => {
  const rows = options.db.prepare(
    `SELECT home_id, integrity_key_id, path_normalization_version
     FROM runtime_control_meta
     WHERE home_id = ?`
  ).all(options.homeId) as RuntimeControlIntegrityRow[];
  if (rows.length !== 1) {
    throw new RuntimeConfigurationError(
      "EE_CONFIGURATION_INVALID",
      `Expected one runtime control identity row for ${options.homeId}, observed ${rows.length}.`
    );
  }

  const key = await readMachineIntegrityKey(options.canonicalHome);
  assertMachineIntegrityKeyId(key, rows[0].integrity_key_id);
  return {
    key,
    integrityKeyId: rows[0].integrity_key_id,
    pathNormalizationVersion: rows[0].path_normalization_version
  };
};

export const fingerprintValidationIdentity = (
  key: MachineIntegrityKey,
  value: string
): string => hmacMachineIntegrityInput(key, "validation-identity-v1", value);

export const fingerprintResolvedSecretMaterial = (
  key: MachineIntegrityKey,
  normalizedCapabilityAuthBinding: string,
  resolvedSecretMaterial: string
): string => hmacMachineIntegrityInput(
  key,
  "resolved-secret-material-v1",
  `${normalizedCapabilityAuthBinding}\0${resolvedSecretMaterial}`
);

export const hmacConfigurationSecretsFile = (
  key: MachineIntegrityKey,
  exactBytes: Uint8Array
): string => hmacMachineIntegrityInput(key, "manifest-secret-file-v1", exactBytes);
