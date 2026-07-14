import { describe, expect, it } from "vitest";
import {
  evaluateOpenClawProductionVerification
} from "../../src/cli/commands/verify.js";
import type {
  CliRuntimeAuthorityInspection
} from "../../src/runtime/activation/cli-inspection.js";

const authority = (
  current: boolean
): CliRuntimeAuthorityInspection => ({
  inspection_schema_version: "cli-runtime-authority-inspection-v1",
  control_database_state: "available",
  evidence_scope: {
    local_source_and_package_closure: "available",
    local_control_database: "available",
    published_npm_clawhub: "not_verified"
  },
  interaction_active: true,
  package_installed: true,
  setup_state: "ready",
  home_id: "home-fixture",
  package_activation_state: "active",
  package_activation_revision: 2,
  blocked_boundary: "none",
  process_activation_current: current,
  route_authority_verification: "not_available_to_global_cli",
  learning_runtime_active: false,
  production_learning_ready: false,
  quality_profile: "not_evaluated",
  core_learning_quality: "not_evaluated",
  learning_health: current
    ? "process_active_route_unverified"
    : "authority_not_current",
  configuration_generation_id: "config-fixture",
  production_activation_handshake_id: "activation-fixture",
  supervisor_state: "active",
  supervisor_lease_epoch: 1,
  worker_state: "active",
  worker_fencing_token: 2,
  next_action: "Inspect package-local status.",
  warning: null
});

describe("strict OpenClaw production verification", () => {
  it("passes active runtime authority without converting quality pending into failure", () => {
    expect(evaluateOpenClawProductionVerification({
      installed: true,
      interactionActive: true,
      authority: authority(true),
      health: {
        evidence_schema_version: "openclaw-runtime-health-v1",
        observed_at: "2026-07-14T12:00:00.000Z",
        lifecycle_state: "active",
        code: "runtime_status_projected",
        status_projection: {
          interaction_active: true,
          learning_runtime_active: true,
          production_learning_ready: false
        },
        safe_detail: null,
        next_action: "Inspect status."
      }
    })).toMatchObject({
      ok: true,
      code: "EE_OPENCLAW_PRODUCTION_RUNTIME_VERIFIED",
      interaction_active: true,
      learning_runtime_active: true,
      production_learning_ready: false
    });
  });

  it("fails with the persisted stable lifecycle code", () => {
    expect(evaluateOpenClawProductionVerification({
      installed: true,
      interactionActive: true,
      authority: authority(false),
      health: {
        evidence_schema_version: "openclaw-runtime-health-v1",
        observed_at: "2026-07-14T12:00:00.000Z",
        lifecycle_state: "failed",
        code: "EE_RUNTIME_CLOSURE_INVALID",
        status_projection: null,
        safe_detail: "closure mismatch",
        next_action: "Repair the installed closure."
      }
    })).toMatchObject({
      ok: false,
      code: "EE_RUNTIME_CLOSURE_INVALID",
      learning_runtime_active: false,
      next_action: "Repair the installed closure."
    });
  });
});
