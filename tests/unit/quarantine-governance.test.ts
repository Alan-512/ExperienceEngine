import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ReviewEventRepository } from "../../src/store/sqlite/repositories/review-event-repo.js";
import { applyGovernedNodeFeedback } from "../../src/experience-management/node-lifecycle-governance.js";
import { retrieveCandidateBundle } from "../../src/controller/candidate-retriever.js";
import { decideIntervention } from "../../src/controller/intervention-controller.js";
import { ExperienceRuntimeService } from "../../src/runtime/service.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import type { ExperienceNode, ExperienceInput } from "../../src/types/domain.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTestDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-quarantine-governance-"));
  tempDirs.push(dir);
  return dir;
};

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
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const node = (overrides: Partial<ExperienceNode>): ExperienceNode => {
  const base: ExperienceNode = {
    id: "node-1",
    node_type: "strategy",
    scope_id: "scope-a",
    task_type: "test_debug",
    trigger_pattern: "Fix the failing vitest auth test",
    compact_hint: "Run the failing vitest auth test before editing.",
    success_signal: "The targeted test passes",
    evidence_summary: "Evidence from prior test runs.",
    source_kind: "system_derived",
    origin_record_ids: ["input_origin"],
    helped_record_ids: [],
    harmed_record_ids: [],
    state: "active",
    delivery_state: "eligible",
    usage_count: 1,
    helped_count: 1,
    harmed_count: 0,
    support_count: 2,
    embedding: [1, 0, 0],
    embedding_provider: "local",
    embedding_model: "Xenova/multilingual-e5-small",
    embedding_version: "local-e5-v1",
    embedding_dimensions: 3,
    created_at: "2026-03-13T00:00:00.000Z",
    updated_at: "2026-03-13T00:00:00.000Z"
  };
  return {
    ...base,
    ...overrides
  };
};

describe("Quarantine Lease and Release Governance", () => {
  describe("1. Metadata Initialization", () => {
    it("initializes quarantine lease metadata on entering quarantine", () => {
      const activeNode = node({
        id: "active-node",
        state: "active",
        delivery_state: "eligible",
        consecutive_harmed_count: 1
      });

      const quarantinedNode = applyGovernedNodeFeedback(activeNode, "harmed");

      expect(quarantinedNode.delivery_state).toBe("quarantined");
      expect(quarantinedNode.quarantined_at).toBeDefined();
      expect(quarantinedNode.quarantine_reason).toBe("consecutive_harms");
      expect(quarantinedNode.quarantine_original_delivery_state).toBe("eligible");
      expect(quarantinedNode.quarantine_lease_expires_at).toBeDefined();
      // Ensure lease is set in the future (30 days ~ 2592000 seconds)
      const expiresAt = new Date(quarantinedNode.quarantine_lease_expires_at!).getTime();
      const now = Date.now();
      expect(expiresAt).toBeGreaterThan(now + 29 * 24 * 60 * 60 * 1000);
      expect(quarantinedNode.quarantine_release_attempt_count).toBe(0);
      expect(quarantinedNode.quarantine_no_harm_pass_count).toBe(0);
    });
  });

  describe("2. Dynamic Transitioning", () => {
    it("transitions expired quarantine lease to shadow_probe during retrieveCandidateBundle", async () => {
      const runtimeDir = makeTestDir();
      const sqlitePath = join(runtimeDir, "experienceengine.db");
      const db = openDatabase(loadConfig({ sqlitePath }));
      bootstrapDatabase(db);
      const repo = new NodeRepository(db);

      const pastExpires = new Date(Date.now() - 1000).toISOString();
      const expiredNode = node({
        id: "expired-quarantine-node",
        delivery_state: "quarantined",
        quarantine_lease_expires_at: pastExpires,
        quarantine_release_attempt_count: 0
      });
      repo.upsert(expiredNode);

      const mockInput: ExperienceInput = {
        scope_id: "scope-a",
        task_type: "test_debug",
        task_summary: "Fix the auth test",
        tool_events: [],
        outcome_signal: "unknown",
        injected_node_ids: []
      };

      const dbNodes = repo.listShadowProbeByExactScope("scope-a");
      expect(dbNodes.length).toBe(0); // Before retrieval, it's quarantined, not shadow_probe

      const bundle = await retrieveCandidateBundle(mockInput, [expiredNode], {
        includeShadowDiagnosticCandidates: true,
        retrievalContext: {
          scopeId: "scope-a",
          host: "codex",
          taskType: "test_debug",
          taskSummary: "Fix the auth test",
          outcomeSignal: "unknown",
          injectedNodeIds: [],
          toolNames: [],
          db
        }
      });

      // Node should have transitioned to shadow_probe in the database
      const dbNodesAfter = repo.listShadowProbeByExactScope("scope-a");
      expect(dbNodesAfter.length).toBe(1);
      expect(dbNodesAfter[0]?.id).toBe("expired-quarantine-node");
      expect(dbNodesAfter[0]?.quarantine_release_attempt_count).toBe(1);
      expect(dbNodesAfter[0]?.quarantine_no_harm_pass_count).toBe(0);
      expect(dbNodesAfter[0]?.quarantine_last_release_attempt_at).toBeDefined();

      // Ensure in-memory nodes inside bundle candidates also updated their states
      const candidate = bundle.candidates.find(c => c.node.id === "expired-quarantine-node");
      expect(candidate).toBeDefined();
      expect(candidate?.node.delivery_state).toBe("shadow_probe");
      expect(candidate?.node.quarantine_release_attempt_count).toBe(1);
    });
  });

  describe("3. Diagnostic Suppression", () => {
    it("suppresses shadow_probe candidates from live prompt injection", async () => {
      const probeNode = node({
        id: "probe-node",
        delivery_state: "shadow_probe"
      });

      const mockInput: ExperienceInput = {
        scope_id: "scope-a",
        task_type: "test_debug",
        task_summary: "Fix the auth test",
        tool_events: [],
        outcome_signal: "unknown",
        injected_node_ids: []
      };

      const decision = await decideIntervention(
        mockInput,
        [probeNode],
        undefined,
        0.6,
        3,
        undefined,
        {
          scopeId: "scope-a",
          host: "codex",
          taskType: "test_debug",
          taskSummary: "Fix the auth test",
          outcomeSignal: "unknown",
          injectedNodeIds: [],
          toolNames: []
        }
      );

      // Verify that shadow_probe node is strictly suppressed from active prompt hints
      expect(decision.mode).toBe("skip");
      expect(decision.selected).toEqual([]);
      // Should be tracked inside recordOnlyDiagnosticCandidateIds
      expect(decision.diagnostics?.recordOnlyDiagnosticCandidateIds).toContain("probe-node");
    });
  });

  describe("4. No-Harm Restoration", () => {
    it("promotes node to conservative_only after 3 successful no-harm passes", async () => {
      const runtimeDir = makeTestDir();
      const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
      const config = loadConfig({ sqlitePath });
      const service = new ExperienceRuntimeService(config, undefined, {
        disableBackgroundLearning: true
      });

      const db = new DatabaseSync(sqlitePath);
      bootstrapDatabase(db);
      const repo = new NodeRepository(db);
      const reviewRepo = new ReviewEventRepository(db);

      const cwd = "/repo";
      const scopeId = resolveScope(cwd).scope_id;

      const probeNode = node({
        id: "probe-node-restore",
        scope_id: scopeId,
        delivery_state: "shadow_probe",
        quarantine_release_attempt_count: 1,
        quarantine_no_harm_pass_count: 2 // Has 2 passes, next success makes it 3!
      });
      repo.upsert(probeNode);

      const sessionId = "session-restore";

      // 1. Call beforePromptBuild to retrieve shadow candidates and seed scorecard
      await service.beforePromptBuild({
        sessionId,
        cwd,
        userMessage: "Fix the failing auth test",
        taskSummary: "Fix the failing auth test"
      });

      // 2. Call finalize to trigger attribution compilation
      await service.finalizeTask({
        sessionId,
        cwd,
        userMessage: "Fix the failing auth test",
        taskSummary: "Fix the failing auth test",
        contextSummary: "Success with no harm",
        outcomeSignal: "success"
      });

      await service.waitForBackgroundLearning();

      const updatedNode = repo.getById("probe-node-restore");
      expect(updatedNode?.delivery_state).toBe("conservative_only");
      expect(updatedNode?.quarantine_release_reason).toBe("passed_shadow_probe");

      const events = reviewRepo.listByNodeId("probe-node-restore");
      expect(events.some(e => e.event_type === "restore_conservative")).toBe(true);
    });
  });

  describe("5. Probe Failure & Retirement", () => {
    it("resets lease and quarantine state on probe failure", async () => {
      const runtimeDir = makeTestDir();
      const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
      const config = loadConfig({ sqlitePath });
      const service = new ExperienceRuntimeService(config, undefined, {
        disableBackgroundLearning: true
      });

      const db = new DatabaseSync(sqlitePath);
      bootstrapDatabase(db);
      const repo = new NodeRepository(db);
      const reviewRepo = new ReviewEventRepository(db);

      const cwd = "/repo";
      const scopeId = resolveScope(cwd).scope_id;

      const probeNode = node({
        id: "probe-node-fail",
        scope_id: scopeId,
        delivery_state: "shadow_probe",
        quarantine_release_attempt_count: 1,
        quarantine_no_harm_pass_count: 1
      });
      repo.upsert(probeNode);

      const sessionId = "session-fail";

      await service.beforePromptBuild({
        sessionId,
        cwd,
        userMessage: "Fix the failing auth test",
        taskSummary: "Fix the failing auth test"
      });

      // Finalize with outcome = failure to cause probe failure
      await service.finalizeTask({
        sessionId,
        cwd,
        userMessage: "Fix the failing auth test",
        taskSummary: "Fix the failing auth test",
        contextSummary: "Failure occurred",
        outcomeSignal: "failure"
      });

      await service.waitForBackgroundLearning();

      const updatedNode = repo.getById("probe-node-fail");
      expect(updatedNode?.delivery_state).toBe("quarantined");
      expect(updatedNode?.quarantine_no_harm_pass_count).toBe(0);
      expect(updatedNode?.quarantine_lease_expires_at).toBeDefined();

      const events = reviewRepo.listByNodeId("probe-node-fail");
      expect(events.some(e => e.event_type === "quarantine")).toBe(true);
    });

    it("permanently retires the node if release attempts reach 3 or more", async () => {
      const runtimeDir = makeTestDir();
      const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
      const config = loadConfig({ sqlitePath });
      const service = new ExperienceRuntimeService(config, undefined, {
        disableBackgroundLearning: true
      });

      const db = new DatabaseSync(sqlitePath);
      bootstrapDatabase(db);
      const repo = new NodeRepository(db);
      const reviewRepo = new ReviewEventRepository(db);

      const cwd = "/repo";
      const scopeId = resolveScope(cwd).scope_id;

      const probeNode = node({
        id: "probe-node-retire",
        scope_id: scopeId,
        delivery_state: "shadow_probe",
        quarantine_release_attempt_count: 3, // At 3 attempts
        quarantine_no_harm_pass_count: 1
      });
      repo.upsert(probeNode);

      const sessionId = "session-retire";

      await service.beforePromptBuild({
        sessionId,
        cwd,
        userMessage: "Fix the failing auth test",
        taskSummary: "Fix the failing auth test"
      });

      // Finalize with failure to trigger quarantine / retirement
      await service.finalizeTask({
        sessionId,
        cwd,
        userMessage: "Fix the failing auth test",
        taskSummary: "Fix the failing auth test",
        contextSummary: "Failure occurred",
        outcomeSignal: "failure"
      });

      await service.waitForBackgroundLearning();

      const updatedNode = repo.getById("probe-node-retire");
      expect(updatedNode?.delivery_state).toBe("retired");
      expect(updatedNode?.state).toBe("retired");

      const events = reviewRepo.listByNodeId("probe-node-retire");
      expect(events.some(e => e.event_type === "retire")).toBe(true);
    });
  });
});
