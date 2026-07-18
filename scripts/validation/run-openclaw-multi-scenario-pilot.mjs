import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  MATCHED_BLOCK_SCHEMA_VERSIONS
} from "../../dist/evaluation/matched-block/constants.js";
import {
  computeBenchmarkRecordDigest
} from "../../dist/evaluation/matched-block/contract.js";
import {
  assertOpenClawMultiScenarioCampaignPlan,
  createOpenClawMultiScenarioCampaignPlan
} from "../../dist/evaluation/matched-block/openclaw-multi-scenario-plan.js";
import {
  createOpenClawMultiScenarioExecutionBundle
} from "../../dist/evaluation/matched-block/openclaw-multi-scenario-execution.js";
import {
  executeOpenClawMultiScenarioCampaign
} from "./lib/openclaw-multi-scenario-runtime.mjs";
import {
  resolveOpenClawMultiScenarioInstallSource
} from "./lib/openclaw-multi-scenario-install-source.mjs";
import {
  digest,
  runOpenClawCommand,
  sha256File,
  writeJson
} from "./lib/openclaw-matched-block-host.mjs";

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
const planOnly = args["plan-only"] === true;
const execute = args.execute === true;
if (planOnly === execute) {
  throw new Error(
    "Pass exactly one of --plan-only or --execute."
  );
}

const commonRequired = [
  "artifact",
  "source-config",
  "openclaw-executable",
  "output-dir"
];
const planRequired = [
  "campaign-version",
  "openclaw-version",
  "host-platform",
  "node-version",
  "model-provider",
  "published-channel",
  "package-name",
  "package-version"
];
const required = planOnly
  ? [...commonRequired, ...planRequired]
  : [...commonRequired, "plan"];
if (execute) {
  required.push(
    "source-auth",
    "npm-registry",
    "openrouter-base-url",
    "registry-record-identity"
  );
}
for (const key of required) {
  if (typeof args[key] !== "string" || args[key].trim().length === 0) {
    throw new Error(`Missing required --${key} argument.`);
  }
}

if (planOnly && args["published-channel"] !== "npm" && args["published-channel"] !== "clawhub") {
  throw new Error("--published-channel must be npm or clawhub.");
}
if (planOnly && !/^[1-9][0-9]*$/.test(args["campaign-version"])) {
  throw new Error("--campaign-version must be a positive integer string.");
}
const repetitionsText = typeof args.repetitions === "string" ? args.repetitions : "1";
if (planOnly && !/^[1-9][0-9]*$/.test(repetitionsText)) {
  throw new Error("--repetitions must be a positive integer string.");
}
const createdAt = typeof args["created-at"] === "string"
  ? args["created-at"]
  : new Date().toISOString();

const artifactPath = resolve(args.artifact);
const sourceConfigPath = resolve(args["source-config"]);
const openclawExecutable = resolve(args["openclaw-executable"]);
const outputDir = resolve(args["output-dir"]);
const sourceAuthPath = execute ? resolve(args["source-auth"]) : null;
const sealedPlanPath = execute ? resolve(args.plan) : null;
for (const path of [
  artifactPath,
  sourceConfigPath,
  openclawExecutable,
  ...(sourceAuthPath ? [sourceAuthPath] : []),
  ...(sealedPlanPath ? [sealedPlanPath] : [])
]) {
  if (!existsSync(path)) {
    throw new Error(`Required plan input does not exist: ${path}`);
  }
}
if (existsSync(outputDir)) {
  throw new Error(`Plan output directory already exists: ${outputDir}`);
}

const sourceConfig = JSON.parse(readFileSync(sourceConfigPath, "utf8"));
const modelIdentity = sourceConfig?.agents?.defaults?.model?.primary;
if (typeof modelIdentity !== "string" || modelIdentity.trim().length === 0) {
  throw new Error("Source OpenClaw config does not declare agents.defaults.model.primary.");
}

const plan = planOnly
  ? assertOpenClawMultiScenarioCampaignPlan(
    createOpenClawMultiScenarioCampaignPlan({
      campaignVersion: args["campaign-version"],
      repetitionsPerScenario: Number.parseInt(repetitionsText, 10),
      createdAt,
      artifact: {
        file_name: basename(artifactPath),
        size_bytes: statSync(artifactPath).size,
        sha256: sha256File(artifactPath),
        published_channel: args["published-channel"],
        package_name: args["package-name"],
        package_version: args["package-version"]
      },
      host: {
        executable_name: basename(openclawExecutable),
        openclaw_version: args["openclaw-version"],
        node_version: args["node-version"],
        platform: args["host-platform"],
        model_provider: args["model-provider"],
        model_identity: modelIdentity,
        host_mode: "local_embedded"
      }
    })
  )
  : assertOpenClawMultiScenarioCampaignPlan(
    JSON.parse(readFileSync(sealedPlanPath, "utf8"))
  );

if (execute) {
  const actualArtifact = {
    file_name: basename(artifactPath),
    size_bytes: statSync(artifactPath).size,
    sha256: sha256File(artifactPath)
  };
  if (
    actualArtifact.file_name !== plan.artifact.file_name ||
    actualArtifact.size_bytes !== plan.artifact.size_bytes ||
    actualArtifact.sha256 !== plan.artifact.sha256
  ) {
    throw new Error("Execution artifact differs from the independently validated sealed plan.");
  }
  if (modelIdentity !== plan.host.model_identity) {
    throw new Error("Execution model identity differs from the independently validated sealed plan.");
  }
  if (basename(openclawExecutable) !== plan.host.executable_name) {
    throw new Error("Execution OpenClaw executable differs from the sealed host identity.");
  }
  const nodeVersion = process.version.replace(/^v/u, "");
  if (nodeVersion !== plan.host.node_version) {
    throw new Error(
      `Execution Node version ${nodeVersion} differs from sealed ${plan.host.node_version}.`
    );
  }
  const platform = `${process.platform}-${process.arch}`;
  if (platform !== plan.host.platform) {
    throw new Error(
      `Execution platform ${platform} differs from sealed ${plan.host.platform}.`
    );
  }
  const versionResult = runOpenClawCommand(openclawExecutable, ["--version"], {
    timeoutMs: 120_000
  });
  const versionOutput = `${versionResult.stdout}\n${versionResult.stderr}`.trim();
  if (versionResult.exitCode !== 0 || !versionOutput.includes(plan.host.openclaw_version)) {
    throw new Error(
      `Execution OpenClaw version differs from sealed ${plan.host.openclaw_version}: ${versionOutput}`
    );
  }
}

mkdirSync(outputDir, { recursive: false });
const planPath = join(outputDir, "multi-scenario-plan.json");
if (sealedPlanPath) {
  copyFileSync(sealedPlanPath, planPath);
} else {
  writeJson(planPath, plan, 0o600);
}

if (planOnly) {
  process.stdout.write(`${JSON.stringify({
    status: "plan_only_completed",
    campaign_id: plan.campaign_manifest.benchmark_campaign_id,
    scenario_count: plan.scenarios.length,
    repetitions_per_scenario: plan.repetitions_per_scenario,
    planned_block_count: plan.scenarios.reduce((total, scenario) => total + scenario.blocks.length, 0),
    plan_digest: plan.plan_digest,
    plan_path: planPath,
    formal_execution_started: false,
    campaign_database_created: false,
    support_claim_allowed: false,
    production_learning_ready: false
  }, null, 2)}\n`);
} else {
  const keepRuntime = args["keep-runtime"] === true;
  const runtimeRoot = args["runtime-root"]
    ? resolve(args["runtime-root"])
    : join(outputDir, "runtime");
  if (existsSync(runtimeRoot)) {
    rmSync(outputDir, { recursive: true, force: true });
    throw new Error(`Pilot runtime directory already exists: ${runtimeRoot}`);
  }
  const runtimeManifest = (() => {
    const value = {
      runtime_manifest_schema_version: MATCHED_BLOCK_SCHEMA_VERSIONS.runtime,
      runtime_manifest_id: `${plan.campaign_manifest.benchmark_campaign_id}-runtime`,
      package_name: plan.artifact.package_name,
      package_version: plan.artifact.package_version,
      published_channel: plan.artifact.published_channel,
      artifact_integrity: `sha256:${plan.artifact.sha256}`,
      registry_record_identity: args["registry-record-identity"],
      openclaw_version: plan.host.openclaw_version,
      node_version: plan.host.node_version,
      platform: plan.host.platform,
      host_identity: "openclaw-local-wsl",
      host_model_provider: plan.host.model_provider,
      host_model_identity_fingerprint: digest({
        provider: plan.host.model_provider,
        model: plan.host.model_identity
      }),
      host_model_parameters_digest: digest({
        thinking: "off",
        timeout_seconds: 600
      }),
      configuration_digest: digest({
        model: plan.host.model_identity,
        openrouter_base_url: "relay-bound",
        evaluation_mode: "sealed-matched-block"
      }),
      profile_registry_digest: `${plan.campaign_manifest.benchmark_campaign_id}-profile-registry`,
      benchmark_evidence_target_id: plan.campaign_manifest.benchmark_campaign_id,
      created_at: plan.created_at,
      runtime_manifest_digest: ""
    };
    value.runtime_manifest_digest = computeBenchmarkRecordDigest(
      value,
      "runtime_manifest_digest"
    );
    return value;
  })();
  const executionContract = {
    preflight_attempt_limit: 1,
    harness_version: "openclaw-multi-scenario-real-host-v2",
    transcript_adapter_version: "openclaw-multi-opportunity-json-v1",
    scorer_version: "matched-block-scorecard-v2",
    observer_contract_digest: digest({ observer: "external-spawn-and-filesystem-v2" }),
    timeout_policy_digest: digest({ preflight_ms: 180_000, formal_ms: 1_800_000 }),
    resource_policy_digest: digest({
      process_limit: 1,
      workspace: "isolated",
      project_marker_ancestor: "forbidden",
      opportunity_sessions: "predeclared"
    }),
    fixture_reset_policy_digest: digest({
      task_fixture: "scenario_adapter_recreated",
      ee_fixture: "arm_recreated",
      harm_recheck_task_fixture: "restored_without_ee_state_reset"
    }),
    network_retry_policy_version: "network-retry-none-v1"
  };
  const executionBundle = createOpenClawMultiScenarioExecutionBundle({
    plan,
    runtimeManifest,
    executionContract
  });
  const campaignDatabasePath = join(outputDir, "multi-scenario-pilot.sqlite");
  const observationsPath = join(outputDir, "observations.json");
  const evidencePath = join(outputDir, "multi-scenario-evidence.json");
  try {
    const installSource = resolveOpenClawMultiScenarioInstallSource({
      publishedChannel: plan.artifact.published_channel,
      packageName: plan.artifact.package_name,
      packageVersion: plan.artifact.package_version,
      artifactPath
    });
    const result = await executeOpenClawMultiScenarioCampaign({
      plan,
      planPath,
      executionBundle,
      runtimeManifest,
      executionContract,
      outputDir,
      runtimeRoot,
      campaignDatabasePath,
      observationsPath,
      evidencePath,
      artifactPath,
      installSource,
      sourceConfigPath,
      sourceAuthPath,
      openclawExecutable,
      npmRegistry: args["npm-registry"].replace(/\/$/, ""),
      openrouterBaseUrl: args["openrouter-base-url"].replace(/\/$/, ""),
      keepRuntime
    });
    process.stdout.write(`${JSON.stringify({
      status: "multi_scenario_pilot_completed",
      campaign_id: plan.campaign_manifest.benchmark_campaign_id,
      plan_digest: plan.plan_digest,
      scenario_count: plan.scenarios.length,
      repetitions_per_scenario: plan.repetitions_per_scenario,
      completed_block_count: result.blockResults.length,
      observation_count: result.observations.length,
      publication_decision: result.campaignReport.report.result.publication_decision.decision,
      evidence_path: evidencePath,
      runtime_retained_for_independent_validation: keepRuntime,
      support_claim_allowed: false,
      production_learning_ready: false
    }, null, 2)}\n`);
  } catch (error) {
    if (!keepRuntime) {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
    throw error;
  }
}
