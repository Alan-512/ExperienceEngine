import { describe, expect, it } from "vitest";

import { retrieveCandidates } from "../../src/controller/candidate-retriever.js";
import type { ExperienceInput, ExperienceNode } from "../../src/types/domain.js";
import { embedText } from "../../src/store/vector/embeddings.js";

const node = (overrides: Partial<ExperienceNode>): ExperienceNode => {
  const base: ExperienceNode = {
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
    updated_at: "2026-03-13T00:00:00.000Z"
  };

  const merged: ExperienceNode = {
    ...base,
    ...overrides
  };

  const retrievalText = merged.retrieval_text ?? `${merged.trigger_pattern}\n${merged.compact_hint}`;
  return {
    ...merged,
    retrieval_text: retrievalText,
    embedding: merged.embedding ?? embedText(retrievalText)
  };
};

const input = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
  scope_id: "scope-a",
  task_type: "bug_fix",
  task_summary: "Fix the failing auth test in this repo",
  tool_events: [],
  outcome_signal: "unknown",
  injected_node_ids: [],
  ...overrides
});

describe("retrieveCandidates", () => {
  it("retrieves semantically similar nodes even when wording differs", () => {
    const candidates = retrieveCandidates(input(), [
      node({ id: "semantically-close" }),
      node({
        id: "unrelated",
        task_type: "feature_add",
        trigger_pattern: "Add analytics dashboard charts to the admin page",
        compact_hint: "Land the feature behind a narrow verification loop with playwright.",
        retrieval_text: "Add analytics dashboard charts to the admin page\nplaywright verification loop",
        embedding: embedText("Add analytics dashboard charts to the admin page\nplaywright verification loop")
      })
    ]);

    expect(candidates.map((entry) => entry.id)).toContain("semantically-close");
    expect(candidates.map((entry) => entry.id)).not.toContain("unrelated");
  });

  it("allows related task families instead of requiring exact task-type equality", () => {
    const candidates = retrieveCandidates(
      input({
        task_type: "bug_fix",
        task_summary: "Repair the authentication unit test regression"
      }),
      [
        node({
          id: "test-debug-node",
          task_type: "test_debug"
        }),
        node({
          id: "far-family-node",
          task_type: "performance",
          trigger_pattern: "Optimize the dashboard query latency",
          compact_hint: "Measure the performance path before optimizing.",
          retrieval_text: "Optimize the dashboard query latency\nmeasure before optimizing",
          embedding: embedText("Optimize the dashboard query latency\nmeasure before optimizing")
        })
      ]
    );

    expect(candidates.map((entry) => entry.id)).toContain("test-debug-node");
    expect(candidates.map((entry) => entry.id)).not.toContain("far-family-node");
  });
});
