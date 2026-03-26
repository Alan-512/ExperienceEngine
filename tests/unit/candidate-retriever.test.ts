import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retrieveCandidates, retrieveScoredCandidates } from "../../src/controller/candidate-retriever.js";
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

  it("prefers expectation-correction nodes whose correction category matches the current deviation", async () => {
    const candidates = await retrieveCandidates(
      input({
        task_type: "feature_add",
        task_summary: "The UI technically works, but the requested interaction model is wrong and needs to be corrected.",
        context_summary: "User corrected the interaction behavior after the first implementation."
      }),
      [
        node({
          id: "matching-correction",
          task_type: "feature_add",
          trigger_pattern: "Technically works but misses the requested interaction model",
          compact_hint: "When the user corrects the interaction model, rebuild around the requested behavior before polishing details.",
          retrieval_text:
            "technically works but misses the requested interaction model\nrequested interaction behavior must change",
          correction_category: "interaction_behavior",
          correction_scope: "repo_local",
          deviation_pattern: "technically works but misses the requested interaction model",
          corrected_constraint: "Rebuild around the requested interaction behavior before polishing details.",
          experience_kind: "expectation_correction",
          confidence_signal: "confirmed_by_user",
          validation_state: "validated_by_reuse"
        }),
        node({
          id: "theme-match-wrong-correction",
          task_type: "feature_add",
          trigger_pattern: "Technically works but the implementation boundary is wrong",
          compact_hint: "Keep the work in the provider layer instead of changing the UI contract.",
          retrieval_text:
            "technically works but the implementation boundary is wrong\nfix the provider layer instead of changing the UI contract",
          correction_category: "implementation_boundary",
          correction_scope: "repo_local",
          deviation_pattern: "implementation solves the wrong layer of the problem",
          corrected_constraint: "Fix the provider layer instead of changing the UI contract.",
          experience_kind: "expectation_correction",
          confidence_signal: "confirmed_by_user",
          validation_state: "validated_by_reuse"
        })
      ]
    );

    expect(candidates[0]?.id).toBe("matching-correction");
  });

  it("does not automatically inject repo-local style constraints across repos", async () => {
    const candidates = await retrieveCandidates(
      input({
        scope_id: "scope-b",
        task_type: "feature_add",
        task_summary: "Adjust the page styling so it feels lighter and more editorial.",
        context_summary: "A different repo is asking for a refreshed style pass."
      }),
      [
        node({
          id: "repo-local-style",
          scope_id: "scope-a",
          task_type: "feature_add",
          trigger_pattern: "The page styling technically works but violates the requested editorial tone",
          compact_hint: "Keep the styling restrained and editorial rather than product-heavy.",
          correction_category: "style_constraint",
          correction_scope: "repo_local",
          deviation_pattern: "result passes technically but violates quality bar",
          corrected_constraint: "Keep the styling restrained and editorial rather than product-heavy.",
          experience_kind: "expectation_correction",
          confidence_signal: "supported_by_objective_success",
          validation_state: "pending_reuse_validation"
        })
      ]
    );

    expect(candidates).toEqual([]);
  });

  it("skips semantic embedding for low-signal queries and completes retrieval without calling the semantic provider", async () => {
    const embedQuerySpy = vi.fn(async () => [1, 0, 0]);
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      embedQuery: embedQuerySpy,
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const candidates = await retrieveCandidates(
      input({
        task_type: "general",
        task_summary: "ok",
        context_summary: ""
      }),
      [
        node({
          id: "legacy-general",
          task_type: "general",
          trigger_pattern: "Verify the repo root and report whether package.json exists",
          compact_hint: "Use exec to verify the repo root and confirm package.json before reporting back."
        })
      ]
    );

    expect(embedQuerySpy).not.toHaveBeenCalled();
    expect(candidates).toEqual([]);
  });

  it("returns scored candidates with semantic/fused score metadata and sortable margins", async () => {
    const candidates = await retrieveScoredCandidates(input(), [
      node({
        id: "strong-match",
        task_type: "test_debug",
        trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
        compact_hint: "Run the failing payments auth test before editing and rerun it after the fix.",
        helped_count: 9,
        support_count: 7
      }),
      node({
        id: "weaker-match",
        task_type: "test_debug",
        trigger_pattern: "Check the current workspace before fixing the payments auth test",
        compact_hint: "Check the current workspace path before attempting the payments auth-test fix.",
        helped_count: 1,
        support_count: 1
      })
    ]);

    expect(candidates[0]).toMatchObject({
      node: expect.objectContaining({ id: "strong-match" }),
      semanticScore: expect.any(Number),
      totalScore: expect.any(Number),
      familyScore: expect.any(Number)
    });
    expect(candidates[0]!.totalScore).toBeGreaterThan(candidates[1]!.totalScore);
  });

  it("recovers a same-family node from strong lexical overlap even when semantic similarity is weak", async () => {
    const candidates = await retrieveScoredCandidates(
      input({
        task_type: "test_debug",
        task_summary: "Diagnose the payments auth timeout by checking the auth fixture handshake first"
      }),
      [
        node({
          id: "lexical-recovery",
          task_type: "test_debug",
          trigger_pattern: "Diagnose the payments auth timeout by checking the auth fixture handshake first",
          compact_hint: "Check the auth fixture handshake before changing the payments auth code path.",
          retrieval_text:
            "Diagnose the payments auth timeout by checking the auth fixture handshake first\nCheck the auth fixture handshake before changing the payments auth code path.",
          embedding: [0, 1, 0],
          embedding_provider: "local",
          embedding_model: "Xenova/multilingual-e5-small",
          embedding_version: "local-e5-v1",
          embedding_dimensions: 3
        })
      ]
    );

    expect(candidates[0]).toMatchObject({
      node: expect.objectContaining({ id: "lexical-recovery" }),
      semanticScore: 0,
      lexicalScore: expect.any(Number),
      fusedScore: expect.any(Number)
    });
    expect(candidates[0]!.lexicalScore).toBeGreaterThan(0.5);
  });

  it("prefers a candidate supported by both semantic and lexical signals over a semantic-only candidate", async () => {
    const candidates = await retrieveScoredCandidates(
      input({
        task_type: "test_debug",
        task_summary: "Fix the failing payments auth test by checking the auth fixture handshake first"
      }),
      [
        node({
          id: "semantic-only",
          task_type: "test_debug",
          trigger_pattern: "Resolve the auth failure after inspecting the repo",
          compact_hint: "Inspect the repo before changing auth code.",
          retrieval_text: "Resolve the auth failure after inspecting the repo\nInspect the repo before changing auth code.",
          embedding: [1, 0, 0],
          embedding_provider: "local",
          embedding_model: "Xenova/multilingual-e5-small",
          embedding_version: "local-e5-v1",
          embedding_dimensions: 3
        }),
        node({
          id: "semantic-and-lexical",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing payments auth test by checking the auth fixture handshake first",
          compact_hint: "Check the auth fixture handshake first, then make the smallest payments auth fix.",
          retrieval_text:
            "Fix the failing payments auth test by checking the auth fixture handshake first\nCheck the auth fixture handshake first, then make the smallest payments auth fix.",
          embedding: [1, 0, 0],
          embedding_provider: "local",
          embedding_model: "Xenova/multilingual-e5-small",
          embedding_version: "local-e5-v1",
          embedding_dimensions: 3
        })
      ]
    );

    expect(candidates[0]).toMatchObject({
      node: expect.objectContaining({ id: "semantic-and-lexical" }),
      lexicalScore: expect.any(Number),
      fusedScore: expect.any(Number)
    });
    expect(candidates[0]!.fusedScore).toBeGreaterThan(candidates[1]!.fusedScore);
  });

  it("allows an optional reranker to reorder otherwise-close candidates", async () => {
    const candidates = await retrieveScoredCandidates(
      input({
        task_type: "test_debug",
        task_summary: "Investigate the payments auth regression and inspect the fixture handshake path first"
      }),
      [
        node({
          id: "baseline-top",
          task_type: "test_debug",
          trigger_pattern: "Inspect the payments auth regression in the current workspace",
          compact_hint: "Inspect the workspace and current auth regression path before editing.",
          retrieval_text:
            "Inspect the payments auth regression in the current workspace\nInspect the workspace and current auth regression path before editing.",
          helped_count: 2,
          support_count: 2
        }),
        node({
          id: "reranked-top",
          task_type: "test_debug",
          trigger_pattern: "Investigate the payments auth regression and inspect the fixture handshake path first",
          compact_hint: "Check the fixture handshake before changing the payments auth code path.",
          retrieval_text:
            "Investigate the payments auth regression and inspect the fixture handshake path first\nCheck the fixture handshake before changing the payments auth code path.",
          helped_count: 2,
          support_count: 2
        })
      ],
      {
        reranker: async ({ candidates: rerankCandidates }) =>
          rerankCandidates.map((candidate) => ({
            id: candidate.node.id,
            score: candidate.node.id === "reranked-top" ? 1 : 0.2
          }))
      }
    );

    expect(candidates[0]).toMatchObject({
      node: expect.objectContaining({ id: "reranked-top" }),
      rerankScore: 1
    });
    expect(candidates[1]).toMatchObject({
      node: expect.objectContaining({ id: "baseline-top" }),
      rerankScore: 0.2
    });
    expect(candidates[0]!.totalScore).toBeGreaterThan(candidates[1]!.totalScore);
  });

  it("applies a default product rerank stage for close hybrid candidates", async () => {
    const candidates = await retrieveScoredCandidates(
      input({
        task_type: "test_debug",
        task_summary: "Investigate the payments auth regression and inspect the fixture handshake path first"
      }),
      [
        node({
          id: "baseline-top",
          task_type: "test_debug",
          trigger_pattern: "Inspect the payments auth regression in the current workspace",
          compact_hint: "Inspect the workspace and current auth regression path before editing.",
          retrieval_text:
            "Inspect the payments auth regression in the current workspace\nInspect the workspace and current auth regression path before editing.",
          helped_count: 4,
          support_count: 3
        }),
        node({
          id: "product-reranked-top",
          task_type: "test_debug",
          trigger_pattern: "Investigate the payments auth regression and inspect the fixture handshake path first",
          compact_hint: "Check the fixture handshake before changing the payments auth code path.",
          goal: "Narrow the payments auth regression through the fixture handshake first.",
          recommended_steps: [
            "Inspect the auth fixture handshake before changing code.",
            "Keep the investigation read-only until the regression signature is clear."
          ],
          retrieval_text:
            "Investigate the payments auth regression and inspect the fixture handshake path first\nCheck the fixture handshake before changing the payments auth code path.",
          helped_count: 2,
          support_count: 2
        })
      ]
    );

    expect(candidates[0]).toMatchObject({
      node: expect.objectContaining({ id: "product-reranked-top" }),
      rerankScore: expect.any(Number)
    });
    expect(candidates[0]!.rerankScore).toBeGreaterThan(candidates[1]!.rerankScore ?? -1);
    expect(candidates[0]!.totalScore).toBeGreaterThan(candidates[1]!.totalScore);
  });

  it("rewrites long read-only investigation prompts before semantic retrieval", async () => {
    const embedQuerySpy = vi.fn(async () => [1, 0, 0]);
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      embedQuery: embedQuerySpy,
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const candidates = await retrieveScoredCandidates(
      input({
        task_type: "test_debug",
        task_summary:
          "Investigate the payments auth test regression in this workspace by checking the auth fixture handshake first. Read-only analysis only; do not modify files."
      }),
      [
        node({
          id: "payments-mature-top",
          task_type: "test_debug",
          trigger_pattern: "Fix the failing payments auth test in ExperienceEngine",
          compact_hint: "Check the auth fixture handshake before changing the payments auth code path.",
          retrieval_text:
            "Fix the failing payments auth test in ExperienceEngine\nCheck the auth fixture handshake before changing the payments auth code path.",
          helped_count: 9,
          support_count: 7,
          validation_state: "validated_by_reuse"
        })
      ]
    );

    expect(embedQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining("Investigate the payments auth test regression by checking the auth fixture handshake first")
    );
    expect(embedQuerySpy).toHaveBeenCalledWith(expect.not.stringContaining("Read-only analysis only"));
    expect(embedQuerySpy).toHaveBeenCalledWith(expect.not.stringContaining("do not modify files"));
    expect(embedQuerySpy).toHaveBeenCalledWith(expect.stringContaining("failing test"));
    expect(candidates[0]?.node.id).toBe("payments-mature-top");
  });
});
