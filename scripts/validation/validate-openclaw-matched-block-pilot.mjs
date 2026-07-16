import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  canonicalJson,
  sha256Text
} from "../../dist/runtime/package/package-generation.js";
import { MATCHED_BLOCK_ARMS } from "../../dist/evaluation/matched-block/constants.js";
import { runMatchedBlockCampaignReport } from "../../dist/evaluation/matched-block/campaign-report.js";
import { MatchedBlockBenchmarkStore } from "../../dist/evaluation/matched-block/store.js";

const TASK_CONTENT = "S8_PILOT_OK\n";

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
for (const key of [
  "evidence",
  "campaign-db",
  "observations",
  "runtime-root",
  "expected-artifact",
  "output",
  "pilot-version"
]) {
  if (typeof args[key] !== "string" || args[key].trim().length === 0) {
    throw new Error(`Missing required --${key} argument.`);
  }
}

const evidencePath = resolve(args.evidence);
const campaignDatabasePath = resolve(args["campaign-db"]);
const observationsPath = resolve(args.observations);
const runtimeRoot = resolve(args["runtime-root"]);
const expectedArtifactPath = resolve(args["expected-artifact"]);
const outputPath = resolve(args.output);
const pilotVersion = args["pilot-version"];
if (!/^[1-9][0-9]*$/.test(pilotVersion)) {
  throw new Error("--pilot-version must be a positive integer string.");
}

for (const path of [
  evidencePath,
  campaignDatabasePath,
  observationsPath,
  runtimeRoot,
  expectedArtifactPath
]) {
  if (!existsSync(path)) {
    throw new Error(`Required pilot validation input does not exist: ${path}`);
  }
}

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const assert = (condition, code, message) => {
  if (!condition) fail(code, message);
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));

const evidence = readJson(evidencePath);
const observations = readJson(observationsPath);
assert(Array.isArray(observations), "PILOT_OBSERVATIONS_INVALID", "Observations must be a JSON array.");

const expectedPilotId = `s8-openclaw-pilot-v${pilotVersion}`;
const expectedNodeId = `s8-pilot-node-v${pilotVersion}`;
const expectedArtifactSha256 = sha256File(expectedArtifactPath);

assert(
  evidence.evidence_type === `real_openclaw_matched_block_pilot_v${pilotVersion}`,
  "PILOT_EVIDENCE_VERSION_MISMATCH",
  "Pilot evidence type does not match the requested protocol stratum."
);
assert(
  evidence.artifact?.sha256 === expectedArtifactSha256 &&
    evidence.artifact?.size === statSync(expectedArtifactPath).size,
  "PILOT_ARTIFACT_MISMATCH",
  "Pilot artifact identity differs from the independently supplied artifact."
);
assert(evidence.support_claim_allowed === false, "PILOT_SUPPORT_BOUNDARY_INVALID", "Pilot must not enable support claims.");
assert(evidence.production_learning_ready === false, "PILOT_SUPPORT_BOUNDARY_INVALID", "Pilot must not claim production learning readiness.");
assert(evidence.harness_result?.status === "completed", "PILOT_HARNESS_INCOMPLETE", "Pilot harness did not complete.");
assert(evidence.block_disposition?.disposition === "complete", "PILOT_BLOCK_INCOMPLETE", "Pilot block is not complete.");

const campaignId = evidence.campaign?.campaign_id;
const blockId = evidence.campaign?.block_id;
assert(campaignId === `${expectedPilotId}-campaign`, "PILOT_CAMPAIGN_ID_MISMATCH", "Unexpected campaign id.");
assert(blockId === `${expectedPilotId}-block`, "PILOT_BLOCK_ID_MISMATCH", "Unexpected block id.");
assert(
  canonicalJson(sorted(evidence.campaign?.planned_arm_order ?? [])) === canonicalJson(sorted(MATCHED_BLOCK_ARMS)),
  "PILOT_ARM_SET_INVALID",
  "Pilot did not seal exactly the required three arms."
);

const store = new MatchedBlockBenchmarkStore(campaignDatabasePath);
let block;
let scenario;
let attempts;
let disposition;
let persistedDecision;
let preflightRecords;
try {
  store.assertOwnsOnlyBenchmarkTables();
  const blocks = store.listBlockManifests(campaignId);
  assert(blocks.length === 1, "PILOT_BLOCK_COUNT_INVALID", "Pilot campaign must contain one sealed block.");
  [block] = blocks;
  assert(block.block_id === blockId, "PILOT_BLOCK_REFERENCE_MISMATCH", "Stored block differs from evidence.");
  scenario = store.getScenarioManifest(block.scenario_id, block.scenario_version);
  assert(Boolean(scenario), "PILOT_SCENARIO_MISSING", "Stored scenario manifest is missing.");
  const plans = store.listArmPlans(blockId);
  assert(plans.length === 3, "PILOT_ARM_PLAN_INVALID", "Pilot must retain three arm plans.");
  preflightRecords = MATCHED_BLOCK_ARMS.flatMap((arm) => store.listPreflightRecords(blockId, arm));
  assert(preflightRecords.length === 15, "PILOT_PREFLIGHT_COUNT_INVALID", "Pilot must retain five preflight stages for every arm.");
  assert(preflightRecords.every((record) => record.status === "passed"), "PILOT_PREFLIGHT_FAILED", "Every pilot preflight record must pass.");
  attempts = store.listFormalAttempts(blockId);
  assert(attempts.length === 3, "PILOT_ATTEMPT_COUNT_INVALID", "Pilot must retain exactly three formal attempts.");
  assert(
    attempts.every((attempt) =>
      attempt.attempt_state_revision === 2 &&
      attempt.execution_status === "completed" &&
      attempt.infrastructure_failure_code === null
    ),
    "PILOT_FORMAL_ATTEMPT_INVALID",
    "Every pilot formal attempt must be a completed revision-two record without infrastructure failure."
  );
  disposition = store.getBlockDisposition(blockId);
  assert(disposition?.disposition === "complete", "PILOT_DISPOSITION_INVALID", "Stored block disposition is not complete.");
  persistedDecision = store.getPublicationDecision(campaignId);
  assert(Boolean(persistedDecision), "PILOT_PUBLICATION_DECISION_MISSING", "Persisted publication decision is missing.");
} finally {
  store.close();
}

const observationsByArm = new Map(observations.map((observation) => [observation.arm, observation]));
assert(observationsByArm.size === 3, "PILOT_OBSERVATION_ARM_SET_INVALID", "Pilot must contain one observation per arm.");
for (const arm of MATCHED_BLOCK_ARMS) {
  assert(observationsByArm.has(arm), "PILOT_OBSERVATION_MISSING", `Pilot observation is missing for ${arm}.`);
}

const treatmentObservation = observationsByArm.get("treatment");
const holdoutObservation = observationsByArm.get("forced_holdout");
const noEeObservation = observationsByArm.get("no_ee");
assert(
  treatmentObservation.decision === "inject" && treatmentObservation.delivered_intervention_count === 1,
  "PILOT_TREATMENT_DELIVERY_INVALID",
  "Treatment must record one real delivered injection."
);
assert(
  holdoutObservation.decision === "inject" && holdoutObservation.delivered_intervention_count === 0,
  "PILOT_HOLDOUT_SUPPRESSION_INVALID",
  "Forced holdout must preserve the inject decision while suppressing delivery."
);
assert(
  noEeObservation.decision === "skip" && noEeObservation.delivered_intervention_count === 0,
  "PILOT_NO_EE_OBSERVATION_INVALID",
  "No-EE must contain no ExperienceEngine decision or delivery."
);

const attemptsByArm = new Map(attempts.map((attempt) => [attempt.arm, attempt]));
const armEvidence = {};
for (const arm of MATCHED_BLOCK_ARMS) {
  const armRoot = join(runtimeRoot, arm);
  const stateDir = join(armRoot, "openclaw-state");
  const workspace = join(armRoot, "workspace");
  const artifactRoot = join(armRoot, "artifacts");
  const eeDatabasePath = join(armRoot, "ee-home", "sqlite", "experienceengine.db");
  const formalTaskPath = join(artifactRoot, "formal-task.txt");
  const resultPath = join(workspace, "result.txt");
  const configPath = join(stateDir, "openclaw.json");

  for (const path of [armRoot, stateDir, workspace, artifactRoot, formalTaskPath, configPath]) {
    assert(existsSync(path), "PILOT_ARM_ARTIFACT_MISSING", `Required ${arm} artifact is missing: ${basename(path)}.`);
  }

  const attempt = attemptsByArm.get(arm);
  assert(Boolean(attempt), "PILOT_ATTEMPT_MISSING", `Formal attempt is missing for ${arm}.`);
  const releaseDeltaMs = statSync(formalTaskPath).mtimeMs - new Date(attempt.started_at).getTime();
  assert(releaseDeltaMs >= 0, "PILOT_FORMAL_BOUNDARY_INVALID", `Task input for ${arm} predates formal attempt insertion.`);
  assert(
    sha256Text(readFileSync(formalTaskPath, "utf8")) === scenario.task_input_digest,
    "PILOT_TASK_INPUT_DIGEST_MISMATCH",
    `Released task input differs from the sealed scenario for ${arm}.`
  );

  const config = readJson(configPath);
  const pluginEntry = config.plugins?.entries?.experienceengine;
  const extensionPath = join(stateDir, "extensions", "experienceengine");
  const observation = observationsByArm.get(arm);
  const actualTaskSuccess = existsSync(resultPath) && readFileSync(resultPath).equals(Buffer.from(TASK_CONTENT));
  assert(
    observation.task_success === Number(actualTaskSuccess),
    "PILOT_TASK_OUTCOME_MISMATCH",
    `Observed task outcome differs from the workspace artifact for ${arm}.`
  );

  if (arm === "no_ee") {
    assert(!pluginEntry?.enabled, "PILOT_NO_EE_CONTAMINATED", "No-EE config enabled ExperienceEngine.");
    assert(!existsSync(extensionPath), "PILOT_NO_EE_CONTAMINATED", "No-EE state contains an ExperienceEngine extension.");
    assert(!existsSync(eeDatabasePath), "PILOT_NO_EE_CONTAMINATED", "No-EE state contains an ExperienceEngine database.");
    armEvidence[arm] = {
      plugin_present: false,
      ee_database_present: false,
      decision: observation.decision,
      delivered: observation.delivered_intervention_count,
      task_success: observation.task_success,
      formal_release_after_start_ms: releaseDeltaMs
    };
    continue;
  }

  assert(pluginEntry?.enabled === true, "PILOT_EE_PLUGIN_MISSING", `${arm} config did not enable ExperienceEngine.`);
  assert(existsSync(extensionPath), "PILOT_EE_PLUGIN_MISSING", `${arm} state is missing the installed ExperienceEngine extension.`);
  assert(existsSync(eeDatabasePath), "PILOT_EE_DATABASE_MISSING", `${arm} state is missing the ExperienceEngine database.`);

  const db = new DatabaseSync(eeDatabasePath, { readOnly: true });
  let injection;
  try {
    const rows = db.prepare(
      `SELECT session_id, scope_id, mode, delivery_mode, delivered,
              injected_node_ids_json, injection_count
       FROM injection_events
       ORDER BY created_at DESC, injection_id DESC`
    ).all();
    assert(rows.length === 1, "PILOT_INJECTION_COUNT_INVALID", `${arm} must contain exactly one formal injection event.`);
    [injection] = rows;
  } finally {
    db.close();
  }
  const injectedNodeIds = JSON.parse(injection.injected_node_ids_json);
  assert(
    typeof injection.session_id === "string" && injection.session_id.endsWith(`s8-pilot-${arm}-session`),
    "PILOT_SESSION_BINDING_INVALID",
    `${arm} injection event is not bound to the sealed OpenClaw session.`
  );
  assert(
    canonicalJson(injectedNodeIds) === canonicalJson([expectedNodeId]),
    "PILOT_NODE_BINDING_INVALID",
    `${arm} injection event differs from the sealed candidate corpus.`
  );
  if (arm === "treatment") {
    assert(
      injection.mode === "inject" && injection.delivery_mode === "live" && Number(injection.delivered) === 1,
      "PILOT_TREATMENT_DELIVERY_INVALID",
      "Treatment persisted injection evidence is not a live delivery."
    );
  } else {
    assert(
      injection.mode === "inject" && injection.delivery_mode === "holdout" && Number(injection.delivered) === 0,
      "PILOT_HOLDOUT_SUPPRESSION_INVALID",
      "Forced holdout persisted evidence did not suppress the inject decision."
    );
  }
  armEvidence[arm] = {
    plugin_present: true,
    ee_database_present: true,
    decision: injection.mode,
    delivery_mode: injection.delivery_mode,
    delivered: Number(injection.delivered),
    injected_node_ids: injectedNodeIds,
    task_success: observation.task_success,
    formal_release_after_start_ms: releaseDeltaMs
  };
}

const recomputedOutputDir = join(dirname(outputPath), "recomputed-report");
const recomputed = runMatchedBlockCampaignReport({
  campaignDatabasePath,
  campaignId,
  observationsPath,
  outputDir: recomputedOutputDir,
  negativeResultDisclosureIncluded: true,
  persistDecision: false,
  now: () => evidence.campaign_report.generated_at
});
assert(
  canonicalJson(recomputed.report.result.campaign_scorecard) ===
    canonicalJson(evidence.campaign_report.result.campaign_scorecard),
  "PILOT_SCORECARD_RECOMPUTATION_MISMATCH",
  "Independent scorecard recomputation differs from the retained pilot evidence."
);
const { created_at: _originalCreatedAt, ...originalDecisionCore } =
  evidence.campaign_report.result.publication_decision;
const { created_at: _recomputedCreatedAt, ...recomputedDecisionCore } =
  recomputed.report.result.publication_decision;
assert(
  canonicalJson(recomputedDecisionCore) === canonicalJson(originalDecisionCore),
  "PILOT_DECISION_RECOMPUTATION_MISMATCH",
  "Independent publication-decision recomputation differs from retained pilot evidence."
);
assert(
  canonicalJson(persistedDecision) === canonicalJson(evidence.campaign_report.result.publication_decision),
  "PILOT_PERSISTED_DECISION_MISMATCH",
  "Persisted publication decision differs from the evidence report."
);

const campaignScorecard = evidence.campaign_report.result.campaign_scorecard;
const publicationDecision = evidence.campaign_report.result.publication_decision;
assert(campaignScorecard.complete_block_coverage === 1, "PILOT_COVERAGE_INVALID", "Pilot complete-block coverage must equal 1.");
assert(campaignScorecard.infrastructure_reliability === 1, "PILOT_RELIABILITY_INVALID", "Pilot infrastructure reliability must equal 1.");
assert(publicationDecision.decision === "not_publishable", "PILOT_PUBLICATION_BOUNDARY_INVALID", "Single-block pilot must remain not publishable.");
assert(
  publicationDecision.threshold_results.minimum_repetitions_per_scenario === false,
  "PILOT_PUBLICATION_BOUNDARY_INVALID",
  "Single-block pilot must fail the sealed minimum repetition threshold."
);

const acceptance = {
  status: "accepted_real_openclaw_matched_block_pilot",
  evidence_type: evidence.evidence_type,
  artifact: {
    path_name: basename(expectedArtifactPath),
    sha256: expectedArtifactSha256,
    size: statSync(expectedArtifactPath).size
  },
  campaign: {
    campaign_id: campaignId,
    block_id: blockId,
    planned_arm_order: evidence.campaign.planned_arm_order,
    preflight_passed: preflightRecords.length,
    formal_attempts_completed: attempts.length,
    disposition: disposition.disposition
  },
  arms: armEvidence,
  scorecard: {
    evidence_digest: campaignScorecard.evidence_digest,
    complete_block_coverage: campaignScorecard.complete_block_coverage,
    infrastructure_reliability: campaignScorecard.infrastructure_reliability,
    delivery_rate: campaignScorecard.scorecard.delivery_rate,
    task_success_delta: campaignScorecard.scorecard.task_success_delta,
    repeated_old_mistake_avoidance_delta:
      campaignScorecard.scorecard.repeated_old_mistake_avoidance_delta
  },
  publication: {
    decision: publicationDecision.decision,
    threshold_results: publicationDecision.threshold_results,
    minimum_repetitions_satisfied: false
  },
  deterministic_recomputation_match: true,
  diagnostic_single_arm_reused: false,
  support_claim_allowed: false,
  production_learning_ready: false,
  runtime_root_name: basename(runtimeRoot),
  generated_at: new Date().toISOString()
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(acceptance, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  status: acceptance.status,
  output: outputPath,
  decision: acceptance.publication.decision,
  treatment_delivered: acceptance.arms.treatment.delivered,
  forced_holdout_delivered: acceptance.arms.forced_holdout.delivered,
  no_ee_plugin_present: acceptance.arms.no_ee.plugin_present,
  deterministic_recomputation_match: acceptance.deterministic_recomputation_match,
  support_claim_allowed: acceptance.support_claim_allowed
}, null, 2)}\n`);
