import type {
  ExperienceNode,
  InjectionMode,
  InterventionConfidence,
  InterventionStrength,
  MatchBand
} from "../types/domain.js";

const MAX_RENDERED_STEPS = 3;
const MAX_RENDERED_AVOID_STEPS = 2;
const DEFAULT_MAX_RENDERED_HINTS = 1;

export type InjectionRenderingPolicy = {
  confidence?: InterventionConfidence;
  overallMatchBand?: MatchBand;
};

const resolveDeliveryState = (node: ExperienceNode): NonNullable<ExperienceNode["delivery_state"]> => {
  if (node.delivery_state) {
    return node.delivery_state;
  }

  switch (node.state) {
    case "candidate":
      return "shadow_only";
    case "priority_candidate":
    case "cooling":
      return "conservative_only";
    case "retired":
      return "quarantined";
    case "active":
    default:
      return "eligible";
  }
};

const hasStructuredGuidance = (node: ExperienceNode): boolean =>
  Boolean(node.goal?.trim()) ||
  (node.recommended_steps?.length ?? 0) > 0 ||
  (node.avoid_steps?.length ?? 0) > 0;

const shouldExpandStructuredGuidance = (
  mode: Exclude<InjectionMode, "skip">,
  node: ExperienceNode,
  policy: InjectionRenderingPolicy
): boolean => {
  if (mode === "inject_conservative") {
    return false;
  }

  if (mode !== "inject") {
    return false;
  }

  if (!hasStructuredGuidance(node)) {
    return false;
  }

  if (node.state !== "active" || resolveDeliveryState(node) !== "eligible") {
    return false;
  }

  if (node.harmed_count > 0 || (node.consecutive_harmed_count ?? 0) > 0) {
    return false;
  }

  const validatedOrHistoricallySupported =
    node.validation_state === "validated_by_reuse" ||
    (!node.validation_state && node.helped_count >= 2 && node.support_count >= 2);

  return (
    validatedOrHistoricallySupported &&
    policy.confidence === "high" &&
    (policy.overallMatchBand === undefined || policy.overallMatchBand === "high")
  );
};

export const explainInjectionRenderingPolicy = (
  mode: Exclude<InjectionMode, "skip">,
  nodes: ExperienceNode[],
  policy: InjectionRenderingPolicy = {}
): string => {
  const primary = nodes[0];
  if (!primary) {
    return "no_renderable_node";
  }
  if (mode === "inject_conservative") {
    return "compact_conservative_injection";
  }
  if (!shouldExpandStructuredGuidance(mode, primary, policy)) {
    return "compact_until_mature_high_confidence";
  }
  return "expanded_mature_high_confidence";
};

const renderNode = (
  mode: Exclude<InjectionMode, "skip">,
  node: ExperienceNode,
  policy: InjectionRenderingPolicy
): string => {
  const lines = [`- ${node.compact_hint}`];

  if (!shouldExpandStructuredGuidance(mode, node, policy)) {
    return lines.join("\n");
  }

  if (node.goal?.trim()) {
    lines.push(`  Goal: ${node.goal.trim()}`);
  }

  const recommendedSteps = node.recommended_steps?.slice(0, MAX_RENDERED_STEPS) ?? [];
  if (recommendedSteps.length) {
    lines.push("  Steps:");
    for (const [index, step] of recommendedSteps.entries()) {
      lines.push(`    ${index + 1}. ${step}`);
    }
  }

  const avoidSteps = node.avoid_steps?.slice(0, MAX_RENDERED_AVOID_STEPS) ?? [];
  if (avoidSteps.length) {
    lines.push("  Avoid:");
    for (const step of avoidSteps) {
      lines.push(`    - ${step}`);
    }
  }

  return lines.join("\n");
};

const policyHeaderByStrength: Record<InterventionStrength, { title: string; instruction: string }> = {
  diagnostic_hint: {
    title: "Diagnostic lead from prior experience:",
    instruction:
      "Use this only as a diagnostic lead. First verify whether the same signal exists in the current task. Do not treat it as a required fix."
  },
  soft_recommendation: {
    title: "Relevant prior experience:",
    instruction:
      "Check this before making unrelated changes; apply it only if current evidence matches."
  },
  strong_recommendation: {
    title: "Validated prior experience:",
    instruction: "Follow this unless current evidence contradicts it."
  },
  hard_constraint: {
    title: "Project constraint or explicit instruction:",
    instruction: "Do not violate this without explicit user approval."
  }
};

export const renderInjection = (
  mode: Exclude<InjectionMode, "skip">,
  nodes: ExperienceNode[],
  maxHints = DEFAULT_MAX_RENDERED_HINTS,
  strength?: InterventionStrength,
  policy: InjectionRenderingPolicy = {}
): string => {
  const selected = nodes.slice(0, maxHints);
  const body = selected.map((node) => renderNode(mode, node, policy)).join("\n");
  const fallbackTitle =
    mode === "inject" ? "Execution hints from prior similar tasks:" : "Conservative execution hints:";
  const policyHeader = strength ? policyHeaderByStrength[strength] : undefined;

  return [policyHeader?.title ?? fallbackTitle, policyHeader?.instruction, body].filter(Boolean).join("\n");
};
