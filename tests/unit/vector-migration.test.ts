import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { VectorMigrationPipeline } from "../../src/maintenance/vector-migrator.js";
import { setEmbeddingProviderForTests, clearEmbeddingProviderForTests, embedQueryText } from "../../src/store/vector/embeddings.js";
import { retrieveCandidateBundle } from "../../src/controller/candidate-retriever.js";
import type { ExperienceNode, ExperienceInput } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeRepo = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-migration-test-"));
  tempDirs.push(runtimeDir);
  const db = openDatabase(
    loadConfig({
      dataDir: runtimeDir,
      sqlitePath: join(runtimeDir, "experienceengine.db"),
      captureDir: join(runtimeDir, "captures")
    })
  );
  bootstrapDatabase(db);
  return {
    db,
    repo: new NodeRepository(db),
    runtimeDir
  };
};

const makeMockNode = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_" + Math.random().toString(36).slice(2, 9),
  node_type: "warning",
  scope_id: "scope_1",
  task_type: "test_debug",
  trigger_pattern: "failing auth test",
  compact_hint: "narrow signature",
  success_signal: "narrow reproduction",
  evidence_summary: "evidence",
  retrieval_text: "failing auth test narrow signature",
  embedding: new Array(192).fill(0.1),
  embedding_provider: "legacy",
  embedding_model: "hashed-bow",
  embedding_version: "legacy-v1",
  embedding_dimensions: 192,
  source_kind: "system_derived",
  experience_kind: "expectation_correction",
  origin_record_ids: ["origin_1"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

describe("Vector Migration (Phase 3)", () => {
  const mockProvider: import("../../src/store/vector/provider-types.js").SemanticEmbeddingProvider = {
    provider: "local",
    model: "mock-model",
    version: "mock-version",
    dimensions: 192,
    embedQuery: async (t: string) => new Array(192).fill(0.25),
    embedPassage: async (t: string) => new Array(192).fill(0.25)
  };

  const targetSpace = {
    provider: "local",
    model: "mock-model",
    version: "mock-version",
    dimensions: 192
  };

  beforeEach(() => {
    setEmbeddingProviderForTests(mockProvider);
  });

  afterEach(() => {
    clearEmbeddingProviderForTests();
    while (tempDirs.length) {
      const dir = tempDirs.pop();
      if (dir) {
        removeTempDirForTests(dir);
      }
    }
  });

  describe("discoverPendingNodes", () => {
    it("identifies mismatching embedding spaces and non-current statuses", () => {
      const { db, repo } = makeRepo();
      const pipeline = new VectorMigrationPipeline();

      // Node A: Space matches, status is current -> Should NOT be discovered
      repo.upsert(
        makeMockNode({
          id: "node_a",
          embedding_provider: "local",
          embedding_model: "mock-model",
          embedding_version: "mock-version",
          embedding_dimensions: 192,
          migration_status: "current"
        })
      );

      // Node B: Space mismatches, status is current -> Should be discovered
      repo.upsert(
        makeMockNode({
          id: "node_b",
          embedding_provider: "legacy",
          embedding_dimensions: 192,
          migration_status: "current"
        })
      );

      // Node C: Space matches, but status is pending -> Should be discovered
      repo.upsert(
        makeMockNode({
          id: "node_c",
          embedding_provider: "local",
          embedding_model: "mock-model",
          embedding_version: "mock-version",
          embedding_dimensions: 192,
          migration_status: "pending"
        })
      );

      // Node D: Space matches, status is missing (null) -> Should be discovered
      repo.upsert(
        makeMockNode({
          id: "node_d",
          embedding_provider: "local",
          embedding_model: "mock-model",
          embedding_version: "mock-version",
          embedding_dimensions: 192,
          migration_status: undefined
        })
      );

      const discoveredCount = pipeline.discoverPendingNodes(db, targetSpace);
      expect(discoveredCount).toBe(3); // node_b, node_c, node_d

      const updatedA = repo.getById("node_a");
      const updatedB = repo.getById("node_b");
      const updatedC = repo.getById("node_c");
      const updatedD = repo.getById("node_d");

      expect(updatedA?.migration_status).toBe("current");
      expect(updatedB?.migration_status).toBe("pending");
      expect(updatedC?.migration_status).toBe("pending");
      expect(updatedD?.migration_status).toBe("pending");
    });
  });

  describe("migrateBatch & runMigration", () => {
    it("runs successful chunked migrations and handles partial failure recovery", async () => {
      const { db, repo } = makeRepo();
      const pipeline = new VectorMigrationPipeline();

      // Node 1: Mismatched, should succeed
      repo.upsert(makeMockNode({ id: "node_1" }));
      // Node 2: Mismatched, should succeed
      repo.upsert(makeMockNode({ id: "node_2" }));
      // Node 3: Mismatched, should fail (we will mock embedPassage to fail for this node)
      repo.upsert(makeMockNode({ id: "node_3", retrieval_text: "trigger_fail" }));

      // Setup custom provider to fail on "trigger_fail"
      const errorProvider: import("../../src/store/vector/provider-types.js").SemanticEmbeddingProvider = {
        ...mockProvider,
        embedPassage: async (text: string) => {
          if (text === "trigger_fail") {
            throw new Error("mock encoding error");
          }
          return new Array(192).fill(0.8);
        }
      };
      setEmbeddingProviderForTests(errorProvider);

      // Discover pending nodes
      const totalDiscovered = pipeline.discoverPendingNodes(db, targetSpace);
      expect(totalDiscovered).toBe(3);

      // Run migration with a batch size of 2
      const config = loadConfig();
      const report = await pipeline.runMigration(db, targetSpace, {
        config,
        batchSize: 2,
        throttleGapMs: 5
      });

      expect(report.totalDiscovered).toBe(3);
      expect(report.processed).toBe(3);
      expect(report.succeeded).toBe(2);
      expect(report.failed).toBe(1);

      const n1 = repo.getById("node_1");
      const n2 = repo.getById("node_2");
      const n3 = repo.getById("node_3");

      expect(n1?.migration_status).toBe("current");
      expect(n1?.embedding_provider).toBe("local");
      expect(n1?.embedding).toEqual(new Array(192).fill(0.8));

      expect(n2?.migration_status).toBe("current");

      expect(n3?.migration_status).toBe("failed");
      expect(n3?.migration_last_error).toContain("Migration fallback detected");

      // Verify resume: if we fix the error provider and run again, only node_3 (failed) should be processed
      setEmbeddingProviderForTests(mockProvider);
      
      const resumeReport = await pipeline.runMigration(db, targetSpace, {
        config,
        batchSize: 10
      });

      expect(resumeReport.processed).toBe(1); // Only Node 3
      expect(resumeReport.succeeded).toBe(1);
      expect(resumeReport.failed).toBe(0);

      const fixedN3 = repo.getById("node_3");
      expect(fixedN3?.migration_status).toBe("current");
      expect(fixedN3?.migration_last_error).toBeUndefined();
    });

    it("respects the throttleGapMs to prevent event-loop choking", async () => {
      const { db, repo } = makeRepo();
      const pipeline = new VectorMigrationPipeline();

      repo.upsert(makeMockNode({ id: "t1" }));
      repo.upsert(makeMockNode({ id: "t2" }));
      repo.upsert(makeMockNode({ id: "t3" }));

      pipeline.discoverPendingNodes(db, targetSpace);

      const start = Date.now();
      await pipeline.runMigration(db, targetSpace, {
        config: loadConfig(),
        batchSize: 1,
        throttleGapMs: 50
      });
      const duration = Date.now() - start;

      // Because batchSize = 1 and we have 3 nodes, it will execute 3 batches.
      // So there will be 2 delay gaps of 50ms = 100ms.
      // Thus, duration should be at least 80ms.
      expect(duration).toBeGreaterThanOrEqual(80);
    });
  });

  describe("retrieval compatibility gating", () => {
    it("excludes pending or migrating nodes from vector retrieval with precise diagnostic codes", async () => {
      const { db, repo } = makeRepo();

      // Node A: Space mismatches, status is pending. Should be filtered out of vector scoring, and have diagnostic reason.
      const nodeA = makeMockNode({
        id: "node_pending",
        embedding_provider: "legacy",
        migration_status: "pending",
        scope_id: "scope_1",
        state: "active",
        retrieval_text: "diagnostic exclude test"
      });
      repo.upsert(nodeA);

      // Node B: Space matches, status is current. Should participate in vector scoring.
      const nodeB = makeMockNode({
        id: "node_compatible",
        embedding_provider: "local",
        embedding_model: "mock-model",
        embedding_version: "mock-version",
        embedding_dimensions: 192,
        migration_status: "current",
        scope_id: "scope_1",
        state: "active",
        embedding: new Array(192).fill(0.25)
      });
      repo.upsert(nodeB);

      const input: ExperienceInput = {
        scope_id: "scope_1",
        task_type: "test_debug",
        task_summary: "diagnostic exclude test",
        context_summary: "something",
        tool_events: [],
        outcome_signal: "unknown",
        injected_node_ids: []
      };

      const allNodes = repo.listAll();
      const config = loadConfig();

      const bundle = await retrieveCandidateBundle(input, allNodes, { config });
      
      const compCandidate = bundle.candidates.find(c => c.node.id === "node_compatible");
      const pendCandidate = bundle.candidates.find(c => c.node.id === "node_pending");

      // compatible node should have ordinary reasons
      expect(compCandidate).toBeDefined();
      expect(compCandidate?.retrievalReasons).toContain("semantic:1.0000");

      // pending node should be retrieved (possibly via lexical/fallback) but explicitly tagged with exclusion
      expect(pendCandidate).toBeDefined();
      expect(pendCandidate?.retrievalReasons).toContain("semantic:excluded_due_to_pending_migration");
    });

    it("excludes incompatible spaces from vector retrieval with incompatible space diagnostic code", async () => {
      const { db, repo } = makeRepo();

      // Node A: Space mismatches, status is current (e.g. metadata is corrupted or manually altered).
      const nodeA = makeMockNode({
        id: "node_incompatible",
        embedding_provider: "legacy",
        migration_status: "current",
        scope_id: "scope_1",
        state: "active"
      });
      repo.upsert(nodeA);

      const input: ExperienceInput = {
        scope_id: "scope_1",
        task_type: "test_debug",
        task_summary: "exclude incompatible space test",
        context_summary: "something",
        tool_events: [],
        outcome_signal: "unknown",
        injected_node_ids: []
      };

      const allNodes = repo.listAll();
      const config = loadConfig();

      const bundle = await retrieveCandidateBundle(input, allNodes, { config });
      const incompCandidate = bundle.candidates.find(c => c.node.id === "node_incompatible");

      expect(incompCandidate).toBeDefined();
      expect(incompCandidate?.retrievalReasons).toContain("semantic:excluded_due_to_incompatible_space");
    });
  });
});
