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

  it("emits at most one compact hint by default", () => {
    const output = renderInjection("inject", [
      node({ id: "first", compact_hint: "First compact hint." }),
      node({ id: "second", compact_hint: "Second compact hint." })
    ]);

    expect(output).toContain("- First compact hint.");
    expect(output).not.toContain("Second compact hint.");
  });

  it("does not render raw retrieval text, task history, or candidate evidence", () => {
    const output = renderInjection("inject", [
      node({
        compact_hint: "Use the compact public hint only.",
        trigger_pattern: "RAW_TRIGGER_SHOULD_STAY_DIAGNOSTIC",
        retrieval_text: "RAW_RETRIEVAL_TEXT_SHOULD_NOT_RENDER",
        evidence_summary: "RAW_TASK_HISTORY_SHOULD_NOT_RENDER",
        origin_record_ids: ["candidate_record_should_not_render"]
      })
    ]);

    expect(output).toContain("Use the compact public hint only.");
    expect(output).not.toContain("RAW_TRIGGER_SHOULD_STAY_DIAGNOSTIC");
    expect(output).not.toContain("RAW_RETRIEVAL_TEXT_SHOULD_NOT_RENDER");
    expect(output).not.toContain("RAW_TASK_HISTORY_SHOULD_NOT_RENDER");
    expect(output).not.toContain("candidate_record_should_not_render");
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
      ],
      1,
      "strong_recommendation",
      { confidence: "high", overallMatchBand: "high" }
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

  it("keeps conservative injection compact even for mature validated nodes", () => {
    const output = renderInjection(
      "inject_conservative",
      [
        node({
          node_type: "strategy",
          helped_count: 4,
          validation_state: "validated_by_reuse",
          goal: "Narrow the migration issue before touching unrelated files.",
          recommended_steps: ["Run the focused migration once to reproduce the failure."],
          avoid_steps: ["Do not edit unrelated migration files before reproduction."]
        })
      ],
      1,
      "soft_recommendation",
      { confidence: "high", overallMatchBand: "high" }
    );

    expect(output).toContain("Relevant prior experience:");
    expect(output).toContain("- Validate the failing migration before changing unrelated schema code.");
    expect(output).not.toContain("Goal:");
    expect(output).not.toContain("Steps:");
    expect(output).not.toContain("Avoid:");
  });

  it("renders diagnostic hints as non-authoritative leads", () => {
    const output = renderInjection("inject_conservative", [node()], 1, "diagnostic_hint");

    expect(output).toContain("Diagnostic lead from prior experience:");
    expect(output).toContain("Use this only as a diagnostic lead.");
    expect(output).toContain("Do not treat it as a required fix.");
    expect(output).toContain("- Validate the failing migration");
  });

  it("renders soft recommendations as relevant prior experience", () => {
    const output = renderInjection("inject_conservative", [node()], 1, "soft_recommendation");

    expect(output).toContain("Relevant prior experience:");
    expect(output).toContain("Check this before making unrelated changes");
  });

  it("renders strong recommendations as validated prior experience", () => {
    const output = renderInjection("inject", [node()], 3, "strong_recommendation");

    expect(output).toContain("Validated prior experience:");
    expect(output).toContain("Follow this unless current evidence contradicts it.");
  });

  it("renders hard constraints as explicit constraints", () => {
    const output = renderInjection("inject", [node()], 3, "hard_constraint");

    expect(output).toContain("Project constraint or explicit instruction:");
    expect(output).toContain("Do not violate this without explicit user approval.");
  });

  it("does not expand when high retrieval quality is present but node maturity is insufficient", () => {
    const output = renderInjection(
      "inject",
      [
        node({
          node_type: "strategy",
          helped_count: 0,
          support_count: 1,
          goal: "Narrow the migration issue before touching unrelated files.",
          recommended_steps: ["Run the focused migration once to reproduce the failure."],
          avoid_steps: ["Do not edit unrelated migration files before reproduction."]
        })
      ],
      1,
      "strong_recommendation",
      { confidence: "high", overallMatchBand: "high" }
    );

    expect(output).toContain("- Validate the failing migration before changing unrelated schema code.");
    expect(output).not.toContain("Goal:");
    expect(output).not.toContain("Steps:");
    expect(output).not.toContain("Avoid:");
  });
});
