import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { AttributionRecordRepository } from "../../src/store/sqlite/repositories/attribution-record-repo.js";
import { ScopeFingerprintRepository } from "../../src/store/sqlite/repositories/scope-fingerprint-repo.js";
import { buildPortabilityScorecard } from "../../src/controller/candidate-retriever.js";
import { evaluateTriggerRoute } from "../../src/controller/trigger-evaluator.js";
import type { ExperienceInput, ExperienceNode, ProjectFingerprint } from "../../src/types/domain.js";
import type { TriggerCandidateQuality } from "../../src/controller/trigger-evaluator.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTestEnv = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-portability-"));
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
    attribRepo: new AttributionRecordRepository(db),
    fpRepo: new ScopeFingerprintRepository(db)
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
  scope_id: "scope_target",
  task_type: "bug_fix",
  trigger_pattern: "Fix issue in module router",
  compact_hint: "Use print debugging.",
  success_signal: "Build succeeds.",
  evidence_summary: "Succeeds.",
  retrieval_text: "Fix issue\nUse print",
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

const mockFingerprint = (overrides: Partial<ProjectFingerprint>): ProjectFingerprint => ({
  schemaVersion: "1.0.0",
  fingerprintHash: "hash",
  timestamp: Date.now(),
  primaryLanguage: "typescript",
  packageManager: "pnpm",
  lockfileFamily: "pnpm",
  frameworks: {},
  databaseOrORM: {},
  testBuildTools: {},
  hostRuntimeAdapters: {},
  configMarkers: [],
  ...overrides
});

const insertFingerprint = (fpRepo: ScopeFingerprintRepository, scopeId: string, fp: ProjectFingerprint) => {
  fpRepo.upsert({
    scope_id: scopeId,
    schema_version: fp.schemaVersion,
    fingerprint_hash: fp.fingerprintHash,
    fingerprint_json: JSON.stringify(fp),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
};

describe("Phase 5: Portability Scoring And Bands", () => {
  it("falls back gracefully when db is absent or fingerprints are missing", () => {
    const nodeItem = mockNode({ id: "node_cross", scope_id: "scope_target" });
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    // Case 1: no db passed
    const scorecard1 = buildPortabilityScorecard(input, nodeItem, undefined);
    expect(scorecard1.score).toBe(0.5);
    expect(scorecard1.portabilityBand).toBe("weakly_related");

    // Case 2: db exists but fingerprints missing
    const { db } = makeTestEnv();
    const scorecard2 = buildPortabilityScorecard(input, nodeItem, { db } as any);
    expect(scorecard2.score).toBe(0.5);
    expect(scorecard2.portabilityBand).toBe("weakly_related");
  });

  it("scores 1.0 when fingerprint matches identically", () => {
    const { db, fpRepo } = makeTestEnv();
    const fpSource = mockFingerprint({
      primaryLanguage: "typescript",
      frameworks: { next: 14 },
      databaseOrORM: { prisma: 5 }
    });
    const fpTarget = mockFingerprint({
      primaryLanguage: "typescript",
      frameworks: { next: 14 },
      databaseOrORM: { prisma: 5 }
    });

    insertFingerprint(fpRepo, "scope_source", fpSource);
    insertFingerprint(fpRepo, "scope_target", fpTarget);

    const nodeItem = mockNode({ id: "node_cross", scope_id: "scope_target" });
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const scorecard = buildPortabilityScorecard(input, nodeItem, { db } as any);
    expect(scorecard.score).toBe(1.0);
    expect(scorecard.portabilityBand).toBe("same_family");
    expect(scorecard.matchedLanguage).toBe(true);
    expect(scorecard.sharedDependencies).toContain("next");
    expect(scorecard.sharedDependencies).toContain("prisma");
    expect(scorecard.penalties).toHaveLength(0);
  });

  it("penalizes core major version mismatches by 0.3", () => {
    const { db, fpRepo } = makeTestEnv();
    const fpSource = mockFingerprint({
      primaryLanguage: "typescript",
      frameworks: { next: 14 },
      databaseOrORM: { prisma: 5 }
    });
    const fpTarget = mockFingerprint({
      primaryLanguage: "typescript",
      frameworks: { next: 13 }, // Mismatch here: 14 vs 13
      databaseOrORM: { prisma: 5 }
    });

    insertFingerprint(fpRepo, "scope_source", fpSource);
    insertFingerprint(fpRepo, "scope_target", fpTarget);

    const nodeItem = mockNode({ id: "node_cross", scope_id: "scope_target" });
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const scorecard = buildPortabilityScorecard(input, nodeItem, { db } as any);
    // Base 1.0, core mismatch: next (14 vs 13) penalties -0.3 => 0.7. prisma matches.
    expect(scorecard.score).toBeCloseTo(0.7, 5);
    expect(scorecard.portabilityBand).toBe("weakly_related"); // core mismatch degrades to weakly_related
    expect(scorecard.penalties.find(p => p.dependency === "next")?.penalty).toBe(0.3);
  });

  it("penalizes auxiliary major version mismatches by 0.1", () => {
    const { db, fpRepo } = makeTestEnv();
    const fpSource = mockFingerprint({
      primaryLanguage: "typescript",
      testBuildTools: { vitest: 1 }
    });
    const fpTarget = mockFingerprint({
      primaryLanguage: "typescript",
      testBuildTools: { vitest: 2 } // Mismatch here: 1 vs 2
    });

    insertFingerprint(fpRepo, "scope_source", fpSource);
    insertFingerprint(fpRepo, "scope_target", fpTarget);

    const nodeItem = mockNode({ id: "node_cross", scope_id: "scope_target" });
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const scorecard = buildPortabilityScorecard(input, nodeItem, { db } as any);
    // Base 1.0, then penalty: -0.1. Final score: 0.9
    expect(scorecard.score).toBeCloseTo(0.9, 5);
    expect(scorecard.portabilityBand).toBe("same_family");
    expect(scorecard.penalties.find(p => p.dependency === "vitest")?.penalty).toBe(0.1);
  });

  it("penalizes unknown versions gently by 0.05", () => {
    const { db, fpRepo } = makeTestEnv();
    const fpSource = mockFingerprint({
      primaryLanguage: "typescript",
      frameworks: { next: 14 }
    });
    const fpTarget = mockFingerprint({
      primaryLanguage: "typescript",
      frameworks: { next: 0 } // Unknown version: 0
    });

    insertFingerprint(fpRepo, "scope_source", fpSource);
    insertFingerprint(fpRepo, "scope_target", fpTarget);

    const nodeItem = mockNode({ id: "node_cross", scope_id: "scope_target" });
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const scorecard = buildPortabilityScorecard(input, nodeItem, { db } as any);
    // Base 1.0, then penalty: -0.05. Final score: 0.95
    expect(scorecard.score).toBeCloseTo(0.95, 5);
    expect(scorecard.portabilityBand).toBe("same_family");
    expect(scorecard.penalties.find(p => p.dependency === "next")?.penalty).toBe(0.05);
  });

  it("upgrades same_family to validated_portable when validated reuse requirements are met", () => {
    const { db, fpRepo } = makeTestEnv();
    const fpSource = mockFingerprint({
      primaryLanguage: "typescript",
      fingerprintHash: "hash"
    });
    const fpTarget = mockFingerprint({
      primaryLanguage: "typescript",
      fingerprintHash: "hash"
    });

    insertFingerprint(fpRepo, "scope_source", fpSource);
    insertFingerprint(fpRepo, "scope_target", fpTarget);

    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    // Case 1: successReuseCount < 3
    const nodeItemLowReuse = mockNode({
      id: "node_low_reuse",
      scope_id: "scope_target",
      portable_validation_evidence: {
        compatibilityClasses: {
          hash: { successReuseCount: 2, harmCount: 0, lastUsedAt: Date.now() }
        }
      }
    });

    const scorecard1 = buildPortabilityScorecard(input, nodeItemLowReuse, { db } as any);
    expect(scorecard1.portabilityBand).toBe("same_family");

    // Case 2: successReuseCount >= 3 but harmCount > 0
    const nodeItemHarmed = mockNode({
      id: "node_harmed",
      scope_id: "scope_target",
      portable_validation_evidence: {
        compatibilityClasses: {
          hash: { successReuseCount: 3, harmCount: 1, lastUsedAt: Date.now() }
        }
      }
    });
    const scorecard2 = buildPortabilityScorecard(input, nodeItemHarmed, { db } as any);
    expect(scorecard2.portabilityBand).toBe("same_family");

    // Case 3: successReuseCount >= 3 and harmCount === 0 -> upgrade
    const nodeItemPerfect = mockNode({
      id: "node_perfect",
      scope_id: "scope_target",
      portable_validation_evidence: {
        compatibilityClasses: {
          hash: { successReuseCount: 3, harmCount: 0, lastUsedAt: Date.now() }
        }
      }
    });
    const scorecard3 = buildPortabilityScorecard(input, nodeItemPerfect, { db } as any);
    expect(scorecard3.portabilityBand).toBe("validated_portable");
  });

  it("blocks incompatible or weakly_related cross-repo candidates in evaluateTriggerRoute", () => {
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    // Case 1: incompatible, scopeMatch === false (cross-repo) -> skip
    const candidateQuality1: TriggerCandidateQuality = {
      semanticScore: 0.8,
      totalScore: 0.8,
      familyScore: 0.8,
      scopeMatch: false,
      taskFamilyMatch: true,
      state: "active",
      helpedCount: 1,
      harmedCount: 0,
      scoreMargin: 0.1,
      portabilityScorecard: {
        portabilityBand: "incompatible",
        score: 0.4,
        matchedLanguage: true,
        sharedDependencies: [],
        penalties: [],
        negativeEvidence: [],
        whyScore: "incompatible version"
      }
    };
    const route1 = evaluateTriggerRoute(input, undefined, { candidateQuality: candidateQuality1 });
    expect(route1.decision).toBe("skip");
    expect(route1.reason).toBe("cross_repo_blocked_by_portability_band_incompatible");

    // Case 2: weakly_related, scopeMatch === false (cross-repo) -> skip
    const candidateQuality2: TriggerCandidateQuality = {
      ...candidateQuality1,
      portabilityScorecard: {
        ...candidateQuality1.portabilityScorecard!,
        portabilityBand: "weakly_related",
        score: 0.5
      }
    };
    const route2 = evaluateTriggerRoute(input, undefined, { candidateQuality: candidateQuality2 });
    expect(route2.decision).toBe("skip");
    expect(route2.reason).toBe("cross_repo_blocked_by_portability_band_weakly_related");

    // Case 3: same_family, scopeMatch === false (cross-repo) but explicit failure -> allow
    const candidateQuality3: TriggerCandidateQuality = {
      ...candidateQuality1,
      portabilityScorecard: {
        ...candidateQuality1.portabilityScorecard!,
        portabilityBand: "same_family",
        score: 0.9
      }
    };
    const inputFailure: ExperienceInput = {
      ...input,
      tool_events: [{ status: "failure" } as any]
    };
    const route3 = evaluateTriggerRoute(inputFailure, undefined, { candidateQuality: candidateQuality3 });
    // Should bypass the portability block and match standard allow decision
    expect(route3.decision).toBe("allow");
    expect(route3.reason).toBe("explicit_failure_signal");
  });

  it("should downgrade to weakly_related when cross-scope node has global harmed_count > 0", () => {
    const { db, fpRepo } = makeTestEnv();
    const fpSource = mockFingerprint({ primaryLanguage: "typescript" });
    const fpTarget = mockFingerprint({ primaryLanguage: "typescript" });

    insertFingerprint(fpRepo, "scope_source", fpSource);
    insertFingerprint(fpRepo, "scope_target", fpTarget);

    const nodeItem = mockNode({ 
      id: "node_cross_harmed", 
      scope_id: "scope_target", 
      harmed_count: 1 
    });
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const scorecard = buildPortabilityScorecard(input, nodeItem, { db } as any);
    expect(scorecard.portabilityBand).toBe("weakly_related");
    expect(scorecard.negativeEvidence).toContain("historical_causal_harm");
  });

  it("should block cross-scope node and force incompatible when destructive command is detected", () => {
    const { db, fpRepo } = makeTestEnv();
    const fpSource = mockFingerprint({ primaryLanguage: "typescript" });
    const fpTarget = mockFingerprint({ primaryLanguage: "typescript" });

    insertFingerprint(fpRepo, "scope_source", fpSource);
    insertFingerprint(fpRepo, "scope_target", fpTarget);

    const nodeItem = mockNode({ 
      id: "node_cross_destructive", 
      scope_id: "scope_target", 
      recommended_steps: ["Do some work", "Run rm -rf /"]
    });
    const input: ExperienceInput = {
      scope_id: "scope_source",
      task_type: "bug_fix",
      task_summary: "Fix router issue",
      tool_events: [],
      outcome_signal: "unknown",
      injected_node_ids: []
    };

    const scorecard = buildPortabilityScorecard(input, nodeItem, { db } as any);
    expect(scorecard.portabilityBand).toBe("incompatible");
    expect(scorecard.score).toBe(0.0);
    expect(scorecard.negativeEvidence).toContain("destructive_guidance");
  });
});
