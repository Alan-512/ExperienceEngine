import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, join } from "node:path";
import {
  canonicalJson,
  sha256Text
} from "../../../dist/runtime/package/package-generation.js";
import {
  computeBenchmarkRecordDigest
} from "../../../dist/evaluation/matched-block/contract.js";
import {
  computeMatchedBlockExecutionContractDigest,
  executeSealedMatchedBlock,
  MatchedBlockHarnessInfrastructureError
} from "../../../dist/evaluation/matched-block/harness.js";
import {
  appendMatchedBlockDisposition
} from "../../../dist/evaluation/matched-block/failure-protocol.js";
import {
  runMatchedBlockCampaignReport
} from "../../../dist/evaluation/matched-block/campaign-report.js";
import {
  MatchedBlockBenchmarkStore
} from "../../../dist/evaluation/matched-block/store.js";
import {
  validateOpenClawScenarioArmEvidence
} from "../../../dist/evaluation/matched-block/openclaw-scenario-adapter.js";
import { loadConfig } from "../../../dist/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../../dist/store/sqlite/db.js";
import { ScopeRepository } from "../../../dist/store/sqlite/repositories/scope-repo.js";
import { NodeRepository } from "../../../dist/store/sqlite/repositories/node-repo.js";
import { InjectionRepository } from "../../../dist/store/sqlite/repositories/injection-repo.js";
import { resolveScope } from "../../../dist/input/scope-resolver.js";
import {
  createOpenClawArmEnv,
  createOpenClawArmRuntimeSet,
  digest,
  findProjectMarkerAncestor,
  parseOpenClawAgentJson,
  patchOpenClawArmConfig,
  prepareOpenClawHostTemplate,
  runOpenClawCommand,
  sha256File,
  writeJson
} from "./openclaw-matched-block-host.mjs";

const INJECT_CONTENT = "MULTI_SCENARIO_INJECT_OK\n";
const CORRECT_SKIP_PACKAGE_NAME = "experienceengine-multi-scenario-fixture";
const AUTH_FIXTURE_CONTENT = `${JSON.stringify({ auth: "sealed-fixture-v1" }, null, 2)}\n`;
const FOCUSED_AUTH_TEST = [
  'import { existsSync, writeFileSync } from "node:fs";',
  'const passed = existsSync(new URL("./auth-fixture.json", import.meta.url));',
  'writeFileSync(new URL("./focused-auth-test-result.txt", import.meta.url), passed ? "PASS\\n" : "FAIL\\n");',
  'if (!passed) process.exitCode = 1;',
  ""
].join("\n");

const withDigest = (value, field) => {
  const next = { ...value };
  next[field] = computeBenchmarkRecordDigest(next, field);
  return next;
};

const unique = (values) => [...new Set(values.filter((value) =>
  typeof value === "string" && value.length > 0
))];

const decisionFromInjection = (injection) => {
  if (!injection || injection.mode === "skip") return "skip";
  return injection.mode === "inject_conservative" ? "conservative" : "inject";
};

const extractUsage = (agentJson) => {
  const usage = agentJson?.meta?.usage ?? agentJson?.usage ?? null;
  return {
    totalTokens: typeof usage?.totalTokens === "number"
      ? usage.totalTokens
      : typeof usage?.total_tokens === "number"
        ? usage.total_tokens
        : null,
    toolCalls: Array.isArray(agentJson?.meta?.toolCalls)
      ? agentJson.meta.toolCalls.length
      : Array.isArray(agentJson?.toolCalls)
        ? agentJson.toolCalls.length
        : 0
  };
};

const readSessionInjection = ({ runtime, arm, env }) => {
  if (arm === "no_ee") return null;
  const sqlitePath = join(runtime.eeHome, "sqlite", "experienceengine.db");
  if (!existsSync(sqlitePath)) return null;
  const config = loadConfig({
    dataDir: runtime.eeHome,
    sqlitePath,
    captureDir: join(runtime.eeHome, "captures"),
    embeddingProvider: "legacy"
  }, { env });
  const db = openDatabase(config);
  try {
    const injection = new InjectionRepository(db).getLatest() ?? null;
    if (injection && (!injection.session_id || !injection.session_id.endsWith(runtime.currentSessionId))) {
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

const decisionEvidence = ({ injection, arm }) => {
  if (arm === "no_ee") {
    return {
      decision: "skip",
      wouldHaveDelivered: null,
      delivered: false,
      consideredIds: [],
      selectedIds: [],
      rejectedIds: [],
      skipReasonCode: null
    };
  }
  const scorecard = injection?.scorecard ?? {};
  const recordOnlyIds = scorecard.recordOnlyDiagnosticCandidateIds ?? [];
  const rejectedIds = unique([
    ...(scorecard.rejectedCandidates ?? []).map((candidate) => candidate.id),
    ...recordOnlyIds
  ]);
  const selectedIds = unique([
    ...(scorecard.selectedCandidateIds ?? []),
    ...(injection?.injected_node_ids ?? [])
  ]);
  const consideredIds = unique([
    ...(scorecard.topCandidates ?? []).map((candidate) => candidate.id),
    ...scorecard.nodes?.map((node) => node.id) ?? [],
    ...recordOnlyIds,
    ...rejectedIds,
    ...selectedIds
  ]);
  return {
    decision: decisionFromInjection(injection),
    wouldHaveDelivered: injection ? injection.mode !== "skip" : false,
    delivered: Boolean(injection?.delivered),
    consideredIds,
    selectedIds,
    rejectedIds,
    skipReasonCode: scorecard.skipReasonCode ?? null
  };
};

const buildOpportunityObservation = (options) => withDigest({
  opportunity_id: options.opportunityId,
  ordinal: options.ordinal,
  decision: options.decision.decision,
  would_have_delivered: options.decision.wouldHaveDelivered,
  delivered_intervention_count: options.decision.delivered ? 1 : 0,
  helped_intervention_count: options.helped ? 1 : 0,
  harmed_intervention_count: options.harmed ? 1 : 0,
  uncertain_intervention_count: options.uncertain ? 1 : 0,
  considered_candidate_ids: options.decision.consideredIds,
  selected_candidate_ids: options.decision.selectedIds,
  rejected_candidate_ids: options.decision.rejectedIds,
  governance_excluded_node_ids: options.governanceExcludedNodeIds ?? [],
  skip_reason_code: options.decision.skipReasonCode,
  task_success: options.taskSuccess ? 1 : 0,
  skipped_guidance_required: options.skippedGuidanceRequired,
  authoritative_harm_evidence_id: options.authoritativeHarmEvidenceId ?? null,
  governance_transition: options.governanceTransition ?? null,
  evidence_digest: ""
}, "evidence_digest");

const buildArmObservation = (options) => {
  const last = options.opportunities.at(-1);
  const sum = (field) => options.opportunities.reduce((total, entry) => total + entry[field], 0);
  return withDigest({
    observation_schema_version: "benchmark-arm-scoring-observation-v2",
    block_id: options.blockId,
    arm: options.arm,
    decision: last.decision,
    decision_opportunity_count: options.opportunities.length,
    delivered_intervention_count: sum("delivered_intervention_count"),
    helped_intervention_count: sum("helped_intervention_count"),
    harmed_intervention_count: sum("harmed_intervention_count"),
    uncertain_intervention_count: sum("uncertain_intervention_count"),
    task_success: last.task_success,
    repeated_old_mistake_avoided: last.task_success,
    provider_cost: null,
    total_token_count: options.totalTokens,
    wall_clock_duration_ms: options.durationMs,
    tool_call_count: options.toolCalls,
    decision_opportunities: options.opportunities,
    observation_digest: ""
  }, "observation_digest");
};

const resetTaskFixture = (workspace, scenarioKind) => {
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  if (scenarioKind === "correct_skip") {
    writeFileSync(join(workspace, "package.json"), `${JSON.stringify({
      name: CORRECT_SKIP_PACKAGE_NAME,
      private: true
    }, null, 2)}\n`, "utf8");
  } else if (scenarioKind === "harm_recovery") {
    writeFileSync(join(workspace, "auth-fixture.json"), AUTH_FIXTURE_CONTENT, "utf8");
    writeFileSync(join(workspace, "focused-auth-test.mjs"), FOCUSED_AUTH_TEST, "utf8");
  }
};

const restoreHarmTaskFixtureForRecheck = (workspace) => {
  writeFileSync(join(workspace, "auth-fixture.json"), AUTH_FIXTURE_CONTENT, "utf8");
  rmSync(join(workspace, "focused-auth-test-result.txt"), { force: true });
};

const seedScenarioNode = ({ adapter, runtime, arm, env, createdAt }) => {
  if (arm === "no_ee") {
    return { scope_id: null, seeded_node_ids: [] };
  }
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
    maxHints: 1,
    distillationAllowPassthrough: true
  }, { env });
  const db = openDatabase(config);
  try {
    bootstrapDatabase(db);
    const scope = resolveScope(runtime.workspace);
    new ScopeRepository(db).upsert(scope);
    const nodeRepo = new NodeRepository(db);
    for (const candidate of adapter.candidate_corpus) {
      nodeRepo.upsert({
        id: candidate.node_id,
        node_type: "strategy",
        scope_id: scope.scope_id,
        task_type: candidate.task_type,
        experience_kind: "execution_pattern",
        confidence_signal: "supported_by_objective_success",
        validation_state: "validated_by_reuse",
        trigger_pattern: candidate.trigger_pattern,
        applicability_notes: candidate.applicability_notes,
        compact_hint: candidate.compact_hint,
        goal: `Execute the sealed ${adapter.scenario_kind} benchmark scenario.`,
        recommended_steps: [candidate.compact_hint],
        avoid_steps: [],
        fallback_steps: [],
        success_signal: adapter.opportunities.flatMap(
          (opportunity) => opportunity.deterministic_success_checks
        ).join(", "),
        evidence_summary: "Pre-sealed deterministic Phase 0.5C real-host fixture.",
        retrieval_text: [
          ...adapter.opportunities.map((opportunity) => opportunity.task_input),
          candidate.trigger_pattern,
          candidate.compact_hint
        ].join("\n"),
        source_kind: "explicit",
        distillation_mode_used: "llm",
        distillation_source: "explicit_provider",
        contains_unbenchmarked_origin:
          candidate.record_only_reason === "unbenchmarked_origin" ? true : undefined,
        effective_generation_assurance_floor:
          candidate.record_only_reason === "unbenchmarked_origin" ? "unbenchmarked" : undefined,
        origin_record_ids: [`${adapter.scenario_id}-fixture-record`],
        helped_record_ids: [],
        harmed_record_ids: [],
        state: candidate.state,
        delivery_state: candidate.delivery_state,
        usage_count: candidate.state === "active" ? 3 : 0,
        helped_count: candidate.state === "active" ? 3 : 0,
        harmed_count: 0,
        support_count: candidate.state === "active" ? 3 : 1,
        created_at: createdAt,
        updated_at: createdAt
      });
    }
    const liveNodeIds = nodeRepo.listLiveInjectableByExactScope(scope.scope_id)
      .map((node) => node.id)
      .sort();
    const expectedLive = adapter.candidate_corpus
      .filter((candidate) => candidate.delivery_state !== "shadow_only")
      .map((candidate) => candidate.node_id)
      .sort();
    if (canonicalJson(liveNodeIds) !== canonicalJson(expectedLive)) {
      throw new Error(
        `Seeded live node set differs from the sealed ${adapter.scenario_kind} candidate contract.`
      );
    }
    return { scope_id: scope.scope_id, seeded_node_ids: liveNodeIds };
  } finally {
    db.close();
  }
};

const runAgentOpportunity = (options) => {
  const messagePath = join(options.runtime.artifactRoot, `${options.label}.task.txt`);
  writeFileSync(messagePath, options.taskInput, "utf8");
  options.runtime.currentSessionId = options.sessionId;
  const result = runOpenClawCommand(options.openclawExecutable, [
    "agent",
    "--local",
    "--json",
    "--session-id", options.sessionId,
    "--message-file", messagePath,
    "--model", options.primaryModel,
    "--thinking", "off",
    "--timeout", "600"
  ], {
    cwd: options.runtime.workspace,
    env: options.env,
    timeoutMs: 620_000
  });
  writeFileSync(
    join(options.runtime.artifactRoot, `${options.label}.stdout.jsonl`),
    result.stdout,
    "utf8"
  );
  writeFileSync(
    join(options.runtime.artifactRoot, `${options.label}.stderr.log`),
    result.stderr,
    "utf8"
  );
  const agentJson = parseOpenClawAgentJson(result.stdout);
  return {
    ...result,
    ...extractUsage(agentJson),
    stdoutDigest: sha256Text(result.stdout),
    stderrDigest: sha256Text(result.stderr),
    injection: readSessionInjection({
      runtime: options.runtime,
      arm: options.arm,
      env: options.env
    })
  };
};

const readGovernanceTransition = ({ runtime, nodeId, exposureInjectionId }) => {
  const sqlitePath = join(runtime.eeHome, "sqlite", "experienceengine.db");
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const node = db.prepare(
      "SELECT state, delivery_state, harmed_count, consecutive_harmed_count FROM experience_nodes WHERE id = ? LIMIT 1"
    ).get(nodeId);
    const attribution = db.prepare(
      `SELECT id, injection_id, delivered, outcome, attribution_verdict, confidence,
              user_override, source, attribution_reason
       FROM attribution_records
       WHERE node_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    ).get(nodeId);
    const review = db.prepare(
      `SELECT id, event_type, source
       FROM review_events
       WHERE node_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    ).get(nodeId);
    if (
      !node || node.delivery_state !== "quarantined" || node.harmed_count < 1 ||
      !attribution || attribution.injection_id !== exposureInjectionId ||
      attribution.delivered !== 1 || attribution.attribution_verdict !== "strong_harmed" ||
      attribution.user_override !== "harmed" || attribution.source !== "manual_override" ||
      attribution.attribution_reason !== "manual_override" ||
      !review || review.event_type !== "mark_harmed" || review.source !== "user"
    ) {
      throw new MatchedBlockHarnessInfrastructureError(
        "BENCH_INSTRUMENTATION_INCOMPARABLE",
        "Production harm attribution or quarantine transition is incomplete."
      );
    }
    const transition = withDigest({
      node_id: nodeId,
      before_delivery_state: "conservative_only",
      after_delivery_state: node.delivery_state,
      authority_source: "production_runtime",
      transition_evidence_id: review.id,
      evidence_digest: ""
    }, "evidence_digest");
    return {
      authoritativeHarmEvidenceId: attribution.id,
      governanceTransition: transition,
      governanceEvidenceDigest: digest({ node, attribution, review }),
      governanceAuthority: {
        user_override: attribution.user_override,
        attribution_source: attribution.source,
        attribution_verdict: attribution.attribution_verdict,
        attribution_reason: attribution.attribution_reason,
        review_event_type: review.event_type,
        review_source: review.source,
        node_state: node.state,
        delivery_state: node.delivery_state,
        harmed_count: node.harmed_count,
        consecutive_harmed_count: node.consecutive_harmed_count
      }
    };
  } finally {
    db.close();
  }
};

const runScenarioArm = (options) => {
  const { adapter, arm, runtime, env } = options;
  const primarySessionId = `${options.blockId}-${arm}-primary`;
  const recoverySessionId = `${options.blockId}-${arm}-recheck`;
  const opportunitySessions = adapter.opportunities.map((opportunity) => ({
    opportunity_id: opportunity.opportunity_id,
    session_role: opportunity.session_role,
    executed: opportunity.session_role !== "feedback" ||
      (adapter.scenario_kind === "harm_recovery" && arm === "treatment"),
    session_id: opportunity.session_role === "feedback"
      ? arm === "treatment" ? primarySessionId : null
      : opportunity.session_role === "fresh_recheck"
        ? recoverySessionId
        : primarySessionId
  }));
  const executions = [];
  const opportunityObservations = [];
  let scenarioSuccess = false;
  let governanceEvidenceDigest = null;
  let governanceAuthority = null;

  if (adapter.scenario_kind === "inject") {
    const execution = runAgentOpportunity({
      runtime,
      arm,
      env,
      openclawExecutable: options.openclawExecutable,
      primaryModel: options.primaryModel,
      sessionId: primarySessionId,
      label: "inject-task",
      taskInput: adapter.opportunities[0].task_input
    });
    executions.push(execution);
    const resultPath = join(runtime.workspace, "result.txt");
    const taskSuccess = existsSync(resultPath) &&
      readFileSync(resultPath).equals(Buffer.from(INJECT_CONTENT));
    const decision = decisionEvidence({ injection: execution.injection, arm });
    opportunityObservations.push(buildOpportunityObservation({
      opportunityId: "inject-task",
      ordinal: 1,
      decision,
      taskSuccess,
      helped: decision.delivered && taskSuccess,
      harmed: false,
      uncertain: decision.delivered && !taskSuccess,
      skippedGuidanceRequired: arm === "no_ee" ? null : !taskSuccess
    }));
    scenarioSuccess = taskSuccess;
  } else if (adapter.scenario_kind === "correct_skip") {
    const packagePath = join(runtime.workspace, "package.json");
    const packageDigestBefore = sha256File(packagePath);
    const execution = runAgentOpportunity({
      runtime,
      arm,
      env,
      openclawExecutable: options.openclawExecutable,
      primaryModel: options.primaryModel,
      sessionId: primarySessionId,
      label: "correct-skip-task",
      taskInput: adapter.opportunities[0].task_input
    });
    executions.push(execution);
    const answerPath = join(runtime.workspace, "answer.txt");
    const answer = existsSync(answerPath) ? readFileSync(answerPath, "utf8") : "";
    const taskSuccess = packageDigestBefore === sha256File(packagePath) &&
      answer.trim() === CORRECT_SKIP_PACKAGE_NAME &&
      answer.trim().split(/\r?\n/).length === 1 &&
      !existsSync(join(runtime.workspace, "result.txt"));
    const decision = decisionEvidence({ injection: execution.injection, arm });
    opportunityObservations.push(buildOpportunityObservation({
      opportunityId: "correct-skip-task",
      ordinal: 1,
      decision,
      taskSuccess,
      helped: false,
      harmed: false,
      uncertain: false,
      skippedGuidanceRequired: arm === "no_ee" ? null : !taskSuccess
    }));
    scenarioSuccess = taskSuccess;
  } else {
    const nodeId = adapter.candidate_corpus[0].node_id;
    const exposure = runAgentOpportunity({
      runtime,
      arm,
      env,
      openclawExecutable: options.openclawExecutable,
      primaryModel: options.primaryModel,
      sessionId: primarySessionId,
      label: "harm-exposure",
      taskInput: adapter.opportunities[0].task_input
    });
    executions.push(exposure);
    const exposureResultPath = join(runtime.workspace, "focused-auth-test-result.txt");
    const exposureResult = existsSync(exposureResultPath)
      ? readFileSync(exposureResultPath, "utf8").trim()
      : "MISSING";
    const exposureTaskSuccess = exposureResult === "PASS";
    const exposureDecision = decisionEvidence({ injection: exposure.injection, arm });
    let authoritativeHarmEvidenceId = null;
    let governanceTransition = null;
    if (arm === "treatment") {
      const feedback = runAgentOpportunity({
        runtime,
        arm,
        env,
        openclawExecutable: options.openclawExecutable,
        primaryModel: options.primaryModel,
        sessionId: primarySessionId,
        label: "harm-feedback",
        taskInput: adapter.opportunities[1].task_input
      });
      executions.push(feedback);
      const governance = readGovernanceTransition({
        runtime,
        nodeId,
        exposureInjectionId: exposure.injection?.injection_id
      });
      authoritativeHarmEvidenceId = governance.authoritativeHarmEvidenceId;
      governanceTransition = governance.governanceTransition;
      governanceEvidenceDigest = governance.governanceEvidenceDigest;
      governanceAuthority = governance.governanceAuthority;
    }
    opportunityObservations.push(buildOpportunityObservation({
      opportunityId: "harm-exposure",
      ordinal: 1,
      decision: exposureDecision,
      taskSuccess: exposureTaskSuccess,
      helped: false,
      harmed: arm === "treatment" && exposureDecision.delivered,
      uncertain: false,
      skippedGuidanceRequired: arm === "no_ee" ? null : false,
      authoritativeHarmEvidenceId,
      governanceTransition
    }));

    restoreHarmTaskFixtureForRecheck(runtime.workspace);
    const recovery = runAgentOpportunity({
      runtime,
      arm,
      env,
      openclawExecutable: options.openclawExecutable,
      primaryModel: options.primaryModel,
      sessionId: recoverySessionId,
      label: "recovery-recheck",
      taskInput: adapter.opportunities[2].task_input
    });
    executions.push(recovery);
    const recoveryResultPath = join(runtime.workspace, "focused-auth-test-result.txt");
    const recoveryTaskSuccess = existsSync(recoveryResultPath) &&
      readFileSync(recoveryResultPath, "utf8").trim() === "PASS";
    const recoveryDecision = decisionEvidence({ injection: recovery.injection, arm });
    opportunityObservations.push(buildOpportunityObservation({
      opportunityId: "recovery-recheck",
      ordinal: 2,
      decision: recoveryDecision,
      taskSuccess: recoveryTaskSuccess,
      helped: false,
      harmed: false,
      uncertain: false,
      skippedGuidanceRequired: arm === "no_ee" ? null : false,
      governanceExcludedNodeIds: arm === "treatment" ? [nodeId] : []
    }));
    scenarioSuccess = arm === "treatment"
      ? exposureResult === "FAIL" && recoveryTaskSuccess && governanceTransition !== null
      : exposureTaskSuccess && recoveryTaskSuccess;
  }

  const totalTokensValues = executions.flatMap((execution) =>
    execution.totalTokens === null ? [] : [execution.totalTokens]
  );
  const observation = buildArmObservation({
    blockId: options.blockId,
    arm,
    opportunities: opportunityObservations,
    totalTokens: totalTokensValues.length === executions.length
      ? totalTokensValues.reduce((sum, value) => sum + value, 0)
      : null,
    durationMs: executions.reduce((sum, execution) => sum + execution.durationMs, 0),
    toolCalls: executions.reduce((sum, execution) => sum + execution.toolCalls, 0)
  });
  const evidence = withDigest({
    evidence_schema_version: "openclaw-scenario-arm-evidence-v1",
    scenario_id: adapter.scenario_id,
    scenario_version: adapter.scenario_version,
    block_id: options.blockId,
    arm,
    plugin_present: arm !== "no_ee",
    ee_database_present: arm !== "no_ee" && existsSync(
      join(runtime.eeHome, "sqlite", "experienceengine.db")
    ),
    opportunity_sessions: opportunitySessions,
    observation,
    evidence_digest: ""
  }, "evidence_digest");
  if (options.validateEvidence !== false) {
    try {
      validateOpenClawScenarioArmEvidence(adapter, evidence);
    } catch (error) {
      const diagnostic = {
        scenario_kind: adapter.scenario_kind,
        arm,
        scenario_success: scenarioSuccess,
        opportunities: observation.decision_opportunities.map((opportunity) => ({
          opportunity_id: opportunity.opportunity_id,
          decision: opportunity.decision,
          would_have_delivered: opportunity.would_have_delivered,
          delivered_intervention_count: opportunity.delivered_intervention_count,
          harmed_intervention_count: opportunity.harmed_intervention_count,
          task_success: opportunity.task_success,
          selected_candidate_ids: opportunity.selected_candidate_ids,
          governance_excluded_node_ids: opportunity.governance_excluded_node_ids,
          authoritative_harm_evidence_present:
            opportunity.authoritative_harm_evidence_id !== null,
          governance_transition: opportunity.governance_transition
        })),
        governance_authority: governanceAuthority
      };
      throw new Error(
        `OpenClaw scenario evidence validation failed: ${
          error instanceof Error ? error.message : String(error)
        }\n${JSON.stringify(diagnostic, null, 2)}`,
        { cause: error }
      );
    }
  }
  const evidenceOutputDir = join(options.outputDir, "arm-evidence", options.blockId);
  mkdirSync(evidenceOutputDir, { recursive: true });
  const evidenceOutputPath = join(evidenceOutputDir, `${arm}.json`);
  writeJson(evidenceOutputPath, evidence, 0o600);

  return {
    observation,
    evidence,
    evidenceFile: join("arm-evidence", options.blockId, `${arm}.json`).replaceAll("\\", "/"),
    scenarioSuccess,
    governanceEvidenceDigest,
    governanceAuthority,
    executions
  };
};

export const executeOpenClawHarmFeedbackLocalPackPreflight = async (options) => {
  if (options.adapter?.scenario_kind !== "harm_recovery") {
    throw new Error("Local-pack harm-feedback preflight requires the sealed harm-recovery adapter.");
  }
  const arm = "treatment";
  const blockId = options.blockId ?? "local-pack-harm-feedback-preflight";
  const {
    primaryModel,
    templateState,
    commonEnv
  } = prepareOpenClawHostTemplate({
    runtimeRoot: options.runtimeRoot,
    sourceConfigPath: options.sourceConfigPath,
    sourceAuthPath: options.sourceAuthPath,
    openrouterBaseUrl: options.openrouterBaseUrl,
    npmRegistry: options.npmRegistry,
    openclawExecutable: options.openclawExecutable
  });
  const armRuntime = createOpenClawArmRuntimeSet({
    templateState,
    blockRuntimeRoot: join(options.runtimeRoot, blockId),
    arms: [arm],
    openrouterBaseUrl: options.openrouterBaseUrl,
    sessionIdForArm: () => `${blockId}-${arm}-base`
  });
  const runtime = armRuntime[arm];
  const env = createOpenClawArmEnv({
    armRuntime,
    arm,
    commonEnv,
    triggerThreshold: 0.05,
    maxHints: 1
  });
  const installSourcePath = options.installSourcePath ?? options.artifactPath;
  let install = runOpenClawCommand(options.openclawExecutable, [
    "plugins", "install", installSourcePath,
    "--acknowledge-clawhub-risk", "--force"
  ], { env, timeoutMs: 600_000 });
  let installCommandVariant = "acknowledged_local_tar";
  if (
    install.exitCode !== 0 &&
    /unknown option ['"]--acknowledge-clawhub-risk['"]/iu.test(
      `${install.stderr}\n${install.stdout}`
    )
  ) {
    install = runOpenClawCommand(options.openclawExecutable, [
      "plugins", "install", installSourcePath, "--force"
    ], { env, timeoutMs: 600_000 });
    installCommandVariant = "legacy_local_tar";
  }
  if (
    install.exitCode !== 0 &&
    /unknown option ['"]--force['"]/iu.test(`${install.stderr}\n${install.stdout}`)
  ) {
    install = runOpenClawCommand(options.openclawExecutable, [
      "plugins", "install", installSourcePath,
      "--dangerously-force-unsafe-install"
    ], { env, timeoutMs: 600_000 });
    installCommandVariant = "legacy_dangerous_code_acknowledgement";
  }
  if (install.exitCode !== 0) {
    throw new Error(`Local-pack OpenClaw install failed: ${install.stderr || install.stdout}`);
  }
  runtime.installed = true;
  patchOpenClawArmConfig({ armRuntime, arm });

  const pluginList = runOpenClawCommand(options.openclawExecutable, [
    "plugins", "list", "--json"
  ], { env, timeoutMs: 120_000 });
  if (pluginList.exitCode !== 0 || !pluginList.stdout.includes("experienceengine")) {
    throw new Error(
      `Local-pack ExperienceEngine plugin was not active: ${pluginList.stderr || pluginList.stdout}`
    );
  }

  resetTaskFixture(runtime.workspace, options.adapter.scenario_kind);
  const seeded = seedScenarioNode({
    adapter: options.adapter,
    runtime,
    arm,
    env,
    createdAt: options.createdAt
  });
  const result = runScenarioArm({
    adapter: options.adapter,
    arm,
    runtime,
    env,
    blockId,
    outputDir: options.outputDir,
    openclawExecutable: options.openclawExecutable,
    primaryModel,
    validateEvidence: false
  });
  if (!result.governanceAuthority) {
    throw new Error("Local-pack harm-feedback preflight did not complete the production governance sequence.");
  }
  return {
    blockId,
    primaryModel,
    seeded,
    observation: result.observation,
    evidence: result.evidence,
    governanceAuthority: result.governanceAuthority,
    governanceEvidenceDigest: result.governanceEvidenceDigest,
    installCommandVariant,
    installDigest: digest({
      exitCode: install.exitCode,
      stdout: install.stdout,
      stderr: install.stderr
    }),
    pluginListDigest: digest({
      exitCode: pluginList.exitCode,
      stdout: pluginList.stdout,
      stderr: pluginList.stderr
    })
  };
};

export const executeOpenClawMultiScenarioCampaign = async (options) => {
  const runtimeRoot = options.runtimeRoot;
  const {
    primaryModel,
    templateState,
    commonEnv
  } = prepareOpenClawHostTemplate({
    runtimeRoot,
    sourceConfigPath: options.sourceConfigPath,
    sourceAuthPath: options.sourceAuthPath,
    openrouterBaseUrl: options.openrouterBaseUrl,
    npmRegistry: options.npmRegistry,
    openclawExecutable: options.openclawExecutable
  });
  if (primaryModel !== options.plan.host.model_identity) {
    throw new Error("OpenClaw source model changed after campaign plan sealing.");
  }

  const scenarioById = new Map(options.plan.scenarios.map((scenario) => [
    scenario.adapter.scenario_id,
    scenario
  ]));
  const fixtureById = new Map(options.executionBundle.fixtures.map((fixture) => [
    fixture.fixture_id,
    fixture
  ]));
  const blockContexts = options.executionBundle.blocks.map((entry) => {
    const blockRuntimeRoot = join(runtimeRoot, entry.block_manifest.block_id);
    const armRuntime = createOpenClawArmRuntimeSet({
      templateState,
      blockRuntimeRoot,
      arms: entry.block_manifest.planned_arm_order,
      openrouterBaseUrl: options.openrouterBaseUrl,
      sessionIdForArm: (arm) => `${entry.block_manifest.block_id}-${arm}-base`
    });
    return { entry, armRuntime };
  });

  const store = new MatchedBlockBenchmarkStore(options.campaignDatabasePath);
  const observations = [];
  const armEvidenceIndex = [];
  const blockResults = [];
  try {
    store.insertCampaignManifest(options.plan.campaign_manifest);
    for (const scenario of options.plan.scenarios) {
      store.insertGroundTruth(scenario.ground_truth);
      store.insertScenarioManifest(scenario.scenario_manifest);
    }
    for (const fixture of options.executionBundle.fixtures) {
      store.insertFixtureManifest(fixture);
    }
    store.insertRuntimeManifest(options.runtimeManifest);
    store.insertInstrumentationManifest(options.executionBundle.instrumentation);
    store.insertPublicationPlan(options.executionBundle.publication_plan);
    for (const entry of options.executionBundle.blocks) {
      store.insertSealedBlock(entry.block_manifest, entry.arm_plans);
    }

    const armEnv = (armRuntime, arm) => createOpenClawArmEnv({
      armRuntime,
      arm,
      commonEnv,
      triggerThreshold: 0.05,
      maxHints: 1
    });

    const createDriver = ({ entry, armRuntime }) => {
      const observerState = new Map();
      const scenario = scenarioById.get(entry.block_manifest.scenario_id);
      const fixture = fixtureById.get(entry.block_manifest.fixture_id);
      if (!scenario || !fixture) throw new Error("Sealed scenario or fixture is missing.");
      return {
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
          const env = armEnv(armRuntime, arm);
          let result = { exitCode: 0, stdout: "", stderr: "", durationMs: 0, timedOut: false };
          if (stage === "dependency_setup" && arm !== "no_ee" && !runtime.installed) {
            result = runOpenClawCommand(options.openclawExecutable, [
              "plugins", "install", options.artifactPath,
              "--acknowledge-clawhub-risk", "--force"
            ], { env, timeoutMs: 600_000 });
            if (result.exitCode === 0) {
              runtime.installed = true;
              patchOpenClawArmConfig({ armRuntime, arm });
            }
          } else if (stage === "credential_validation") {
            result = runOpenClawCommand(options.openclawExecutable, [
              "models", "status", "--json"
            ], { env, timeoutMs: 120_000 });
          } else if (stage === "host_startup") {
            result = runOpenClawCommand(options.openclawExecutable, [
              "plugins", "list", "--json"
            ], { env, timeoutMs: 120_000 });
            if (result.exitCode === 0) {
              const hasEe = result.stdout.includes("experienceengine");
              if ((arm === "no_ee" && hasEe) || (arm !== "no_ee" && !hasEe)) {
                result.exitCode = 1;
                result.stderr += `\nUnexpected ExperienceEngine plugin presence for ${arm}.`;
              }
            }
          } else if (stage === "fixture_preparation") {
            mkdirSync(runtime.workspace, { recursive: true });
            const marker = findProjectMarkerAncestor(runtime.workspace);
            if (marker) {
              result.exitCode = 1;
              result.stderr = `Workspace resolves beneath project marker ${marker.marker}.`;
            } else {
              result.stdout = `workspace-ready:${resolveScope(runtime.workspace).scope_id}`;
            }
          } else if (stage === "harness_smoke") {
            result.stdout = `${entry.block_manifest.block_id}:${arm}`;
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
          const arm = context.plan.arm;
          const runtime = armRuntime[arm];
          const env = armEnv(armRuntime, arm);
          resetTaskFixture(runtime.workspace, scenario.adapter.scenario_kind);
          const fixtureState = seedScenarioNode({
            adapter: scenario.adapter,
            runtime,
            arm,
            env,
            createdAt: options.plan.created_at
          });
          return {
            reset_contract_digest: options.executionContract.fixture_reset_policy_digest,
            evidence_digest: digest({
              arm,
              scenario_kind: scenario.adapter.scenario_kind,
              task_fixture_digest: fixture.repository_snapshot_digest,
              candidate_corpus_digest: fixture.candidate_corpus_digest,
              fixture_scope_id: fixtureState.scope_id,
              seeded_node_ids: fixtureState.seeded_node_ids
            })
          };
        },
        startExternalObserver: async (context) => {
          observerState.set(context.plan.arm, { startedAt: Date.now() });
          return {
            observer_id: `external-observer-${entry.block_manifest.block_id}-${context.plan.arm}`,
            observer_contract_digest: options.executionBundle.instrumentation.observer_contract_digest,
            instrumentation_manifest_digest:
              options.executionBundle.instrumentation.instrumentation_manifest_digest,
            started_evidence_digest: digest({
              block_id: entry.block_manifest.block_id,
              arm: context.plan.arm,
              started: true
            })
          };
        },
        prepareArm: async (context) => {
          const arm = context.plan.arm;
          const list = runOpenClawCommand(options.openclawExecutable, [
            "plugins", "list", "--json"
          ], { env: armEnv(armRuntime, arm), timeoutMs: 120_000 });
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
        releaseTaskInput: async (context) => {
          const arm = context.plan.arm;
          const result = runScenarioArm({
            adapter: scenario.adapter,
            blockId: entry.block_manifest.block_id,
            arm,
            runtime: armRuntime[arm],
            env: armEnv(armRuntime, arm),
            openclawExecutable: options.openclawExecutable,
            primaryModel,
            outputDir: options.outputDir
          });
          observations.push(result.observation);
          armEvidenceIndex.push({
            block_id: entry.block_manifest.block_id,
            scenario_id: scenario.adapter.scenario_id,
            scenario_kind: scenario.adapter.scenario_kind,
            arm,
            evidence_file: result.evidenceFile,
            evidence_digest: result.evidence.evidence_digest,
            governance_evidence_digest: result.governanceEvidenceDigest
          });
          return {
            task_outcome: result.scenarioSuccess ? "success" : "failure",
            task_timeout: result.executions.some((execution) => execution.timedOut),
            product_runtime_failure_codes: result.scenarioSuccess
              ? []
              : ["OPENCLAW_MULTI_SCENARIO_EXPECTATION_FAILED"],
            workspace_artifact_digest: digest({
              scenario_kind: scenario.adapter.scenario_kind,
              files: [
                "result.txt",
                "answer.txt",
                "auth-fixture.json",
                "focused-auth-test-result.txt"
              ].map((file) => {
                const path = join(armRuntime[arm].workspace, file);
                return [file, existsSync(path) ? sha256File(path) : null];
              })
            }),
            host_transcript_digest: digest(result.executions.map((execution) => ({
              stdout: execution.stdoutDigest,
              stderr: execution.stderrDigest
            }))),
            deterministic_check_digest: digest({
              scenario_kind: scenario.adapter.scenario_kind,
              success: result.scenarioSuccess,
              evidence_digest: result.evidence.evidence_digest
            }),
            scoring_record_digest: result.observation.observation_digest,
            execution_contract_digest: computeMatchedBlockExecutionContractDigest(
              options.executionContract
            ),
            ee_runtime_loaded: arm !== "no_ee",
            decision_pipeline_ran: arm !== "no_ee",
            would_have_delivered: result.observation.decision_opportunities.some(
              (opportunity) => opportunity.would_have_delivered === true
            ) ? true : arm === "no_ee" ? null : false,
            delivered: result.observation.delivered_intervention_count > 0,
            delivered_node_ids: unique(result.observation.decision_opportunities.flatMap(
              (opportunity) => opportunity.delivered_intervention_count > 0
                ? opportunity.selected_candidate_ids
                : []
            ))
          };
        },
        finishExternalObserver: async (context) => {
          const state = observerState.get(context.plan.arm);
          return {
            arm_neutral_metrics_digest: digest({
              block_id: entry.block_manifest.block_id,
              arm: context.plan.arm,
              elapsed_ms: state ? Date.now() - state.startedAt : null,
              collector: "external-spawn-and-filesystem-v2"
            }),
            observer_contract_digest: options.executionBundle.instrumentation.observer_contract_digest,
            instrumentation_manifest_digest:
              options.executionBundle.instrumentation.instrumentation_manifest_digest
          };
        },
        cleanupArm: async () => {}
      };
    };

    for (const context of blockContexts) {
      const harnessResult = await executeSealedMatchedBlock({
        store,
        blockId: context.entry.block_manifest.block_id,
        executionContract: options.executionContract,
        driver: createDriver(context)
      });
      if (harnessResult.status !== "completed") {
        throw new Error(
          `Matched-block preflight failed for ${context.entry.block_manifest.block_id}: ${
            JSON.stringify(harnessResult.failed_preflight)
          }`
        );
      }
      const disposition = appendMatchedBlockDisposition(
        store,
        context.entry.block_manifest.block_id,
        new Date().toISOString(),
        "run-openclaw-multi-scenario-pilot"
      );
      blockResults.push({
        block_id: context.entry.block_manifest.block_id,
        scenario_id: context.entry.block_manifest.scenario_id,
        repetition_index: context.entry.block_manifest.repetition_index,
        planned_arm_order: context.entry.block_manifest.planned_arm_order,
        manifest_digest: context.entry.block_manifest.manifest_digest,
        harness_result: harnessResult,
        block_disposition: disposition
      });
    }

    writeJson(options.observationsPath, observations, 0o600);
    const campaignReport = runMatchedBlockCampaignReport({
      campaignDatabasePath: options.campaignDatabasePath,
      campaignId: options.plan.campaign_manifest.benchmark_campaign_id,
      observationsPath: options.observationsPath,
      outputDir: join(options.outputDir, "report"),
      negativeResultDisclosureIncluded: true,
      persistDecision: true
    });
    const evidence = {
      evidence_type: "real_openclaw_multi_scenario_directional_pilot_v1",
      plan_file_name: basename(options.planPath),
      plan_digest: options.plan.plan_digest,
      artifact: options.plan.artifact,
      host: options.plan.host,
      campaign: {
        campaign_id: options.plan.campaign_manifest.benchmark_campaign_id,
        scenario_count: options.plan.scenarios.length,
        repetitions_per_scenario: options.plan.repetitions_per_scenario,
        block_count: blockResults.length,
        blocks: blockResults.map((result) => ({
          block_id: result.block_id,
          scenario_id: result.scenario_id,
          repetition_index: result.repetition_index,
          planned_arm_order: result.planned_arm_order,
          manifest_digest: result.manifest_digest
        }))
      },
      block_results: blockResults,
      arm_evidence_index: armEvidenceIndex,
      observations_file_name: basename(options.observationsPath),
      observations_digest: digest(observations),
      campaign_report: campaignReport.report,
      exact_limitations: {
        evidence_label: "infrastructure_directional_pilot",
        scenario_kinds: options.plan.scenarios.map((scenario) => scenario.adapter.scenario_kind),
        repetitions_per_scenario: options.plan.repetitions_per_scenario,
        general_efficacy_claim_allowed: false
      },
      support_claim_allowed: false,
      production_learning_ready: false,
      runtime_retained_for_independent_validation: options.keepRuntime,
      generated_at: new Date().toISOString()
    };
    writeJson(options.evidencePath, evidence, 0o600);
    return { evidence, campaignReport, observations, blockResults };
  } finally {
    store.close();
    if (!options.keepRuntime) {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  }
};
