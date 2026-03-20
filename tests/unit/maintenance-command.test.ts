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

    await runMaintenanceCommand("redistill-rule-nodes", {
      loadConfig: () =>
        ({
          distillationMode: "auto",
          distillationAllowPassthrough: true,
          hostLlmMode: "auto"
        }) as never,
      resolveDistillationResolution: () =>
        ({
          distillationMode: "llm",
          distillationSource: "host_mediated",
          reason: "Resolved host-mediated Codex distillation."
        }) as never,
      redistillRuleNodes
    });

    expect(redistillRuleNodes).toHaveBeenCalledOnce();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Re-distilled rule-promoted nodes with source: host_mediated"],
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
          distillationAllowPassthrough: true,
          hostLlmMode: "auto"
        }) as never,
      resolveDistillationResolution: () =>
        ({
          distillationMode: "rule",
          distillationSource: "rule",
          reason: "No reusable host llm path is available."
        }) as never,
      redistillRuleNodes
    });

    expect(redistillRuleNodes).not.toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["[ExperienceEngine] Rule node re-distillation requires llm mode; current mode is rule."],
        ["[ExperienceEngine] No reusable host llm path is available."]
      ])
    );
  });

  it("prints usage for unknown maintenance actions", async () => {
    await runMaintenanceCommand("unknown");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Usage: ee maintenance embeddings-reset|redistill-rule-nodes|claude-validate-print"
    );
  });
});
