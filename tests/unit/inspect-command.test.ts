import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInspectCommand } from "../../src/cli/commands/inspect.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../../src/store/sqlite/repositories/distillation-job-repo.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { InjectionRepository } from "../../src/store/sqlite/repositories/injection-repo.js";
import { AttributionRecordRepository } from "../../src/store/sqlite/repositories/attribution-record-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { OutcomeRecordRepository } from "../../src/store/sqlite/repositories/outcome-record-repo.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import { RepoPolicyRepository } from "../../src/store/sqlite/repositories/repo-policy-repo.js";
import { TaskRunRepository } from "../../src/store/sqlite/repositories/task-run-repo.js";
import { nowIso } from "../../src/utils/clock.js";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import type {
  DistillationJob,
  ExperienceCandidate,
  ExperienceInputRecord,
  InjectionEvent,
  AttributionRecord,
  ExperienceNode,
  OutcomeRecord,
  ReviewEvent,
  TaskRun
} from "../../src/types/domain.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-inspect-command-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_inspect",
  node_type: "strategy",
  scope_id: resolveScope("/repo").scope_id,
  task_type: "test_debug",
  validation_state: "validated_by_reuse",
  trigger_pattern: "Fix the failing auth test",
  applicability_notes: "Stay in the same repo scope",
  env_signature: undefined,
  compact_hint: "Run the failing auth test before editing and verify after the fix.",
  goal: "Stabilize the auth test",
  recommended_steps: [],
  avoid_steps: ["Avoid broad refactors before reproducing the test failure."],
  fallback_steps: [],
  success_signal: "The test passes",
  stop_condition: "Stop if the failure is no longer reproducible in the current repo.",
  escalation_condition: undefined,
  evidence_summary: "Previously solved the same auth test failure.",
  retrieval_text: "Fix the failing auth test\nRun the failing auth test before editing and verify after the fix.",
  source_kind: "system_derived",
  distillation_mode_used: "rule",
  distillation_source: "rule",
  promotion_signal: "high_value",
  promotion_reason: "The lesson carries a reusable verification loop with explicit next-step guidance.",
  merge_decision: "UPDATE",
  merge_reason: "A same-family auth-test lesson already existed and this run strengthened it.",
  priority_promotion_applied: true,
  origin_record_ids: ["input_origin"],
  helped_record_ids: ["input_helped"],
  harmed_record_ids: ["input_harmed"],
  state: "active",
  usage_count: 2,
  helped_count: 1,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: "2026-03-12T00:00:00.000Z",
  updated_at: "2026-03-12T00:00:00.000Z",
  ...overrides
});

const makeRecord = (overrides: Partial<ExperienceInputRecord> = {}): ExperienceInputRecord => ({
  record_id: "input_1",
  scope_id: resolveScope("/repo").scope_id,
  session_id: "session_last",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  outcome_signal: "success",
  context_summary: "Auth test failure in the current repo",
  evidence: ["Bash: success: auth test now passes"],
  injected_node_ids: ["node_inspect"],
  created_at: nowIso(),
  ...overrides
});

const makeCandidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_inspect",
  source_record_id: "input_1",
  scope_id: resolveScope("/repo").scope_id,
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix the failing auth test",
  compact_hint: "Use vitest as the terminal verification loop.",
  goal: "Keep the auth test in a narrow loop.",
  success_signal: "vitest passes",
  evidence_summary: "Terminal sequence: vitest passed.",
  retrieval_text: "Fix the failing auth test\nvitest passed",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_context_summary: "Auth test failure in the current repo",
  source_signal: {
    task_summary: "Fix the failing auth test",
    context_summary: "Auth test failure in the current repo",
    outcome_signal: "success",
    tool_events: [],
    evidence: ["vitest: success: auth test now passes"],
    failure_signature: "Auth test assertion failed",
    retry_count: 1,
    correction_signals: ["apply_patch"],
    tool_event_summary: ["failure: vitest failed: Auth test assertion failed", "success: vitest succeeded"]
  },
  lifecycle_state: "pending",
  retry_count: 0,
  created_at: "2026-03-13T01:00:00.000Z",
  updated_at: "2026-03-13T01:00:00.000Z",
  ...overrides
});

const makeTaskRun = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  id: "taskrun_inspect",
  host: "codex",
  scope_id: resolveScope("/repo").scope_id,
  session_id: "session_last",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  prompt_excerpt: "Fix the auth test",
  context_summary: "Auth test failure in the current repo",
  started_at: "2026-03-13T01:00:00.000Z",
  ended_at: "2026-03-13T01:05:00.000Z",
  final_status: "success",
  failure_signature: "Auth test assertion failed",
  learning_status: undefined,
  learning_reason: undefined,
  created_at: "2026-03-13T01:00:00.000Z",
  updated_at: "2026-03-13T01:05:00.000Z",
  ...overrides
});

const makeOutcomeRecord = (overrides: Partial<OutcomeRecord> = {}): OutcomeRecord => ({
  id: "outcome_inspect",
  task_run_id: "taskrun_inspect",
  outcome_signal: "success",
  failure_signature: "Auth test assertion failed",
  summary: "Fix the failing auth test",
  created_at: "2026-03-13T01:05:00.000Z",
  ...overrides
});

const makeReviewEvent = (overrides: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: "review_inspect",
  node_id: "node_inspect",
  task_run_id: "taskrun_inspect",
  event_type: "mark_helped",
  source: "user",
  created_at: "2026-03-13T01:06:00.000Z",
  ...overrides
});

const makeInjectionEvent = (overrides: Partial<InjectionEvent> = {}): InjectionEvent => ({
  injection_id: "inject_inspect",
  session_id: "session_inject_only",
  scope_id: resolveScope(process.cwd()).scope_id,
  task_type: "test_debug",
  task_summary: "Investigate the payments auth test regression",
  mode: "inject",
  delivery_mode: "live",
  delivered: true,
  injected_node_ids: ["node_inspect"],
  injection_count: 1,
  scorecard: {
    scopeId: resolveScope(process.cwd()).scope_id,
    sessionId: "session_inject_only",
    taskType: "test_debug",
    taskSummary: "Investigate the payments auth test regression",
    mode: "inject",
    interventionStrength: "strong_recommendation",
    riskLevel: "medium",
    recommendation: "Apply these hints normally, then mark helped or harmed after the task.",
    reasons: ["A mature same-family candidate matched strongly."],
    topCandidates: [
      {
        id: "node_inspect",
        semanticScore: 0.42,
        lexicalScore: 0.99,
        fusedScore: 0.88,
        retrievalScore: 0.6,
        policyAdjustment: 0.28,
        rerankScore: 1,
        rerankSource: "model",
        retrievalReasons: ["lexical:0.9900", "family:exact"],
        policyReasons: [
          "family:1.0000",
          "maturity:0.0950",
          "real_dev_alignment:0.0600",
          "meta_origin_penalty:0.0000"
        ],
        taskFamilyMatch: true
      }
    ],
    topCandidateScore: 0.88,
    scoreMargin: 0.02,
    confidence: "high",
    budgetClass: "single_hint",
    fastPathApplied: true,
    queryRewriteApplied: true,
    mergeDecision: "UPDATE",
    mergeReason: "A same-family auth-test lesson already existed and this run strengthened it.",
    promotionSignal: "high_value",
    priorityPromotionApplied: true,
    gateReason: "strong_candidate_fast_path",
    decisionReason: "mature_validated_candidate",
    secondOpinionApplied: true,
    secondOpinionDecision: "allow_conservative",
    secondOpinionTrigger: "harm_history",
    secondOpinionReason:
      "The candidate still matches, but recent harm history warrants a cautious single hint.",
    selectedCandidateIds: ["node_inspect"],
    rejectedCandidates: [{ id: "node_runner_up", reasonCodes: ["same_family_runner_up"] }],
    createdAt: "2026-03-14T01:00:00.000Z",
    nodes: []
  },
  was_successful: null,
  harm_observed: null,
  attribution_reason: undefined,
  created_at: "2026-03-14T01:00:00.000Z",
  resolved_at: undefined,
  ...overrides
});

const makeAttributionRecord = (overrides: Partial<AttributionRecord> = {}): AttributionRecord => ({
  id: "attr_inspect",
  injection_id: "inject_inspect",
  node_id: "node_inspect",
  intervention_strength: "strong_recommendation",
  injection_mode: "inject",
  delivery_mode: "live",
  delivered: true,
  outcome: "success",
  attribution_verdict: "weak_helped",
  confidence: "medium",
  evidence_refs: ["input_inspect", "taskrun_inspect", "inject_inspect"],
  source: "automatic",
  attribution_reason: "success_outcome",
  created_at: "2026-03-14T01:05:00.000Z",
  ...overrides
});

const makeJob = (overrides: Partial<DistillationJob> = {}): DistillationJob => ({
  id: "job_inspect",
  candidate_id: "candidate_inspect",
  status: "pending",
  extractor_profile: "balanced",
  retry_count: 0,
  created_at: "2026-03-13T01:00:00.000Z",
  updated_at: "2026-03-13T01:00:00.000Z",
  ...overrides
});

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
  consoleTableSpy.mockClear();
});

describe("inspect command", () => {
  it("prints the most recent intervention summary with injected hints", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    const taskRunRepo = new TaskRunRepository(db);
    const outcomeRepo = new OutcomeRecordRepository(db);
    const reviewEventRepo = new ReviewEventRepository(db);
    const node = makeNode();
    nodeRepo.upsert(node);
    inputRepo.upsert(makeRecord());
    taskRunRepo.upsert(makeTaskRun());
    outcomeRepo.upsert(makeOutcomeRecord());
    reviewEventRepo.upsert(makeReviewEvent({ source: "automatic" }));
    runInspectCommand("--last");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Session: session_last"],
        [`Scope: ${resolveScope("/repo").scope_id}`],
        ["Task type: test_debug"],
        ["Intervention: inject"],
        ["Delivery style: normal hint delivery"],
        ["Injected nodes:"],
        ["- node_inspect strategy active system_derived"],
        ["  Trigger: Fix the failing auth test"],
        ["  Quality: strong"],
        ["  Best fit: test_debug tasks in this repo scope"],
        ["  Promotion signal: high_value"],
        ["  Promotion reason: The lesson carries a reusable verification loop with explicit next-step guidance."],
        ["  Priority promotion applied: yes"],
        ["  Merge decision: UPDATE"],
        ["  Merge reason: A same-family auth-test lesson already existed and this run strengthened it."],
        ["  Origin records: input_origin"],
        ["  Evidence: Previously solved the same auth test failure."],
        ["Scorecard:"],
        ["- Risk: low"],
        ["- Recommendation: Apply these hints normally, then mark helped or harmed after the task."],
        ["- Why ExperienceEngine acted: ExperienceEngine injected the best available reusable guidance for this task."],
        ["- Trust summary: low-risk active guidance with 1 helped and 0 harmed signal(s)."],
        ["- Why it matched:"],
        ["  - Exact task-family match was found in historical experience."],
        ["Automatic feedback: helped"],
        ["Automatic feedback reason: success_outcome"],
        ["Timeline:"],
        ["- decision inject: Delivered 1 node for the task."],
        ["- outcome success: Fix the failing auth test"],
        ["- feedback helped: Automatic attribution marked the injection as helpful."],
        ["Hints:"],
        ["- Run the failing auth test before editing and verify after the fix."],
        ["Evidence:"],
        ["- Bash: success: auth test now passes"],
        ["Outcome: success"]
      ])
    );
    expect(consoleLogSpy.mock.calls).not.toEqual(
      expect.arrayContaining([
        ["- Top candidate score: 0.88"],
        ["- Score margin: 0.02"],
        ["- Fast path applied: yes"],
        ["- Query rewrite applied: yes"],
        ["- Gate reason: strong_candidate_fast_path"],
        ["- Decision reason: mature_validated_candidate"]
      ])
    );
  });

  it("prints full scorecard diagnostics when --verbose is requested", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    const injectionRepo = new InjectionRepository(db);
    const attributionRepo = new AttributionRecordRepository(db);
    const scopeId = resolveScope(process.cwd()).scope_id;
    nodeRepo.upsert(makeNode({ scope_id: scopeId }));
    inputRepo.upsert(
      makeRecord({
        scope_id: scopeId,
        session_id: "session_verbose",
        task_summary: "Investigate the payments auth test regression",
        created_at: "2026-03-13T01:00:00.000Z"
      })
    );
    injectionRepo.upsert(
      makeInjectionEvent({
        session_id: "session_verbose",
        scope_id: scopeId
      })
    );
    attributionRepo.insert(makeAttributionRecord());

    runInspectCommand("--last", "--verbose");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Route mode: inject"],
        ["- Top candidate score: 0.88"],
        ["- Score margin: 0.02"],
        ["- Confidence: high"],
        ["- Intervention strength: strong_recommendation"],
        ["- Budget class: single_hint"],
        ["- Fast path applied: yes"],
        ["- Query rewrite applied: yes"],
        ["- Promotion signal: high_value"],
        ["- Priority promotion applied: yes"],
        ["- Merge decision: UPDATE"],
        ["- Merge reason: A same-family auth-test lesson already existed and this run strengthened it."],
        ["- Top candidate retrieval score: 0.6"],
        ["- Top candidate policy adjustment: 0.28"],
        ["- Top candidate rerank score: 1"],
        ["- Top candidate rerank source: model"],
        ["- Gate reason: strong_candidate_fast_path"],
        ["- Decision reason: mature_validated_candidate"],
        ["- Sync second-opinion applied: yes"],
        ["- Sync second-opinion decision: allow_conservative"],
        ["- Sync second-opinion trigger: harm_history"],
        [
          "- Sync second-opinion reason: The candidate still matches, but recent harm history warrants a cautious single hint."
        ],
        ["- Selected candidates: node_inspect"],
        ["- Top candidate retrieval reasons:"],
        ["- Top candidate policy reasons:"],
        ["- Governance notes:"],
        ["  - Governance favored real coding-error guidance for this task."],
        ["- Attribution records:"],
        ["  - node_inspect: weak_helped (medium, delivered, source=automatic)"]
      ])
    );
  });

  it("prints repo policy state and evidence-aware circuit details", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const scopeId = resolveScope(process.cwd()).scope_id;
    const policyRepo = new RepoPolicyRepository(db);
    const injectionRepo = new InjectionRepository(db);
    const attributionRepo = new AttributionRecordRepository(db);
    policyRepo.upsert({
      scope_id: scopeId,
      configured_mode: "safe",
      effective_mode: "strict",
      circuit_state: "tripped",
      circuit_reason: "repo_circuit: 2 strong_harmed records in 5 recent interventions",
      live_diagnostics_disabled: true,
      created_at: "2026-05-04T10:00:00.000Z",
      updated_at: "2026-05-04T10:01:00.000Z",
      last_tripped_at: "2026-05-04T10:01:00.000Z"
    });
    injectionRepo.upsert(makeInjectionEvent({
      injection_id: "inject_manual_override",
      scope_id: scopeId,
      was_successful: false,
      harm_observed: true,
      attribution_reason: "relevant_failure",
      resolved_at: "2026-05-04T10:01:10.000Z"
    }));
    injectionRepo.upsert(makeInjectionEvent({
      injection_id: "inject_fallback_policy",
      scope_id: scopeId,
      was_successful: false,
      harm_observed: false,
      attribution_reason: "relevant_failure",
      created_at: "2026-05-04T10:02:00.000Z",
      resolved_at: "2026-05-04T10:02:10.000Z"
    }));
    attributionRepo.insert(makeAttributionRecord({
      id: "attr_manual_override",
      injection_id: "inject_manual_override",
      node_id: "node_manual_override",
      attribution_verdict: "strong_harmed",
      user_override: "harmed",
      source: "manual_override",
      attribution_reason: "manual_override",
      created_at: "2026-05-04T10:01:00.000Z"
    }));

    runInspectCommand("repo");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Repo policy:"],
        ["- Configured mode: safe"],
        ["- Effective mode: strict"],
        ["- Circuit state: tripped"],
        ["- Live diagnostics suppressed: yes"],
        ["- Circuit reason: repo_circuit: 2 strong_harmed records in 5 recent interventions"],
        ["- Last tripped at: 2026-05-04T10:01:00.000Z"],
        ["- Restore: Run `ee config restore repo-policy` after investigating the circuit evidence."],
        ["Repo policy evidence:"],
        ["- Window: 2/20"],
        ["- Attribution evidence: 1"],
        ["- Injection fallback evidence: 1"],
        ["- Manual override evidence: 1"],
        ["- Duplicate fallback entries suppressed: 1"],
        ["Evidence verdicts:"],
        ["Recent policy evidence:"]
      ])
    );
    expect(consoleTableSpy).toHaveBeenCalledWith(expect.objectContaining({
      strong_harmed: 1,
      weak_harmed: 1
    }));
    expect(consoleTableSpy).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        source: "attribution",
        label: "manual_override",
        verdict: "strong_harmed",
        override: "harmed"
      }),
      expect.objectContaining({
        source: "injection_fallback",
        label: "injection_fallback",
        verdict: "weak_harmed"
      })
    ]));
  });

  it("prints bounded hygiene findings with filters", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const scopeId = resolveScope(process.cwd()).scope_id;
    const nodeRepo = new NodeRepository(db);
    const attributionRepo = new AttributionRecordRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_hygiene_cli",
      scope_id: scopeId,
      delivery_state: "eligible",
      harmed_count: 1,
      harmed_record_ids: ["input_harmed_cli"],
      updated_at: "2026-05-04T00:00:00.000Z"
    }));
    attributionRepo.insert(makeAttributionRecord({
      id: "attr_hygiene_cli",
      node_id: "node_hygiene_cli",
      injection_id: undefined,
      attribution_verdict: "strong_harmed",
      evidence_refs: ["input_harmed_cli", "inject_harmed_cli"],
      source: "automatic",
      created_at: "2026-05-04T00:00:00.000Z"
    }));

    runInspectCommand("hygiene", "--type", "evidence_drift", "--limit", "5");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Experience hygiene:"],
        [`- Scope: ${scopeId}`],
        ["- Findings: 1"],
        ["By severity:"],
        ["By type:"]
      ])
    );
    expect(consoleTableSpy.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({
        severity: "high",
        type: "evidence_drift",
        nodes: "node_hygiene_cli"
      })
    ]);
  });

  it("prints persisted skip delivery decisions", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const scopeId = resolveScope(process.cwd()).scope_id;
    new InjectionRepository(db).upsert({
      injection_id: "decision_skip",
      session_id: "session_skip",
      scope_id: scopeId,
      task_type: "test_debug",
      task_summary: "Fix the failing auth test",
      mode: "skip",
      delivery_mode: "live",
      delivered: true,
      injected_node_ids: [],
      injection_count: 0,
      was_successful: null,
      harm_observed: null,
      created_at: "2026-03-14T02:00:00.000Z"
    });

    runInspectCommand("--last");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Session: session_skip"],
        [`Scope: ${scopeId}`],
        ["Task type: test_debug"],
        ["Intervention: skip"],
        ["Delivery style: no hint delivered"],
        ["Automatic feedback: none"]
      ])
    );
  });

  it("prints learning status and rejection reason for recorded-only tasks", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const inputRepo = new InputRecordRepository(db);
    const taskRunRepo = new TaskRunRepository(db);

    inputRepo.upsert(
      makeRecord({
        injected_node_ids: [],
        task_summary: "Refine the inline notice wording"
      })
    );
    taskRunRepo.upsert(
      makeTaskRun({
        task_summary: "Refine the inline notice wording",
        learning_status: "rejected",
        learning_reason:
          "task stayed in expression-layer refinement: wording, copy, or presentation changes are recorded but not learned"
      })
    );

    runInspectCommand("--last");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Learning status: rejected"],
        [
          "Learning reason: task stayed in expression-layer refinement: wording, copy, or presentation changes are recorded but not learned"
        ]
      ])
    );
  });

  it("prefers the latest injection event in the current scope before finalize writes an input record", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    const injectionRepo = new InjectionRepository(db);
    const scopeId = resolveScope(process.cwd()).scope_id;

    nodeRepo.upsert(makeNode({ scope_id: scopeId }));
    inputRepo.upsert(
      makeRecord({
        scope_id: scopeId,
        session_id: "session_older",
        task_summary: "Older finalized auth task",
        created_at: "2026-03-13T01:00:00.000Z"
      })
    );
    injectionRepo.upsert(makeInjectionEvent({ scope_id: scopeId }));

    runInspectCommand("--last");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Session: session_inject_only"],
        [`Scope: ${scopeId}`],
        ["Task type: test_debug"],
        ["Intervention: inject"],
        ["Automatic feedback: none"],
        ["Scorecard:"],
        ["Hints:"],
        ["- Run the failing auth test before editing and verify after the fix."],
        ["Outcome: unknown"]
      ])
    );
    expect(consoleLogSpy.mock.calls).not.toEqual(
      expect.arrayContaining([
        ["- Query rewrite applied: yes"],
        ["- Promotion signal: high_value"],
        ["- Priority promotion applied: yes"],
        ["- Merge decision: UPDATE"],
        ["- Merge reason: A same-family auth-test lesson already existed and this run strengthened it."],
        ["- Top candidate rerank score: 1"],
        ["- Top candidate rerank source: model"],
        ["- Gate reason: strong_candidate_fast_path"],
        ["- Decision reason: mature_validated_candidate"]
      ])
    );
  });

  it("prints learning summary without pack/compiler sections", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const node = makeNode({ scope_id: resolveScope(process.cwd()).scope_id });
    nodeRepo.upsert(node);
    runInspectCommand("learning");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Candidate lifecycle:"],
        ["Distillation jobs:"],
        ["Formal nodes:"],
        ["Node sources:"],
        ["Effectiveness:"],
        ["Benchmark summary:"],
        ["Attribution reasons:"],
        ["Runtime records:"]
      ])
    );
  });

  it("prints a repo summary fallback with benchmark and next action", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    const node = makeNode({ scope_id: resolveScope(process.cwd()).scope_id });
    nodeRepo.upsert(node);
    inputRepo.upsert(
      makeRecord({
        scope_id: resolveScope(process.cwd()).scope_id,
        session_id: "session_repo_summary",
        task_summary: "Review the auth test routing"
      })
    );
    runInspectCommand("repo");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Repo summary:"],
        [`- Scope: ${resolveScope(process.cwd()).scope_id}`],
        ["- Benchmark verdict: warming_up"],
        ["- Suggested mode: shadow"],
        ["- Latest intervention summary: inject on the latest recorded task."],
        ["- Latest decision explanation: ExperienceEngine injected the best available reusable guidance for this task."],
        ["Recommended next action:"]
      ])
    );
  });

  it("prints the most recent shadow evaluation when hints were suppressed", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    const injectionRepo = new InjectionRepository(db);
    nodeRepo.upsert(makeNode({ id: "node_shadow" }));
    inputRepo.upsert(
      makeRecord({
        record_id: "input_shadow",
        session_id: "session_shadow",
        injected_node_ids: []
      })
    );
    injectionRepo.upsert({
      injection_id: "inject_shadow",
      session_id: "session_shadow",
      scope_id: resolveScope("/repo").scope_id,
      task_type: "test_debug",
      task_summary: "Fix the failing auth test",
      mode: "inject",
      delivery_mode: "shadow",
      delivered: false,
      injected_node_ids: ["node_shadow"],
      injection_count: 1,
      scorecard: {
        sessionId: "session_shadow",
        scopeId: resolveScope("/repo").scope_id,
        taskType: "test_debug",
        taskSummary: "Fix the failing auth test",
        mode: "inject_conservative",
        riskLevel: "low",
        recommendation: "Apply these hints normally, then mark helped or harmed after the task.",
        reasons: ["Exact task-family match was found in historical experience."],
        topCandidates: [
          {
            id: "node_shadow",
            semanticScore: 0.74,
            lexicalScore: 0.66,
            fusedScore: 0.82,
            rerankScore: 0.91,
            taskFamilyMatch: true
          }
        ],
        topCandidateScore: 0.93,
        scoreMargin: 0.28,
        fastPathApplied: true,
        gateReason: "uncertainty_aware_routing",
        decisionReason: "ambiguous_same_family_candidate",
        nodes: [],
        createdAt: "2026-03-13T01:00:00.000Z"
      },
      was_successful: null,
      harm_observed: null,
      attribution_reason: "suppressed_delivery",
      created_at: "2026-03-13T01:00:00.000Z"
    });

    runInspectCommand("--last");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Session: session_shadow"],
        ["Intervention: shadow"],
        ["Delivery style: cautious hint delivery"],
        ["Automatic feedback: none"],
        ["Automatic feedback reason: suppressed_delivery"],
        ["Injected nodes:"],
        ["- node_shadow strategy active system_derived"],
        ["Hints:"],
        ["- Run the failing auth test before editing and verify after the fix."],
        ["- Why ExperienceEngine acted: ExperienceEngine found a promising same-family match and chose conservative injection instead of skipping."],
        ["- Trust summary: low-risk active guidance with 1 helped and 0 harmed signal(s)."]
      ])
    );
    expect(consoleLogSpy.mock.calls).not.toEqual(
      expect.arrayContaining([
        ["- Top candidate score: 0.93"],
        ["- Score margin: 0.28"],
        ["- Fast path applied: yes"],
        ["- Top candidate semantic score: 0.74"],
        ["- Top candidate lexical score: 0.66"],
        ["- Top candidate fused score: 0.82"],
        ["- Top candidate rerank score: 0.91"],
        ["- Gate reason: uncertainty_aware_routing"],
        ["- Decision reason: ambiguous_same_family_candidate"]
      ])
    );
  });

  it("prints active nodes as a reviewable table", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(
      makeNode({
        id: "node_retired",
        state: "retired",
        compact_hint: "This retired hint should not appear in active view."
      })
    );

    runInspectCommand("active");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "node_inspect",
        type: "strategy",
        source: "system_derived",
        task: "test_debug",
        state: "active",
        helped: 1,
        harmed: 0,
        hint: "Run the failing auth test before editing and verify after the fix."
      })
    ]);
  });

  it("prints recent history as a compact review table", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const inputRepo = new InputRecordRepository(db);
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_1",
        session_id: "session_recent_1",
        injected_node_ids: ["node_inspect"],
        created_at: "2026-03-13T01:00:00.000Z"
      })
    );
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_2",
        session_id: "session_recent_2",
        injected_node_ids: [],
        outcome_signal: "failure",
        created_at: "2026-03-13T00:00:00.000Z"
      })
    );

    runInspectCommand("recent");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        session: "session_recent_1",
        task: "test_debug",
        intervention: "inject",
        outcome: "success"
      }),
      expect.objectContaining({
        session: "session_recent_2",
        task: "test_debug",
        intervention: "skip",
        outcome: "failure"
      })
    ]);
  });

  it("filters recent history to injected turns and respects a custom limit", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const inputRepo = new InputRecordRepository(db);
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_a",
        session_id: "session_recent_a",
        injected_node_ids: ["node_inspect"],
        created_at: "2026-03-13T03:00:00.000Z"
      })
    );
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_b",
        session_id: "session_recent_b",
        injected_node_ids: [],
        created_at: "2026-03-13T02:00:00.000Z"
      })
    );
    inputRepo.upsert(
      makeRecord({
        record_id: "input_recent_c",
        session_id: "session_recent_c",
        injected_node_ids: ["node_inspect"],
        created_at: "2026-03-13T01:00:00.000Z"
      })
    );

    runInspectCommand("recent", "injected", "1");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        session: "session_recent_a",
        intervention: "inject"
      })
    ]);
  });

  it("prints a single node detail view", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(
      makeNode({
        recommended_steps: ["Run the failing test", "Apply the minimal fix"]
      })
    );

    runInspectCommand("node:node_inspect");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Node: node_inspect"],
        ["Type: strategy"],
        ["Source: system_derived"],
        ["Distillation mode: rule"],
        ["Distillation source: rule"],
        ["Task type: test_debug"],
        ["State: active"],
        [`Scope: ${resolveScope("/repo").scope_id}`],
        ["Helped: 1"],
        ["Harmed: 0"],
        ["Used: 2"],
        ["Current assessment: trusted for normal reuse in similar tasks."],
        ["Quality band: strong"],
        ["Quality drivers:"],
        ["- This node has already been validated by successful reuse."],
        ["- Helpful outcomes still outweigh harmful ones for this node."],
        ["Hint: Run the failing auth test before editing and verify after the fix."],
        ["Goal: Stabilize the auth test"],
        ["Applicability: Stay in the same repo scope"],
        ["Applicability profile:"],
        ["- Best fit: test_debug tasks in this repo scope"],
        ["- Scope validity: Stay in the same repo scope"],
        ["- Confidence: high"],
        ["- Risk: low"],
        ["- Avoid when: Stop if the failure is no longer reproducible in the current repo."],
        ["Success signal: The test passes"],
        ["Evidence: Previously solved the same auth test failure."],
        ["Origin records: input_origin"],
        ["Helped records: input_helped"],
        ["Harmed records: input_harmed"],
        ["Recommended steps:"],
        ["- Run the failing test"],
        ["- Apply the minimal fix"]
      ])
    );
  });

  it("filters nodes by state", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(
      makeNode({
        id: "node_cooling",
        state: "cooling",
        compact_hint: "Cooling node hint"
      })
    );

    runInspectCommand("state", "cooling");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "node_cooling",
        source: "system_derived",
        state: "cooling",
        hint: "Cooling node hint"
      })
    ]);
  });

  it("filters nodes by type", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(
      makeNode({
        id: "node_warning",
        node_type: "warning",
        compact_hint: "Warning node hint"
      })
    );

    runInspectCommand("type", "warning");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "node_warning",
        type: "warning",
        source: "system_derived",
        hint: "Warning node hint"
      })
    ]);
  });

  it("prints learning pipeline summary", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    new CandidateRepository(db).upsert(makeCandidate());
    new DistillationJobRepository(db).upsert(makeJob({ status: "failed", retry_count: 1, last_error: "timeout" }));
    new NodeRepository(db).upsert(makeNode({ state: "active" }));
    new TaskRunRepository(db).upsert(makeTaskRun());
    new OutcomeRecordRepository(db).upsert(makeOutcomeRecord());
    new ReviewEventRepository(db).upsert(makeReviewEvent({ source: "automatic" }));
    new InjectionRepository(db).upsert({
      injection_id: "inject_learning",
      session_id: "session_last",
      scope_id: resolveScope("/repo").scope_id,
      task_type: "test_debug",
      task_summary: "Fix the failing auth test",
      mode: "inject",
      delivery_mode: "shadow",
      delivered: false,
      injected_node_ids: ["node_inspect"],
      injection_count: 1,
      created_at: "2026-03-13T01:01:00.000Z",
      resolved_at: "2026-03-13T01:05:00.000Z",
      was_successful: true,
      harm_observed: false,
      attribution_reason: "suppressed_delivery"
    });

    runInspectCommand("learning");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Candidate lifecycle:"],
        ["Distillation jobs:"],
        ["Formal nodes:"],
        ["Node sources:"],
        ["Effectiveness:"],
        ["Benchmark summary:"],
        ["Recommendation: Collect at least 3 decisions before treating benchmark numbers as stable."],
        ["Attribution reasons:"],
        ["Runtime records:"]
      ])
    );
    expect(consoleTableSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ pending: 1, distilled: 0, failed: 0, discarded: 0 })],
        [expect.objectContaining({ pending: 0, processing: 0, succeeded: 0, failed: 1, discarded: 0 })],
        [expect.objectContaining({ candidate: 0, priority_candidate: 0, active: 1, cooling: 0, retired: 0 })],
        [expect.objectContaining({ explicit_provider: 0, rule: 1, disabled: 0 })],
        [expect.objectContaining({ decisions: 1, live: 0, shadow: 1, holdout: 0, delivered: 0, suppressed: 1, automaticHelped: 1, automaticHarmed: 0 })],
        [expect.objectContaining({ deliveryRate: 0, suppressionRate: 1, helpfulRate: 1, harmfulRate: 0, netHelpfulRate: 1, verdict: "warming_up" })],
        [expect.objectContaining({ success_outcome: 0, relevant_failure: 0, environmental_failure: 0, exploratory_failure: 0, no_relevant_failure: 0, suppressed_delivery: 1, unknown_outcome: 0 })],
        [expect.objectContaining({ taskRuns: 1, outcomes: 1, reviews: 1 })]
      ])
    );
  });

  it("lists managed backups", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const service = new ExperienceStateArtifactService({
      now: () => "2026-03-13T06:30:00.000Z",
      idFactory: (() => {
        let count = 0;
        return () => `token-${++count}`;
      })()
    });
    const plan = service.planOperation({ operation: "backup" });
    service.executePlannedOperation({
      planId: plan.planId,
      confirmationToken: plan.confirmationToken
    });

    runInspectCommand("backups");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^backup-/),
        kind: "backup",
        sqlite: true,
        settings: false
      })
    ]);
  });
});
