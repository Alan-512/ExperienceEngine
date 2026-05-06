import { describe, expect, it } from "vitest";
import { createCodexActionRegistry } from "../../src/adapters/codex/action-registry.js";

describe("codex action registry", () => {
  it("defines long-tail actions and excludes core loop tools", () => {
    const registry = createCodexActionRegistry({
      interactionSurface: {
        inspectRecent: async () => [],
        inspectNode: async () => null,
        listNodesByState: async () => [],
        listNodesByType: async () => [],
        inspectLearningSummary: async () => ({}),
        inspectExportDrafts: async () => ({}),
        inspectReview: async () => ({}),
        coolNode: async () => ({}),
        retireNode: async () => ({}),
        feedbackNode: async () => ({}),
        disableScope: async () => ({}),
        enableScope: async () => ({})
      } as never,
      operationalSurface: {
        checkUpdate: async () => ({})
      } as never,
      operationalActions: {
        planOperation: async () => ({}),
        executePlannedOperation: async () => ({})
      } as never,
      stateArtifacts: {
        listBackups: () => [],
        planOperation: async () => ({}),
        executePlannedOperation: async () => ({})
      } as never
    });

    expect(registry.list().map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "plan_upgrade",
        "plan_backup",
        "inspect_recent_history",
        "inspect_node_detail",
        "inspect_learning_summary",
        "inspect_export_drafts",
        "inspect_operator_review"
      ])
    );
    expect(registry.get("lookup_hints")).toBeUndefined();
    expect(registry.get("record_tool_result")).toBeUndefined();
    expect(registry.get("finalize_task")).toBeUndefined();
    expect(registry.get("feedback_last")).toBeUndefined();
  });

  it("marks high-impact operations and inspect actions distinctly", () => {
    const registry = createCodexActionRegistry({
      interactionSurface: {
        inspectRecent: async () => [],
        inspectNode: async () => null,
        listNodesByState: async () => [],
        listNodesByType: async () => [],
        inspectLearningSummary: async () => ({}),
        inspectExportDrafts: async () => ({}),
        inspectReview: async () => ({}),
        coolNode: async () => ({}),
        retireNode: async () => ({}),
        feedbackNode: async () => ({}),
        disableScope: async () => ({}),
        enableScope: async () => ({})
      } as never,
      operationalSurface: {
        checkUpdate: async () => ({})
      } as never,
      operationalActions: {
        planOperation: async () => ({}),
        executePlannedOperation: async () => ({})
      } as never,
      stateArtifacts: {
        listBackups: () => [],
        planOperation: async () => ({}),
        executePlannedOperation: async () => ({})
      } as never
    });

    expect(registry.get("plan_upgrade")).toMatchObject({
      category: "admin",
      riskLevel: "high",
      requiresConfirmation: true
    });
    expect(registry.get("inspect_recent_history")).toMatchObject({
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false
    });
    expect(registry.get("inspect_operator_review")).toMatchObject({
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      summary: expect.stringContaining("read-only operator review workflow")
    });
  });
});
