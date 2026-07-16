import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalJson, sha256Text } from "../../dist/runtime/package/package-generation.js";
import {
  MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "../../dist/evaluation/matched-block/constants.js";
import {
  computeMatchedBlockArmControlDigest,
  deriveMatchedBlockArmOrder
} from "../../dist/evaluation/matched-block/arm-control.js";
import {
  computeBenchmarkRecordDigest
} from "../../dist/evaluation/matched-block/contract.js";
import {
  computeMatchedBlockExecutionContractDigest,
  executeSealedMatchedBlock,
  MatchedBlockHarnessInfrastructureError
} from "../../dist/evaluation/matched-block/harness.js";
import {
  appendMatchedBlockDisposition
} from "../../dist/evaluation/matched-block/failure-protocol.js";
import {
  runMatchedBlockCampaignReport
} from "../../dist/evaluation/matched-block/campaign-report.js";
import { MatchedBlockBenchmarkStore } from "../../dist/evaluation/matched-block/store.js";
import { loadConfig } from "../../dist/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../dist/store/sqlite/db.js";
import { ScopeRepository } from "../../dist/store/sqlite/repositories/scope-repo.js";
import { NodeRepository } from "../../dist/store/sqlite/repositories/node-repo.js";
import { InjectionRepository } from "../../dist/store/sqlite/repositories/injection-repo.js";
import { resolveScope } from "../../dist/input/scope-resolver.js";

const TASK_CONTENT = "S8_PILOT_OK\n";
const TASK_INPUT = [
  "In the current workspace, use the available tools to create a file named result.txt.",
  "The file must contain exactly one line: S8_PILOT_OK",
  "Do not add any other characters or lines. Verify the file, then reply only DONE."
].join("\n");

const parseArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
};

const args = parseArgs(process.argv.slice(2));
const required = [
  "openclaw-executable",
  "artifact",
  "source-config",
  "source-auth",
  "npm-registry",
  "openrouter-base-url",
  "output-dir",
  "pilot-version"
];
for (const key of required) {
  if (typeof args[key] !== "string" || args[key].trim().length === 0) {
    throw new Error(`Missing required --${key} argument.`);
  }
}

const openclawExecutable = resolve(args["openclaw-executable"]);
const artifactPath = resolve(args.artifact);
const sourceConfigPath = resolve(args["source-config"]);
const sourceAuthPath = resolve(args["source-auth"]);
const npmRegistry = args["npm-registry"].replace(/\/$/, "");
const openrouterBaseUrl = args["openrouter-base-url"].replace(/\/$/, "");
const outputDir = resolve(args["output-dir"]);
const pilotVersion = args["pilot-version"];
if (!/^[1-9][0-9]*$/.test(pilotVersion)) {
  throw new Error("--pilot-version must be a positive integer string.");
}
const pilotId = `s8-openclaw-pilot-v${pilotVersion}`;
const scenarioId = `s8-file-write-v${pilotVersion}`;
const nodeId = `s8-pilot-node-v${pilotVersion}`;
const blockSeed = `${pilotId}-seed`;
const keepRuntime = args["keep-runtime"] === true;
const runtimeRoot = args["runtime-root"]
  ? resolve(args["runtime-root"])
  : join(outputDir, "runtime");
const campaignDatabasePath = join(outputDir, "matched-block-pilot.sqlite");
const observationsPath = join(outputDir, "observations.json");
const evidencePath = join(outputDir, "pilot-evidence.json");

if (existsSync(outputDir)) {
  throw new Error(`Pilot output directory already exists: ${outputDir}`);
}
if (existsSync(runtimeRoot)) {
  throw new Error(`Pilot runtime directory already exists: ${runtimeRoot}`);
}
for (const path of [openclawExecutable, artifactPath, sourceConfigPath, sourceAuthPath]) {
  if (!existsSync(path)) throw new Error(`Required pilot input does not exist: ${path}`);
}
mkdirSync(outputDir, { recursive: true });
mkdirSync(runtimeRoot, { recursive: true });

const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const digest = (value) => sha256Text(canonicalJson(value));
const withDigest = (value, field) => {
  const next = { ...value };
  next[field] = computeBenchmarkRecordDigest(next, field);
  return next;
};
const writeJson = (path, value, mode) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
};

const findProjectMarkerAncestor = (startPath) => {
  let current = resolve(startPath);
  while (true) {
    for (const marker of [".git", "AGENTS.md", "package.json", "openspec"]) {
      if (existsSync(join(current, marker))) {
        return { directory: current, marker };
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

const run = (command, commandArgs, options = {}) => {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 600_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  });
  return {
    exitCode: result.status ?? (result.error?.code === "ETIMEDOUT" ? 124 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? `${result.error.name}: ${result.error.message}` : ""),
    durationMs: Date.now() - started,
    timedOut: result.error?.code === "ETIMEDOUT"
  };
};

const sourceConfig = JSON.parse(readFileSync(sourceConfigPath, "utf8"));
const primaryModel = sourceConfig?.agents?.defaults?.model?.primary;
if (typeof primaryModel !== "string" || primaryModel.length === 0) {
  throw new Error("Source OpenClaw config does not declare agents.defaults.model.primary.");
}

const templateState = join(runtimeRoot, "template-state");
const templateAgentDir = join(templateState, "agents", "main", "agent");
mkdirSync(templateAgentDir, { recursive: true });
const templateConfig = {
  agents: {
    defaults: {
      model: {
        primary: primaryModel
      },
      workspace: join(runtimeRoot, "template-workspace")
    }
  },
  session: sourceConfig.session ?? {},
  tools: sourceConfig.tools ?? {},
  models: {
    mode: "merge",
    providers: {
      openrouter: {
        baseUrl: openrouterBaseUrl
      }
    }
  },
  plugins: {
    allow: [],
    entries: {},
    load: {}
  }
};
mkdirSync(templateConfig.agents.defaults.workspace, { recursive: true });
const templateConfigPath = join(templateState, "openclaw.json");
writeJson(templateConfigPath, templateConfig, 0o600);
cpSync(sourceAuthPath, join(templateAgentDir, "auth-profiles.json"));

const commonEnv = {
  ...process.env,
  npm_config_registry: npmRegistry,
  NPM_CONFIG_REGISTRY: npmRegistry,
  NO_COLOR: "1"
};
const templateEnv = {
  ...commonEnv,
  OPENCLAW_STATE_DIR: templateState,
  OPENCLAW_CONFIG_PATH: templateConfigPath
};
const doctor = run(openclawExecutable, [
  "doctor",
  "--non-interactive",
  "--yes",
  "--no-workspace-suggestions"
], { env: templateEnv, timeoutMs: 180_000 });
if (doctor.exitCode !== 0) {
  throw new Error(`OpenClaw auth migration failed: ${doctor.stderr || doctor.stdout}`);
}

const arms = deriveMatchedBlockArmOrder(blockSeed);
const armRuntime = Object.fromEntries(arms.map((arm) => {
  const root = join(runtimeRoot, arm);
  const stateDir = join(root, "openclaw-state");
  const workspace = join(root, "workspace");
  const eeHome = join(root, "ee-home");
  const artifactRoot = join(root, "artifacts");
  cpSync(templateState, stateDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  const configPath = join(stateDir, "openclaw.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.agents.defaults.workspace = workspace;
  config.models = {
    mode: "merge",
    providers: { openrouter: { baseUrl: openrouterBaseUrl } }
  };
  if (arm === "no_ee") {
    config.plugins = { allow: [], entries: {}, load: {} };
  }
  writeJson(configPath, config, 0o600);
  return [arm, {
    root,
    stateDir,
    configPath,
    workspace,
    eeHome,
    artifactRoot,
    sessionId: `s8-pilot-${arm}-session`,
    installed: false
  }];
}));

const runtimeManifest = withDigest({
  runtime_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.runtime,
  runtime_manifest_id: `runtime-${pilotId}`,
  package_name: "@alan512/experienceengine",
  package_version: "0.5.1",
  published_channel: "clawhub",
  artifact_integrity: `sha256:${sha256File(artifactPath)}`,
  registry_record_identity: "clawhub:@alan512/experienceengine@0.5.1:7d2d0c67d116aed78a8e7b826cc81da950655c5d8510d9d70fd1a772d936f01c",
  openclaw_version: "2026.7.1",
  node_version: process.version,
  platform: `${process.platform}-${process.arch}`,
  host_identity: "openclaw-local-wsl",
  host_model_provider: "openrouter",
  host_model_identity_fingerprint: digest({ provider: "openrouter", model: primaryModel }),
  host_model_parameters_digest: digest({ thinking: "off", timeout_seconds: 600 }),
  configuration_digest: digest({ primaryModel, openrouterBaseUrl: "relay-bound" }),
  profile_registry_digest: `${pilotId}-profile-registry`,
  benchmark_evidence_target_id: pilotId,
  created_at: new Date().toISOString(),
  runtime_manifest_digest: ""
}, "runtime_manifest_digest");

const executionContract = {
  preflight_attempt_limit: 1,
  harness_version: `matched-block-real-openclaw-pilot-v${pilotVersion}`,
  transcript_adapter_version: `openclaw-local-json-v${pilotVersion}`,
  scorer_version: "matched-block-scorecard-v1",
  observer_contract_digest: digest({ observer: "external-spawn-and-filesystem-v1" }),
  timeout_policy_digest: digest({ preflight_ms: 180_000, formal_ms: 600_000 }),
  resource_policy_digest: digest({
    process_limit: 1,
    workspace: "isolated",
    project_marker_ancestor: "forbidden"
  }),
  fixture_reset_policy_digest: digest({
    result_file: "absent",
    ee_fixture: "recreated",
    exact_scope_live_node: "required"
  }),
  network_retry_policy_version: "network-retry-none-v1"
};

const createdAt = new Date().toISOString();
const campaign = withDigest({
  campaign_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.campaign,
  benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  benchmark_campaign_id: `${pilotId}-campaign`,
  scenario_set_digest: digest([scenarioId]),
  analysis_plan_digest: digest({ efficacy: "complete-block-only", pilot: true }),
  exclusion_policy_version: "matched-block-exclusion-v1",
  replacement_policy_version: "whole-block-replacement-v1",
  created_at: createdAt,
  campaign_manifest_digest: ""
}, "campaign_manifest_digest");
const groundTruth = withDigest({
  ground_truth_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.groundTruth,
  ground_truth_id: `${scenarioId}-ground-truth`,
  scenario_id: scenarioId,
  scenario_version: pilotVersion,
  expected_action: "inject",
  applicable_node_ids: [nodeId],
  applicable_candidate_ids: [],
  distractor_node_ids: [],
  distractor_candidate_ids: [],
  scope_validity: { valid: true, reason_code: "exact_workspace_scope" },
  safety_constraints: ["workspace_only", "single_file_write"],
  deterministic_success_checks: ["result.txt_sha256"],
  known_old_mistake_path: "write_extra_text_or_wrong_path",
  created_at: createdAt,
  ground_truth_digest: ""
}, "ground_truth_digest");
const scenario = withDigest({
  scenario_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.scenario,
  scenario_id: groundTruth.scenario_id,
  scenario_version: groundTruth.scenario_version,
  title: "Create one byte-exact workspace file",
  task_type: "general",
  task_input: TASK_INPUT,
  task_input_digest: sha256Text(TASK_INPUT),
  ground_truth_id: groundTruth.ground_truth_id,
  ground_truth_digest: groundTruth.ground_truth_digest,
  created_at: createdAt,
  scenario_digest: ""
}, "scenario_digest");
const fixture = withDigest({
  fixture_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.fixture,
  fixture_id: `${scenarioId}-fixture`,
  fixture_version: pilotVersion,
  repository_source: "generated://s8-openclaw-pilot",
  repository_revision: pilotVersion,
  repository_snapshot_digest: digest({ files: [] }),
  setup_contract_digest: digest({
    empty_workspace: true,
    project_marker_ancestor: "forbidden"
  }),
  reset_contract_digest: executionContract.fixture_reset_policy_digest,
  candidate_corpus_digest: digest({ node_id: nodeId, content: TASK_CONTENT }),
  created_at: createdAt,
  fixture_digest: ""
}, "fixture_digest");
const instrumentation = withDigest({
  instrumentation_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.instrumentation,
  instrumentation_manifest_id: `${pilotId}-instrumentation`,
  harness_version: executionContract.harness_version,
  transcript_adapter_version: executionContract.transcript_adapter_version,
  scorer_version: executionContract.scorer_version,
  observer_contract_digest: executionContract.observer_contract_digest,
  timeout_policy_digest: executionContract.timeout_policy_digest,
  resource_policy_digest: executionContract.resource_policy_digest,
  fixture_reset_policy_digest: executionContract.fixture_reset_policy_digest,
  network_retry_policy_version: executionContract.network_retry_policy_version,
  collected_metrics: [
    "delivery_rate",
    "net_helpful_intervention_rate",
    "helpful_rate",
    "harmful_rate",
    "uncertain_rate",
    "task_success_delta",
    "repeated_old_mistake_avoidance_delta",
    "correct_skip_rate",
    "false_positive_injection_rate",
    "provider_cost",
    "experienceengine_token_overhead",
    "wall_clock_latency_delta",
    "tool_call_delta",
    "infrastructure_failure_rate"
  ],
  unavailable_metric_policy: "mark_unavailable",
  created_at: createdAt,
  instrumentation_manifest_digest: ""
}, "instrumentation_manifest_digest");
const block = withDigest({
  benchmark_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.block,
  benchmark_protocol_version: MATCHED_BLOCK_BENCHMARK_PROTOCOL_VERSION,
  benchmark_campaign_id: campaign.benchmark_campaign_id,
  benchmark_profile_registry_digest: runtimeManifest.profile_registry_digest,
  benchmark_evidence_target_id: runtimeManifest.benchmark_evidence_target_id,
  scenario_id: scenario.scenario_id,
  scenario_version: scenario.scenario_version,
  scenario_digest: scenario.scenario_digest,
  scenario_set_digest: campaign.scenario_set_digest,
  fixture_id: fixture.fixture_id,
  ground_truth_id: groundTruth.ground_truth_id,
  runtime_manifest_id: runtimeManifest.runtime_manifest_id,
  instrumentation_manifest_id: instrumentation.instrumentation_manifest_id,
  block_id: `${pilotId}-block`,
  replacement_for_block_id: null,
  replacement_generation: 0,
  repetition_index: 1,
  randomization_seed: blockSeed,
  planned_arm_order: arms,
  repository_snapshot_digest: fixture.repository_snapshot_digest,
  task_input_digest: scenario.task_input_digest,
  candidate_corpus_digest: fixture.candidate_corpus_digest,
  host_identity: runtimeManifest.host_identity,
  host_model_provider: runtimeManifest.host_model_provider,
  host_model_identity_fingerprint: runtimeManifest.host_model_identity_fingerprint,
  host_model_parameters_digest: runtimeManifest.host_model_parameters_digest,
  environment_contract_digest: computeMatchedBlockExecutionContractDigest(executionContract),
  network_retry_policy_version: executionContract.network_retry_policy_version,
  harness_version: executionContract.harness_version,
  transcript_adapter_version: executionContract.transcript_adapter_version,
  scorer_version: executionContract.scorer_version,
  analysis_plan_digest: campaign.analysis_plan_digest,
  exclusion_policy_version: campaign.exclusion_policy_version,
  replacement_policy_version: campaign.replacement_policy_version,
  created_at: createdAt,
  sealed_at: createdAt,
  manifest_digest: ""
}, "manifest_digest");
const armPlans = arms.map((arm, index) => ({
  arm_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.armPlan,
  benchmark_campaign_id: campaign.benchmark_campaign_id,
  block_id: block.block_id,
  manifest_digest: block.manifest_digest,
  arm,
  planned_ordinal: index + 1,
  workspace_isolation_id: `${block.block_id}-${arm}-workspace`,
  ee_home_isolation_id: `${block.block_id}-${arm}-ee-home`,
  host_session_isolation_id: `${block.block_id}-${arm}-session`,
  arm_control_digest: computeMatchedBlockArmControlDigest(arm)
}));
const publicationPlan = withDigest({
  publication_plan_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.publicationPlan,
  benchmark_campaign_id: campaign.benchmark_campaign_id,
  analysis_plan_digest: campaign.analysis_plan_digest,
  minimum_repetitions_per_scenario: 5,
  minimum_complete_block_coverage: 0.8,
  minimum_infrastructure_reliability: 0.95,
  quality_thresholds: {
    harmful_rate: 0.05,
    infrastructure_failure_rate: 0.05
  },
  uncertainty_method: "scenario_cluster_normal_95_v1",
  negative_result_disclosure_required: true,
  sensitivity_exclusion_policy_version: "sensitivity-exclusion-v1",
  created_at: createdAt,
  sealed_at: createdAt,
  publication_plan_digest: ""
}, "publication_plan_digest");

const store = new MatchedBlockBenchmarkStore(campaignDatabasePath);
store.insertCampaignManifest(campaign);
store.insertGroundTruth(groundTruth);
store.insertScenarioManifest(scenario);
store.insertFixtureManifest(fixture);
store.insertRuntimeManifest(runtimeManifest);
store.insertInstrumentationManifest(instrumentation);
store.insertPublicationPlan(publicationPlan);
store.insertSealedBlock(block, armPlans);

const armEnv = (arm) => {
  const runtime = armRuntime[arm];
  return {
    ...commonEnv,
    OPENCLAW_STATE_DIR: runtime.stateDir,
    OPENCLAW_CONFIG_PATH: runtime.configPath,
    EXPERIENCE_ENGINE_EVALUATION_MODE: arm === "forced_holdout" ? "holdout" : "live",
    EXPERIENCE_ENGINE_HOLDOUT_RATE: arm === "forced_holdout" ? "1" : "0",
    EXPERIENCE_ENGINE_EMBEDDING_PROVIDER: "legacy",
    EXPERIENCE_ENGINE_TRIGGER_THRESHOLD: "0.05",
    EXPERIENCE_ENGINE_MAX_HINTS: "1",
    EXPERIENCE_ENGINE_INLINE_NOTICES: "false",
    EXPERIENCE_ENGINE_LOG_LEVEL: "error"
  };
};

const patchArmConfig = (arm) => {
  const runtime = armRuntime[arm];
  const config = JSON.parse(readFileSync(runtime.configPath, "utf8"));
  config.agents.defaults.workspace = runtime.workspace;
  if (arm !== "no_ee") {
    const entry = config.plugins?.entries?.experienceengine ?? {};
    config.plugins = config.plugins ?? {};
    config.plugins.entries = config.plugins.entries ?? {};
    config.plugins.entries.experienceengine = {
      ...entry,
      enabled: true,
      config: {
        ...(entry.config ?? {}),
        dataDir: runtime.eeHome,
        sqlitePath: join(runtime.eeHome, "sqlite", "experienceengine.db"),
        captureDir: join(runtime.eeHome, "captures"),
        hybridEnabled: false,
        hybridSyncExplainEnabled: false,
        hybridAsyncPostmortemEnabled: false
      }
    };
  } else {
    config.plugins = { allow: [], entries: {}, load: {} };
  }
  writeJson(runtime.configPath, config, 0o600);
};

const seedEeFixture = (arm) => {
  if (arm === "no_ee") {
    return {
      scope_id: null,
      seeded_node_ids: []
    };
  }
  const runtime = armRuntime[arm];
  rmSync(runtime.eeHome, { recursive: true, force: true });
  mkdirSync(runtime.eeHome, { recursive: true });
  const sqlitePath = join(runtime.eeHome, "sqlite", "experienceengine.db");
  const config = loadConfig({
    dataDir: runtime.eeHome,
    sqlitePath,
    captureDir: join(runtime.eeHome, "captures"),
    embeddingProvider: "legacy",
    evaluationMode: arm === "forced_holdout" ? "holdout" : "live",
    holdoutRate: arm === "forced_holdout" ? 1 : 0,
    triggerThreshold: 0.05,
    maxHints: 1
  }, { env: armEnv(arm) });
  const db = openDatabase(config);
  try {
    bootstrapDatabase(db);
    const scope = resolveScope(runtime.workspace);
    new ScopeRepository(db).upsert(scope);
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert({
      id: nodeId,
      node_type: "strategy",
      scope_id: scope.scope_id,
      task_type: "general",
      experience_kind: "execution_pattern",
      confidence_signal: "supported_by_objective_success",
      validation_state: "validated_by_reuse",
      trigger_pattern: "create result.txt exactly S8_PILOT_OK verify file then reply DONE",
      applicability_notes: "Exact S8 pilot workspace file task only.",
      compact_hint: "Create result.txt in the current workspace with exactly S8_PILOT_OK followed by one newline. Verify the file byte-for-byte, then reply DONE.",
      goal: "Complete the byte-exact S8 pilot file task.",
      recommended_steps: [
        "Write result.txt in the current workspace.",
        "Verify the file contains exactly S8_PILOT_OK and one newline."
      ],
      avoid_steps: ["Do not add commentary to the file.", "Do not write outside the workspace."],
      fallback_steps: [],
      success_signal: "result.txt has the expected SHA-256 digest",
      evidence_summary: "Pre-sealed deterministic S8 pilot fixture.",
      retrieval_text: `${TASK_INPUT} result.txt S8_PILOT_OK byte exact verification`,
      source_kind: "explicit",
      distillation_mode_used: "llm",
      distillation_source: "explicit_provider",
      origin_record_ids: [`${pilotId}-fixture-record`],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "active",
      delivery_state: "eligible",
      usage_count: 3,
      helped_count: 3,
      harmed_count: 0,
      support_count: 3,
      created_at: createdAt,
      updated_at: createdAt
    });
    const liveNodes = nodeRepo.listLiveInjectableByExactScope(scope.scope_id);
    if (!liveNodes.some((node) => node.id === nodeId)) {
      throw new Error(`Seeded node ${nodeId} is not live-injectable in the exact arm scope.`);
    }
    return {
      scope_id: scope.scope_id,
      seeded_node_ids: liveNodes.map((node) => node.id).sort()
    };
  } finally {
    db.close();
  }
};

const parseAgentJson = (stdout) => {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  return null;
};

const readInjectionEvidence = (arm) => {
  if (arm === "no_ee") return null;
  const runtime = armRuntime[arm];
  const sqlitePath = join(runtime.eeHome, "sqlite", "experienceengine.db");
  if (!existsSync(sqlitePath)) return null;
  const config = loadConfig({
    dataDir: runtime.eeHome,
    sqlitePath,
    captureDir: join(runtime.eeHome, "captures"),
    embeddingProvider: "legacy"
  }, { env: armEnv(arm) });
  const db = openDatabase(config);
  try {
    const injection = new InjectionRepository(db).getLatest() ?? null;
    if (
      injection &&
      (!injection.session_id || !injection.session_id.endsWith(runtime.sessionId))
    ) {
      throw new MatchedBlockHarnessInfrastructureError(
        "BENCH_INSTRUMENTATION_INCOMPARABLE",
        `Latest injection event is not bound to the expected ${arm} host session.`
      );
    }
    return injection;
  } finally {
    db.close();
  }
};

const observerState = new Map();
const observations = [];
const driver = {
  resolveIsolation: (_bundle, plan) => {
    const runtime = armRuntime[plan.arm];
    return {
      workspace_isolation_id: plan.workspace_isolation_id,
      ee_home_isolation_id: plan.ee_home_isolation_id,
      host_session_isolation_id: plan.host_session_isolation_id,
      workspace_path: runtime.workspace,
      ee_home_path: runtime.eeHome,
      host_state_path: runtime.stateDir,
      artifact_root_path: runtime.artifactRoot
    };
  },
  runPreflight: async (context, stage) => {
    const arm = context.plan.arm;
    const runtime = armRuntime[arm];
    let result = { exitCode: 0, stdout: "", stderr: "", durationMs: 0, timedOut: false };
    if (stage === "dependency_setup" && arm !== "no_ee" && !runtime.installed) {
      result = run(openclawExecutable, [
        "plugins", "install", artifactPath, "--acknowledge-clawhub-risk", "--force"
      ], { env: armEnv(arm), timeoutMs: 600_000 });
      if (result.exitCode === 0) {
        runtime.installed = true;
        patchArmConfig(arm);
      }
    } else if (stage === "credential_validation") {
      result = run(openclawExecutable, ["models", "status", "--json"], {
        env: armEnv(arm), timeoutMs: 120_000
      });
    } else if (stage === "host_startup") {
      result = run(openclawExecutable, ["plugins", "list", "--json"], {
        env: armEnv(arm), timeoutMs: 120_000
      });
      if (result.exitCode === 0) {
        const hasEe = result.stdout.includes("experienceengine");
        if ((arm === "no_ee" && hasEe) || (arm !== "no_ee" && !hasEe)) {
          result.exitCode = 1;
          result.stderr += `\nUnexpected ExperienceEngine plugin presence for ${arm}.`;
        }
      }
    } else if (stage === "fixture_preparation") {
      mkdirSync(runtime.workspace, { recursive: true });
      const projectMarkerAncestor = findProjectMarkerAncestor(runtime.workspace);
      if (projectMarkerAncestor) {
        result.exitCode = 1;
        result.stderr = `Workspace resolves beneath project marker ${projectMarkerAncestor.marker}.`;
      } else {
        result.stdout = statSync(runtime.workspace).isDirectory()
          ? `workspace-ready:${resolveScope(runtime.workspace).scope_id}`
          : "";
      }
    } else if (stage === "harness_smoke") {
      result.stdout = runtime.sessionId;
    }
    return {
      passed: result.exitCode === 0,
      failure_code: result.exitCode === 0 ? null : "BENCH_HOST_START_FAILED",
      evidence_digest: digest({
        arm,
        stage,
        exitCode: result.exitCode,
        stdout: sha256Text(result.stdout),
        stderr: sha256Text(result.stderr),
        durationMs: result.durationMs
      })
    };
  },
  resetFixture: async (context) => {
    const runtime = armRuntime[context.plan.arm];
    rmSync(runtime.workspace, { recursive: true, force: true });
    mkdirSync(runtime.workspace, { recursive: true });
    const fixtureState = seedEeFixture(context.plan.arm);
    return {
      reset_contract_digest: executionContract.fixture_reset_policy_digest,
      evidence_digest: digest({
        arm: context.plan.arm,
        workspace_empty: true,
        ee_fixture: context.plan.arm === "no_ee" ? "absent" : fixture.candidate_corpus_digest,
        fixture_scope_id: fixtureState.scope_id,
        seeded_node_ids: fixtureState.seeded_node_ids
      })
    };
  },
  startExternalObserver: async (context) => {
    observerState.set(context.plan.arm, { startedAt: Date.now() });
    return {
      observer_id: `external-observer-${context.plan.arm}`,
      observer_contract_digest: instrumentation.observer_contract_digest,
      instrumentation_manifest_digest: instrumentation.instrumentation_manifest_digest,
      started_evidence_digest: digest({ arm: context.plan.arm, started: true })
    };
  },
  prepareArm: async (context) => {
    const arm = context.plan.arm;
    const runtime = armRuntime[arm];
    const list = run(openclawExecutable, ["plugins", "list", "--json"], {
      env: armEnv(arm), timeoutMs: 120_000
    });
    const hasEe = list.exitCode === 0 && list.stdout.includes("experienceengine");
    if ((arm === "no_ee" && hasEe) || (arm !== "no_ee" && !hasEe)) {
      throw new MatchedBlockHarnessInfrastructureError(
        "BENCH_ARM_CONTAMINATION_DETECTED",
        `Unexpected ExperienceEngine plugin state for ${arm}.`
      );
    }
    return {
      preparation_evidence_digest: digest({ arm, plugin_present: hasEe }),
      ee_runtime_loaded: arm !== "no_ee",
      decision_pipeline_ready: arm !== "no_ee",
      delivery_mode: context.control.delivery_mode
    };
  },
  releaseTaskInput: async (context, _prepared, taskInput) => {
    const arm = context.plan.arm;
    const runtime = armRuntime[arm];
    const messagePath = join(runtime.artifactRoot, "formal-task.txt");
    writeFileSync(messagePath, taskInput, "utf8");
    const result = run(openclawExecutable, [
      "agent",
      "--local",
      "--json",
      "--session-id", runtime.sessionId,
      "--message-file", messagePath,
      "--model", primaryModel,
      "--thinking", "off",
      "--timeout", "600"
    ], { cwd: runtime.workspace, env: armEnv(arm), timeoutMs: 620_000 });
    writeFileSync(join(runtime.artifactRoot, "openclaw.stdout.jsonl"), result.stdout, "utf8");
    writeFileSync(join(runtime.artifactRoot, "openclaw.stderr.log"), result.stderr, "utf8");
    const agentJson = parseAgentJson(result.stdout);
    const resultPath = join(runtime.workspace, "result.txt");
    const taskSuccess = result.exitCode === 0 && existsSync(resultPath) &&
      readFileSync(resultPath).equals(Buffer.from(TASK_CONTENT));
    const injection = readInjectionEvidence(arm);
    const wouldHaveDelivered = arm === "no_ee"
      ? null
      : Boolean(injection && injection.injected_node_ids.length > 0);
    const delivered = arm === "no_ee" ? false : Boolean(injection?.delivered);
    const usage = agentJson?.meta?.usage ?? agentJson?.usage ?? null;
    const totalTokens = typeof usage?.totalTokens === "number"
      ? usage.totalTokens
      : typeof usage?.total_tokens === "number"
        ? usage.total_tokens
        : null;
    const toolCalls = Array.isArray(agentJson?.meta?.toolCalls)
      ? agentJson.meta.toolCalls.length
      : Array.isArray(agentJson?.toolCalls)
        ? agentJson.toolCalls.length
        : 0;
    observations.push({
      block_id: block.block_id,
      arm,
      decision: arm === "no_ee"
        ? "skip"
        : wouldHaveDelivered
          ? injection?.mode === "inject_conservative" ? "conservative" : "inject"
          : "skip",
      decision_opportunity_count: 1,
      delivered_intervention_count: delivered ? 1 : 0,
      helped_intervention_count: delivered && taskSuccess ? 1 : 0,
      harmed_intervention_count: 0,
      uncertain_intervention_count: delivered && !taskSuccess ? 1 : 0,
      task_success: taskSuccess ? 1 : 0,
      repeated_old_mistake_avoided: taskSuccess ? 1 : 0,
      provider_cost: null,
      total_token_count: totalTokens,
      wall_clock_duration_ms: result.durationMs,
      tool_call_count: toolCalls,
      observation_digest: digest({
        arm,
        taskSuccess,
        delivered,
        wouldHaveDelivered,
        totalTokens,
        toolCalls,
        stdout: sha256Text(result.stdout),
        stderr: sha256Text(result.stderr)
      })
    });
    return {
      task_outcome: taskSuccess ? "success" : "failure",
      task_timeout: result.timedOut,
      product_runtime_failure_codes: result.exitCode === 0 ? [] : ["OPENCLAW_AGENT_EXIT_NONZERO"],
      workspace_artifact_digest: existsSync(resultPath)
        ? sha256File(resultPath)
        : digest({ result_file: "missing" }),
      host_transcript_digest: sha256Text(result.stdout),
      deterministic_check_digest: digest({
        expected_sha256: sha256Text(TASK_CONTENT),
        actual_sha256: existsSync(resultPath) ? sha256File(resultPath) : null,
        taskSuccess
      }),
      scoring_record_digest: observations.at(-1).observation_digest,
      execution_contract_digest: context.executionContractDigest,
      ee_runtime_loaded: arm !== "no_ee",
      decision_pipeline_ran: arm !== "no_ee",
      would_have_delivered: wouldHaveDelivered,
      delivered,
      delivered_node_ids: delivered ? injection.injected_node_ids : []
    };
  },
  finishExternalObserver: async (context) => {
    const state = observerState.get(context.plan.arm);
    return {
      arm_neutral_metrics_digest: digest({
        arm: context.plan.arm,
        elapsed_ms: state ? Date.now() - state.startedAt : null,
        collector: "external-spawn-and-filesystem-v1"
      }),
      observer_contract_digest: instrumentation.observer_contract_digest,
      instrumentation_manifest_digest: instrumentation.instrumentation_manifest_digest
    };
  },
  cleanupArm: async () => {}
};

let harnessResult;
let campaignReport;
try {
  harnessResult = await executeSealedMatchedBlock({
    store,
    blockId: block.block_id,
    executionContract,
    driver
  });
  if (harnessResult.status !== "completed") {
    throw new Error(`Pilot preflight failed: ${JSON.stringify(harnessResult.failed_preflight)}`);
  }
  const disposition = appendMatchedBlockDisposition(
    store,
    block.block_id,
    new Date().toISOString(),
    "run-openclaw-matched-block-pilot"
  );
  writeJson(observationsPath, observations);
  campaignReport = runMatchedBlockCampaignReport({
    campaignDatabasePath,
    campaignId: campaign.benchmark_campaign_id,
    observationsPath,
    outputDir: join(outputDir, "report"),
    negativeResultDisclosureIncluded: true,
    persistDecision: true
  });
  const evidence = {
    evidence_type: `real_openclaw_matched_block_pilot_v${pilotVersion}`,
    artifact: {
      path_name: basename(artifactPath),
      size: statSync(artifactPath).size,
      sha256: sha256File(artifactPath)
    },
    openclaw: {
      executable_name: basename(openclawExecutable),
      model: primaryModel,
      host_mode: "local_embedded"
    },
    campaign: {
      campaign_id: campaign.benchmark_campaign_id,
      block_id: block.block_id,
      planned_arm_order: arms,
      manifest_digest: block.manifest_digest
    },
    harness_result: harnessResult,
    block_disposition: disposition,
    observations,
    campaign_report: campaignReport.report,
    support_claim_allowed: false,
    production_learning_ready: false,
    generated_at: new Date().toISOString()
  };
  writeJson(evidencePath, evidence);
  process.stdout.write(`${JSON.stringify({
    status: "pilot_completed",
    output_dir: outputDir,
    evidence_path: evidencePath,
    campaign_decision: campaignReport.report.result.publication_decision.decision,
    arm_outcomes: observations.map((observation) => ({
      arm: observation.arm,
      task_success: observation.task_success,
      delivered: observation.delivered_intervention_count,
      decision: observation.decision,
      would_have_delivered: observation.decision !== "skip"
    }))
  }, null, 2)}\n`);
} finally {
  store.close();
  if (!keepRuntime) {
    rmSync(runtimeRoot, { recursive: true, force: true });
  }
}
