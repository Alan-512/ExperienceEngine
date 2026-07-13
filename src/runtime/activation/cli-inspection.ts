import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  evaluateCanonicalProductionActivationInTransaction
} from "./authority.js";
import type {
  BlockedBoundary,
  PackageActivationState
} from "./constants.js";
import {
  readConfigurationPointer,
  readPackageActivationAuthority,
  readSupervisorLeaseByHome,
  readWorkerLeaseByHome
} from "./database.js";
import { assertPackageActivationShape } from "./state-contract.js";

export type CliRuntimeControlDatabaseState =
  | "missing"
  | "not_initialized"
  | "available"
  | "invalid";

export type CliRuntimeAuthorityInspection = {
  inspection_schema_version: "cli-runtime-authority-inspection-v1";
  control_database_state: CliRuntimeControlDatabaseState;
  evidence_scope: {
    local_source_and_package_closure: "available";
    local_control_database: "missing" | "not_initialized" | "available" | "invalid";
    published_npm_clawhub: "not_verified";
  };
  interaction_active: boolean;
  package_installed: boolean;
  setup_state: "installed" | "initialized" | "ready";
  home_id: string | null;
  package_activation_state: PackageActivationState | "missing" | "invalid";
  package_activation_revision: number;
  blocked_boundary: BlockedBoundary;
  process_activation_current: boolean;
  route_authority_verification: "not_available_to_global_cli";
  learning_runtime_active: false;
  production_learning_ready: false;
  quality_profile: "not_evaluated";
  core_learning_quality: "not_evaluated";
  learning_health:
    | "not_initialized"
    | "authority_not_current"
    | "blocked"
    | "draining"
    | "process_active_route_unverified";
  configuration_generation_id: string | null;
  production_activation_handshake_id: string | null;
  supervisor_state: string | null;
  supervisor_lease_epoch: number | null;
  worker_state: string | null;
  worker_fencing_token: number | null;
  next_action: string;
  warning: string | null;
};

const baseInspection = (options: {
  state: CliRuntimeControlDatabaseState;
  interactionActive: boolean;
  packageInstalled: boolean;
  warning: string | null;
}): CliRuntimeAuthorityInspection => ({
  inspection_schema_version: "cli-runtime-authority-inspection-v1",
  control_database_state: options.state,
  evidence_scope: {
    local_source_and_package_closure: "available",
    local_control_database: options.state,
    published_npm_clawhub: "not_verified"
  },
  interaction_active: options.interactionActive,
  package_installed: options.packageInstalled,
  setup_state: "installed",
  home_id: null,
  package_activation_state: options.state === "invalid" ? "invalid" : "missing",
  package_activation_revision: 0,
  blocked_boundary: "none",
  process_activation_current: false,
  route_authority_verification: "not_available_to_global_cli",
  learning_runtime_active: false,
  production_learning_ready: false,
  quality_profile: "not_evaluated",
  core_learning_quality: "not_evaluated",
  learning_health: "not_initialized",
  configuration_generation_id: null,
  production_activation_handshake_id: null,
  supervisor_state: null,
  supervisor_lease_epoch: null,
  worker_state: null,
  worker_fencing_token: null,
  next_action: "Initialize the verified package-local runtime through OpenClaw.",
  warning: options.warning
});

const tableExists = (db: DatabaseSync, table: string): boolean => Boolean(
  db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table)
);

const canonicalProcessAuthority = (
  db: DatabaseSync,
  homeId: string,
  observedAt: string
): boolean => {
  db.exec("BEGIN");
  try {
    const evidence = evaluateCanonicalProductionActivationInTransaction({
      db,
      homeId,
      observedAt
    });
    return evidence.available && evidence.fresh;
  } catch {
    return false;
  } finally {
    db.exec("ROLLBACK");
  }
};

const deriveHealth = (options: {
  activationState: PackageActivationState;
  processActivationCurrent: boolean;
  workerState: string | null;
}): CliRuntimeAuthorityInspection["learning_health"] => {
  if (options.activationState === "blocked" || options.workerState === "blocked") {
    return "blocked";
  }
  if (options.workerState === "draining") {
    return "draining";
  }
  if (options.processActivationCurrent) {
    return "process_active_route_unverified";
  }
  return "authority_not_current";
};

const deriveAction = (options: {
  activationState: PackageActivationState;
  blockedBoundary: BlockedBoundary;
  processActivationCurrent: boolean;
}): { nextAction: string; warning: string | null } => {
  if (options.activationState === "uninitialized") {
    return {
      nextAction: "Run initialize_package_activation through the package-local OpenClaw service.",
      warning: "Learning runtime is not initialized."
    };
  }
  if (options.activationState === "blocked") {
    return {
      nextAction: options.blockedBoundary === "post_identity"
        ? "Use retry_production_activation or prepare_package_rollback through OpenClaw."
        : "Use retry_package_activation or cancel_package_transition through OpenClaw.",
      warning: `Package activation is blocked at ${options.blockedBoundary}.`
    };
  }
  if (!options.processActivationCurrent) {
    return {
      nextAction: "Complete the current package-local supervisor, worker, and production handshake authority.",
      warning: "Process activation authority is not current."
    };
  }
  return {
    nextAction: "Use OpenClaw native status to verify current route and quality evidence.",
    warning: "Global CLI does not claim learning-runtime or production readiness without package-local route authority."
  };
};

export const inspectCliRuntimeAuthorityFromDatabase = (options: {
  db: DatabaseSync;
  interactionActive: boolean;
  packageInstalled: boolean;
  observedAt?: string;
}): CliRuntimeAuthorityInspection => {
  if (!tableExists(options.db, "runtime_control_meta")) {
    return baseInspection({
      state: "not_initialized",
      interactionActive: options.interactionActive,
      packageInstalled: options.packageInstalled,
      warning: "Runtime control authority is not initialized in this database."
    });
  }
  const meta = options.db.prepare(
    "SELECT home_id FROM runtime_control_meta ORDER BY created_at, home_id LIMIT 1"
  ).get() as { home_id: string } | undefined;
  if (!meta || !tableExists(options.db, "package_activation_state")) {
    return baseInspection({
      state: "not_initialized",
      interactionActive: options.interactionActive,
      packageInstalled: options.packageInstalled,
      warning: "Runtime control metadata exists without package activation authority."
    });
  }
  const activation = readPackageActivationAuthority(options.db, meta.home_id);
  if (!activation) {
    return {
      ...baseInspection({
        state: "not_initialized",
        interactionActive: options.interactionActive,
        packageInstalled: options.packageInstalled,
        warning: "Package activation authority has not been bootstrapped."
      }),
      home_id: meta.home_id
    };
  }
  try {
    assertPackageActivationShape(activation);
  } catch {
    return {
      ...baseInspection({
        state: "invalid",
        interactionActive: options.interactionActive,
        packageInstalled: options.packageInstalled,
        warning: "Package activation authority has an invalid identity shape."
      }),
      home_id: meta.home_id
    };
  }
  const observedAt = options.observedAt ?? new Date().toISOString();
  const processActivationCurrent = canonicalProcessAuthority(
    options.db,
    meta.home_id,
    observedAt
  );
  const supervisor = readSupervisorLeaseByHome(options.db, meta.home_id);
  const worker = readWorkerLeaseByHome(options.db, meta.home_id);
  const pointer = readConfigurationPointer(options.db, meta.home_id);
  const action = deriveAction({
    activationState: activation.activation_state,
    blockedBoundary: activation.blocked_boundary,
    processActivationCurrent
  });
  const initialized = activation.activation_state !== "uninitialized";
  return {
    inspection_schema_version: "cli-runtime-authority-inspection-v1",
    control_database_state: "available",
    evidence_scope: {
      local_source_and_package_closure: "available",
      local_control_database: "available",
      published_npm_clawhub: "not_verified"
    },
    interaction_active: options.interactionActive,
    package_installed: options.packageInstalled,
    setup_state: initialized && options.interactionActive
      ? "ready"
      : initialized
        ? "initialized"
        : "installed",
    home_id: meta.home_id,
    package_activation_state: activation.activation_state,
    package_activation_revision: activation.activation_revision,
    blocked_boundary: activation.blocked_boundary,
    process_activation_current: processActivationCurrent,
    route_authority_verification: "not_available_to_global_cli",
    learning_runtime_active: false,
    production_learning_ready: false,
    quality_profile: "not_evaluated",
    core_learning_quality: "not_evaluated",
    learning_health: deriveHealth({
      activationState: activation.activation_state,
      processActivationCurrent,
      workerState: worker?.state ?? null
    }),
    configuration_generation_id: pointer?.generation_id ?? null,
    production_activation_handshake_id:
      activation.production_activation_handshake_id,
    supervisor_state: supervisor?.state ?? null,
    supervisor_lease_epoch: supervisor?.lease_epoch ?? null,
    worker_state: worker?.state ?? null,
    worker_fencing_token: worker?.fencing_token ?? null,
    next_action: action.nextAction,
    warning: action.warning
  };
};

export const inspectCliRuntimeAuthority = (options: {
  sqlitePath: string;
  interactionActive: boolean;
  packageInstalled: boolean;
  observedAt?: string;
}): CliRuntimeAuthorityInspection => {
  if (!existsSync(options.sqlitePath)) {
    return baseInspection({
      state: "missing",
      interactionActive: options.interactionActive,
      packageInstalled: options.packageInstalled,
      warning: "Runtime control database does not exist."
    });
  }
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(options.sqlitePath, { readOnly: true });
    return inspectCliRuntimeAuthorityFromDatabase({
      db,
      interactionActive: options.interactionActive,
      packageInstalled: options.packageInstalled,
      observedAt: options.observedAt
    });
  } catch {
    return baseInspection({
      state: "invalid",
      interactionActive: options.interactionActive,
      packageInstalled: options.packageInstalled,
      warning: "Runtime control database could not be inspected safely."
    });
  } finally {
    db?.close();
  }
};

export const logCliRuntimeAuthorityInspection = (
  inspection: CliRuntimeAuthorityInspection,
  options: { verbose?: boolean } = {}
): void => {
  console.log("OpenClaw production runtime:");
  console.log(`- Interaction active: ${inspection.interaction_active ? "yes" : "no"}`);
  console.log(`- Package activation: ${inspection.package_activation_state} (revision ${inspection.package_activation_revision})`);
  console.log(`- Learning runtime active: ${inspection.learning_runtime_active ? "yes" : "not verified"}`);
  console.log(`- Production learning ready: ${inspection.production_learning_ready ? "yes" : "not verified"}`);
  console.log(`- Quality profile: ${inspection.quality_profile}`);
  console.log(`- Learning health: ${inspection.learning_health}`);
  console.log(`- Next action: ${inspection.next_action}`);
  if (inspection.warning) {
    console.log(`- Runtime warning: ${inspection.warning}`);
  }
  console.log("- Evidence scope: local source/package/control evidence only; published npm/ClawHub support is not verified here.");
  if (!options.verbose) {
    return;
  }
  console.log("Runtime authority evidence:");
  console.log(`- Control database: ${inspection.control_database_state}`);
  console.log(`- Home ID: ${inspection.home_id ?? "none"}`);
  console.log(`- Blocked boundary: ${inspection.blocked_boundary}`);
  console.log(`- Process activation current: ${inspection.process_activation_current ? "yes" : "no"}`);
  console.log(`- Route authority verification: ${inspection.route_authority_verification}`);
  console.log(`- Configuration generation ID: ${inspection.configuration_generation_id ?? "none"}`);
  console.log(`- Production handshake ID: ${inspection.production_activation_handshake_id ?? "none"}`);
  console.log(`- Supervisor: ${inspection.supervisor_state ?? "none"}; epoch ${inspection.supervisor_lease_epoch ?? "none"}`);
  console.log(`- Worker: ${inspection.worker_state ?? "none"}; fence ${inspection.worker_fencing_token ?? "none"}`);
  console.log(`- Published distribution evidence: ${inspection.evidence_scope.published_npm_clawhub}`);
};
