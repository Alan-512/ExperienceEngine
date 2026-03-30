import { describe, expect, it } from "vitest";
import { buildHybridPhase1RolloutSummary } from "../../src/evaluation/hybrid-phase1-rollout-summary.js";

describe("buildHybridPhase1RolloutSummary", () => {
  it("builds a compact rollout report from traces and artifacts", () => {
    const summary = buildHybridPhase1RolloutSummary({
      traces: [
        {
          id: "trace_1",
          surface: "interaction",
          session_id: "session_1",
          scope_id: "scope_repo",
          worker_task: "explain_decision",
          route: "ESCALATE_SYNC_EXPLAIN",
          route_policy_version: "hybrid-phase1-v1",
          capsule_schema_version: "hybrid-capsule-v1",
          worker_profile_version: "hybrid-explain-v1",
          rollout_mode: "live",
          rollout_reason: "enabled",
          worker_ran: true,
          validation_status: "accepted",
          output_action: "surfaced",
          created_at: "2026-03-30T00:00:00.000Z"
        },
        {
          id: "trace_2",
          surface: "runtime",
          session_id: "session_2",
          scope_id: "scope_repo",
          worker_task: "postmortem_review",
          route: "ESCALATE_ASYNC_POSTMORTEM",
          route_policy_version: "hybrid-phase1-v1",
          capsule_schema_version: "hybrid-capsule-v1",
          worker_profile_version: "hybrid-postmortem-v1",
          rollout_mode: "live",
          rollout_reason: "enabled",
          worker_ran: true,
          validation_status: "accepted",
          output_action: "stored",
          created_at: "2026-03-30T00:00:01.000Z"
        }
      ],
      artifacts: [
        {
          id: "artifact_1",
          task_run_id: "taskrun_1",
          scope_id: "scope_repo",
          worker_task: "postmortem_review",
          approval_class: "review_artifact",
          schema_version: "hybrid-capsule-v1",
          route_policy_version: "hybrid-phase1-v1",
          worker_profile_version: "hybrid-postmortem-v1",
          recommendation: "capture",
          summary: "A reusable correction was observed.",
          payload: { reviewNotes: ["keep this bounded"] },
          created_at: "2026-03-30T00:00:01.000Z",
          updated_at: "2026-03-30T00:00:01.000Z"
        }
      ],
      releaseGate: {
        stage: "shadow",
        routeGatePassed: true,
        explainGatePassed: true,
        postmortemGatePassed: true,
        runtimeGuardrailsPassed: true
      }
    });

    expect(summary.routeDistribution).toEqual({
      ESCALATE_SYNC_EXPLAIN: 1,
      ESCALATE_ASYNC_POSTMORTEM: 1
    });
    expect(summary.syncEscalationRate).toBe(0.5);
    expect(summary.asyncReviewSchedulingRate).toBe(0.5);
    expect(summary.workerOutputValidityRate).toBe(1);
    expect(summary.fallbackRate).toBe(0);
    expect(summary.explanationQualitySummary.surfaced).toBe(1);
    expect(summary.postmortemQualitySummary.storedArtifacts).toBe(1);
    expect(summary.recommendation).toBe("canary_ready");
  });

  it("blocks rollout when fallbacks dominate the trace set", () => {
    const summary = buildHybridPhase1RolloutSummary({
      traces: [
        {
          id: "trace_1",
          surface: "interaction",
          route: "ESCALATE_SYNC_EXPLAIN",
          route_policy_version: "hybrid-phase1-v1",
          rollout_mode: "shadow",
          rollout_reason: "shadow",
          worker_ran: true,
          validation_status: "fallback",
          output_action: "rejected",
          fallback_reason: "timeout",
          created_at: "2026-03-30T00:00:00.000Z"
        },
        {
          id: "trace_2",
          surface: "runtime",
          route: "ESCALATE_ASYNC_POSTMORTEM",
          route_policy_version: "hybrid-phase1-v1",
          rollout_mode: "shadow",
          rollout_reason: "shadow",
          worker_ran: true,
          validation_status: "fallback",
          output_action: "rejected",
          fallback_reason: "circuit_open",
          created_at: "2026-03-30T00:00:01.000Z"
        }
      ],
      artifacts: [],
      releaseGate: {
        stage: "shadow",
        routeGatePassed: true,
        explainGatePassed: true,
        postmortemGatePassed: false,
        runtimeGuardrailsPassed: false
      }
    });

    expect(summary.fallbackRate).toBe(1);
    expect(summary.recommendation).toBe("blocked");
  });

  it("reports phase 2 explain-only readiness without changing the phase 1 recommendation model", () => {
    const summary = buildHybridPhase1RolloutSummary({
      traces: [
        {
          id: "trace_1",
          surface: "interaction",
          route: "ESCALATE_SYNC_EXPLAIN",
          route_policy_version: "hybrid-phase1-v1",
          capsule_schema_version: "hybrid-capsule-v1",
          worker_profile_version: "hybrid-explain-llm-v1",
          rollout_mode: "shadow",
          rollout_reason: "shadow",
          worker_task: "explain_decision",
          worker_ran: true,
          validation_status: "accepted",
          output_action: "none",
          created_at: "2026-03-30T00:00:00.000Z"
        }
      ],
      artifacts: [],
      releaseGate: {
        stage: "shadow",
        routeGatePassed: true,
        explainGatePassed: true,
        postmortemGatePassed: true,
        runtimeGuardrailsPassed: true
      },
      phase2ExplainGate: {
        stage: "shadow",
        explainFaithfulnessPassed: true,
        explainFallbackRatePassed: true,
        explainTimeoutRatePassed: true
      }
    });

    expect(summary.phase2ExplainSummary).toEqual({
      llmBackedAttempts: 1,
      llmBackedFallbacks: 0,
      recommendation: "canary_ready"
    });
    expect(summary.recommendation).toBe("canary_ready");
  });

  it("counts provider-unavailable phase 2 fallback traces as llm-backed attempts for gate visibility", () => {
    const summary = buildHybridPhase1RolloutSummary({
      traces: [
        {
          id: "trace_phase2_unavailable",
          surface: "interaction",
          route: "ESCALATE_SYNC_EXPLAIN",
          route_policy_version: "hybrid-phase1-v1",
          capsule_schema_version: "hybrid-capsule-v1",
          worker_profile_version: "hybrid-explain-llm-v1",
          rollout_mode: "shadow",
          rollout_reason: "shadow",
          worker_task: "explain_decision",
          worker_ran: false,
          validation_status: "fallback",
          output_action: "none",
          fallback_reason: "provider_unavailable",
          created_at: "2026-03-30T00:00:00.000Z"
        }
      ],
      artifacts: [],
      phase2ExplainGate: {
        stage: "shadow",
        explainFaithfulnessPassed: true,
        explainFallbackRatePassed: false,
        explainTimeoutRatePassed: true
      }
    });

    expect(summary.phase2ExplainSummary).toEqual({
      llmBackedAttempts: 1,
      llmBackedFallbacks: 1,
      recommendation: "blocked"
    });
  });
});
