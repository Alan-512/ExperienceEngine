import { afterEach, describe, expect, it, vi } from "vitest";
import { runMaintenanceCommand } from "../../src/cli/commands/maintenance.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
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
        targetToolName: "mcp__experienceengine__experienceengine_pack_list",
        toolSeen: true,
        toolResultSeen: true,
        assistantText: "There is one pack.",
        usedTranscriptConclusion: true
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Claude print validation complete."],
        ["[ExperienceEngine] Exit code: 0"],
        ["[ExperienceEngine] Stdout empty: yes"],
        ["[ExperienceEngine] Transcript: /tmp/claude-session.jsonl"],
        ["[ExperienceEngine] Target tool seen: yes (mcp__experienceengine__experienceengine_pack_list)"],
        ["[ExperienceEngine] Tool result seen: yes"],
        ["[ExperienceEngine] Transcript conclusion: There is one pack."]
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
      "Usage: ee maintenance embeddings-reset|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>"
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
        packActivations: 1,
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
        ["[ExperienceEngine] Merged aggregates: packActivations=1 taskStats=2"]
      ])
    );
  });
});
