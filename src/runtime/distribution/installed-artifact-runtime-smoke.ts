import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  INSTALLED_ARTIFACT_RUNTIME_EVIDENCE_VERSION
} from "./constants.js";
import type {
  MaterializedPublishedArtifact
} from "./artifact-materializer.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";
import type {
  InstalledArtifactRuntimeEvidence
} from "./types.js";

export type InstalledArtifactRuntimeSmokeInvocation = {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
};

export type InstalledArtifactRuntimeSmokeProcessRunner = (
  invocation: InstalledArtifactRuntimeSmokeInvocation
) => Promise<{ stdout: string; stderr: string }>;

type RawInstalledArtifactRuntimeSmokeResult = {
  ok?: unknown;
  package_name?: unknown;
  package_version?: unknown;
  artifact_integrity?: unknown;
  registry_record_identity?: unknown;
  evidence_class?: unknown;
  home_id?: unknown;
  gateway_instance_id?: unknown;
  active_package_generation_id?: unknown;
  package_activation_revision?: unknown;
  production_activation_id?: unknown;
  schema_version?: unknown;
  supervisor_owner_id?: unknown;
  supervisor_lease_epoch?: unknown;
  production_worker_owner_id?: unknown;
  production_worker_fencing_token?: unknown;
  configuration_generation_id?: unknown;
  effective_route_set_id?: unknown;
  semantic_completion_job_id?: unknown;
  semantic_completion_candidate_id?: unknown;
  semantic_completion_claim_owner_id?: unknown;
  semantic_completion_claim_fencing_token?: unknown;
  semantic_completion_node_id?: unknown;
  semantic_completion_job_status?: unknown;
  stale_output_failure_code?: unknown;
  stale_output_interruption_count?: unknown;
  stale_output_content_retry_count?: unknown;
  interaction_active?: unknown;
  learning_runtime_active?: unknown;
  production_learning_ready?: unknown;
  worker_terminal_state?: unknown;
  supervisor_terminal_state?: unknown;
  terminal_reason?: unknown;
  attempt_terminal_code?: unknown;
};

const defaultProcessRunner: InstalledArtifactRuntimeSmokeProcessRunner = (invocation) =>
  new Promise((resolveRun, rejectRun) => {
    execFile(
      invocation.executable,
      invocation.args,
      {
        cwd: invocation.cwd,
        env: invocation.env,
        timeout: invocation.timeoutMs,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          rejectRun(new PublishedRuntimeClosureError(
            "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
            `Installed artifact runtime smoke failed with code ${
              (error as NodeJS.ErrnoException).code ?? "unknown"
            }.`
          ));
          return;
        }
        resolveRun({ stdout, stderr });
      }
    );
  });

const requireString = (
  value: unknown,
  field: string
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `Installed artifact runtime smoke field ${field} is missing.`
    );
  }
  return value;
};

const requirePositiveInteger = (
  value: unknown,
  field: string
): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      `Installed artifact runtime smoke field ${field} must be a positive integer.`
    );
  }
  return Number(value);
};

const parseSmokeOutput = (stdout: string): RawInstalledArtifactRuntimeSmokeResult => {
  const lines = stdout.split(/\r?\n/gu).map((line) => line.trim()).filter(Boolean);
  const payload = lines.at(-1);
  if (!payload) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Installed artifact runtime smoke returned no JSON evidence."
    );
  }
  try {
    return JSON.parse(payload) as RawInstalledArtifactRuntimeSmokeResult;
  } catch {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Installed artifact runtime smoke returned invalid JSON evidence."
    );
  }
};

const mapLiveEvidence = (options: {
  artifact: MaterializedPublishedArtifact;
  raw: RawInstalledArtifactRuntimeSmokeResult;
  verifiedAt: string;
}): InstalledArtifactRuntimeEvidence => {
  const raw = options.raw;
  if (
    raw.ok !== true ||
    raw.evidence_class !==
      (options.artifact.published_channel === "npm"
        ? "published_npm"
        : "published_clawhub") ||
    raw.package_name !== options.artifact.package_name ||
    raw.package_version !== options.artifact.package_version ||
    raw.artifact_integrity !== options.artifact.artifact_integrity ||
    raw.registry_record_identity !== options.artifact.registry_record_identity ||
    raw.interaction_active !== true ||
    raw.learning_runtime_active !== true ||
    raw.semantic_completion_job_status !== "succeeded" ||
    raw.stale_output_interruption_count !== 1 ||
    raw.stale_output_content_retry_count !== 0 ||
    raw.worker_terminal_state !== "stopped" ||
    raw.supervisor_terminal_state !== "stopped"
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Installed artifact runtime smoke evidence does not match the exact artifact or protected queue contract."
    );
  }
  const staleFailureCode = requireString(
    raw.stale_output_failure_code,
    "stale_output_failure_code"
  );
  if (staleFailureCode !== "EE_ACTIVATION_FENCING_REJECTED") {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Installed artifact runtime smoke did not reject stale semantic output through activation fencing."
    );
  }
  return {
    evidence_schema_version: INSTALLED_ARTIFACT_RUNTIME_EVIDENCE_VERSION,
    evidence_class: "installed_artifact",
    published_channel: options.artifact.published_channel,
    package_name: options.artifact.package_name,
    package_version: options.artifact.package_version,
    artifact_integrity: options.artifact.artifact_integrity,
    registry_record_identity: options.artifact.registry_record_identity,
    activation: {
      home_id: requireString(raw.home_id, "home_id"),
      gateway_instance_id: requireString(
        raw.gateway_instance_id,
        "gateway_instance_id"
      ),
      active_package_generation_id: requireString(
        raw.active_package_generation_id,
        "active_package_generation_id"
      ),
      package_activation_revision: requirePositiveInteger(
        raw.package_activation_revision,
        "package_activation_revision"
      ),
      production_activation_id: requireString(
        raw.production_activation_id,
        "production_activation_id"
      ),
      supervisor_owner_id: requireString(
        raw.supervisor_owner_id,
        "supervisor_owner_id"
      ),
      supervisor_lease_epoch: requirePositiveInteger(
        raw.supervisor_lease_epoch,
        "supervisor_lease_epoch"
      ),
      worker_owner_id: requireString(
        raw.production_worker_owner_id,
        "production_worker_owner_id"
      ),
      worker_fencing_token: requirePositiveInteger(
        raw.production_worker_fencing_token,
        "production_worker_fencing_token"
      ),
      worker_mode: "production",
      schema_version: requireString(raw.schema_version, "schema_version"),
      configuration_generation_id: requireString(
        raw.configuration_generation_id,
        "configuration_generation_id"
      ),
      effective_route_set_id: requireString(
        raw.effective_route_set_id,
        "effective_route_set_id"
      )
    },
    queue: {
      fixture_id: "published-deterministic-semantic-queue-v1",
      job_id: requireString(
        raw.semantic_completion_job_id,
        "semantic_completion_job_id"
      ),
      candidate_id: requireString(
        raw.semantic_completion_candidate_id,
        "semantic_completion_candidate_id"
      ),
      claim_owner_id: requireString(
        raw.semantic_completion_claim_owner_id,
        "semantic_completion_claim_owner_id"
      ),
      claim_fencing_token: requirePositiveInteger(
        raw.semantic_completion_claim_fencing_token,
        "semantic_completion_claim_fencing_token"
      ),
      completion_node_id: requireString(
        raw.semantic_completion_node_id,
        "semantic_completion_node_id"
      ),
      semantic_completion_committed: true,
      authority_loss_completion_rejected: true,
      interruption_recovery_recorded: true,
      content_retry_consumed: false
    },
    runtime_shutdown: {
      package_runtime_stop_observed: true,
      worker_terminal_state: "stopped",
      supervisor_terminal_state: "stopped",
      supervisor_terminal_reason: requireString(
        raw.terminal_reason,
        "terminal_reason"
      ),
      launch_attempt_terminal_code: requireString(
        raw.attempt_terminal_code,
        "attempt_terminal_code"
      )
    },
    interaction_active: true,
    learning_runtime_active: true,
    production_learning_ready: raw.production_learning_ready === true,
    verified_at: options.verifiedAt
  };
};

export const runInstalledArtifactRuntimeSmoke = async (options: {
  artifact: MaterializedPublishedArtifact;
  packageRoot: string;
  harnessSourcePath: string;
  executable?: string;
  env?: NodeJS.ProcessEnv;
  processRunner?: InstalledArtifactRuntimeSmokeProcessRunner;
  timeoutMs?: number;
  now?: () => Date;
}): Promise<InstalledArtifactRuntimeEvidence> => {
  const packageRoot = resolve(options.packageRoot);
  const harnessPath = join(
    packageRoot,
    "scripts",
    "validation",
    "__ee-published-runtime-harness.mjs"
  );
  const harnessSource = await readFile(options.harnessSourcePath, "utf8");
  await mkdir(dirname(harnessPath), { recursive: true });
  await writeFile(harnessPath, harnessSource, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  try {
    const processRunner = options.processRunner ?? defaultProcessRunner;
    const result = await processRunner({
      executable: options.executable ?? process.execPath,
      args: [harnessPath],
      cwd: packageRoot,
      env: {
        ...(options.env ?? process.env),
        NODE_PATH: "",
        NODE_OPTIONS: "",
        EXPERIENCE_ENGINE_VALIDATION_EVIDENCE_CLASS:
          options.artifact.published_channel === "npm"
            ? "published_npm"
            : "published_clawhub",
        EXPERIENCE_ENGINE_VALIDATION_ARTIFACT_INTEGRITY:
          options.artifact.artifact_integrity,
        EXPERIENCE_ENGINE_VALIDATION_REGISTRY_RECORD_IDENTITY:
          options.artifact.registry_record_identity
      },
      timeoutMs: options.timeoutMs ?? 180_000
    });
    return mapLiveEvidence({
      artifact: options.artifact,
      raw: parseSmokeOutput(result.stdout),
      verifiedAt: (options.now ?? (() => new Date()))().toISOString()
    });
  } finally {
    await rm(harnessPath, { force: true });
  }
};

export const INSTALLED_ARTIFACT_RUNTIME_SMOKE_CONTRACT = Object.freeze({
  runtime_modules_resolve_from_installed_package: true,
  global_ee_command_required: false,
  global_openclaw_command_invoked: false,
  registry_artifact_identity_required: true,
  protected_queue_completion_required: true,
  stale_output_rejection_required: true,
  content_retry_consumed_on_interruption: false,
  temporary_harness_removed: true
  ,real_openclaw_gateway_started: false
  ,evidence_class: "installed_artifact"
});
