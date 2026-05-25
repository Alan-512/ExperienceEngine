import { describe, expect, it } from "vitest";
import { projectTraceCapsule } from "../../src/input/projector.js";
import { applyTraceLearningGatePolicy } from "../../src/analyzer/llm-learning-gate.js";
import { buildCandidateSignals } from "../../src/analyzer/candidate-signals.js";
import { TrajectoryMatcher } from "../../src/compiler/trajectory-matcher.js";
import { TrajectoryCompiler } from "../../src/compiler/trajectory-compiler.js";
import type { TraceCapsule, ExperienceCandidateDraft } from "../../src/types/domain.js";

describe("Trace Learning and Attribution Integration", () => {
  it("projects and evaluates trace-backed expectation corrections correctly", () => {
    // Stage 5.1 & 5.2 & 5.3: expectation correction minimum evidence rules
    const capsule: TraceCapsule = {
      id: "trace_ec_1",
      scope_id: "sc_1",
      task: { goal: "Fix the bug in the routing layer", user_constraints: [] },
      events: [
        {
          id: "ev_1",
          event_type: "correction",
          timestamp: "2026-05-24T12:00:00Z",
          source: { host: "antigravity", adapter_version: "1.0.0" },
          payload: { type: "user_explicit", feedback: "wrong layer, move it to provider routing" }
        }
      ],
      evidence_refs: [],
      outcome: { outcome_signal: "success", confidence: "high", summary: "Completed fix in provider routing" },
      capture_metadata: {
        is_complete: true,
        completeness_score: 1.0,
        metadata_only: false,
        dropped_events_count: 0,
        redaction_applied: false,
        size_bytes: 100
      },
      host_profile: {
        host: "antigravity",
        profile_version: "1.0.0",
        adapter_version: "1.0.0",
        capabilities: {},
        transcript_stability: "stable",
        tool_coverage: [],
        observed_at: "2026-05-24T12:00:00Z"
      },
      created_at: "2026-05-24T12:00:00Z",
      updated_at: "2026-05-24T12:01:00Z"
    };

    const input = projectTraceCapsule(capsule);
    expect(input.trace_capsule_id).toBe("trace_ec_1");
    expect(input.tool_events.length).toBe(1);
    expect(input.tool_events[0].tool_name).toBe("correction");

    const draft: ExperienceCandidateDraft = {
      node_type: "strategy",
      scope_id: "sc_1",
      task_type: "bug_fix",
      experience_kind: "expectation_correction",
      trigger_pattern: "routing",
      compact_hint: "Move the fix to provider routing.",
      success_signal: "success",
      evidence_summary: "User correction supported",
      source_kind: "system_derived"
    };

    // Low-completeness trace gate check
    const lowCompletenessInput = { ...input, trace_completeness: 0.3 };
    const policed = applyTraceLearningGatePolicy(lowCompletenessInput, draft);
    // Since minimum rules pass (user correction event + success outcome), it should NOT restrict it!
    expect(policed.promotion_signal).toBeUndefined();
    expect(policed.confidence_signal).toBeUndefined();
  });

  it("restricts low-completeness trace candidates if minimum evidence rules are not met", () => {
    const capsule: TraceCapsule = {
      id: "trace_low_1",
      scope_id: "sc_1",
      task: { goal: "Fix the UI", user_constraints: [] },
      events: [],
      evidence_refs: [],
      outcome: { outcome_signal: "success", confidence: "high", summary: "Fixed" },
      capture_metadata: {
        is_complete: false,
        completeness_score: 0.2,
        metadata_only: false,
        dropped_events_count: 5,
        redaction_applied: false,
        size_bytes: 50
      },
      host_profile: {
        host: "antigravity",
        profile_version: "1.0.0",
        adapter_version: "1.0.0",
        capabilities: {},
        transcript_stability: "stable",
        tool_coverage: [],
        observed_at: "2026-05-24T12:00:00Z"
      },
      created_at: "2026-05-24T12:00:00Z",
      updated_at: "2026-05-24T12:01:00Z"
    };

    const input = projectTraceCapsule(capsule);
    const draft: ExperienceCandidateDraft = {
      node_type: "strategy",
      scope_id: "sc_1",
      task_type: "bug_fix",
      experience_kind: "expectation_correction", // requires correction event!
      trigger_pattern: "UI",
      compact_hint: "Fix UI",
      success_signal: "success",
      evidence_summary: "Lack of correction event",
      source_kind: "system_derived"
    };

    const policed = applyTraceLearningGatePolicy(input, draft);
    // Should restrict promotion since completeness is < 0.6 and correction events are missing
    expect(policed.promotion_signal).toBe("normal");
    expect(policed.confidence_signal).toBe("unconfirmed");
    expect(policed.promotion_reason).toContain("restricted high confidence promotion");
  });

  it("trajectory matcher matches file_change trace events", () => {
    const compiled = TrajectoryCompiler.compileNodeExpectations(
      ["write_to_file src/index.ts"],
      [],
      "success"
    );

    // Projected file_change event
    const projectedEvents = [
      {
        event_id: "ev_fc",
        tool_name: "file_change",
        status: "success" as const,
        input_summary: "src/index.ts",
        output_summary: "write",
        started_at: "2026-05-24T12:00:00Z",
        ended_at: "2026-05-24T12:00:00Z"
      }
    ];

    const matchResult = TrajectoryMatcher.match(compiled, projectedEvents, "success");
    expect(matchResult.verdict).toBe("adoption_detected");
    expect(matchResult.matchedExpectationIds.length).toBe(1);
    expect(matchResult.evidenceRefs).toContain("ev_fc");
  });

  it("verifies correction trace events satisfy expectation correction evidence rules even without semantic directional correction", () => {
    const capsule: TraceCapsule = {
      id: "trace_ec_no_semantic",
      scope_id: "sc_1",
      task: { goal: "Normal goal", user_constraints: [] },
      events: [
        {
          id: "ev_1",
          event_type: "correction",
          timestamp: "2026-05-24T12:00:00Z",
          source: { host: "antigravity", adapter_version: "1.0.0" },
          // A plain correction feedback message that does NOT match DIRECTIONAL_CORRECTION_CUE_PATTERN
          payload: { type: "user_explicit", feedback: "Change layout structure" }
        }
      ],
      evidence_refs: [],
      outcome: { outcome_signal: "success", confidence: "high", summary: "Fixed" },
      capture_metadata: {
        is_complete: true,
        completeness_score: 1.0,
        metadata_only: false,
        dropped_events_count: 0,
        redaction_applied: false,
        size_bytes: 100
      },
      host_profile: {
        host: "antigravity",
        profile_version: "1.0.0",
        adapter_version: "1.0.0",
        capabilities: {},
        transcript_stability: "stable",
        tool_coverage: [],
        observed_at: "2026-05-24T12:00:00Z"
      },
      created_at: "2026-05-24T12:00:00Z",
      updated_at: "2026-05-24T12:01:00Z"
    };

    const input = projectTraceCapsule(capsule);
    // Explicitly verify trace_windows counts are computed correctly
    const signals = buildCandidateSignals(input);
    expect(signals.trace_windows?.correction_events_count).toBe(1);
    expect(signals.directional_correction?.detected).toBe(false);

    const draft: ExperienceCandidateDraft = {
      node_type: "strategy",
      scope_id: "sc_1",
      task_type: "bug_fix",
      experience_kind: "expectation_correction",
      trigger_pattern: "routing",
      compact_hint: "Move the fix to provider routing.",
      success_signal: "success",
      evidence_summary: "User correction supported",
      source_kind: "system_derived"
    };

    // Evaluate under low completeness trace
    const lowCompletenessInput = { ...input, trace_completeness: 0.3 };
    const policed = applyTraceLearningGatePolicy(lowCompletenessInput, draft);
    
    // Minimum rules should still pass because of correction_events_count === 1
    expect(policed.promotion_signal).toBeUndefined();
    expect(policed.confidence_signal).toBeUndefined();
  });
});
