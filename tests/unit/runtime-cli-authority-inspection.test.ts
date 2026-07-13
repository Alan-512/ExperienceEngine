import { describe, expect, it, vi } from "vitest";
import {
  inspectCliRuntimeAuthority,
  inspectCliRuntimeAuthorityFromDatabase,
  logCliRuntimeAuthorityInspection
} from "../../src/runtime/activation/cli-inspection.js";
import {
  createRuntimeProductionLifecycleFixture
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import {
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

describe("CLI runtime authority inspection", () => {
  it("separates current process authority from unverified route and published evidence", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const inspection = inspectCliRuntimeAuthorityFromDatabase({
        db: fixture.db,
        interactionActive: true,
        packageInstalled: true,
        observedAt: PROCESS_FIXTURE_START
      });
      expect(inspection).toMatchObject({
        control_database_state: "available",
        interaction_active: true,
        setup_state: "ready",
        package_activation_state: "active",
        process_activation_current: true,
        route_authority_verification: "not_available_to_global_cli",
        learning_runtime_active: false,
        production_learning_ready: false,
        quality_profile: "not_evaluated",
        learning_health: "process_active_route_unverified",
        evidence_scope: {
          local_source_and_package_closure: "available",
          local_control_database: "available",
          published_npm_clawhub: "not_verified"
        }
      });
      const serialized = JSON.stringify(inspection).toLowerCase();
      expect(serialized).not.toContain("api_key");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("process_start_token");
      expect(serialized).not.toContain("gateway_process_start_token");
    } finally {
      fixture.db.close();
    }
  });

  it("fails closed without creating a missing database", () => {
    const missingPath = "definitely-missing-runtime-authority.db";
    expect(inspectCliRuntimeAuthority({
      sqlitePath: missingPath,
      interactionActive: true,
      packageInstalled: true
    })).toMatchObject({
      control_database_state: "missing",
      learning_runtime_active: false,
      production_learning_ready: false,
      evidence_scope: {
        published_npm_clawhub: "not_verified"
      }
    });
  });

  it("keeps concise output actionable and verbose output limited to authority evidence", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const inspection = inspectCliRuntimeAuthorityFromDatabase({
        db: fixture.db,
        interactionActive: true,
        packageInstalled: true,
        observedAt: PROCESS_FIXTURE_START
      });
      logCliRuntimeAuthorityInspection(inspection, { verbose: true });
      const output = log.mock.calls.map(([line]) => String(line)).join("\n");
      expect(output).toContain("OpenClaw production runtime:");
      expect(output).toContain("Next action:");
      expect(output).toContain("Runtime authority evidence:");
      expect(output).toContain("Published distribution evidence: not_verified");
      expect(output.toLowerCase()).not.toContain("api key");
      expect(output.toLowerCase()).not.toContain("secret");
    } finally {
      log.mockRestore();
      fixture.db.close();
    }
  });
});
