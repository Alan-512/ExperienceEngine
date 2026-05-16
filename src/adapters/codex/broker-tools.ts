import { z } from "zod";
import type { CodexActionRegistry } from "./action-registry.js";
import { describeSurfaceTier } from "../../interaction/surface-tiers.js";

export const listCodexActionsSchema = z.object({
  category: z.enum(["inspect", "state", "admin", "maintenance"]).optional(),
  surfaceTier: z.enum(["routine", "operator", "advanced"]).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional()
});

export const prepareCodexActionSchema = z.object({
  actionId: z.string().min(1)
});

export const executeCodexActionSchema = z.object({
  actionId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional()
});

type JsonContract =
  | { type: "string"; enum?: string[]; optional?: boolean }
  | { type: "number"; integer?: boolean; positive?: boolean; optional?: boolean }
  | { type: "boolean"; optional?: boolean }
  | { type: "record"; valueType: string; optional?: boolean }
  | {
      type: "object";
      optional?: boolean;
      required: string[];
      properties: Record<string, JsonContract>;
    }
  | { type: "unknown"; optional?: boolean };

const serializeZodSchema = (schema: z.ZodTypeAny): JsonContract => {
  if (schema instanceof z.ZodOptional) {
    return {
      ...serializeZodSchema(schema.unwrap()),
      optional: true
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [key, serializeZodSchema(value as z.ZodTypeAny)])
    ) as Record<string, JsonContract>;
    return {
      type: "object",
      required: Object.entries(properties)
        .filter(([, value]) => !value.optional)
        .map(([key]) => key),
      properties
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: [...schema.options]
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    const checks = schema._def.checks ?? [];
    return {
      type: "number",
      integer: checks.some((check) => check.kind === "int"),
      positive: checks.some((check) => check.kind === "min" && check.value > 0)
    };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: "record",
      valueType: "unknown"
    };
  }

  return { type: "unknown" };
};

const describeRisk = (riskLevel: "low" | "medium" | "high", requiresConfirmation: boolean): string => {
  if (riskLevel === "high") {
    return requiresConfirmation
      ? "High-impact action. Review the generated plan and require explicit confirmation before execution."
      : "High-impact action. Validate arguments carefully before execution.";
  }

  if (riskLevel === "medium") {
    return "Medium-impact action. Verify scope and arguments before execution.";
  }

  return "Low-risk action. Safe for read-only inspection or scoped low-impact state updates.";
};

const describeNextStep = (action: ReturnType<CodexActionRegistry["get"]>) => {
  if (!action) {
    return "Unknown action.";
  }

  if (action.requiresConfirmation) {
    return `Call experienceengine_execute_action with actionId=${action.id} to create or continue the guarded flow, then require explicit confirmation before the matching execute step.`;
  }

  return `Call experienceengine_execute_action with actionId=${action.id} and a payload matching parameter_contract.`;
};

export const createCodexBrokerFacade = (registry: CodexActionRegistry) => ({
  listActions(args: z.infer<typeof listCodexActionsSchema>) {
    const actions = registry
      .list()
      .filter((action) => (args.category ? action.category === args.category : true))
      .filter((action) => (args.surfaceTier ? action.surfaceTier === args.surfaceTier : true))
      .filter((action) => (args.riskLevel ? action.riskLevel === args.riskLevel : true))
      .map((action) => ({
        id: action.id,
        title: action.title,
        summary: action.summary,
        category: action.category,
        surfaceTier: action.surfaceTier,
        riskLevel: action.riskLevel,
        requiresConfirmation: action.requiresConfirmation
      }));

    return { actions };
  },

  prepareAction(args: z.infer<typeof prepareCodexActionSchema>) {
    const action = registry.get(args.actionId);
    if (!action) {
      throw new Error(`Unknown action: ${args.actionId}`);
    }

    return {
      action: {
        id: action.id,
        title: action.title,
        summary: action.summary,
        category: action.category,
        surfaceTier: action.surfaceTier,
        riskLevel: action.riskLevel,
        requiresConfirmation: action.requiresConfirmation
      },
      parameter_contract: action.inputSchema
        ? serializeZodSchema(action.inputSchema)
        : { type: "object", required: [], properties: {} },
      example_payload: action.examplePayload ?? {},
      surface_tier_description: describeSurfaceTier(action.surfaceTier),
      risk_description: describeRisk(action.riskLevel, action.requiresConfirmation),
      impact_summary: action.summary,
      suggested_next_step: describeNextStep(action)
    };
  },

  async executeAction(args: z.infer<typeof executeCodexActionSchema>) {
    const action = registry.get(args.actionId);
    if (!action) {
      throw new Error(`Unknown action: ${args.actionId}`);
    }

    const result = await action.handler(args.payload ?? {});
    return {
      actionId: action.id,
      result
    };
  }
});
