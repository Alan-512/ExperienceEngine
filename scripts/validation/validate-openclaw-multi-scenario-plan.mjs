import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  assertOpenClawMultiScenarioCampaignPlan
} from "../../dist/evaluation/matched-block/openclaw-multi-scenario-plan.js";

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
if (typeof args.plan !== "string" || args.plan.trim().length === 0) {
  throw new Error("Missing required --plan argument.");
}
const planPath = resolve(args.plan);
if (!existsSync(planPath)) {
  throw new Error(`Plan file does not exist: ${planPath}`);
}
const plan = assertOpenClawMultiScenarioCampaignPlan(
  JSON.parse(readFileSync(planPath, "utf8"))
);

process.stdout.write(`${JSON.stringify({
  status: "plan_validated",
  plan_file_name: basename(planPath),
  campaign_id: plan.campaign_manifest.benchmark_campaign_id,
  scenario_kinds: plan.scenarios.map((scenario) => scenario.adapter.scenario_kind),
  repetitions_per_scenario: plan.repetitions_per_scenario,
  planned_block_count: plan.scenarios.reduce((total, scenario) => total + scenario.blocks.length, 0),
  plan_digest: plan.plan_digest,
  formal_execution_started: false,
  support_claim_allowed: plan.claim_boundary.support_claim_allowed,
  production_learning_ready: plan.claim_boundary.production_learning_ready
}, null, 2)}\n`);
