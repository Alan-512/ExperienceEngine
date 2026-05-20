import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase } from "../../src/store/sqlite/db.js";
import { ExperienceRuntimeService } from "../../src/runtime/service.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ScopeFingerprintRepository } from "../../src/store/sqlite/repositories/scope-fingerprint-repo.js";
import { decideIntervention } from "../../src/controller/intervention-controller.js";
import { removeTempDirForTests } from "../unit/temp-cleanup.js";
import type { ExperienceInput, ExperienceNode } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeTestEnv = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-crossrepo-"));
  tempDirs.push(runtimeDir);
  const config = loadConfig({
    dataDir: runtimeDir,
    sqlitePath: join(runtimeDir, "experienceengine.db"),
    captureDir: join(runtimeDir, "captures"),
    triggerThreshold: 0.6,
    maxHints: 3
  });
  
  const service = new ExperienceRuntimeService(config, {}, {
    disableBackgroundLearning: true,
    disableHybridPosttask: true
  });
  
  const db = (service as any).db as DatabaseSync;
  bootstrapDatabase(db);

  return {
    service,
    db,
    nodeRepo: new NodeRepository(db),
    fpRepo: new ScopeFingerprintRepository(db)
  };
};

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const mockNode = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_cross",
  node_type: "strategy",
  scope_id: "scope_target",
  task_type: "bug_fix",
  trigger_pattern: "Fix issue in auth router",
  compact_hint: "Use narrow try catch block.",
  success_signal: "Build succeeds.",
  evidence_summary: "Succeeds.",
  retrieval_text: "Fix issue auth",
  embedding: [1, 0, 0],
  source_kind: "system_derived",
  state: "active",
  delivery_state: "eligible",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  created_at: "2026-05-20T00:00:00.000Z",
  updated_at: "2026-05-20T00:00:00.000Z",
  ...overrides
});

const insertFingerprint = (fpRepo: ScopeFingerprintRepository, scopeId: string, hash: string, deps: Record<string, number>) => {
  fpRepo.upsert({
    scope_id: scopeId,
    schema_version: "1.0.0",
    fingerprint_hash: hash,
    fingerprint_json: JSON.stringify({
      schemaVersion: "1.0.0",
      fingerprintHash: hash,
      timestamp: Date.now(),
      primaryLanguage: "typescript",
      packageManager: "pnpm",
      lockfileFamily: "pnpm",
      frameworks: deps,
      databaseOrORM: {},
      testBuildTools: {},
      hostRuntimeAdapters: {},
      configMarkers: []
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
};

describe("Phase 6 Integration: Cross-Repo Intervention Governance", () => {
  it("enforces conservative delivery for same_family cross-repo candidates and handles weakly_related skip gates", async () => {
    const { service, db, fpRepo, nodeRepo } = makeTestEnv();

    insertFingerprint(fpRepo, "scope_source", "hash_source", { next: 14 });
    insertFingerprint(fpRepo, "scope_target", "hash_target", { next: 14 });

    const crossNode = mockNode({ scope_id: "scope_target", state: "active", delivery_state: "eligible" });
    nodeRepo.upsert(crossNode);

    const inputSameFamily: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix issue auth",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const decision1 = await decideIntervention(
      inputSameFamily,
      [crossNode],
      undefined,
      0.6,
      3,
      undefined,
      { db, toolNames: [] } as any,
      undefined
    );

    expect(decision1.mode).toBe("inject_conservative");
    expect(decision1.selected).toHaveLength(1);
    expect(decision1.selected[0].id).toBe("node_cross");
    expect(decision1.diagnostics?.gateReason).toBe("uncertainty_aware_routing");

    insertFingerprint(fpRepo, "scope_target", "hash_target_mismatch", { next: 13 });

    const decision2 = await decideIntervention(
      inputSameFamily,
      [crossNode],
      undefined,
      0.6,
      3,
      undefined,
      { db, toolNames: [] } as any,
      undefined
    );

    expect(decision2.mode).toBe("skip");
    expect(decision2.selected).toHaveLength(0);
    expect(decision2.diagnostics?.decisionReason).toBe("cross_repo_blocked_by_portability_band_weakly_related");
  });

  it("tracks post-task portability evidence and upgrades same_family to validated_portable after 3 successes", async () => {
    const { service, db, fpRepo, nodeRepo } = makeTestEnv();

    insertFingerprint(fpRepo, "scope_source", "hash_source", { next: 14 });
    insertFingerprint(fpRepo, "scope_target", "hash_target", { next: 14 });

    const crossNode = mockNode({ scope_id: "scope_target", state: "active", delivery_state: "eligible" });
    nodeRepo.upsert(crossNode);

    const triggerSuccessFinalize = async () => {
      const finalizeInput: ExperienceInput = {
        scope_id: "scope_source",
        task_type: "bug_fix",
        task_summary: "Fix issue auth",
        tool_events: [],
        outcome_signal: "success",
        injected_node_ids: ["node_cross"]
      };

      await (service as any).updateInjectedNodes(finalizeInput, "attrib_1", "task_run_1", undefined, "episode_1");
    };

    let node = nodeRepo.getById("node_cross")!;
    expect(node.portable_validation_evidence).toBeUndefined();

    await triggerSuccessFinalize();
    node = nodeRepo.getById("node_cross")!;
    expect(node.portable_validation_evidence?.compatibilityClasses?.hash_source?.successReuseCount).toBe(1);
    expect(node.portable_validation_evidence?.compatibilityClasses?.hash_source?.harmCount).toBe(0);

    await triggerSuccessFinalize();
    await triggerSuccessFinalize();

    node = nodeRepo.getById("node_cross")!;
    expect(node.portable_validation_evidence?.compatibilityClasses?.hash_source?.successReuseCount).toBe(3);

    const decisionAfterSuccesses = await decideIntervention(
      {
        scope_id: "scope_source",
        task_type: "bug_fix",
        task_summary: "Fix issue auth",
        tool_events: [],
        outcome_signal: "unknown",
        injected_node_ids: []
      },
      [node],
      undefined,
      0.6,
      3,
      undefined,
      { db, toolNames: [] } as any,
      undefined
    );

    expect(decisionAfterSuccesses.mode).toBe("inject");
    expect(decisionAfterSuccesses.selected[0].id).toBe("node_cross");

    const finalizeHarmInput: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix issue auth",
      tool_events: [{ tool_name: "exec", status: "failure", error_signature: "fatal error in router" } as any],
      outcome_signal: "failure",
      injected_node_ids: ["node_cross"]
    };
    await (service as any).updateInjectedNodes(finalizeHarmInput, "attrib_2", "task_run_2", undefined, "episode_2");

    node = nodeRepo.getById("node_cross")!;
    expect(node.portable_validation_evidence?.compatibilityClasses?.hash_source?.successReuseCount).toBe(3);
    expect(node.portable_validation_evidence?.compatibilityClasses?.hash_source?.harmCount).toBe(1);

    const decisionAfterHarm = await decideIntervention(
      {
        scope_id: "scope_source",
        task_type: "bug_fix",
        task_summary: "Fix issue auth",
        tool_events: [],
        outcome_signal: "unknown",
        injected_node_ids: []
      },
      [node],
      undefined,
      0.6,
      3,
      undefined,
      { db, toolNames: [] } as any,
      undefined
    );

    // Now that the node has global harm count > 0, the cross-scope global harm check correctly blocks it from same_family delivery, forcing a skip decision.
    expect(decisionAfterHarm.mode).toBe("skip");
  });
});
