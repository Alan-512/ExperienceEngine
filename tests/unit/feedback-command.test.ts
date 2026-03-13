import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runFeedbackCommand } from "../../src/cli/commands/feedback.js";
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

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-feedback-command-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_feedback",
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
  retrieval_text: "Fix the failing auth test\nRun the failing auth test before editing and verify after the fix.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 1,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
  created_at: "2026-03-12T00:00:00.000Z",
  updated_at: "2026-03-12T00:00:00.000Z",
  ...overrides
});

const makeRecord = (overrides: Partial<ExperienceInputRecord> = {}): ExperienceInputRecord => ({
  record_id: "input_feedback",
  scope_id: resolveScope("/repo").scope_id,
  session_id: "session_feedback",
  task_type: "test_debug",
  task_summary: "Fix the failing auth test",
  outcome_signal: "success",
  context_summary: "Auth test failure in the current repo",
  evidence: ["Bash: success: auth test now passes"],
  injected_node_ids: ["node_feedback"],
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
});

describe("feedback command", () => {
  it("records helped feedback for the last injected experience set", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const inputRepo = new InputRecordRepository(db);
    nodeRepo.upsert(makeNode());
    inputRepo.upsert(makeRecord());

    runFeedbackCommand("--last", "helped");

    const node = nodeRepo.getById("node_feedback");
    expect(node?.helped_count).toBe(1);
    expect(node?.harmed_count).toBe(0);
    expect(node?.last_helped_at).toBeTruthy();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Recorded feedback for the last injected experience: helped."
    );
  });

  it("records harmed feedback for a specific node", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());

    runFeedbackCommand("node", "node_feedback", "harmed");

    const node = nodeRepo.getById("node_feedback");
    expect(node?.helped_count).toBe(0);
    expect(node?.harmed_count).toBe(1);
    expect(node?.last_harmed_at).toBeTruthy();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Recorded feedback for node node_feedback: harmed."
    );
  });
});
