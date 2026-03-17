import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { retrieveCandidates } from "../../src/controller/candidate-retriever.js";
import type { ExperienceInput, ExperienceNode } from "../../src/types/domain.js";
import {
  clearEmbeddingProviderForTests,
  embedText,
  setEmbeddingProviderForTests
} from "../../src/store/vector/embeddings.js";

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
    embedding: merged.embedding ?? embedText(retrievalText),
    embedding_provider: merged.embedding_provider,
    embedding_model: merged.embedding_model,
    embedding_version: merged.embedding_version,
    embedding_dimensions: merged.embedding_dimensions
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
  beforeEach(() => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });
  });

  afterEach(() => {
    clearEmbeddingProviderForTests();
  });

  it("retrieves semantically similar nodes even when wording differs", async () => {
    const candidates = await retrieveCandidates(input(), [
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

  it("allows related task families instead of requiring exact task-type equality", async () => {
    const candidates = await retrieveCandidates(
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

  it("downranks low-specificity legacy hints below more specific distilled nodes", async () => {
    const candidates = await retrieveCandidates(
      input({
        task_type: "test_debug",
        task_summary: "Reproduce the failing auth baseline test and rerun it after the smallest fix"
      }),
      [
        node({
          id: "legacy-generic",
          compact_hint: "Reproduce first, then validate the fix with exec before moving on.",
          helped_count: 5,
          support_count: 4
        }),
        node({
          id: "specific-distilled",
          compact_hint:
            "Reproduce the failing auth baseline test with exec, make the smallest matching change, then rerun exec.",
          trigger_pattern: "Repair the openclaw baseline auth test regression in this repo",
          helped_count: 1,
          support_count: 1,
          recommended_steps: [
            "Run the focused baseline test once to reproduce.",
            "Make the smallest auth change that matches the failure.",
            "Rerun the focused baseline test."
          ]
        })
      ]
    );

    expect(candidates[0]?.id).toBe("specific-distilled");
    expect(candidates.map((entry) => entry.id)).toContain("legacy-generic");
  });

  it("does not let general verification tasks pull in unrelated debug-family fallback nodes", async () => {
    const candidates = await retrieveCandidates(
      input({
        task_type: "general",
        task_summary:
          "This is a read-only repository verification task. Run pwd and confirm package.json exists before reporting the repo root."
      }),
      [
        node({
          id: "general-node",
          task_type: "general",
          trigger_pattern: "Verify the repository root and report whether package.json exists",
          compact_hint: "Use exec as the verification loop for this coding task, keep the change narrow, and rerun it before moving on."
        }),
        node({
          id: "debug-fallback",
          task_type: "test_debug",
          compact_hint: "Reproduce first, then validate the fix with exec before moving on.",
          helped_count: 20,
          support_count: 10
        })
      ]
    );

    expect(candidates.map((entry) => entry.id)).toContain("general-node");
    expect(candidates.map((entry) => entry.id)).not.toContain("debug-fallback");
  });

  it("falls back to retrieval text when a stored embedding is stale or incompatible", async () => {
    const candidates = await retrieveCandidates(input(), [
      node({
        id: "stale-embedding",
        embedding: [1, 2],
        trigger_pattern: "Fix the failing auth test in ExperienceEngine",
        compact_hint: "Run the failing auth test before editing and rerun it immediately after the fix."
      })
    ]);

    expect(candidates.map((entry) => entry.id)).toContain("stale-embedding");
  });

  it("prefers nodes whose embedding metadata matches the active local provider", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const candidates = await retrieveCandidates(input(), [
      node({
        id: "local-match",
        embedding: [1, 0, 0],
        embedding_provider: "local",
        embedding_model: "Xenova/multilingual-e5-small",
        embedding_version: "local-e5-v1",
        embedding_dimensions: 3
      }),
      node({
        id: "legacy-mismatch",
        embedding: [1, 0, 0],
        embedding_provider: "legacy",
        embedding_model: "hashed-bow",
        embedding_version: "legacy-v1",
        embedding_dimensions: 3
      })
    ]);

    expect(candidates[0]?.id).toBe("local-match");
  });

  it("falls back to legacy retrieval when the local provider cannot embed the query", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        throw new Error("provider offline");
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const candidates = await retrieveCandidates(input(), [
      node({
        id: "legacy-fallback",
        embedding: undefined,
        trigger_pattern: "Fix the failing auth test in ExperienceEngine",
        compact_hint: "Run the failing auth test before editing and rerun it immediately after the fix."
      })
    ]);

    expect(candidates.map((entry) => entry.id)).toContain("legacy-fallback");
  });
});
