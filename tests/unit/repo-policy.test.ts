import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import {
  buildDefaultRepoPolicy,
  evaluateRepoPolicy,
  restoreRepoPolicy
} from "../../src/experience-management/repo-policy.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { AttributionRecordRepository } from "../../src/store/sqlite/repositories/attribution-record-repo.js";
import { InjectionRepository } from "../../src/store/sqlite/repositories/injection-repo.js";
import { RepoPolicyRepository } from "../../src/store/sqlite/repositories/repo-policy-repo.js";
import type { AttributionRecord, InjectionEvent } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-repo-policy-"));
  tempDirs.push(runtimeDir);
  const db = openDatabase(
    loadConfig({
      dataDir: runtimeDir,
      sqlitePath: join(runtimeDir, "experienceengine.db"),
      captureDir: join(runtimeDir, "captures")
    })
  );
  bootstrapDatabase(db);
  return db;
};

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const attributionRecord = (index: number, overrides: Partial<AttributionRecord> = {}): AttributionRecord => ({
  id: `attr_${index}`,
  injection_id: `inject_${index}`,
  node_id: `node_${index}`,
  intervention_strength: "soft_recommendation",
  injection_mode: "inject_conservative",
  delivery_mode: "live",
  delivered: true,
  outcome: "failure",
  attribution_verdict: "neutral",
  confidence: "medium",
  evidence_refs: [`taskrun_${index}`],
  source: "automatic",
  attribution_reason: "unknown_outcome",
  created_at: `2026-05-04T10:${String(index).padStart(2, "0")}:00.000Z`,
  resolved_at: `2026-05-04T10:${String(index).padStart(2, "0")}:10.000Z`,
  ...overrides
});

const injectionEvent = (index: number, overrides: Partial<InjectionEvent> = {}): InjectionEvent => ({
  injection_id: `inject_${index}`,
  scope_id: "scope_repo",
  task_type: "test_debug",
  task_summary: `Task ${index}`,
  mode: "inject_conservative",
  delivery_mode: "live",
  delivered: true,
  injected_node_ids: [`node_${index}`],
  injection_count: 1,
  was_successful: true,
  harm_observed: false,
  created_at: `2026-05-04T10:${String(index).padStart(2, "0")}:00.000Z`,
  resolved_at: `2026-05-04T10:${String(index).padStart(2, "0")}:10.000Z`,
  ...overrides
});

describe("RepoPolicyRepository", () => {
  it("creates safe default policy for a scope", () => {
    const repo = new RepoPolicyRepository(makeDb());

    expect(repo.getOrCreate("scope_repo")).toMatchObject({
      scope_id: "scope_repo",
      configured_mode: "safe",
      effective_mode: "safe",
      circuit_state: "clear",
      live_diagnostics_disabled: false
    });
  });

  it("restores circuit state without deleting intervention evidence", () => {
    const db = makeDb();
    const policyRepo = new RepoPolicyRepository(db);
    const injectionRepo = new InjectionRepository(db);
    const attributionRepo = new AttributionRecordRepository(db);
    policyRepo.upsert({
      ...buildDefaultRepoPolicy("scope_repo", "safe", "2026-05-04T10:00:00.000Z"),
      effective_mode: "strict",
      circuit_state: "tripped",
      circuit_reason: "repo_circuit",
      live_diagnostics_disabled: true,
      last_tripped_at: "2026-05-04T10:01:00.000Z",
      updated_at: "2026-05-04T10:01:00.000Z"
    });
    injectionRepo.upsert(injectionEvent(1));
    attributionRepo.insert(attributionRecord(1));

    const restored = policyRepo.restore("scope_repo");

    expect(restored).toMatchObject({
      effective_mode: "safe",
      circuit_state: "clear",
      live_diagnostics_disabled: false
    });
    expect(injectionRepo.countByScope("scope_repo")).toBe(1);
    expect(attributionRepo.countByVerdict("neutral")).toBe(1);
  });
});

describe("repo policy evaluator", () => {
  it("does not downgrade before the minimum evidence window", () => {
    const policy = buildDefaultRepoPolicy("scope_repo", "fast_learning", "2026-05-04T10:00:00.000Z");
    const evaluation = evaluateRepoPolicy(
      policy,
      [attributionRecord(1, { attribution_verdict: "strong_harmed" }), attributionRecord(2, { attribution_verdict: "strong_harmed" })],
      [],
      "2026-05-04T10:10:00.000Z"
    );

    expect(evaluation).toMatchObject({
      breached: false,
      changed: false,
      eligibleCount: 2
    });
    expect(evaluation.policy.effective_mode).toBe("fast_learning");
  });

  it("downgrades fast learning to safe on repeated strong harmed attribution", () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      attributionRecord(index, {
        attribution_verdict: index < 2 ? "strong_harmed" : "weak_helped"
      })
    );

    const evaluation = evaluateRepoPolicy(buildDefaultRepoPolicy("scope_repo", "fast_learning"), records);

    expect(evaluation).toMatchObject({
      evidenceSource: "attribution",
      breached: true,
      changed: true,
      strongHarmedCount: 2
    });
    expect(evaluation.policy).toMatchObject({
      effective_mode: "safe",
      circuit_state: "tripped",
      live_diagnostics_disabled: false
    });
  });

  it("downgrades safe mode to strict on harmful attribution rate", () => {
    const records = Array.from({ length: 10 }, (_, index) =>
      attributionRecord(index, {
        attribution_verdict: index < 3 ? "weak_harmed" : "neutral"
      })
    );

    const evaluation = evaluateRepoPolicy(buildDefaultRepoPolicy("scope_repo", "safe"), records);

    expect(evaluation).toMatchObject({
      breached: true,
      harmfulCount: 3
    });
    expect(evaluation.policy).toMatchObject({
      effective_mode: "strict",
      live_diagnostics_disabled: true
    });
  });

  it("falls back to injection evidence when attribution records are absent", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      injectionEvent(index, {
        was_successful: index < 2 ? false : true,
        attribution_reason: index < 2 ? "relevant_failure" : "success_outcome"
      })
    );

    const evaluation = evaluateRepoPolicy(buildDefaultRepoPolicy("scope_repo", "safe"), [], events);

    expect(evaluation).toMatchObject({
      evidenceSource: "injection_fallback",
      breached: true,
      harmfulCount: 2
    });
    expect(evaluation.policy.effective_mode).toBe("strict");
  });

  it("keeps fallback injection evidence in the circuit window during attribution migration", () => {
    const attribution = [attributionRecord(10, { attribution_verdict: "neutral" })];
    const events = Array.from({ length: 4 }, (_, index) =>
      injectionEvent(index, {
        was_successful: index < 2 ? false : true,
        attribution_reason: index < 2 ? "relevant_failure" : "success_outcome"
      })
    );

    const evaluation = evaluateRepoPolicy(buildDefaultRepoPolicy("scope_repo", "safe"), attribution, events);

    expect(evaluation).toMatchObject({
      evidenceSource: "attribution",
      eligibleCount: 5,
      harmfulCount: 2,
      breached: true
    });
    expect(evaluation.policy.effective_mode).toBe("strict");
  });

  it("clears a strict circuit on manual restore", () => {
    const strictPolicy = {
      ...buildDefaultRepoPolicy("scope_repo", "safe"),
      effective_mode: "strict" as const,
      circuit_state: "tripped" as const,
      circuit_reason: "repo_circuit",
      live_diagnostics_disabled: true
    };

    expect(restoreRepoPolicy(strictPolicy, "2026-05-04T11:00:00.000Z")).toMatchObject({
      effective_mode: "safe",
      circuit_state: "clear",
      circuit_reason: undefined,
      live_diagnostics_disabled: false,
      restored_at: "2026-05-04T11:00:00.000Z"
    });
  });
});
