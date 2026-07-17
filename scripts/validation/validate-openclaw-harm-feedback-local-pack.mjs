import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOpenClawInstallTarball
} from "../../dist/install/openclaw-installer.js";
import {
  resolveExperienceEnginePaths
} from "../../dist/config/path-resolver.js";
import {
  assertRuntimeClosureManifest
} from "../../dist/runtime/package/closure-manifest.js";
import {
  createOpenClawMultiScenarioAdapters
} from "../../dist/evaluation/matched-block/openclaw-scenario-adapter.js";
import {
  executeOpenClawHarmFeedbackLocalPackPreflight
} from "./lib/openclaw-multi-scenario-runtime.mjs";

const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const openclawExecutable = process.env.EXPERIENCE_ENGINE_OPENCLAW_EXECUTABLE?.trim();
const openclawEntrypoint = process.env.EXPERIENCE_ENGINE_OPENCLAW_ENTRYPOINT?.trim();
const seedConfigPath = process.env.EXPERIENCE_ENGINE_OPENCLAW_SEED_CONFIG?.trim();
const requestedSeedAuthPath = process.env.EXPERIENCE_ENGINE_OPENCLAW_SEED_AUTH?.trim();
const requestedArtifactPath = process.env.EXPERIENCE_ENGINE_LOCAL_PACK_ARTIFACT?.trim();
const requestedOpenRouterBaseUrl =
  process.env.EXPERIENCE_ENGINE_OPENROUTER_BASE_URL?.trim();
const npmRegistry = (
  process.env.EXPERIENCE_ENGINE_NPM_REGISTRY?.trim() ||
  "https://registry.npmjs.org"
).replace(/\/$/, "");

if (!openclawExecutable) {
  throw new Error(
    "EXPERIENCE_ENGINE_OPENCLAW_EXECUTABLE is required for real-host harm-feedback validation."
  );
}
if (!seedConfigPath) {
  throw new Error(
    "EXPERIENCE_ENGINE_OPENCLAW_SEED_CONFIG is required for isolated real-host validation."
  );
}

const resolvedExecutable = resolve(openclawExecutable);
const resolvedEntrypoint = openclawEntrypoint ? resolve(openclawEntrypoint) : null;
const resolvedSeedConfig = resolve(seedConfigPath);
const resolvedSeedAuth = resolve(
  requestedSeedAuthPath ||
  join(dirname(resolvedSeedConfig), "agents", "main", "agent", "auth-profiles.json")
);
for (const requiredPath of [
  resolvedExecutable,
  ...(resolvedEntrypoint ? [resolvedEntrypoint] : []),
  resolvedSeedConfig,
  resolvedSeedAuth
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Required local-pack preflight input does not exist: ${requiredPath}`);
  }
}
if (
  process.platform === "win32" &&
  /\.(?:cmd|bat)$/iu.test(resolvedExecutable) &&
  !resolvedEntrypoint
) {
  throw new Error(
    "Windows .cmd/.bat launchers are not accepted. Set EXPERIENCE_ENGINE_OPENCLAW_EXECUTABLE " +
    "to node.exe and EXPERIENCE_ENGINE_OPENCLAW_ENTRYPOINT to openclaw.mjs."
  );
}
const openclawCommand = resolvedEntrypoint
  ? { executable: resolvedExecutable, args: [resolvedEntrypoint] }
  : resolvedExecutable;

const sourceConfig = JSON.parse(readFileSync(resolvedSeedConfig, "utf8"));
const configuredOpenRouterBaseUrl =
  sourceConfig?.models?.providers?.openrouter?.baseUrl ??
  sourceConfig?.models?.providers?.openrouter?.base_url ??
  null;
const openrouterBaseUrl = (
  requestedOpenRouterBaseUrl || configuredOpenRouterBaseUrl || ""
).replace(/\/$/, "");
if (!openrouterBaseUrl) {
  throw new Error(
    "EXPERIENCE_ENGINE_OPENROUTER_BASE_URL is required when the seed config has no OpenRouter base URL."
  );
}

const validationRoot = await mkdtemp(
  join(tmpdir(), "ee-openclaw-harm-feedback-local-pack-")
);
const runtimeHome = join(validationRoot, "pack-home");
const paths = resolveExperienceEnginePaths({
  adapter: "openclaw",
  env: {
    ...process.env,
    EXPERIENCE_ENGINE_HOME: runtimeHome
  }
});
mkdirSync(paths.dataDir, { recursive: true });
mkdirSync(paths.captureDir, { recursive: true });
mkdirSync(join(runtimeHome, "adapters", "openclaw"), { recursive: true });
mkdirSync(join(runtimeHome, "sqlite"), { recursive: true });

try {
  const artifactPath = requestedArtifactPath
    ? resolve(requestedArtifactPath)
    : createOpenClawInstallTarball(packageRoot, paths);
  if (!existsSync(artifactPath)) {
    throw new Error("The current-source local-pack artifact was not created.");
  }
  const artifactBytes = readFileSync(artifactPath);
  const stagedInstallSource = join(dirname(artifactPath), "experienceengine-openclaw");
  if (!existsSync(stagedInstallSource)) {
    throw new Error("The current-source local-pack staging directory is unavailable.");
  }
  const artifactIntegrity = `sha256:${createHash("sha256")
    .update(artifactBytes)
    .digest("hex")}`;
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const closure = assertRuntimeClosureManifest(packageRoot);
  const createdAt = new Date().toISOString();
  const adapter = createOpenClawMultiScenarioAdapters({
    campaignVersion: "1",
    createdAt
  }).find((entry) => entry.scenario_kind === "harm_recovery");
  if (!adapter) {
    throw new Error("The sealed harm-recovery adapter is unavailable.");
  }

  const result = await executeOpenClawHarmFeedbackLocalPackPreflight({
    adapter,
    createdAt,
    artifactPath,
    installSourcePath: stagedInstallSource,
    runtimeRoot: join(validationRoot, "runtime"),
    outputDir: join(validationRoot, "evidence"),
    sourceConfigPath: resolvedSeedConfig,
    sourceAuthPath: resolvedSeedAuth,
    openrouterBaseUrl,
    npmRegistry,
    openclawExecutable: openclawCommand
  });
  const exposure = result.observation.decision_opportunities.find(
    (entry) => entry.opportunity_id === "harm-exposure"
  );
  const recovery = result.observation.decision_opportunities.find(
    (entry) => entry.opportunity_id === "recovery-recheck"
  );
  const exposureSession = result.evidence.opportunity_sessions.find(
    (entry) => entry.opportunity_id === "harm-exposure"
  );
  const feedbackSession = result.evidence.opportunity_sessions.find(
    (entry) => entry.opportunity_id === "harm-feedback"
  );
  const recoverySession = result.evidence.opportunity_sessions.find(
    (entry) => entry.opportunity_id === "recovery-recheck"
  );
  if (
    !exposure || exposure.delivered_intervention_count !== 1 ||
    exposure.harmed_intervention_count !== 1 ||
    exposure.authoritative_harm_evidence_id === null ||
    exposure.governance_transition?.authority_source !== "production_runtime" ||
    exposure.governance_transition.after_delivery_state !== "quarantined" ||
    !recovery || recovery.decision !== "skip" ||
    recovery.delivered_intervention_count !== 0 || recovery.task_success !== 1 ||
    !recovery.governance_excluded_node_ids.includes(adapter.candidate_corpus[0].node_id) ||
    !exposureSession?.session_id || feedbackSession?.session_id !== exposureSession.session_id ||
    !recoverySession?.session_id || recoverySession.session_id === exposureSession.session_id
  ) {
    throw new Error("The real-host exposure, same-session feedback, or fresh recovery evidence is incomplete.");
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    evidence_class: "local_pack_harm_feedback_preflight",
    install_origin: "local_pack",
    install_source_materialization: "generated_local_pack_stage",
    package_name: packageJson.name,
    package_version: packageJson.version,
    artifact_integrity: artifactIntegrity,
    artifact_size_bytes: statSync(artifactPath).size,
    package_build_id: closure.packageBuildId,
    closure_manifest_digest: closure.closureManifestDigest,
    exposure: {
      decision: exposure.decision,
      delivered_intervention_count: exposure.delivered_intervention_count,
      deterministic_task_success: exposure.task_success,
      task_failure_required_for_this_preflight: false
    },
    feedback: {
      same_session_as_exposure: true,
      user_override: result.governanceAuthority.user_override,
      attribution_source: result.governanceAuthority.attribution_source,
      attribution_verdict: result.governanceAuthority.attribution_verdict,
      attribution_reason: result.governanceAuthority.attribution_reason,
      review_event_type: result.governanceAuthority.review_event_type,
      review_source: result.governanceAuthority.review_source
    },
    governance: {
      node_state: result.governanceAuthority.node_state,
      delivery_state: result.governanceAuthority.delivery_state,
      harmed_count: result.governanceAuthority.harmed_count,
      consecutive_harmed_count: result.governanceAuthority.consecutive_harmed_count,
      evidence_digest: result.governanceEvidenceDigest
    },
    recovery: {
      fresh_session: true,
      delivered_intervention_count: recovery.delivered_intervention_count,
      deterministic_task_success: recovery.task_success,
      governance_excluded_node_count: recovery.governance_excluded_node_ids.length
    },
    install_evidence_digest: result.installDigest,
    install_command_variant: result.installCommandVariant,
    plugin_presence_evidence_digest: result.pluginListDigest,
    artifact_runtime_validated: false,
    support_claim_allowed: false,
    production_learning_ready: false,
    limitation:
      "Current-source local-pack real-host preflight only. This is not exact published-artifact C3 evidence."
  }, null, 2)}\n`);
} finally {
  await rm(validationRoot, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 40 : 3,
    retryDelay: 250
  });
}
