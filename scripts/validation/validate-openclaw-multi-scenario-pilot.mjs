import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  canonicalJson
} from "../../dist/runtime/package/package-generation.js";
import {
  assertOpenClawMultiScenarioCampaignPlan
} from "../../dist/evaluation/matched-block/openclaw-multi-scenario-plan.js";
import {
  validateOpenClawScenarioArmEvidence
} from "../../dist/evaluation/matched-block/openclaw-scenario-adapter.js";
import {
  assertBenchmarkArmScoringObservationV2
} from "../../dist/evaluation/matched-block/scoring.js";
import {
  MatchedBlockBenchmarkStore
} from "../../dist/evaluation/matched-block/store.js";
import {
  runMatchedBlockCampaignReport
} from "../../dist/evaluation/matched-block/campaign-report.js";
import {
  digest,
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
for (const key of [
  "plan",
  "evidence",
  "database",
  "observations",
  "artifact",
  "runtime-root",
  "output-dir"
]) {
  if (typeof args[key] !== "string" || args[key].trim().length === 0) {
    throw new Error(`Missing required --${key} argument.`);
  }
}
const planPath = resolve(args.plan);
const evidencePath = resolve(args.evidence);
const databasePath = resolve(args.database);
const observationsPath = resolve(args.observations);
const artifactPath = resolve(args.artifact);
const outputDir = resolve(args["output-dir"]);
const runtimeRoot = resolve(args["runtime-root"]);
for (const path of [
  planPath,
  evidencePath,
  databasePath,
  observationsPath,
  artifactPath,
  runtimeRoot
]) {
  if (!existsSync(path)) throw new Error(`Required validation input does not exist: ${path}`);
}
if (existsSync(outputDir)) {
  throw new Error(`Validation output directory already exists: ${outputDir}`);
}

const plan = assertOpenClawMultiScenarioCampaignPlan(
  JSON.parse(readFileSync(planPath, "utf8"))
);
if (
  basename(artifactPath) !== plan.artifact.file_name ||
  statSync(artifactPath).size !== plan.artifact.size_bytes ||
  sha256File(artifactPath) !== plan.artifact.sha256
) {
  throw new Error("Validation artifact differs from the sealed campaign plan.");
}
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
if (
  evidence.evidence_type !== "real_openclaw_multi_scenario_directional_pilot_v1" ||
  evidence.plan_digest !== plan.plan_digest ||
  evidence.support_claim_allowed !== false ||
  evidence.production_learning_ready !== false ||
  evidence.exact_limitations?.general_efficacy_claim_allowed !== false
) {
  throw new Error("Evidence identity or fail-closed claim boundary is invalid.");
}

const observationsValue = JSON.parse(readFileSync(observationsPath, "utf8"));
if (!Array.isArray(observationsValue)) {
  throw new Error("Observations file must contain an array.");
}
const observations = observationsValue.map(assertBenchmarkArmScoringObservationV2);
if (evidence.observations_digest !== digest(observations)) {
  throw new Error("Evidence observations digest does not match the observations file.");
}

const adaptersByScenarioId = new Map(plan.scenarios.map((scenario) => [
  scenario.adapter.scenario_id,
  scenario.adapter
]));
const plannedBlocks = plan.scenarios.flatMap((scenario) => scenario.blocks);
const expectedArmEvidenceCount = plannedBlocks.length * 3;
const expectedArmEvidenceKeys = new Set(plannedBlocks.flatMap((block) =>
  ["treatment", "forced_holdout", "no_ee"].map((arm) => `${block.block_id}:${arm}`)
));
if (!Array.isArray(evidence.arm_evidence_index) ||
  evidence.arm_evidence_index.length !== expectedArmEvidenceCount) {
  throw new Error("Evidence index does not contain exactly one record per planned arm.");
}

const observationByKey = new Map(observations.map((observation) => [
  `${observation.block_id}:${observation.arm}`,
  observation
]));
if (observationByKey.size !== expectedArmEvidenceCount) {
  throw new Error("Observation set is incomplete or contains duplicate block/arm identities.");
}

const evidenceRoot = dirname(evidencePath);
const validatedArmEvidence = [];
const armEvidenceByKey = new Map();
for (const indexEntry of evidence.arm_evidence_index) {
  if (typeof indexEntry.evidence_file !== "string" ||
    indexEntry.evidence_file.includes("..") ||
    indexEntry.evidence_file.startsWith("/") ||
    /^[A-Za-z]:/.test(indexEntry.evidence_file)) {
    throw new Error("Arm evidence index contains an unsafe path.");
  }
  const armEvidencePath = resolve(evidenceRoot, indexEntry.evidence_file);
  if (relative(evidenceRoot, armEvidencePath).startsWith("..") || !existsSync(armEvidencePath)) {
    throw new Error("Arm evidence file escapes the campaign evidence root or is missing.");
  }
  const armEvidence = JSON.parse(readFileSync(armEvidencePath, "utf8"));
  const adapter = adaptersByScenarioId.get(armEvidence.scenario_id);
  if (!adapter) throw new Error("Arm evidence references an undeclared scenario.");
  const validation = validateOpenClawScenarioArmEvidence(adapter, armEvidence);
  const evidenceKey = `${armEvidence.block_id}:${armEvidence.arm}`;
  if (!expectedArmEvidenceKeys.has(evidenceKey) || armEvidenceByKey.has(evidenceKey)) {
    throw new Error("Arm evidence index contains an unplanned or duplicate block/arm identity.");
  }
  const observation = observationByKey.get(`${armEvidence.block_id}:${armEvidence.arm}`);
  if (!observation || canonicalJson(observation) !== canonicalJson(armEvidence.observation)) {
    throw new Error("Arm evidence observation does not match the campaign observations file.");
  }
  if (
    indexEntry.block_id !== armEvidence.block_id ||
    indexEntry.scenario_id !== armEvidence.scenario_id ||
    indexEntry.scenario_kind !== adapter.scenario_kind ||
    indexEntry.arm !== armEvidence.arm ||
    indexEntry.evidence_digest !== armEvidence.evidence_digest
  ) {
    throw new Error("Arm evidence index identity or digest is invalid.");
  }
  validatedArmEvidence.push({
    ...validation,
    evidence_file: indexEntry.evidence_file
  });
  armEvidenceByKey.set(evidenceKey, armEvidence);
}
if (armEvidenceByKey.size !== expectedArmEvidenceKeys.size) {
  throw new Error("Arm evidence index does not cover the exact sealed block/arm set.");
}

const store = new MatchedBlockBenchmarkStore(databasePath);
let persistedPublicationDecision;
try {
  const campaign = store.getCampaignManifest(plan.campaign_manifest.benchmark_campaign_id);
  if (!campaign || canonicalJson(campaign) !== canonicalJson(plan.campaign_manifest)) {
    throw new Error("Campaign database manifest differs from the sealed plan.");
  }
  const blocks = store.listBlockManifests(campaign.benchmark_campaign_id);
  if (blocks.length !== plannedBlocks.length) {
    throw new Error("Campaign database block count differs from the sealed plan.");
  }
  for (const plannedBlock of plannedBlocks) {
    const block = store.getBlockManifest(plannedBlock.block_id);
    if (!block || block.manifest_digest !== evidence.campaign.blocks.find(
      (entry) => entry.block_id === plannedBlock.block_id
    )?.manifest_digest) {
      throw new Error(`Block ${plannedBlock.block_id} is missing or digest-mismatched.`);
    }
    const armPlans = store.listArmPlans(plannedBlock.block_id);
    if (canonicalJson(armPlans.map((entry) => entry.arm)) !==
      canonicalJson(plannedBlock.planned_arm_order)) {
      throw new Error(`Block ${plannedBlock.block_id} arm order differs from the sealed plan.`);
    }
    for (const arm of plannedBlock.planned_arm_order) {
      const attempt = store.getFormalAttempt(plannedBlock.block_id, arm);
      if (!attempt || attempt.execution_status !== "completed") {
        throw new Error(`Block ${plannedBlock.block_id}/${arm} lacks one completed formal attempt.`);
      }
    }
    const disposition = store.getBlockDisposition(plannedBlock.block_id);
    if (!disposition || disposition.disposition !== "included_complete") {
      throw new Error(`Block ${plannedBlock.block_id} lacks an included-complete disposition.`);
    }
  }
  persistedPublicationDecision = store.getPublicationDecision(campaign.benchmark_campaign_id);
  if (!persistedPublicationDecision) {
    throw new Error("Campaign database lacks a persisted publication decision.");
  }
} finally {
  store.close();
}

mkdirSync(outputDir, { recursive: false });
const recomputed = runMatchedBlockCampaignReport({
  campaignDatabasePath: databasePath,
  campaignId: plan.campaign_manifest.benchmark_campaign_id,
  observationsPath,
  outputDir: join(outputDir, "recomputed-report"),
  negativeResultDisclosureIncluded: true,
  persistDecision: false,
  now: () => persistedPublicationDecision.created_at
});
if (
  recomputed.report.result.campaign_scorecard.evidence_digest !==
    evidence.campaign_report.result.campaign_scorecard.evidence_digest ||
  canonicalJson(recomputed.report.result.publication_decision) !==
    canonicalJson(persistedPublicationDecision) ||
  persistedPublicationDecision.decision !== "not_publishable"
) {
  throw new Error("Independent scorecard or publication-decision recomputation differs.");
}

const runtimeChecks = [];
for (const plannedBlock of plannedBlocks) {
  const scenario = plan.scenarios.find((entry) =>
    entry.adapter.scenario_id === plannedBlock.scenario_id
  );
  for (const arm of ["treatment", "forced_holdout", "no_ee"]) {
      const sqlitePath = join(
        runtimeRoot,
        plannedBlock.block_id,
        arm,
        "ee-home",
        "sqlite",
        "experienceengine.db"
      );
      if (arm === "no_ee") {
        if (existsSync(sqlitePath)) {
          throw new Error(`No-EE arm unexpectedly contains an EE database for ${plannedBlock.block_id}.`);
        }
        runtimeChecks.push({ block_id: plannedBlock.block_id, arm, ee_database_present: false });
        continue;
      }
      if (!existsSync(sqlitePath)) {
        throw new Error(`EE arm database is missing for ${plannedBlock.block_id}/${arm}.`);
      }
      const check = {
        block_id: plannedBlock.block_id,
        arm,
        ee_database_present: true,
        harm_governance_verified: false
      };
      if (scenario.adapter.scenario_kind === "harm_recovery" && arm === "treatment") {
        const nodeId = scenario.adapter.candidate_corpus[0].node_id;
        const armEvidence = armEvidenceByKey.get(`${plannedBlock.block_id}:${arm}`);
        const exposure = armEvidence?.observation.decision_opportunities.find((entry) =>
          entry.opportunity_id === "harm-exposure"
        );
        if (!exposure?.governance_transition || !exposure.authoritative_harm_evidence_id) {
          throw new Error("Treatment harm evidence lacks attribution or transition identity binding.");
        }
        const db = new DatabaseSync(sqlitePath, { readOnly: true });
        try {
          const node = db.prepare(
            `SELECT state, delivery_state, harmed_count, consecutive_harmed_count
             FROM experience_nodes WHERE id = ? LIMIT 1`
          ).get(nodeId);
          const attribution = db.prepare(
            `SELECT id, injection_id, delivered, attribution_verdict, confidence,
                    user_override, source, attribution_reason
             FROM attribution_records WHERE node_id = ? ORDER BY created_at DESC LIMIT 1`
          ).get(nodeId);
          const review = db.prepare(
            `SELECT id, event_type, source FROM review_events
             WHERE node_id = ? ORDER BY created_at DESC LIMIT 1`
          ).get(nodeId);
          if (
            !node || node.delivery_state !== "quarantined" || node.harmed_count < 1 ||
            node.consecutive_harmed_count < 1 ||
            exposure.governance_transition.node_id !== nodeId ||
            exposure.governance_transition.after_delivery_state !== node.delivery_state ||
            !attribution || attribution.delivered !== 1 ||
            attribution.id !== exposure.authoritative_harm_evidence_id ||
            attribution.attribution_verdict !== "strong_harmed" ||
            attribution.confidence !== "high" || attribution.user_override !== "harmed" ||
            attribution.source !== "manual_override" ||
            attribution.attribution_reason !== "manual_override" ||
            !review || review.id !== exposure.governance_transition.transition_evidence_id ||
            review.event_type !== "mark_harmed" || review.source !== "user"
          ) {
            throw new Error("Treatment harm runtime database lacks production-governed recovery evidence.");
          }
          check.harm_governance_verified = true;
        } finally {
          db.close();
        }
      }
      runtimeChecks.push(check);
  }
}

const validationRecord = {
  validation_type: "openclaw_multi_scenario_independent_validation_v1",
  plan_file_name: basename(planPath),
  plan_digest: plan.plan_digest,
  evidence_file_name: basename(evidencePath),
  campaign_database_name: basename(databasePath),
  campaign_id: plan.campaign_manifest.benchmark_campaign_id,
  scenario_kinds: plan.scenarios.map((scenario) => scenario.adapter.scenario_kind),
  planned_block_count: plannedBlocks.length,
  validated_arm_evidence_count: validatedArmEvidence.length,
  publication_decision: persistedPublicationDecision.decision,
  scorecard_evidence_digest: recomputed.report.result.campaign_scorecard.evidence_digest,
  runtime_checks: runtimeChecks,
  support_claim_allowed: false,
  production_learning_ready: false,
  runtime_cleaned: false,
  generated_at: new Date().toISOString()
};

if (args["cleanup-runtime"] === true) {
  const campaignRoot = dirname(planPath);
  const relativeRuntime = relative(campaignRoot, runtimeRoot);
  if (relativeRuntime.startsWith("..") || relativeRuntime === "" || basename(runtimeRoot) !== "runtime") {
    throw new Error("Refusing to clean a runtime directory outside the campaign output root.");
  }
  rmSync(runtimeRoot, { recursive: true, force: true });
  validationRecord.runtime_cleaned = true;
}

validationRecord.validation_digest = digest(validationRecord);
writeJson(join(outputDir, "validation.json"), validationRecord, 0o600);
process.stdout.write(`${JSON.stringify({
  status: "multi_scenario_pilot_validated",
  campaign_id: validationRecord.campaign_id,
  planned_block_count: validationRecord.planned_block_count,
  validated_arm_evidence_count: validationRecord.validated_arm_evidence_count,
  publication_decision: validationRecord.publication_decision,
  scorecard_evidence_digest: validationRecord.scorecard_evidence_digest,
  runtime_cleaned: validationRecord.runtime_cleaned,
  support_claim_allowed: false,
  production_learning_ready: false,
  validation_digest: validationRecord.validation_digest
}, null, 2)}\n`);
