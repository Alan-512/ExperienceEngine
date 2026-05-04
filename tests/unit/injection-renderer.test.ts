import { describe, expect, it } from "vitest";
import { renderInjection } from "../../src/controller/injection-renderer.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const node = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_1",
  node_type: "warning",
  scope_id: "scope_1",
  task_type: "bug_fix",
  trigger_pattern: "fix sqlite issue",
  compact_hint: "Validate the failing migration before changing unrelated schema code.",
  success_signal: "Migration runs cleanly.",
  evidence_summary: "Migration failed twice.",
  retrieval_text: "fix sqlite issue\nValidate the failing migration before changing unrelated schema code.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

describe("renderInjection", () => {
  it("renders a compact hints block", () => {
    const output = renderInjection("inject", [node()]);
    expect(output).toBe(
      [
        "Execution hints from prior similar tasks:",
        "- Validate the failing migration before changing unrelated schema code."
      ].join("\n")
    );
  });

  it("expands structured steps for mature injected guidance", () => {
    const output = renderInjection(
      "inject",
      [
        node({
          node_type: "strategy",
          helped_count: 2,
          validation_state: "validated_by_reuse",
          goal: "Narrow the failing migration before touching unrelated schema code.",
          recommended_steps: [
            "Run the focused migration once to reproduce the failure.",
            "Inspect the failing SQL and compare it with the expected schema.",
            "Change only the migration under test, then rerun it."
          ],
          avoid_steps: ["Do not edit unrelated schema files before reproducing the failure."]
        })
      ]
    );

    expect(output).toContain("Goal: Narrow the failing migration before touching unrelated schema code.");
    expect(output).toContain("Steps:");
    expect(output).toContain("  1. Run the focused migration once to reproduce the failure.");
    expect(output).toContain("Avoid:");
    expect(output).toContain("  - Do not edit unrelated schema files before reproducing the failure.");
  });

  it("keeps conservative candidate injections compact", () => {
    const output = renderInjection(
      "inject_conservative",
      [
        node({
          state: "candidate",
          recommended_steps: [
            "Run the focused migration once to reproduce the failure.",
            "Inspect the failing SQL and compare it with the expected schema."
          ]
        })
      ]
    );

    expect(output).toMatch(/^Conservative execution hints:\n- Validate the failing migration before changing unrelated schema code\./);
    expect(output).not.toContain("Steps:");
    expect(output).not.toContain("Goal:");
    expect(output).not.toContain("  1.");
  });

  it("expands mature conservative guidance when the node is validated and low risk", () => {
    const output = renderInjection(
      "inject_conservative",
      [
        node({
          node_type: "strategy",
          helped_count: 4,
          validation_state: "validated_by_reuse",
          goal: "Narrow the migration issue before touching unrelated files.",
          recommended_steps: [
            "Run the focused migration once to reproduce the failure.",
            "Inspect the ordering mismatch in the migration under test.",
            "Change only the migration under test and rerun it."
          ],
          avoid_steps: ["Do not edit unrelated migration files before reproduction."]
        })
      ]
    );

    expect(output).toContain("Conservative execution hints:");
    expect(output).toContain("Goal:");
    expect(output).toContain("Steps:");
    expect(output).toContain("Avoid:");
  });
});
