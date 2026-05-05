import { z } from "zod";
import type { DeliveryState, ExperienceNodeType, ExperienceState, TaskType } from "../../types/domain.js";
import type { HygieneFindingType, HygieneSeverity } from "../../maintenance/experience-hygiene.js";
import type { ExportDraftRisk } from "../../maintenance/experience-export-drafts.js";

export type CodexActionCategory = "inspect" | "state" | "admin" | "maintenance";
export type CodexActionRiskLevel = "low" | "medium" | "high";

export type CodexActionDefinition = {
  id: string;
  title: string;
  summary: string;
  category: CodexActionCategory;
  riskLevel: CodexActionRiskLevel;
  requiresConfirmation: boolean;
  inputSchema?: z.ZodTypeAny;
  examplePayload?: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

type RegistryDeps = {
  interactionSurface: {
    inspectRecent: (args?: { mode?: "all" | "injected"; limit?: number }) => Promise<unknown>;
    inspectNode: (args: { nodeId: string }) => Promise<unknown>;
    listNodesByState: (args: { state: ExperienceState }) => Promise<unknown>;
    listNodesByType: (args: { nodeType: ExperienceNodeType }) => Promise<unknown>;
    inspectLearningSummary: () => Promise<unknown>;
    inspectHygiene: (args?: { cwd?: string; type?: HygieneFindingType; severity?: HygieneSeverity; limit?: number }) => Promise<unknown>;
    inspectExportDrafts: (args?: {
      cwd?: string;
      nodeId?: string;
      nodeType?: ExperienceNodeType;
      taskFamily?: TaskType;
      state?: ExperienceState;
      deliveryState?: DeliveryState;
      risk?: ExportDraftRisk;
      limit?: number;
    }) => Promise<unknown>;
    coolNode: (args: { nodeId: string }) => Promise<unknown>;
    retireNode: (args: { nodeId: string }) => Promise<unknown>;
    feedbackNode: (args: { nodeId: string; feedback: "helped" | "harmed" }) => Promise<unknown>;
    disableScope: (args?: { cwd?: string }) => Promise<unknown>;
    enableScope: (args?: { cwd?: string }) => Promise<unknown>;
  };
  operationalSurface: {
    checkUpdate: (adapter: "openclaw" | "claude-code" | "codex") => Promise<unknown>;
  };
  operationalActions: {
    planOperation: (args: {
      adapter: "openclaw" | "claude-code" | "codex";
      operation: "install" | "repair" | "upgrade";
    }) => unknown;
    executePlannedOperation: (args: { planId: string; confirmationToken: string }) => unknown;
  };
  stateArtifacts: {
    listBackups: () => unknown;
    planOperation: (
      args:
        | { operation: "backup" | "export" }
        | { operation: "import"; importPath: string }
        | { operation: "rollback"; backupId: string }
    ) => unknown;
    executePlannedOperation: (args: { planId: string; confirmationToken: string }) => unknown;
  };
};

export type CodexActionRegistry = ReturnType<typeof createCodexActionRegistry>;

export const createCodexActionRegistry = (deps: RegistryDeps) => {
  const actions: CodexActionDefinition[] = [
    {
      id: "plan_install",
      title: "Plan Install",
      summary: "Create an install plan for a supported adapter.",
      category: "admin",
      riskLevel: "high",
      requiresConfirmation: true,
      inputSchema: z.object({
        adapter: z.enum(["openclaw", "claude-code", "codex"])
      }),
      examplePayload: { adapter: "codex" },
      handler: async ({ adapter }) =>
        deps.operationalActions.planOperation({
          adapter: adapter as "openclaw" | "claude-code" | "codex",
          operation: "install"
        })
    },
    {
      id: "plan_repair",
      title: "Plan Repair",
      summary: "Create a repair plan for a supported adapter.",
      category: "admin",
      riskLevel: "high",
      requiresConfirmation: true,
      inputSchema: z.object({
        adapter: z.enum(["openclaw", "claude-code", "codex"])
      }),
      examplePayload: { adapter: "codex" },
      handler: async ({ adapter }) =>
        deps.operationalActions.planOperation({
          adapter: adapter as "openclaw" | "claude-code" | "codex",
          operation: "repair"
        })
    },
    {
      id: "plan_upgrade",
      title: "Plan Upgrade",
      summary: "Create an upgrade plan for a supported adapter.",
      category: "admin",
      riskLevel: "high",
      requiresConfirmation: true,
      inputSchema: z.object({
        adapter: z.enum(["openclaw", "claude-code", "codex"])
      }),
      examplePayload: { adapter: "codex" },
      handler: async ({ adapter }) =>
        deps.operationalActions.planOperation({
          adapter: adapter as "openclaw" | "claude-code" | "codex",
          operation: "upgrade"
        })
    },
    {
      id: "execute_operational_plan",
      title: "Execute Operational Plan",
      summary: "Execute a previously planned install, repair, or upgrade operation.",
      category: "admin",
      riskLevel: "high",
      requiresConfirmation: true,
      inputSchema: z.object({
        planId: z.string().min(1),
        confirmationToken: z.string().min(1)
      }),
      examplePayload: { planId: "plan-123", confirmationToken: "confirm-123" },
      handler: async ({ planId, confirmationToken }) =>
        deps.operationalActions.executePlannedOperation({
          planId: String(planId),
          confirmationToken: String(confirmationToken)
        })
    },
    {
      id: "plan_backup",
      title: "Plan Backup",
      summary: "Create a backup plan for managed EE state.",
      category: "maintenance",
      riskLevel: "high",
      requiresConfirmation: true,
      examplePayload: {},
      handler: async () => deps.stateArtifacts.planOperation({ operation: "backup" })
    },
    {
      id: "plan_export",
      title: "Plan Export",
      summary: "Create an export plan for managed EE state.",
      category: "maintenance",
      riskLevel: "high",
      requiresConfirmation: true,
      examplePayload: {},
      handler: async () => deps.stateArtifacts.planOperation({ operation: "export" })
    },
    {
      id: "plan_import",
      title: "Plan Import",
      summary: "Create an import plan for an EE snapshot.",
      category: "maintenance",
      riskLevel: "high",
      requiresConfirmation: true,
      inputSchema: z.object({
        importPath: z.string().min(1)
      }),
      examplePayload: { importPath: "/tmp/experienceengine-snapshot" },
      handler: async ({ importPath }) =>
        deps.stateArtifacts.planOperation({ operation: "import", importPath: String(importPath) })
    },
    {
      id: "plan_rollback",
      title: "Plan Rollback",
      summary: "Create a rollback plan for managed EE state.",
      category: "maintenance",
      riskLevel: "high",
      requiresConfirmation: true,
      inputSchema: z.object({
        backupId: z.string().min(1)
      }),
      examplePayload: { backupId: "backup-123" },
      handler: async ({ backupId }) =>
        deps.stateArtifacts.planOperation({ operation: "rollback", backupId: String(backupId) })
    },
    {
      id: "execute_state_plan",
      title: "Execute State Plan",
      summary: "Execute a previously planned backup, export, import, or rollback operation.",
      category: "maintenance",
      riskLevel: "high",
      requiresConfirmation: true,
      inputSchema: z.object({
        planId: z.string().min(1),
        confirmationToken: z.string().min(1)
      }),
      examplePayload: { planId: "plan-123", confirmationToken: "confirm-123" },
      handler: async ({ planId, confirmationToken }) =>
        deps.stateArtifacts.executePlannedOperation({
          planId: String(planId),
          confirmationToken: String(confirmationToken)
        })
    },
    {
      id: "check_update",
      title: "Check Update",
      summary: "Check release or update status for an adapter.",
      category: "maintenance",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        adapter: z.enum(["openclaw", "claude-code", "codex"])
      }),
      examplePayload: { adapter: "codex" },
      handler: async ({ adapter }) =>
        deps.operationalSurface.checkUpdate(adapter as "openclaw" | "claude-code" | "codex")
    },
    {
      id: "inspect_recent_history",
      title: "Inspect Recent History",
      summary: "Inspect recent EE history, optionally filtered to injected turns.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        mode: z.enum(["all", "injected"]).optional(),
        limit: z.number().int().positive().optional()
      }),
      examplePayload: { mode: "injected", limit: 10 },
      handler: async ({ mode, limit }) =>
        deps.interactionSurface.inspectRecent({
          mode: mode as "all" | "injected" | undefined,
          limit: typeof limit === "number" ? limit : undefined
        })
    },
    {
      id: "inspect_node_detail",
      title: "Inspect Node Detail",
      summary: "Inspect one EE node by id.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        nodeId: z.string().min(1)
      }),
      examplePayload: { nodeId: "node_123" },
      handler: async ({ nodeId }) => deps.interactionSurface.inspectNode({ nodeId: String(nodeId) })
    },
    {
      id: "inspect_nodes_by_state",
      title: "Inspect Nodes By State",
      summary: "Inspect EE nodes filtered by lifecycle state.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        state: z.enum(["candidate", "priority_candidate", "active", "cooling", "retired"])
      }),
      examplePayload: { state: "active" },
      handler: async ({ state }) =>
        deps.interactionSurface.listNodesByState({ state: state as ExperienceState })
    },
    {
      id: "inspect_nodes_by_type",
      title: "Inspect Nodes By Type",
      summary: "Inspect EE nodes filtered by node type.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        nodeType: z.enum(["strategy", "warning"])
      }),
      examplePayload: { nodeType: "warning" },
      handler: async ({ nodeType }) =>
        deps.interactionSurface.listNodesByType({ nodeType: nodeType as ExperienceNodeType })
    },
    {
      id: "inspect_learning_summary",
      title: "Inspect Learning Summary",
      summary: "Inspect the current learning summary.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      examplePayload: {},
      handler: async () => deps.interactionSurface.inspectLearningSummary()
    },
    {
      id: "inspect_experience_hygiene",
      title: "Inspect Experience Hygiene",
      summary: "Inspect read-only EE hygiene findings for stale, duplicate, conflicting, over-generalized, or drifted guidance.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        type: z.enum([
          "stale_experience",
          "duplicate_guidance",
          "conflicting_guidance",
          "over_generalized_guidance",
          "evidence_drift"
        ]).optional(),
        severity: z.enum(["high", "medium", "low"]).optional(),
        cwd: z.string().min(1).optional(),
        limit: z.number().int().positive().optional()
      }),
      examplePayload: { cwd: "/path/to/repo", severity: "high", limit: 10 },
      handler: async ({ cwd, type, severity, limit }) =>
        deps.interactionSurface.inspectHygiene({
          cwd: typeof cwd === "string" ? cwd : undefined,
          type: type as HygieneFindingType | undefined,
          severity: severity as HygieneSeverity | undefined,
          limit: typeof limit === "number" ? limit : undefined
        })
    },
    {
      id: "inspect_export_drafts",
      title: "Inspect Export Drafts",
      summary: "Inspect read-only review packages for guidance that may be exported outside local EE state.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        cwd: z.string().min(1).optional(),
        nodeId: z.string().min(1).optional(),
        nodeType: z.enum(["strategy", "warning"]).optional(),
        taskFamily: z.string().min(1).optional(),
        state: z.enum(["candidate", "priority_candidate", "active", "cooling", "retired"]).optional(),
        deliveryState: z.enum(["shadow_only", "conservative_only", "eligible", "quarantined"]).optional(),
        risk: z.enum(["low", "medium", "high"]).optional(),
        limit: z.number().int().positive().optional()
      }),
      examplePayload: { cwd: "/path/to/repo", state: "cooling", risk: "high", limit: 10 },
      handler: async ({ cwd, nodeId, nodeType, taskFamily, state, deliveryState, risk, limit }) =>
        deps.interactionSurface.inspectExportDrafts({
          cwd: typeof cwd === "string" ? cwd : undefined,
          nodeId: typeof nodeId === "string" ? nodeId : undefined,
          nodeType: nodeType as ExperienceNodeType | undefined,
          taskFamily: taskFamily as TaskType | undefined,
          state: state as ExperienceState | undefined,
          deliveryState: deliveryState as DeliveryState | undefined,
          risk: risk as ExportDraftRisk | undefined,
          limit: typeof limit === "number" ? limit : undefined
        })
    },
    {
      id: "inspect_backup_inventory",
      title: "Inspect Backup Inventory",
      summary: "Inspect managed EE backups available for rollback or export review.",
      category: "inspect",
      riskLevel: "low",
      requiresConfirmation: false,
      examplePayload: {},
      handler: async () => deps.stateArtifacts.listBackups()
    },
    {
      id: "feedback_node",
      title: "Feedback Node",
      summary: "Record helped or harmed feedback for a specific EE node.",
      category: "state",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        nodeId: z.string().min(1),
        feedback: z.enum(["helped", "harmed"])
      }),
      examplePayload: { nodeId: "node_123", feedback: "helped" },
      handler: async ({ nodeId, feedback }) =>
        deps.interactionSurface.feedbackNode({
          nodeId: String(nodeId),
          feedback: feedback as "helped" | "harmed"
        })
    },
    {
      id: "set_scope_intervention_state",
      title: "Set Scope Intervention State",
      summary: "Enable or disable EE interventions for a working-directory scope.",
      category: "state",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        action: z.enum(["enable", "disable"]),
        cwd: z.string().optional()
      }),
      examplePayload: { action: "disable", cwd: "/repo" },
      handler: async ({ action, cwd }) =>
        action === "disable"
          ? deps.interactionSurface.disableScope({ cwd: typeof cwd === "string" ? cwd : undefined })
          : deps.interactionSurface.enableScope({ cwd: typeof cwd === "string" ? cwd : undefined })
    },
    {
      id: "set_node_lifecycle",
      title: "Set Node Lifecycle",
      summary: "Move a specific EE node into cooling or retired lifecycle state.",
      category: "state",
      riskLevel: "low",
      requiresConfirmation: false,
      inputSchema: z.object({
        action: z.enum(["cool", "retire"]),
        nodeId: z.string().min(1)
      }),
      examplePayload: { action: "cool", nodeId: "node_123" },
      handler: async ({ action, nodeId }) =>
        action === "cool"
          ? deps.interactionSurface.coolNode({ nodeId: String(nodeId) })
          : deps.interactionSurface.retireNode({ nodeId: String(nodeId) })
    }
  ];

  const byId = new Map(actions.map((action) => [action.id, action] as const));

  return {
    list: () => actions,
    get: (id: string) => byId.get(id)
  };
};
