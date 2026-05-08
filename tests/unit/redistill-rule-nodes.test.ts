import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { loadConfig } from "../../src/config/load-config.js";
import { redistillRuleNodes } from "../../src/maintenance/redistill-rule-nodes.js";
import type { ExperienceCandidate, ExperienceNode } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";
import {
  clearEmbeddingProviderForTests,
  setEmbeddingProviderForTests
} from "../../src/store/vector/embeddings.js";

const tempDirs: string[] = [];

const makeDb = (overrides: Partial<ReturnType<typeof loadConfig>> = {}) => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-redistill-"));
  tempDirs.push(runtimeDir);
  const config = loadConfig({
    dataDir: runtimeDir,
    sqlitePath: join(runtimeDir, "experienceengine.db"),
    captureDir: join(runtimeDir, "captures"),
    distillationAutoDrain: false,
    ...overrides
  });
  const db = openDatabase(config);
  bootstrapDatabase(db);
  return { db, config };
};

afterEach(() => {
  clearEmbeddingProviderForTests();
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const makeCandidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_rule_1",
  task_run_id: "taskrun_rule_1",
  candidate_kind: "successful_fix",
  source_record_id: "input_rule_1",
  scope_id: "scope_rule",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix flaky auth vitest failures",
  compact_hint: "Keep the auth repro loop tight.",
  goal: "Tighten the auth debug loop",
  success_signal: "The focused auth vitest passes",
  evidence_summary: "Derived from the focused auth loop.",
  retrieval_text: "Fix flaky auth vitest failures\nKeep the auth repro loop tight.",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_context_summary: "Auth flake investigation.",
  raw_summary: "Focused auth loop stabilized the failure.",
  failure_signature: "auth vitest flake",
  source_signal: {
    task_summary: "Fix flaky auth vitest failures",
    context_summary: "Auth flake investigation.",
    outcome_signal: "success",
    tool_events: [],
    evidence: ["vitest: success: auth repro passes"],
    failure_signature: "auth vitest flake",
    retry_count: 1,
    correction_signals: ["apply_patch"],
    tool_event_summary: ["failure: auth flake", "success: auth repro passes"]
  },
  lifecycle_state: "distilled",
  retry_count: 0,
  distilled_node_id: "node_rule_1",
  created_at: "2026-03-18T00:00:00.000Z",
  updated_at: "2026-03-18T00:00:00.000Z",
  distilled_at: "2026-03-18T00:01:00.000Z",
  ...overrides
});

const makeRuleNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_rule_1",
  node_type: "strategy",
  scope_id: "scope_rule",
  task_type: "test_debug",
  trigger_pattern: "Fix flaky auth vitest failures",
  compact_hint: "Keep the auth repro loop tight.",
  goal: "Tighten the auth debug loop",
  success_signal: "The focused auth vitest passes",
  evidence_summary: "Derived from the focused auth loop.",
  retrieval_text: "Fix flaky auth vitest failures\nKeep the auth repro loop tight.",
  embedding: [1, 0, 0],
  embedding_provider: "local",
  embedding_model: "Xenova/multilingual-e5-small",
  embedding_version: "local-e5-v1",
  embedding_dimensions: 3,
  distillation_mode_used: "rule",
  distillation_source: "rule",
  source_kind: "system_derived",
  origin_record_ids: ["input_rule_1"],
  helped_record_ids: ["review_helped_1"],
  harmed_record_ids: [],
  state: "active",
  usage_count: 3,
  helped_count: 1,
  harmed_count: 0,
  support_count: 2,
  last_used_at: "2026-03-18T00:02:00.000Z",
  last_helped_at: "2026-03-18T00:03:00.000Z",
  created_at: "2026-03-18T00:01:00.000Z",
  updated_at: "2026-03-18T00:03:00.000Z",
  ...overrides
});

describe("redistillRuleNodes", () => {
  it("upgrades a rule-promoted node to llm without losing governance history", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [0, 1, 0];
      }
    });

    const { db, config } = makeDb();
    const candidateRepo = new CandidateRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate());
    nodeRepo.upsert(makeRuleNode());

    const report = await redistillRuleNodes({
      config,
      candidateRepo,
      nodeRepo,
      distiller: {
        async distill() {
          return {
            node_type: "strategy",
            scope_id: "scope_rule",
            task_type: "test_debug",
            trigger_pattern: "Fix flaky auth vitest failures",
            compact_hint: "Re-run the smallest auth repro before every fix.",
            goal: "Keep auth fixes narrowly verified.",
            recommended_steps: ["Run the focused auth repro", "Change one seam", "Run the repro again"],
            avoid_steps: ["Do not widen the repro loop too early"],
            fallback_steps: ["Inspect the first failing auth assertion"],
            success_signal: "The focused auth repro passes",
            evidence_summary: "Upgraded through llm distillation.",
            retrieval_text: "ignored",
            source_kind: "system_derived",
            distillation_mode_used: "llm",
            distillation_source: "explicit_provider"
          };
        }
      }
    });

    expect(report).toEqual({
      attempted: 1,
      upgraded: 1,
      skippedNoCandidate: 0,
      failed: 0
    });

    const upgraded = nodeRepo.getById("node_rule_1");
    expect(upgraded?.id).toBe("node_rule_1");
    expect(upgraded?.compact_hint).toContain("smallest auth repro");
    expect(upgraded?.distillation_mode_used).toBe("llm");
    expect(upgraded?.distillation_source).toBe("explicit_provider");
    expect(upgraded?.redistilled_from).toBe("rule");
    expect(upgraded?.usage_count).toBe(3);
    expect(upgraded?.helped_count).toBe(1);
    expect(upgraded?.support_count).toBe(2);
    expect(upgraded?.state).toBe("active");
    expect(upgraded?.embedding).toEqual([0, 1, 0]);
    expect(candidateRepo.getById("candidate_rule_1")?.last_error).toBeUndefined();
  });

  it("skips rule nodes that no longer have a source candidate", async () => {
    const { db, config } = makeDb();
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeRuleNode({ id: "node_without_candidate" }));

    const report = await redistillRuleNodes({
      config,
      candidateRepo: new CandidateRepository(db),
      nodeRepo,
      distiller: {
        async distill() {
          throw new Error("should not run");
        }
      }
    });

    expect(report).toEqual({
      attempted: 1,
      upgraded: 0,
      skippedNoCandidate: 1,
      failed: 0
    });
  });
});
