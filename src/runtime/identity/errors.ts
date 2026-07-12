import type { RuntimeIdentityMismatchCode } from "./types.js";

export class RuntimeIdentityError extends Error {
  constructor(
    public readonly code: RuntimeIdentityMismatchCode | "EE_INTEGRITY_KEY_INVALID" | "EE_BOOTSTRAP_WRITER_FORBIDDEN",
    message: string
  ) {
    super(message);
    this.name = "RuntimeIdentityError";
  }
}
