import { describe, expect, it } from "vitest";
import type {
  CoreLearningQualityProjection
} from "../../src/runtime/configuration/product-boundaries.js";
import type {
  RuntimeCapabilityProductState
} from "../../src/runtime/configuration/types.js";
import {
  inspectOpenClawRuntimeStatus
} from "../../src/runtime/activation/status.js";
import type {
  RuntimeCapabilityRouteAuthorityEvidence
} from "../../src/runtime/activation/types.js";
import {
  createFixedProcessAuthorityClock
} from "../../src/runtime/process/clock.js";
import {
  createRuntimeProductionLifecycleFixture,
  PRODUCTION_FIXTURE_CONFIGURATION_ID,
  PRODUCTION_FIXTURE_ROUTE_SET_ID
} from "../fixtures/runtime-production-lifecycle-fixture.js";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { createQueueCandidate } from "../fixtures/fenced-learning-queue-fixture.js";
import {
  PROCESS_FIXTURE_HOME_ID,
  PROCESS_FIXTURE_PACKAGE_ID,
  PROCESS_FIXTURE_START
} from "../fixtures/runtime-process-authority-fixture.js";

const evaluatedStates = (): RuntimeCapabilityProductState[] => [
  {
    capability: "learning_gate",
    required_for_production: true,
    validation_status: "valid",
    benchmark_assurance: "recommended",
    runtime_health: "healthy",
    active_route_kind: "primary"
  },
  {
    capability: "distillation",
    required_for_production: true,
    validation_status: "valid",
    benchmark_assurance: "recommended",
    runtime_health: "healthy",
    active_route_kind: "primary"
  },
  {
    capability: "embedding",
    required_for_production: true,
    validation_status: "valid",
    benchmark_assurance: "supported",
    runtime_health: "degraded_fallback",
    active_route_kind: "fallback"
  },
  {
    capability: "sync_second_opinion",
    required_for_production: false,
    validation_status: "valid",
    benchmark_assurance: "supported",
    runtime_health: "disabled",
    active_route_kind: "none"
  },
  {
    capability: "hybrid_postmortem",
    required_for_production: false,
    validation_status: "valid",
    benchmark_assurance: "supported",
    runtime_health: "disabled",
    active_route_kind: "none"
  }
];

const evaluatedQuality = (): CoreLearningQualityProjection => ({
  quality_profile: "evaluated_recommended",
  profile_id: "profile-evaluated-status-test",
  profile_version: "1.0.0",
  setup_state: "configured",
  validation_state: "valid",
  benchmark_assurance: "supported",
  runtime_health: "degraded",
  core_learning_quality: "production",
  production_ready: true,
  queue_claiming_enabled: false,
  semantic_production_writes_enabled: false,
  capability_states: evaluatedStates()
});

const customQuality = (): CoreLearningQualityProjection => ({
  ...evaluatedQuality(),
  quality_profile: "custom",
  profile_id: "profile-custom-status-test",
  benchmark_assurance: "unbenchmarked",
  core_learning_quality: "contract_valid_quality_unbenchmarked",
  production_ready: false,
  capability_states: evaluatedStates().map((state) => ({
    ...state,
    benchmark_assurance: "unbenchmarked" as const
  }))
});

const routeAuthorities = (
  quality: CoreLearningQualityProjection
): RuntimeCapabilityRouteAuthorityEvidence[] => quality.capability_states
  .filter((state) => state.required_for_production)
  .map((state, index) => ({
    available: true,
    fresh: true,
    authority_contract_version: "s6-capability-route-authority-v1",
    home_id: PROCESS_FIXTURE_HOME_ID,
    configuration_generation_id: PRODUCTION_FIXTURE_CONFIGURATION_ID,
    package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
    effective_route_set_id: PRODUCTION_FIXTURE_ROUTE_SET_ID,
    effective_route_revision: index + 1,
    capability: state.capability,
    route_fingerprint: `route-status-${state.capability}`,
    validation_current: true,
    observed_at: PROCESS_FIXTURE_START,
    expires_at: "2026-07-12T00:00:15.000Z"
  }));

describe("runtime production status projection", () => {
  it("projects the real S5 queue status and failure-code columns", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      bootstrapDatabase(fixture.db);
      const candidate = createQueueCandidate({
        id: "candidate-runtime-status-queue",
        task_run_id: "taskrun-runtime-status-queue",
        source_record_id: "input-runtime-status-queue",
        created_at: PROCESS_FIXTURE_START,
        updated_at: PROCESS_FIXTURE_START
      });
      new CandidateRepository(fixture.db).upsert(candidate);
      fixture.db.prepare(
        `INSERT INTO distillation_jobs (
          id, candidate_id, home_id, status, state_revision,
          extractor_profile, failure_code, failure_class, failure_scope,
          system_attempt_count, interruption_count, content_retry_count,
          next_attempt_at, blocked_at, route_fingerprint,
          retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, 'blocked', 1, ?, ?, 'configuration', 'system',
                  0, 0, 0, ?, ?, ?, 0, ?, ?)`
      ).run(
        "job-runtime-status-queue",
        candidate.id,
        PROCESS_FIXTURE_HOME_ID,
        "runtime-status-test",
        "EE_PROVIDER_CONFIGURATION_INVALID",
        PROCESS_FIXTURE_START,
        PROCESS_FIXTURE_START,
        "fixture-route-distillation",
        PROCESS_FIXTURE_START,
        PROCESS_FIXTURE_START
      );
      const quality = evaluatedQuality();
      const projection = inspectOpenClawRuntimeStatus({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        interactionActive: true,
        packageInstalled: true,
        qualityProjection: quality,
        routeAuthorities: routeAuthorities(quality),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(projection.queue_state).toMatchObject({
        total: 1,
        blocked: 1,
        state: "blocked"
      });
      expect(projection.blocked_counts_by_failure_code).toEqual({
        EE_PROVIDER_CONFIGURATION_INVALID: 1
      });
    } finally {
      fixture.db.close();
    }
  });

  it("reports interaction, active learning runtime, and production readiness separately", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const quality = evaluatedQuality();
      const status = inspectOpenClawRuntimeStatus({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        interactionActive: true,
        packageInstalled: true,
        qualityProjection: quality,
        routeAuthorities: routeAuthorities(quality),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(status).toMatchObject({
        projection_schema_version: "openclaw-runtime-status-v1",
        projection_revision: 2,
        package_generation_id: PROCESS_FIXTURE_PACKAGE_ID,
        configuration_generation_id: PRODUCTION_FIXTURE_CONFIGURATION_ID,
        effective_route_set_id: PRODUCTION_FIXTURE_ROUTE_SET_ID,
        plugin_activation_state: "active",
        package_activation_state: "active",
        production_activation_authorized: true,
        interaction_active: true,
        learning_runtime_active: true,
        production_learning_ready: true,
        setup_state: "ready",
        quality_profile: "evaluated_recommended",
        core_learning_quality: "production",
        learning_health: "degraded",
        next_action: "No activation repair is required.",
        warning: null
      });
      expect(status.worker_heartbeat_fresh).toBe(true);
      expect(status.fresh_supervisor_authority).toBe(true);
      expect(status.capability_routes).toHaveLength(5);
    } finally {
      fixture.db.close();
    }
  });

  it("keeps custom contract-valid quality explicitly unbenchmarked and not production-ready", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const quality = customQuality();
      const status = inspectOpenClawRuntimeStatus({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        interactionActive: true,
        packageInstalled: true,
        qualityProjection: quality,
        routeAuthorities: routeAuthorities(quality),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(status).toMatchObject({
        production_activation_authorized: true,
        learning_runtime_active: true,
        production_learning_ready: false,
        quality_profile: "custom",
        core_learning_quality: "contract_valid_quality_unbenchmarked",
        warning: "Custom configuration is contract-valid but quality-unbenchmarked."
      });
      expect(status.next_action).toMatch(/evaluated profile/u);
    } finally {
      fixture.db.close();
    }
  });

  it("does not confuse inactive interaction wiring with learning runtime authority", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const quality = evaluatedQuality();
      const status = inspectOpenClawRuntimeStatus({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        interactionActive: false,
        packageInstalled: true,
        qualityProjection: quality,
        routeAuthorities: routeAuthorities(quality),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(status).toMatchObject({
        interaction_active: false,
        learning_runtime_active: true,
        production_learning_ready: true,
        setup_state: "initialized",
        warning: "Prompt-time interaction is inactive."
      });
    } finally {
      fixture.db.close();
    }
  });

  it("fails production activation status closed when one required route authority is absent", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      const quality = evaluatedQuality();
      const routes = routeAuthorities(quality).filter(
        (route) => route.capability !== "embedding"
      );
      const status = inspectOpenClawRuntimeStatus({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        interactionActive: true,
        packageInstalled: true,
        qualityProjection: quality,
        routeAuthorities: routes,
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(status).toMatchObject({
        production_activation_authorized: false,
        learning_runtime_active: false,
        production_learning_ready: false,
        warning: "Production activation authority is not current."
      });
    } finally {
      fixture.db.close();
    }
  });

  it("derives first-value and outcome-confirmed milestones from existing records without a second ledger", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.db.exec(`
        CREATE TABLE task_runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL);
        CREATE TABLE experience_nodes (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
        CREATE TABLE injection_events (
          injection_id TEXT PRIMARY KEY,
          delivered INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE attribution_records (
          id TEXT PRIMARY KEY,
          delivered INTEGER NOT NULL,
          source TEXT NOT NULL,
          user_override TEXT,
          attribution_verdict TEXT NOT NULL,
          confidence TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT INTO task_runs VALUES ('task-status', '2026-07-12T00:00:02.000Z');
        INSERT INTO experience_nodes VALUES ('node-status', '2026-07-12T00:00:03.000Z');
        INSERT INTO injection_events VALUES ('injection-status', 1, '2026-07-12T00:00:04.000Z');
        INSERT INTO attribution_records VALUES (
          'attribution-status', 1, 'trajectory', NULL,
          'strong_helped', 'high', '2026-07-12T00:00:05.000Z'
        );
      `);
      const quality = evaluatedQuality();
      const status = inspectOpenClawRuntimeStatus({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        interactionActive: true,
        packageInstalled: true,
        qualityProjection: quality,
        routeAuthorities: routeAuthorities(quality),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(status).toMatchObject({
        first_value_state: "first_value_reached",
        outcome_confirmed_value_state: "reached",
        milestones: {
          first_task_at: "2026-07-12T00:00:02.000Z",
          first_node_at: "2026-07-12T00:00:03.000Z",
          first_intervention_at: "2026-07-12T00:00:04.000Z",
          first_attribution_at: "2026-07-12T00:00:05.000Z",
          first_helpful_intervention_at: "2026-07-12T00:00:05.000Z",
          first_harmful_intervention_at: null
        }
      });
    } finally {
      fixture.db.close();
    }
  });

  it("reports the exact post-identity blocked recovery actions", () => {
    const fixture = createRuntimeProductionLifecycleFixture();
    try {
      fixture.db.prepare(
        `UPDATE package_activation_state
         SET activation_revision = activation_revision + 1,
             activation_state = 'blocked',
             blocked_boundary = 'post_identity',
             blocked_from_state = 'production_activating',
             production_activation_handshake_id = NULL,
             activation_deadline_at = '2026-07-12T00:10:00.000Z',
             updated_by_kind = 'supervisor',
             updated_by_gateway_instance_id = NULL,
             updated_by_supervisor_owner_id = ?,
             updated_by_supervisor_lease_epoch = ?
         WHERE home_id = ?`
      ).run(
        fixture.supervisorLease.owner_id,
        fixture.supervisorLease.lease_epoch,
        PROCESS_FIXTURE_HOME_ID
      );
      const quality = evaluatedQuality();
      const status = inspectOpenClawRuntimeStatus({
        db: fixture.db,
        homeId: PROCESS_FIXTURE_HOME_ID,
        interactionActive: true,
        packageInstalled: true,
        qualityProjection: quality,
        routeAuthorities: routeAuthorities(quality),
        clock: createFixedProcessAuthorityClock(PROCESS_FIXTURE_START)
      });
      expect(status).toMatchObject({
        package_activation_state: "blocked",
        blocked_boundary: "post_identity",
        production_activation_authorized: false,
        production_learning_ready: false,
        warning: "Package activation is blocked at post_identity."
      });
      expect(status.next_action).toBe(
        "Use retry_production_activation or prepare_package_rollback."
      );
    } finally {
      fixture.db.close();
    }
  });
});
