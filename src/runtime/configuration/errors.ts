export type RuntimeConfigurationErrorCode =
  | "EE_CONFIGURATION_INVALID"
  | "EE_CONFIGURATION_POINTER_CONFLICT"
  | "EE_CONFIGURATION_GENERATION_INVALID"
  | "EE_PROFILE_REGISTRY_INVALID"
  | "EE_PROFILE_INCOMPATIBLE"
  | "EE_VALIDATION_BINDING_INVALID"
  | "EE_ROUTE_AUTHORITY_INVALID"
  | "EE_ROUTE_PROJECTION_WRITE_FORBIDDEN"
  | "EE_ROUTE_PROJECTION_AUTHORITY_UNAVAILABLE"
  | "EE_LEGACY_RULE_MODE_FORBIDDEN";

export class RuntimeConfigurationError extends Error {
  constructor(
    public readonly code: RuntimeConfigurationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RuntimeConfigurationError";
  }
}
