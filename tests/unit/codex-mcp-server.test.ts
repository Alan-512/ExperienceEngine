import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { lookupCodexExperienceHints } from "../../src/adapters/codex/mcp-server.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mcp-"));
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

describe("Codex MCP server foundation", () => {
  it("looks up experience hints through the shared core runtime", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const scope = resolveScope("/repo");
    const timestamp = nowIso();

    nodeRepo.upsert({
      id: "node_codex_prompt_injection",
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
      state: "candidate",
      usage_count: 0,
      helped_count: 0,
      harmed_count: 0,
      support_count: 1,
      created_at: timestamp,
      updated_at: timestamp
    });

    const result = await lookupCodexExperienceHints(
      {
        cwd: "/repo",
        prompt: "Fix the failing auth test",
        sessionId: "codex-session-a"
      },
      { homeDir, env }
    );

    expect(result.mode).toBe("inject_conservative");
    expect(result.text).toContain("Run the failing auth test before editing and verify after the fix.");
    expect(result.injectedNodeIds).toEqual(["node_codex_prompt_injection"]);
  });
});
