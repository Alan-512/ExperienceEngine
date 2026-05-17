import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMaintenanceCommand } from "../../src/cli/commands/maintenance.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { GovernanceActionRepository, GovernanceScheduleRepository } from "../../src/store/sqlite/repositories/hygiene-governance-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-maintenance-command-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_maintenance_a",
  node_type: "strategy",
  scope_id: "scope_maintenance",
  task_type: "test_debug",
  trigger_pattern: "Fix provider config mismatch",
  compact_hint: "Inspect runtime provider config before changing generated config.",
  recommended_steps: ["inspect runtime provider config"],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "provider config test passes",
  evidence_summary: "Recovered provider config mismatch in a prior task.",
  retrieval_text: "Fix provider config mismatch Inspect runtime provider config",
  source_kind: "system_derived",
  origin_record_ids: ["input_a"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  delivery_state: "eligible",
  usage_count: 1,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-15T00:00:00.000Z",
  ...overrides
});

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
});

describe("maintenance command", () => {
  it("runs claude print validation and summarizes transcript-backed results", async () => {
    await runMaintenanceCommand("claude-validate-print", {
      claudeValidatePrint: async () => ({
        command: ["claude", "-p", "--permission-mode", "bypassPermissions", "ping"],
        exitCode: 0,
        stdout: "",
        stderr: "",
        transcriptPath: "/tmp/claude-session.jsonl",
        targetToolName: "mcp__experienceengine__experienceengine_get_capabilities",
        toolSeen: true,
        toolResultSeen: true,
        mcpServerToolAvailable: true,
        mcpServerToolNames: ["experienceengine_get_capabilities"],
        mcpServerError: null,
        assistantText: "Capabilities loaded.",
        usedTranscriptConclusion: true
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Claude print validation complete."],
        ["[ExperienceEngine] Exit code: 0"],
        ["[ExperienceEngine] Stdout empty: yes"],
        ["[ExperienceEngine] Transcript: /tmp/claude-session.jsonl"],
        ["[ExperienceEngine] Target tool seen: yes (mcp__experienceengine__experienceengine_get_capabilities)"],
        ["[ExperienceEngine] Tool result seen: yes"],
        ["[ExperienceEngine] MCP server exposes target tool: yes"],
        ["[ExperienceEngine] Transcript conclusion: Capabilities loaded."]
      ])
    );
  });

  it("clears and rebuilds the configured embedding cache", async () => {
    await runMaintenanceCommand("embeddings-reset", {
      loadConfig: () =>
        ({
          embeddingProvider: "local",
          embeddingModel: "Xenova/multilingual-e5-small",
          embeddingDtype: "q8",
          embeddingCacheDir: "/tmp/embeddings"
        }) as never,
      resetManagedEmbeddingCache: async () => ({
        cacheDir: "/tmp/embeddings",
        model: "Xenova/multilingual-e5-small",
        rebuilt: true,
        dimensions: 384
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Cleared embedding cache: /tmp/embeddings"],
        ["[ExperienceEngine] Rebuilt managed embedding cache with Xenova/multilingual-e5-small (384 dimensions)."]
      ])
    );
  });

  it("re-distills rule-promoted nodes when llm mode is available", async () => {
    const redistillRuleNodes = vi.fn().mockResolvedValue({
      attempted: 2,
      upgraded: 1,
      skippedNoCandidate: 1,
      failed: 0
    });
    const resolveDistillationResolution = vi.fn().mockReturnValue({
      distillationMode: "llm",
      distillationSource: "explicit_provider",
      reason: "Resolved from explicit ExperienceEngine distiller provider configuration."
    });

    await runMaintenanceCommand("redistill-rule-nodes", {
      loadConfig: () =>
        ({
          distillationMode: "auto",
          distillationAllowPassthrough: true,
          distillerProvider: "openrouter",
          distillerModel: "openai/gpt-4o-mini"
        }) as never,
      resolveDistillationResolution,
      redistillRuleNodes
    });

    expect(resolveDistillationResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        configProvider: "openrouter",
        configModel: "openai/gpt-4o-mini"
      })
    );
    expect(redistillRuleNodes).toHaveBeenCalledOnce();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Re-distilled rule-promoted nodes with source: explicit_provider"],
        ["[ExperienceEngine] Attempted: 2 | Upgraded: 1 | Skipped (no candidate): 1 | Failed: 0"]
      ])
    );
  });

  it("explains when rule node re-distillation cannot run without llm mode", async () => {
    const redistillRuleNodes = vi.fn();

    await runMaintenanceCommand("redistill-rule-nodes", {
      loadConfig: () =>
        ({
          distillationMode: "auto",
          distillationAllowPassthrough: true
        }) as never,
      resolveDistillationResolution: () =>
        ({
          distillationMode: "rule",
          distillationSource: "rule",
          reason: "No explicit distiller provider is configured."
        }) as never,
      redistillRuleNodes
    });

    expect(redistillRuleNodes).not.toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Rule node re-distillation requires llm mode; current mode is rule."],
        ["[ExperienceEngine] No explicit distiller provider is configured."]
      ])
    );
  });

  it("prints usage for unknown maintenance actions", async () => {
    await runMaintenanceCommand("unknown");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Usage: ee maintenance embeddings-reset|embedding-smoke|governance drain|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>"
    );
  });

  it("runs embedding smoke evaluation and prints cold/warm timing summaries", async () => {
    await runMaintenanceCommand("embedding-smoke", {
      loadConfig: () =>
        ({
          embeddingProvider: "api",
          embeddingModel: "Xenova/multilingual-e5-small",
          embeddingDtype: "q8",
          embeddingCacheDir: "/tmp/embeddings"
        }) as never,
      embeddingSmoke: async () => ({
        provider: "openai",
        model: "text-embedding-3-small",
        queryText: "validate the failing auth test before editing",
        passageText: "reproduce the failing auth test before editing and rerun it after the fix",
        coldQueryMs: 180,
        warmQueryMs: 2,
        coldPassageMs: 190,
        warmPassageMs: 1
      })
    } as never);

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Embedding smoke complete for openai/text-embedding-3-small."],
        ["[ExperienceEngine] Query cold=180ms warm=2ms"],
        ["[ExperienceEngine] Passage cold=190ms warm=1ms"]
      ])
    );
  });

  it("merges one scope into another through maintenance command", async () => {
    const mergeScopesWithConfig = vi.fn().mockReturnValue({
      sourceScopeId: "scope_source",
      targetScopeId: "scope_target",
      moved: {
        inputRecords: 12,
        taskRuns: 7,
        injections: 0,
        nodes: 3,
        candidates: 1
      },
      merged: {
        taskStats: 2
      }
    });

    await runMaintenanceCommand("merge-scope", ["scope_source", "scope_target"], {
      mergeScopesWithConfig,
      loadConfig: () => ({}) as never
    });

    expect(mergeScopesWithConfig).toHaveBeenCalledOnce();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Merged scope scope_source into scope_target."],
        ["[ExperienceEngine] Moved: records=12 taskRuns=7 injections=0 nodes=3 candidates=1"],
        ["[ExperienceEngine] Merged aggregates: taskStats=2"]
      ])
    );
  });

  it("drains due autonomous hygiene governance through the scheduler path", async () => {
    const home = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(home, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const cwd = "/repo-maintenance-governance-cli";
    const scopeId = resolveScope(cwd).scope_id;
    const nodeRepo = new NodeRepository(db);
    nodeRepo.upsert(makeNode({
      id: "node_maintenance_canonical",
      scope_id: scopeId,
      helped_record_ids: ["input_helped"],
      helped_count: 1,
      support_count: 2
    }));
    nodeRepo.upsert(makeNode({
      id: "node_maintenance_duplicate",
      scope_id: scopeId,
      origin_record_ids: ["input_b"],
      state: "priority_candidate",
      delivery_state: "conservative_only"
    }));
    new GovernanceScheduleRepository(db).maybeEnqueue({
      scopeId,
      trigger: "maintenance_cli",
      now: "2026-05-17T09:59:00.000Z",
      intervalMs: 1,
      findingHash: "stale-hash"
    });
    db.close();

    await runMaintenanceCommand("governance", ["drain", "--cwd", cwd]);

    const verifyDb = openDatabase(loadConfig());
    bootstrapDatabase(verifyDb);
    expect(new NodeRepository(verifyDb).getById("node_maintenance_duplicate")?.state).toBe("retired");
    const appliedActions = verifyDb
      .prepare("SELECT action_id FROM hygiene_governance_actions WHERE scope_id = ? AND status = 'applied'")
      .all(scopeId);
    expect(appliedActions).toHaveLength(1);
    expect(new GovernanceActionRepository(verifyDb).get((appliedActions[0] as { action_id: string }).action_id)?.before_snapshot_id).toBeTruthy();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [`[ExperienceEngine] Governance drain completed for ${scopeId}: completed.`],
        ["[ExperienceEngine] Recent applied actions: 1"]
      ])
    );
    verifyDb.close();
  });
});
