import { describe, expect, it } from "vitest";
import type { ExperienceInput, ToolEvent } from "../../src/types/domain.js";
import {
  deriveNodeOriginProfile,
  deriveTaskManagementSignals
} from "../../src/experience-management/task-management-signals.js";

const toolEvent = (overrides: Partial<ToolEvent> = {}): ToolEvent => ({
  event_id: "evt_1",
  tool_name: "exec_command",
  status: "success",
  output_summary: "Executed a routine command during the task.",
  started_at: "2026-04-03T00:00:00.000Z",
  ...overrides
});

const input = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_repo",
  task_type: "general",
  task_summary: "General task summary",
  context_summary: "General task context",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: [],
  ...overrides
});

describe("deriveTaskManagementSignals", () => {
  it("marks concrete bug-fix work as real dev and bug-fix-like", () => {
    const signals = deriveTaskManagementSignals(input({
      task_type: "bug_fix",
      task_summary: "Debug why the auth callback is still failing after the provider routing refactor.",
      context_summary: "The current behavior still throws the same runtime error in the auth callback.",
      tool_events: [toolEvent({
        status: "failure",
        error_signature: "auth callback failed",
        output_summary: "The auth callback still fails after the latest patch."
      })]
    }));

    expect(signals.realDevLikely).toBe(true);
    expect(signals.bugFixLike).toBe(true);
    expect(signals.metaLike).toBe(false);
    expect(signals.confidence).toBe("high");
  });

  it("marks implementation-oriented feature work as real dev without forcing bug-fix-like", () => {
    const signals = deriveTaskManagementSignals(input({
      task_type: "feature_add",
      task_summary: "Implement a new OpenClaw doctor summary for plugin drift and host heartbeat state.",
      context_summary: "Add the product-facing summary and the supporting state checks.",
      tool_events: [toolEvent()]
    }));

    expect(signals.realDevLikely).toBe(true);
    expect(signals.bugFixLike).toBe(false);
    expect(signals.metaLike).toBe(false);
  });

  it("marks audit and review wording as meta-like", () => {
    const signals = deriveTaskManagementSignals(input({
      task_type: "general",
      task_summary: "Review the weekly audit summary and inspect the latest doctor output before proposing changes.",
      context_summary: "This is a weekly audit of retrieval quality and host readiness."
    }));

    expect(signals.metaLike).toBe(true);
    expect(signals.validationLike).toBe(false);
    expect(signals.realDevLikely).toBe(false);
  });

  it("marks validation and host-verification wording as validation-like", () => {
    const signals = deriveTaskManagementSignals(input({
      task_type: "general",
      task_summary: "Validate the real host install path and verify host wiring after the release candidate build.",
      context_summary: "Run host verification and confirm the install qualification checks are green."
    }));

    expect(signals.validationLike).toBe(true);
    expect(signals.metaLike).toBe(false);
    expect(signals.realDevLikely).toBe(false);
  });

  it("allows mixed tasks to be both real-dev-like and validation-like", () => {
    const signals = deriveTaskManagementSignals(input({
      task_type: "refactor",
      task_summary: "Refactor the packaging path, then validate the real host install flow against the new runtime closure.",
      context_summary: "Implement the refactor first, then run validation against the real host.",
      tool_events: [toolEvent({
        tool_name: "pnpm test",
        output_summary: "Ran the packaging regression suite before validating the host install path."
      })]
    }));

    expect(signals.realDevLikely).toBe(true);
    expect(signals.validationLike).toBe(true);
    expect(signals.metaLike).toBe(false);
    expect(signals.reasons.length).toBeGreaterThan(0);
  });
});

describe("deriveNodeOriginProfile", () => {
  it("does not force strict promotion for a mixed real-dev validation sample", () => {
    const profile = deriveNodeOriginProfile([
      {
        scope_id: "scope_repo",
        task_type: "general",
        task_summary: "Review and validate the failing auth callback fix against the real host flow.",
        context_summary: "The failing callback still needs a real implementation fix before validation.",
        outcome_signal: "success"
      }
    ]);

    expect(profile.sampleCount).toBe(1);
    expect(profile.metaCount).toBe(1);
    expect(profile.validationCount).toBe(1);
    expect(profile.realDevCount).toBe(1);
    expect(profile.strictPromotion).toBe(false);
  });

  it("enables strict promotion when meta or validation origins dominate the samples", () => {
    const profile = deriveNodeOriginProfile([
      {
        scope_id: "scope_repo",
        task_type: "general",
        task_summary: "Review the weekly audit findings before proposing changes.",
        context_summary: "Audit the latest inspect output.",
        outcome_signal: "success"
      },
      {
        scope_id: "scope_repo",
        task_type: "general",
        task_summary: "Validate the real host install path after the release build.",
        context_summary: "Run host verification and confirm qualification checks.",
        outcome_signal: "success"
      },
      {
        scope_id: "scope_repo",
        task_type: "feature_add",
        task_summary: "Implement the packaging fix for the runtime closure.",
        context_summary: "Add the missing packaging guard.",
        outcome_signal: "success"
      }
    ]);

    expect(profile.sampleCount).toBe(3);
    expect(profile.strictPromotion).toBe(true);
  });
});
