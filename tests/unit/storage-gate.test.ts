import { describe, expect, it } from "vitest";
import { shouldStoreCandidate } from "../../src/analyzer/storage-gate.js";
import type { ExperienceCandidateDraft, ExperienceInput, ToolEvent } from "../../src/types/domain.js";

const makeEvent = (overrides: Partial<ToolEvent> = {}): ToolEvent => ({
  event_id: "evt_1",
  tool_name: "vitest",
  status: "success",
  started_at: "2026-03-15T10:00:00.000Z",
  ended_at: "2026-03-15T10:00:01.000Z",
  ...overrides
});

const makeCandidate = (): ExperienceCandidateDraft => ({
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "bug_fix",
  trigger_pattern: "Fix auth test failure",
  compact_hint: "Keep a tight vitest loop when iterating on the auth fix.",
  success_signal: "vitest passes",
  evidence_summary: "Terminal sequence: vitest passed.",
  source_kind: "system_derived",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: []
});

const makeInput = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope_1",
  task_type: "bug_fix",
  task_summary: "Fix auth test failure",
  tool_events: [],
  outcome_signal: "success",
  injected_node_ids: [],
  ...overrides
});

describe("shouldStoreCandidate SDPO gate", () => {
  it("accepts candidates with failure evidence followed by success", () => {
    const input = makeInput({
      tool_events: [
        makeEvent({ status: "failure", error_signature: "Auth spec assertion failed" }),
        makeEvent({ status: "success", output_summary: "Auth tests passed" })
      ],
      outcome_signal: "success"
    });

    expect(shouldStoreCandidate(makeCandidate(), input)).toBe(true);
  });

  it("rejects candidates without a recoverable path", () => {
    const input = makeInput({
      tool_events: [makeEvent({ status: "failure", error_signature: "Auth spec assertion failed" })],
      outcome_signal: "failure"
    });

    expect(shouldStoreCandidate(makeCandidate(), input)).toBe(false);
  });

  it("rejects candidates without criticality signals", () => {
    const input = makeInput({
      tool_events: [makeEvent({ status: "success", output_summary: "Auth tests passed" })],
      outcome_signal: "success"
    });

    expect(shouldStoreCandidate(makeCandidate(), input)).toBe(false);
  });
});
