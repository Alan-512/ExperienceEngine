import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createCodexBehaviorLoop } from "../../src/adapters/codex/mcp-server.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ScopeRepository } from "../../src/store/sqlite/repositories/scope-repo.js";
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
    state: "candidate",
    usage_count: 0,
    helped_count: 0,
    harmed_count: 0,
    support_count: 1,
    created_at: timestamp,
    updated_at: timestamp
  });
};

describe("Codex MCP behavior loop", () => {
  it("looks up experience hints through the shared core runtime", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_prompt_injection");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const result = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-session-a"
    });

    expect(result.mode).toBe("inject_conservative");
    expect(result.text).toContain("Run the failing auth test before editing and verify after the fix.");
    expect(result.notice).toBe("[ExperienceEngine] Injected 1 strategy hint for this task.");
    expect(result.injectedNodeIds).toEqual(["node_codex_prompt_injection"]);
  });

  it("records a successful tool result and finalizes helped feedback", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_helped");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const lookup = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-helped-session"
    });
    expect(lookup.injectedNodeIds).toEqual(["node_codex_helped"]);

    const toolResult = await loop.recordToolResult({
      sessionId: "codex-helped-session",
      toolName: "Bash",
      inputSummary: "pnpm test auth",
      outputSummary: "auth test now passes",
      status: "success"
    });
    expect(toolResult.status).toBe("success");

    const finalized = await loop.finalizeTask({
      sessionId: "codex-helped-session",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    expect(finalized.outcomeSignal).toBe("success");
    expect(finalized.injectedNodeIds).toEqual(["node_codex_helped"]);
    expect(finalized.evidence).toContain("Bash: success: auth test now passes");

    const node = nodeRepo.getById("node_codex_helped");
    expect(node?.usage_count).toBe(1);
    expect(node?.helped_count).toBe(1);
    expect(node?.harmed_count).toBe(0);
  });

  it("records a failed tool result and finalizes harmed feedback", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_harmed");

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const lookup = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-harmed-session"
    });
    expect(lookup.injectedNodeIds).toEqual(["node_codex_harmed"]);

    const toolResult = await loop.recordToolResult({
      sessionId: "codex-harmed-session",
      toolName: "Bash",
      inputSummary: "pnpm test auth",
      errorSignature: "1 failed",
      outputSummary: "1 failed",
      status: "failure"
    });
    expect(toolResult.status).toBe("failure");

    const finalized = await loop.finalizeTask({
      sessionId: "codex-harmed-session",
      cwd: "/repo",
      prompt: "Fix the failing auth test"
    });

    expect(finalized.outcomeSignal).toBe("failure");
    expect(finalized.injectedNodeIds).toEqual(["node_codex_harmed"]);
    expect(finalized.evidence).toContain("Bash: failure: 1 failed");

    const node = nodeRepo.getById("node_codex_harmed");
    expect(node?.usage_count).toBe(1);
    expect(node?.helped_count).toBe(0);
    expect(node?.harmed_count).toBe(1);
  });

  it("skips intervention when the current scope has been disabled", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const scopeRepo = new ScopeRepository(db);
    const scope = resolveScope("/repo");
    seedStrategyNode(nodeRepo, "/repo", nowIso(), "node_codex_disabled_scope");
    scopeRepo.upsert({
      ...scope,
      is_disabled: true
    });

    const loop = createCodexBehaviorLoop({ homeDir, env });
    const result = await loop.lookupHints({
      cwd: "/repo",
      prompt: "Fix the failing auth test",
      sessionId: "codex-disabled-scope"
    });

    expect(result.mode).toBe("skip");
    expect(result.text).toBeUndefined();
    expect(result.notice).toBeUndefined();
    expect(result.injectedNodeIds).toEqual([]);
  });
});
