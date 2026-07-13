import type { DatabaseSync } from "node:sqlite";
import type {
  CoreLearningQualityProjection
} from "../configuration/product-boundaries.js";
import {
  SYSTEM_PROCESS_AUTHORITY_CLOCK,
  toProcessAuthorityEpochMs
} from "../process/clock.js";
import {
  readSupervisorLaunchState
} from "../process/database.js";
import {
  evaluateFreshSupervisorAuthorityInTransaction
} from "../process/fresh-supervisor-authority.js";
import type {
  RuntimeProcessAuthorityClock
} from "../process/types.js";
import { runRuntimeImmediateTransaction } from "../schema/sqlite-policy.js";
import {
  STATUS_PROJECTION_SCHEMA_VERSION,
  type BlockedBoundary,
  type PackageActivationState
} from "./constants.js";
import {
  evaluateCanonicalProductionActivationInTransaction
} from "./authority.js";
import {
  readActivationHandshake,
  readConfigurationPointer,
  readMigrationState,
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import type {
  RuntimeCapabilityRouteAuthorityEvidence
} from "./types.js";

export type RuntimeActivationMilestones = {
  first_task_at: string | null;
  first_node_at: string | null;
  first_intervention_at: string | null;
  first_attribution_at: string | null;
  first_helpful_intervention_at: string | null;
  first_harmful_intervention_at: string | null;
};

export type RuntimeQueueStatusProjection = {
  total: number;
  pending: number;
  processing: number;
  blocked: number;
  failed: number;
  succeeded: number;
  discarded: number;
  state: "idle" | "running" | "blocked" | "failed";
};

export type OpenClawRuntimeStatusProjection = {
  projection_schema_version: typeof STATUS_PROJECTION_SCHEMA_VERSION;
  projection_revision: number;
  home_id: string;
  package_generation_id: string | null;
  configuration_generation_id: string | null;
  effective_route_set_id: string | null;
  gateway_instance_id: string | null;
  plugin_activation_state: "active" | "inactive";
  package_activation_state: PackageActivationState | "missing";
  package_activation_revision: number;
  blocked_boundary: BlockedBoundary;
  production_activation_handshake_id: string | null;
  production_handshake_current_activation_revision: number | null;
  launch_authorization_id: string | null;
  launch_authorization_revision: number;
  launch_authorization_state_revision: number;
  current_launch_attempt_id: string | null;
  supervisor_launch_activation_revision_at_consumption: number | null;
  supervisor_state: string | null;
  supervisor_lease_epoch: number | null;
  supervisor_lease_state_revision: number | null;
  fresh_supervisor_authority: boolean;
  worker_state: string | null;
  worker_fencing_token: number | null;
  worker_heartbeat_fresh: boolean;
  production_activation_authorized: boolean;
  migration_status: string | null;
  schema_version: string | null;
  queue_state: RuntimeQueueStatusProjection;
  blocked_counts_by_failure_code: Record<string, number>;
  capability_routes: CoreLearningQualityProjection["capability_states"];
  last_updated_at: string;
  interaction_active: boolean;
  learning_runtime_active: boolean;
  production_learning_ready: boolean;
  setup_state: "installed" | "initialized" | "ready";
  quality_profile: CoreLearningQualityProjection["quality_profile"];
  core_learning_quality: CoreLearningQualityProjection["core_learning_quality"];
  learning_health: CoreLearningQualityProjection["runtime_health"];
  first_value_state: "warming_up" | "first_value_reached";
  outcome_confirmed_value_state: "not_reached" | "reached";
  milestones: RuntimeActivationMilestones;
  next_action: string;
  warning: string | null;
};

const tableExists = (db: DatabaseSync, table: string): boolean => Boolean(
  db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table)
);

const scalarTimestamp = (
  db: DatabaseSync,
  sql: string
): string | null => {
  const row = db.prepare(sql).get() as { value: string | null } | undefined;
  return row?.value ?? null;
};

export const deriveRuntimeActivationMilestones = (
  db: DatabaseSync
): RuntimeActivationMilestones => ({
  first_task_at: tableExists(db, "task_runs")
    ? scalarTimestamp(db, "SELECT MIN(started_at) AS value FROM task_runs")
    : null,
  first_node_at: tableExists(db, "experience_nodes")
    ? scalarTimestamp(db, "SELECT MIN(created_at) AS value FROM experience_nodes")
    : null,
  first_intervention_at: tableExists(db, "injection_events")
    ? scalarTimestamp(
      db,
      "SELECT MIN(created_at) AS value FROM injection_events WHERE delivered = 1"
    )
    : null,
  first_attribution_at: tableExists(db, "attribution_records")
    ? scalarTimestamp(db, "SELECT MIN(created_at) AS value FROM attribution_records")
    : null,
  first_helpful_intervention_at: tableExists(db, "attribution_records")
    ? scalarTimestamp(
      db,
      `SELECT MIN(created_at) AS value
       FROM attribution_records
       WHERE delivered = 1
         AND (
           (source = 'manual_override' AND user_override = 'helped')
           OR (
             attribution_verdict = 'strong_helped'
             AND confidence IN ('medium', 'high')
           )
         )`
    )
    : null,
  first_harmful_intervention_at: tableExists(db, "attribution_records")
    ? scalarTimestamp(
      db,
      `SELECT MIN(created_at) AS value
       FROM attribution_records
       WHERE delivered = 1
         AND (
           (source = 'manual_override' AND user_override = 'harmful')
           OR (
             attribution_verdict = 'strong_harmed'
             AND confidence IN ('medium', 'high')
           )
         )`
    )
    : null
});

const readQueueProjection = (
  db: DatabaseSync,
  homeId: string
): {
  queue: RuntimeQueueStatusProjection;
  blocked: Record<string, number>;
} => {
  const empty: RuntimeQueueStatusProjection = {
    total: 0,
    pending: 0,
    processing: 0,
    blocked: 0,
    failed: 0,
    succeeded: 0,
    discarded: 0,
    state: "idle"
  };
  if (!tableExists(db, "distillation_jobs")) {
    return { queue: empty, blocked: {} };
  }
  const rows = db.prepare(
    `SELECT status, COUNT(*) AS count
     FROM distillation_jobs
     WHERE home_id = ?
     GROUP BY status`
  ).all(homeId) as Array<{ status: keyof RuntimeQueueStatusProjection; count: number }>;
  const queue = { ...empty };
  for (const row of rows) {
    if (typeof queue[row.status] === "number") {
      (queue[row.status] as number) = Number(row.count);
      queue.total += Number(row.count);
    }
  }
  queue.state = queue.processing > 0
    ? "running"
    : queue.blocked > 0
      ? "blocked"
      : queue.failed > 0
        ? "failed"
        : "idle";
  const blockedRows = db.prepare(
    `SELECT COALESCE(failure_code, 'unknown') AS failure_code,
            COUNT(*) AS count
     FROM distillation_jobs
     WHERE home_id = ? AND status = 'blocked'
     GROUP BY COALESCE(failure_code, 'unknown')
     ORDER BY failure_code`
  ).all(homeId) as Array<{ failure_code: string; count: number }>;
  return {
    queue,
    blocked: Object.fromEntries(
      blockedRows.map((row) => [row.failure_code, Number(row.count)])
    )
  };
};

const routesAuthorizeCurrentRuntime = (options: {
  routes: readonly RuntimeCapabilityRouteAuthorityEvidence[];
  quality: CoreLearningQualityProjection;
  homeId: string;
  packageGenerationId: string;
  configurationGenerationId: string;
  effectiveRouteSetId: string;
  observedAt: string;
}): boolean => options.quality.capability_states
  .filter((state) => state.required_for_production)
  .every((state) => options.routes.some((route) => (
    route.available &&
    route.fresh &&
    route.home_id === options.homeId &&
    route.package_generation_id === options.packageGenerationId &&
    route.configuration_generation_id === options.configurationGenerationId &&
    route.effective_route_set_id === options.effectiveRouteSetId &&
    route.capability === state.capability &&
    route.validation_current === true &&
    toProcessAuthorityEpochMs(route.observed_at) <=
      toProcessAuthorityEpochMs(options.observedAt) &&
    toProcessAuthorityEpochMs(route.expires_at) >
      toProcessAuthorityEpochMs(options.observedAt)
  )));

const deriveNextAction = (options: {
  setupState: OpenClawRuntimeStatusProjection["setup_state"];
  interactionActive: boolean;
  activationState: PackageActivationState | "missing";
  blockedBoundary: BlockedBoundary;
  productionAuthorized: boolean;
  productionReady: boolean;
  quality: CoreLearningQualityProjection;
}): { nextAction: string; warning: string | null } => {
  if (options.setupState === "installed" || options.activationState === "missing") {
    return {
      nextAction: "Run initialize_package_activation for the verified package generation.",
      warning: "Learning runtime is not initialized."
    };
  }
  if (!options.interactionActive) {
    return {
      nextAction: "Restore the OpenClaw plugin interaction lifecycle before enabling learning.",
      warning: "Prompt-time interaction is inactive."
    };
  }
  if (options.activationState === "blocked") {
    const nextAction = options.blockedBoundary === "post_identity"
      ? "Use retry_production_activation or prepare_package_rollback."
      : "Use retry_package_activation or cancel_package_transition for the current boundary.";
    return {
      nextAction,
      warning: `Package activation is blocked at ${options.blockedBoundary}.`
    };
  }
  if (!options.productionAuthorized) {
    return {
      nextAction: "Complete the current production activation handshake with fresh supervisor and worker authority.",
      warning: "Production activation authority is not current."
    };
  }
  if (!options.productionReady) {
    if (options.quality.quality_profile === "custom") {
      return {
        nextAction: "Use an evaluated profile or provide current benchmark assurance for every required capability.",
        warning: "Custom configuration is contract-valid but quality-unbenchmarked."
      };
    }
    const actionable = options.quality.capability_states.find((state) =>
      state.required_for_production && (
        state.validation_status !== "valid" ||
        state.benchmark_assurance === "unbenchmarked" ||
        !["healthy", "degraded_fallback"].includes(state.runtime_health)
      )
    );
    return {
      nextAction: actionable
        ? `Repair and revalidate the ${actionable.capability} capability route.`
        : "Repair the current evaluated quality projection.",
      warning: actionable
        ? `${actionable.capability} is not production-ready.`
        : "Production quality requirements are not current."
    };
  }
  return {
    nextAction: "No activation repair is required.",
    warning: null
  };
};

export const inspectOpenClawRuntimeStatus = (options: {
  db: DatabaseSync;
  homeId: string;
  interactionActive: boolean;
  packageInstalled: boolean;
  qualityProjection: CoreLearningQualityProjection;
  routeAuthorities: readonly RuntimeCapabilityRouteAuthorityEvidence[];
  clock?: RuntimeProcessAuthorityClock;
}): OpenClawRuntimeStatusProjection => {
  const clock = options.clock ?? SYSTEM_PROCESS_AUTHORITY_CLOCK;
  return runRuntimeImmediateTransaction(options.db, {
    category: "lease",
    operation: () => {
      const observedAt = clock.captureObservedNowInTransaction(options.db);
      const activation = readPackageActivationAuthority(options.db, options.homeId);
      const pointer = readConfigurationPointer(options.db, options.homeId);
      const migration = readMigrationState(options.db, options.homeId);
      const supervisor = readSupervisorLeaseByHome(options.db, options.homeId);
      const worker = readWorkerLeaseByHome(options.db, options.homeId);
      const launch = readSupervisorLaunchState(options.db, options.homeId);
      const gateway = options.db.prepare(
        `SELECT * FROM gateway_heartbeats
         WHERE home_id = ? AND expires_at > ?
         ORDER BY heartbeat_at DESC, gateway_instance_id DESC
         LIMIT 1`
      ).get(options.homeId, observedAt) as {
        gateway_instance_id: string;
        package_generation_id: string;
      } | undefined;
      const handshake = activation?.production_activation_handshake_id
        ? readActivationHandshake(
          options.db,
          options.homeId,
          activation.production_activation_handshake_id
        )
        : undefined;
      const freshSupervisor = evaluateFreshSupervisorAuthorityInTransaction({
        db: options.db,
        homeId: options.homeId,
        observedAt
      });
      const canonical = evaluateCanonicalProductionActivationInTransaction({
        db: options.db,
        homeId: options.homeId,
        observedAt
      });
      const routeCurrent = canonical.available && canonical.fresh
        ? routesAuthorizeCurrentRuntime({
          routes: options.routeAuthorities,
          quality: options.qualityProjection,
          homeId: options.homeId,
          packageGenerationId: canonical.package_generation_id,
          configurationGenerationId: canonical.configuration_generation_id,
          effectiveRouteSetId: canonical.effective_route_set_id,
          observedAt
        })
        : false;
      const productionAuthorized = Boolean(
        canonical.available && canonical.fresh && routeCurrent
      );
      const initialized = Boolean(
        activation &&
        activation.activation_state !== "uninitialized" &&
        pointer &&
        migration
      );
      const setupState: OpenClawRuntimeStatusProjection["setup_state"] =
        options.packageInstalled && initialized && options.interactionActive
          ? "ready"
          : options.packageInstalled && initialized
            ? "initialized"
            : "installed";
      const productionReady = productionAuthorized &&
        options.qualityProjection.production_ready;
      const milestones = deriveRuntimeActivationMilestones(options.db);
      const queue = readQueueProjection(options.db, options.homeId);
      const action = deriveNextAction({
        setupState,
        interactionActive: options.interactionActive,
        activationState: activation?.activation_state ?? "missing",
        blockedBoundary: activation?.blocked_boundary ?? "none",
        productionAuthorized,
        productionReady,
        quality: options.qualityProjection
      });
      return {
        projection_schema_version: STATUS_PROJECTION_SCHEMA_VERSION,
        projection_revision: activation?.activation_revision ?? 0,
        home_id: options.homeId,
        package_generation_id: gateway?.package_generation_id ??
          activation?.active_package_generation_id ?? null,
        configuration_generation_id: pointer?.generation_id ?? null,
        effective_route_set_id: canonical.available
          ? canonical.effective_route_set_id
          : handshake?.effective_route_set_id ?? null,
        gateway_instance_id: gateway?.gateway_instance_id ?? null,
        plugin_activation_state: options.interactionActive ? "active" : "inactive",
        package_activation_state: activation?.activation_state ?? "missing",
        package_activation_revision: activation?.activation_revision ?? 0,
        blocked_boundary: activation?.blocked_boundary ?? "none",
        production_activation_handshake_id:
          activation?.production_activation_handshake_id ?? null,
        production_handshake_current_activation_revision:
          handshake?.current_activation_revision ?? null,
        launch_authorization_id: activation?.launch_authorization_id ?? null,
        launch_authorization_revision:
          activation?.launch_authorization_revision ?? 0,
        launch_authorization_state_revision:
          activation?.launch_authorization_state_revision ?? 0,
        current_launch_attempt_id: launch?.current_launch_attempt_id ?? null,
        supervisor_launch_activation_revision_at_consumption:
          supervisor?.launch_activation_revision_at_consumption ?? null,
        supervisor_state: supervisor?.state ?? null,
        supervisor_lease_epoch: supervisor?.lease_epoch ?? null,
        supervisor_lease_state_revision:
          supervisor?.lease_state_revision ?? null,
        fresh_supervisor_authority: Boolean(
          freshSupervisor.available && freshSupervisor.fresh
        ),
        worker_state: worker?.state ?? null,
        worker_fencing_token: worker?.fencing_token ?? null,
        worker_heartbeat_fresh: Boolean(
          worker &&
          worker.state !== "stopped" &&
          toProcessAuthorityEpochMs(worker.expires_at) >
            toProcessAuthorityEpochMs(observedAt)
        ),
        production_activation_authorized: productionAuthorized,
        migration_status: migration?.migration_status ?? null,
        schema_version: migration?.current_schema_version ?? null,
        queue_state: queue.queue,
        blocked_counts_by_failure_code: queue.blocked,
        capability_routes: [...options.qualityProjection.capability_states],
        last_updated_at: observedAt,
        interaction_active: options.interactionActive,
        learning_runtime_active: productionAuthorized,
        production_learning_ready: productionReady,
        setup_state: setupState,
        quality_profile: options.qualityProjection.quality_profile,
        core_learning_quality: options.qualityProjection.core_learning_quality,
        learning_health: options.qualityProjection.runtime_health,
        first_value_state: milestones.first_intervention_at
          ? "first_value_reached"
          : "warming_up",
        outcome_confirmed_value_state:
          milestones.first_helpful_intervention_at ? "reached" : "not_reached",
        milestones,
        next_action: action.nextAction,
        warning: action.warning
      };
    }
  });
};
