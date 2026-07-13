export type RuntimeActivationErrorCode =
  | "EE_PACKAGE_ACTIVATION_INVALID"
  | "EE_PACKAGE_ACTIVATION_STALE"
  | "EE_PACKAGE_ACTIVATION_CONFLICT"
  | "EE_PACKAGE_ACTIVATION_NOT_EMPTY"
  | "EE_PACKAGE_CLOSURE_REQUIRED"
  | "EE_PACKAGE_ACTIVATION_SUPERVISOR_FRESH"
  | "EE_PACKAGE_ACTIVATION_WRITER_INVALID"
  | "EE_CONTROL_REQUEST_CONFLICT"
  | "EE_CONTROL_REQUEST_STALE"
  | "EE_ACTIVATION_HANDSHAKE_STALE"
  | "EE_PRODUCTION_ACTIVATION_NOT_CURRENT";

export class RuntimeActivationError extends Error {
  constructor(
    readonly code: RuntimeActivationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RuntimeActivationError";
  }
}
