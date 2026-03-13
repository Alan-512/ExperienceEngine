import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInspectCommand } from "../../src/cli/commands/inspect.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { InputRecordRepository } from "../../src/store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { nowIso } from "../../src/utils/clock.js";
import type { ExperienceInputRecord, ExperienceNode } from "../../src/types/domain.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-inspect-command-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_inspect",
  node_type: "strategy",
  scope_id: resolveScope("/repo").scope_id,
  task_type: "test_debug",
  trigger_pattern: "Fix the failing auth test",
  applicability_notes: "Stay in the same repo scope",
  env_signature: undefined,
  compact_hint: "Run the failing auth test before editing and verify after the fix.",
  goal: "Stabilize the auth test",
  recommended_steps: [],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "The test passes",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "Previously solved the same auth test failure.",
  source_kind: "system_derived",
  state: "active",
  usage_count: 2,
  helped_count: 1,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-03-12T00:00:00.000Z",
  updated_at: "2026-03-12T00:00:00.000Z",
  ...overrides
});

const makeRecord = (overrides: Partial<ExperienceInputRecord> = {}): ExperienceInputRecord => ({
  record_id: "input_1",
  scope_id: resolveScope("/repo").scope_id,
  session_id: "session_last",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  outcome_signal: "success",
  context_summary: "Auth test failure in the current repo",
  evidence: ["Bash: success: auth test now passes"],
  injected_node_ids: ["node_inspect"],
  created_at: nowIso(),
  ...overrides
});

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
  consoleTableSpy.mockClear();
});

describe("inspect command", () => {
  it("prints the most recent intervention summary with injected hints", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    nodeRepo.upsert(makeNode());
    inputRepo.upsert(makeRecord());

    runInspectCommand("--last");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Session: session_last"],
        [`Scope: ${resolveScope("/repo").scope_id}`],
        ["Task type: test_debug"],
        ["Intervention: inject"],
        ["Injected nodes:"],
        ["- node_inspect strategy active"],
        ["Hints:"],
        ["- Run the failing auth test before editing and verify after the fix."],
        ["Evidence:"],
        ["- Bash: success: auth test now passes"],
        ["Outcome: success"]
      ])
    );
  });

  it("prints active nodes as a reviewable table", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);

    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(
      makeNode({
        id: "node_retired",
        state: "retired",
        compact_hint: "This retired hint should not appear in active view."
      })
    );

    runInspectCommand("active");

    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "node_inspect",
        type: "strategy",
        task: "test_debug",
        state: "active",
        helped: 1,
        harmed: 0,
        hint: "Run the failing auth test before editing and verify after the fix."
      })
    ]);
  });
});
