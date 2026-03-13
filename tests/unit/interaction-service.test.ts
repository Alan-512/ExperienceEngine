import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { ExperienceInteractionService } from "../../src/interaction/service.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-interaction-service-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const seedStrategyNode = (nodeRepo: NodeRepository, cwd: string, timestamp: string, id: string): void => {
  const scope = resolveScope(cwd);
  nodeRepo.upsert({
    id,
    node_type: "strategy",
    scope_id: scope.scope_id,
    task_type: "test_debug",
    trigger_pattern: "Fix the failing auth test",
    applicability_notes: "Use the same repo and test scope",
    env_signature: undefined,
    compact_hint: "Run the failing auth test before editing and verify after the fix.",
    goal: "Stabilize the failing auth test",
    recommended_steps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
    avoid_steps: [],
    fallback_steps: [],
    success_signal: "The targeted test passes",
    stop_condition: undefined,
    escalation_condition: undefined,
    evidence_summary: "Recovered the same failing auth test in a prior task.",
    source_kind: "system_derived",
    state: "active",
    usage_count: 0,
    helped_count: 0,
    harmed_count: 0,
    support_count: 1,
    created_at: timestamp,
    updated_at: timestamp
  });
};

describe("ExperienceInteractionService", () => {
  it("returns structured node views", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_interaction_detail");

    const service = new ExperienceInteractionService(config);
    const active = service.listActiveNodes();
    const detail = service.inspectNode("node_interaction_detail");

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: "node_interaction_detail",
      type: "strategy",
      state: "active"
    });
    expect(detail).toMatchObject({
      id: "node_interaction_detail",
      scopeId: resolveScope("/repo").scope_id,
      recommendedSteps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"]
    });
  });

  it("returns not_found for feedback when no injected record exists", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const service = new ExperienceInteractionService(config);

    expect(service.feedbackLast("helped")).toEqual({
      status: "not_found",
      reason: "last_injected_missing"
    });
  });

  it("toggles scope state and reports whether the state changed", () => {
    const homeDir = makeTempDir();
    const config = loadConfig({ dataDir: join(homeDir, ".experienceengine") });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const scopeRepo = new ScopeRepository(db);
    const scope = resolveScope("/repo");
    scopeRepo.upsert(scope);

    const service = new ExperienceInteractionService(config);
    const disabled = service.disableScope("/repo");
    const disabledAgain = service.disableScope("/repo");
    const enabled = service.enableScope("/repo");

    expect(disabled).toMatchObject({
      scopeId: scope.scope_id,
      isDisabled: true,
      changed: true
    });
    expect(disabledAgain).toMatchObject({
      scopeId: scope.scope_id,
      isDisabled: true,
      changed: false
    });
    expect(enabled).toMatchObject({
      scopeId: scope.scope_id,
      isDisabled: false,
      changed: true
    });
  });
});
