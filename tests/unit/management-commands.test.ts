import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCoolCommand } from "../../src/cli/commands/cool.js";
import { runDisableCommand } from "../../src/cli/commands/disable.js";
import { runRetireCommand } from "../../src/cli/commands/retire.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-management-command-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_manage",
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

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
});

describe("management commands", () => {
  it("disables a node by retiring it from injection", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());

    runDisableCommand("node", "node_manage");

    expect(nodeRepo.getById("node_manage")?.state).toBe("retired");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Disabled node node_manage. It will no longer be injected."
    );
  });

  it("cools and retires explicit nodes", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode());

    runCoolCommand("node", "node_manage");
    expect(nodeRepo.getById("node_manage")?.state).toBe("cooling");

    runRetireCommand("node", "node_manage");
    expect(nodeRepo.getById("node_manage")?.state).toBe("retired");

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Cooled node node_manage. It will be considered less aggressively."],
        ["[ExperienceEngine] Retired node node_manage. Historical stats were preserved."]
      ])
    );
  });

  it("disables the current scope", () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const scopeRepo = new ScopeRepository(db);

    runDisableCommand("scope");

    const resolvedScope = resolveScope("/repo");
    const scope = scopeRepo.getById(resolvedScope.scope_id);
    expect(scope?.is_disabled).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `[ExperienceEngine] Disabled interventions for scope ${resolvedScope.scope_id} (${resolvedScope.root_path}).`
    );

    cwdSpy.mockRestore();
  });
});
