import { describe, expect, it } from "vitest";
import { buildExplainDecisionCapsule, buildPostmortemReviewCapsule } from "../../../src/hybrid/capsule-builder.js";
import { HybridWorkerClient } from "../../../src/hybrid/worker-client.js";

const buildCapsule = () =>
  buildExplainDecisionCapsule({
    schemaVersion: "hybrid-capsule-v1",
    routeDecision: {
      route: "ESCALATE_SYNC_EXPLAIN",
      reasonCode: "explicit_explanation_request",
      policyVersion: "hybrid-phase1-v1"
    },
    inspection: {
      scopeId: "scope_repo",
      taskType: "test_debug",
      intervention: "inject",
      deliveryMode: "live",
      delivered: true,
      autoFeedback: "none",
      outcome: "success",
      injectedNodes: [],
      hints: [],
      evidence: ["vitest: success: targeted auth test now passes"],
      scorecard: {
        scopeId: "scope_repo",
        taskType: "test_debug",
        taskSummary: "Fix the failing auth test",
        mode: "inject",
        riskLevel: "low",
        recommendation: "Inject the strongest validated auth-test recovery hint.",
        reasons: ["The best candidate is validated by reuse."],
        decisionReason: "mature_validated_candidate",
        nodes: [],
        createdAt: "2026-03-30T00:00:00.000Z"
      },
      decisionExplanation: "ExperienceEngine injected the best available reusable guidance for this task.",
      trustSummary: "low-risk active guidance with 2 helped and 0 harmed signals.",
      retrievalNotes: ["Query rewrite preserved retrieval intent."],
      timeline: [],
      learningStatus: "captured",
      learningReason: "captured after successful reuse",
      summary: "Fix the failing auth test",
      createdAt: "2026-03-30T00:00:00.000Z"
    }
  });

const buildPostmortemCapsule = () =>
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
      task_summary: "Fix the auth test by moving the provider config",
      prompt_excerpt: "Fix the auth test by moving the provider config",
      context_summary: "The provider-path change resolved the last failure.",
      started_at: "2026-03-30T00:00:00.000Z",
      ended_at: "2026-03-30T00:03:00.000Z",
      final_status: "success",
      learning_status: "captured",
      learning_reason: "directional correction observed",
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:03:00.000Z"
    },
    outcomeSignal: "success",
    triggers: {
      directionalCorrectionPresent: true,
      injectedNodeInteractionPresent: false,
      retryOrInvalidationSignaturePresent: true,
      meaningfulFailureSignaturePresent: false,
      conservativeTransitionReviewWorthy: false
    },
    toolEvents: []
  });

describe("HybridWorkerClient", () => {
  it("returns a validated advisory explain result", async () => {
    const client = new HybridWorkerClient();
    const result = await client.runExplainDecision(buildCapsule());

    expect(result).toMatchObject({
      status: "accepted",
      approvalClass: "advisory"
    });
  });

  it("falls back safely when explain workers are disabled", async () => {
    const client = new HybridWorkerClient({ explainDecisionEnabled: false });
    const result = await client.runExplainDecision(buildCapsule());

    expect(result).toEqual({
      status: "fallback",
      reason: "disabled"
    });
  });

  it("falls back on invalid worker output", async () => {
    const client = new HybridWorkerClient({
      explainDecisionExecutor: async () =>
        ({
          task: "explain_decision",
          decision: "",
          reason: "",
          confidence: "high"
        }) as never
    });

    const result = await client.runExplainDecision(buildCapsule());

    expect(result).toMatchObject({
      status: "fallback",
      reason: "validation_failed"
    });
  });

  it("does not open the timeout circuit after repeated validation failures", async () => {
    const client = new HybridWorkerClient({
      timeoutCircuitThreshold: 2,
      explainDecisionExecutor: async () =>
        ({
          task: "explain_decision",
          decision: "",
          reason: "",
          confidence: "high"
        }) as never
    });

    const first = await client.runExplainDecision(buildCapsule());
    const second = await client.runExplainDecision(buildCapsule());
    const third = await client.runExplainDecision(buildCapsule());

    expect(first).toMatchObject({ status: "fallback", reason: "validation_failed" });
    expect(second).toMatchObject({ status: "fallback", reason: "validation_failed" });
    expect(third).toMatchObject({ status: "fallback", reason: "validation_failed" });
  });

  it("falls back on timeout", async () => {
    const client = new HybridWorkerClient({
      explainDecisionTimeoutMs: 5,
      explainDecisionExecutor: async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              task: "explain_decision",
              decision: "late",
              reason: "late",
              confidence: "low"
            };
          }
    });

    const result = await client.runExplainDecision(buildCapsule());

    expect(result).toEqual({
      status: "fallback",
      reason: "timeout"
    });
  });

  it("returns a validated postmortem review artifact result", async () => {
    const client = new HybridWorkerClient();
    const result = await client.runPostmortemReview(buildPostmortemCapsule());

    expect(result).toMatchObject({
      status: "accepted",
      approvalClass: "review_artifact"
    });
  });

  it("does not open the timeout circuit after repeated postmortem validation failures", async () => {
    const client = new HybridWorkerClient({
      timeoutCircuitThreshold: 2,
      postmortemReviewExecutor: async () =>
        ({
          task: "postmortem_review",
          review_verdict: "review_artifact",
          candidate_recommendation: "capture",
          feedback_followup_recommendation: "none",
          confidence: "certain",
          reason: "",
          review_artifact: {
            summary: "",
            notes: []
          }
        }) as never
    });

    const first = await client.runPostmortemReview(buildPostmortemCapsule());
    const second = await client.runPostmortemReview(buildPostmortemCapsule());
    const third = await client.runPostmortemReview(buildPostmortemCapsule());

    expect(first).toMatchObject({ status: "fallback", reason: "validation_failed" });
    expect(second).toMatchObject({ status: "fallback", reason: "validation_failed" });
    expect(third).toMatchObject({ status: "fallback", reason: "validation_failed" });
  });

  it("opens a safe circuit after repeated explain timeouts", async () => {
    const client = new HybridWorkerClient({
      explainDecisionTimeoutMs: 5,
      timeoutCircuitThreshold: 2,
      explainDecisionExecutor: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          task: "explain_decision",
          decision: "late",
          reason: "late",
          confidence: "low"
        };
      }
    });

    const first = await client.runExplainDecision(buildCapsule());
    const second = await client.runExplainDecision(buildCapsule());
    const third = await client.runExplainDecision(buildCapsule());

    expect(first).toMatchObject({ status: "fallback", reason: "timeout" });
    expect(second).toMatchObject({ status: "fallback", reason: "timeout" });
    expect(third).toMatchObject({ status: "fallback", reason: "circuit_open" });
  });
});
