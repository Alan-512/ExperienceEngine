import type { RuntimeIdentityMismatchCode } from "./types.js";

export class RuntimeIdentityError extends Error {
  constructor(
    public readonly code:
      | RuntimeIdentityMismatchCode
      | "EE_INTEGRITY_KEY_INVALID"
      | "EE_BOOTSTRAP_WRITER_FORBIDDEN"
      | "EE_OPENCLAW_INSTALL_ATTESTATION_INVALID"
      | "EE_OPENCLAW_INSTALL_ATTESTATION_CONFLICT"
      | "EE_OPENCLAW_INSTALL_ATTESTATION_MISMATCH",
    message: string
  ) {
    super(message);
    this.name = "RuntimeIdentityError";
  }
}
