import { describe, expect, it } from "vitest";
import { buildPostmortemReviewCapsule } from "../../../src/hybrid/capsule-builder.js";
import { runPostmortemReviewWorker } from "../../../src/hybrid/workers/postmortem-review.js";

const buildCapsule = () =>
  buildPostmortemReviewCapsule({
    schemaVersion: "hybrid-capsule-v1",
    routeDecision: {
      route: "ESCALATE_ASYNC_POSTMORTEM",
      reasonCode: "eligible_async_postmortem_review",
      policyVersion: "hybrid-phase1-v1"
    },
    taskRun: {
      id: "taskrun-postmortem",
      host: "codex",
      scope_id: "scope_repo",
      session_id: "session-postmortem",
      task_type: "test_debug",
      task_summary: "Fix the failing auth test by moving the config into the provider path",
      prompt_excerpt: "Fix the failing auth test by moving the config into the provider path",
      context_summary: "The first approach failed until the fix moved out of the UI layer.",
      started_at: "2026-03-30T00:00:00.000Z",
      ended_at: "2026-03-30T00:02:00.000Z",
      final_status: "success",
      learning_status: "captured",
      learning_reason: "directional correction observed",
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:02:00.000Z"
    },
    outcomeSignal: "success",
    triggers: {
      directionalCorrectionPresent: true,
      injectedNodeInteractionPresent: true,
      retryOrInvalidationSignaturePresent: true,
      meaningfulFailureSignaturePresent: false,
      conservativeTransitionReviewWorthy: false
    },
    injectedNodes: [
      {
        id: "node_provider_path",
        node_type: "strategy",
        scope_id: "scope_repo",
        task_type: "test_debug",
        compact_hint: "Move the fix into provider routing before retrying the focused auth test.",
        trigger_pattern: "Move the failing auth fix into the provider path",
        success_signal: "The focused auth test passes after the provider-path correction.",
        evidence_summary: "A prior run only converged after moving the fix into provider routing.",
        source_kind: "system_derived",
        origin_record_ids: [],
        helped_record_ids: [],
        harmed_record_ids: [],
        state: "priority_candidate",
        delivery_state: "conservative_only",
        usage_count: 1,
        helped_count: 0,
        harmed_count: 0,
        support_count: 1,
        created_at: "2026-03-30T00:00:00.000Z",
        updated_at: "2026-03-30T00:00:00.000Z"
      }
    ],
    toolEvents: [
      {
        event_id: "tool_1",
        tool_name: "vitest",
        output_summary: "The focused auth test passed after the provider-path change.",
        status: "success",
        started_at: "2026-03-30T00:01:00.000Z",
        ended_at: "2026-03-30T00:02:00.000Z"
      }
    ]
  });

describe("runPostmortemReviewWorker", () => {
  it("produces bounded review-artifact output for a successful correction run", async () => {
    const result = await runPostmortemReviewWorker(buildCapsule());

    expect(result).toMatchObject({
      task: "postmortem_review",
      review_verdict: "policy_gated",
      candidate_recommendation: "capture",
      feedback_followup_recommendation: "none"
    });
    expect(result.injected_node_reviews).toEqual([
      expect.objectContaining({
        node_id: "node_provider_path",
        feedback_verdict: "uncertain",
        delivery_recommendation: "keep"
      })
    ]);
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.review_artifact?.summary.length).toBeGreaterThan(0);
    expect(result.review_artifact?.notes.length).toBeGreaterThan(0);
    expect(result.lifecycleSuggestions).toBeUndefined();
    expect(result.writeBackSuggestions).toBeUndefined();
  });

  it("can suggest reject for a failed run with meaningful failure evidence", async () => {
    const capsule = buildPostmortemReviewCapsule({
      schemaVersion: "hybrid-capsule-v1",
      routeDecision: {
        route: "ESCALATE_ASYNC_POSTMORTEM",
        reasonCode: "eligible_async_postmortem_review",
        policyVersion: "hybrid-phase1-v1"
      },
      taskRun: {
        id: "taskrun-postmortem-reject",
        host: "codex",
        scope_id: "scope_repo",
        session_id: "session-postmortem-reject",
        task_type: "test_debug",
        task_summary: "Reject the failed auth path after bounded review",
        prompt_excerpt: "Reject the failed auth path after bounded review",
        context_summary: "The provider-path correction never converged and the failing path remained unsupported.",
        started_at: "2026-03-30T00:00:00.000Z",
        ended_at: "2026-03-30T00:02:00.000Z",
        final_status: "failure",
        learning_status: "rejected",
        learning_reason: "meaningful failure remained",
        created_at: "2026-03-30T00:00:00.000Z",
        updated_at: "2026-03-30T00:02:00.000Z"
      },
      outcomeSignal: "failure",
      triggers: {
        directionalCorrectionPresent: false,
        injectedNodeInteractionPresent: true,
        retryOrInvalidationSignaturePresent: true,
        meaningfulFailureSignaturePresent: true,
        conservativeTransitionReviewWorthy: false
      },
      injectedNodes: [
        {
          id: "node_failed_path",
          node_type: "strategy",
          scope_id: "scope_repo",
          task_type: "test_debug",
          compact_hint: "Keep the fix in provider routing, not the UI layer.",
          trigger_pattern: "Correct the failing auth fix boundary",
          success_signal: "The auth test passes after the provider-path correction.",
          evidence_summary: "A prior run converged only after the provider-path correction.",
          source_kind: "system_derived",
          origin_record_ids: [],
          helped_record_ids: [],
          harmed_record_ids: [],
          state: "priority_candidate",
          delivery_state: "conservative_only",
          usage_count: 1,
          helped_count: 0,
          harmed_count: 0,
          support_count: 1,
          created_at: "2026-03-30T00:00:00.000Z",
          updated_at: "2026-03-30T00:00:00.000Z"
        }
      ],
      toolEvents: []
    });

    const result = await runPostmortemReviewWorker(capsule);
    expect(result).toMatchObject({
      task: "postmortem_review",
      candidate_recommendation: "reject"
    });
    expect(result.injected_node_reviews).toEqual([
      expect.objectContaining({
        node_id: "node_failed_path",
        feedback_verdict: "harmed"
      })
    ]);
  });
});
