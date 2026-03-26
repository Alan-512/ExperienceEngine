import { describe, expect, it } from "vitest";

import { computeLexicalRetrievalScores } from "../../src/controller/lexical-retriever.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const node = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node-1",
  node_type: "strategy",
  scope_id: "scope-a",
  task_type: "test_debug",
  trigger_pattern: "Repair the broken authentication unit test in the workspace",
  compact_hint: "Reproduce the failing test with vitest, then rerun vitest after the smallest fix.",
  success_signal: "vitest finishes cleanly for the targeted task.",
  evidence_summary: "Terminal sequence: vitest failed -> vitest passed.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 1,
  helped_count: 1,
  harmed_count: 0,
  support_count: 2,
  created_at: "2026-03-13T00:00:00.000Z",
  updated_at: "2026-03-13T00:00:00.000Z",
  ...overrides
});

describe("computeLexicalRetrievalScores", () => {
  it("returns explicit normalized lexical scores for each candidate", () => {
    const scores = computeLexicalRetrievalScores("repair the broken authentication unit test", [
      node({ id: "strong" }),
      node({
        id: "weak",
        trigger_pattern: "Add an analytics dashboard",
        compact_hint: "Use playwright to validate the dashboard.",
        success_signal: "Dashboard charts render."
      })
    ]);

    expect(scores.get("strong")?.score).toBeGreaterThan(0.5);
    expect(scores.get("weak")?.score ?? 0).toBeLessThan(scores.get("strong")?.score ?? 0);
    expect(scores.get("strong")?.fieldScores.triggerPattern).toBeGreaterThan(0);
  });

  it("uses structured fields like recommended steps and goal as first-class lexical signals", () => {
    const scores = computeLexicalRetrievalScores("check the auth fixture handshake before changing auth code", [
      node({
        id: "structured",
        trigger_pattern: "Investigate the auth regression",
        compact_hint: "Narrow the auth regression before editing.",
        goal: "Check the auth fixture handshake before changing auth code",
        recommended_steps: [
          "Check the auth fixture handshake before changing auth code.",
          "Keep the investigation read-only until the failure signature is clear."
        ]
      }),
      node({
        id: "unstructured",
        trigger_pattern: "Investigate the auth regression",
        compact_hint: "Narrow the auth regression before editing."
      })
    ]);

    expect(scores.get("structured")?.score).toBeGreaterThan(scores.get("unstructured")?.score ?? 0);
    expect(scores.get("structured")?.fieldScores.recommendedSteps).toBeGreaterThan(0);
    expect(scores.get("structured")?.fieldScores.goal).toBeGreaterThan(0);
  });
});
