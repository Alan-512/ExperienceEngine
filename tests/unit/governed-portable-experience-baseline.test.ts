import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { AttributionRecordRepository } from "../../src/store/sqlite/repositories/attribution-record-repo.js";
import type { ExperienceNode, AttributionRecord } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTestEnv = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-baseline-"));
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
    nodeRepo: new NodeRepository(db),
    attribRepo: new AttributionRecordRepository(db)
  };
};

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

const mockNode = (overrides: Partial<ExperienceNode>): ExperienceNode => ({
  id: "node_1",
  node_type: "strategy",
  scope_id: "scope_1",
  task_type: "bug_fix",
  trigger_pattern: "Fix error in module router",
  compact_hint: "Narrow down the issue using prints.",
  success_signal: "Build succeeds without errors.",
  evidence_summary: "Reproduction steps pass.",
  retrieval_text: "Fix error in module router\nNarrow down the issue using prints.",
  embedding: [0.1, 0.2, 0.3],
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

const mockAttribution = (overrides: Partial<AttributionRecord>): AttributionRecord => ({
  id: "attrib_1",
  node_id: "node_1",
  delivered: true,
  outcome: "success",
  attribution_verdict: "neutral",
  confidence: "medium",
  evidence_refs: [],
  source: "automatic",
  created_at: "2026-05-20T00:00:00.000Z",
  ...overrides
});

describe("Governed Portable Experience Baseline", () => {
  it("proves same-scope retrieval is active for eligible delivery state", () => {
    const { nodeRepo } = makeTestEnv();
    
    nodeRepo.upsert(mockNode({ id: "node_active", scope_id: "scope_1", delivery_state: "eligible", state: "active" }));
    nodeRepo.upsert(mockNode({ id: "node_shadow", scope_id: "scope_1", delivery_state: "shadow_only", state: "candidate" }));
    
    const injectable = nodeRepo.listLiveInjectableByExactScope("scope_1");
    expect(injectable.map(n => n.id)).toContain("node_active");
    expect(injectable.map(n => n.id)).not.toContain("node_shadow");
    
    const shadowVisible = nodeRepo.listShadowEligibleByExactScope("scope_1");
    expect(shadowVisible.map(n => n.id)).toContain("node_shadow");
  });

  it("proves cross-scope candidates are delivered conservatively", () => {
    const { nodeRepo } = makeTestEnv();
    
    nodeRepo.upsert(mockNode({ id: "node_same", scope_id: "scope_1", state: "active" }));
    nodeRepo.upsert(mockNode({ id: "node_cross_eligible", scope_id: "scope_2", state: "active" }));
    nodeRepo.upsert(mockNode({ id: "node_cross_priority", scope_id: "scope_3", state: "priority_candidate" }));
    
    const crossScopeCandidates = nodeRepo.listConservativeCrossScopeCandidates("scope_1");
    const ids = crossScopeCandidates.map(n => n.id).sort();
    
    expect(ids).toContain("node_cross_eligible");
    expect(ids).toContain("node_cross_priority");
    expect(ids).not.toContain("node_same");
    
    // Cross scope candidate properties must correspond to conservative limits
    const crossEligible = crossScopeCandidates.find(n => n.id === "node_cross_eligible");
    expect(crossEligible?.delivery_state).toBe("eligible");
  });

  it("proves neutral and unknown outcome attributions do not mutate counters", () => {
    const { nodeRepo, attribRepo } = makeTestEnv();
    
    nodeRepo.upsert(mockNode({ id: "node_1", helped_count: 5, harmed_count: 2 }));
    
    // Automatic neutral attribution
    attribRepo.insert(mockAttribution({ id: "attrib_1", node_id: "node_1", attribution_verdict: "neutral" }));
    const storedNodeNeutral = nodeRepo.getById("node_1");
    expect(storedNodeNeutral?.helped_count).toBe(5);
    expect(storedNodeNeutral?.harmed_count).toBe(2);
    
    // Automatic unknown attribution
    attribRepo.insert(mockAttribution({ id: "attrib_2", node_id: "node_1", attribution_verdict: "unknown" }));
    const storedNodeUnknown = nodeRepo.getById("node_1");
    expect(storedNodeUnknown?.helped_count).toBe(5);
    expect(storedNodeUnknown?.harmed_count).toBe(2);
  });

  it("proves quarantined delivery gates prevent normal retrieval", () => {
    const { nodeRepo } = makeTestEnv();
    
    nodeRepo.upsert(mockNode({ id: "node_quarantined", scope_id: "scope_1", delivery_state: "quarantined", state: "retired" }));
    
    const injectable = nodeRepo.listLiveInjectableByExactScope("scope_1");
    expect(injectable.map(n => n.id)).not.toContain("node_quarantined");
    
    const shadowVisible = nodeRepo.listShadowEligibleByExactScope("scope_1");
    expect(shadowVisible.map(n => n.id)).not.toContain("node_quarantined");
    
    const crossScope = nodeRepo.listConservativeCrossScopeCandidates("scope_2");
    expect(crossScope.map(n => n.id)).not.toContain("node_quarantined");
  });
});
