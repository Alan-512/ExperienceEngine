import type { ExperienceNode, InjectionMode } from "../types/domain.js";

const MAX_RENDERED_STEPS = 3;
const MAX_RENDERED_AVOID_STEPS = 2;

const shouldExpandStructuredGuidance = (
  mode: Exclude<InjectionMode, "skip">,
  node: ExperienceNode
): boolean => {
  if (mode !== "inject") {
    return false;
  }

  if (node.state === "candidate" || node.state === "priority_candidate") {
    return false;
  }

  const hasStructuredGuidance =
    Boolean(node.goal?.trim()) ||
    (node.recommended_steps?.length ?? 0) > 0 ||
    (node.avoid_steps?.length ?? 0) > 0;

  if (!hasStructuredGuidance) {
    return false;
  }

  return (
    node.validation_state === "validated_by_reuse" ||
    node.helped_count > 0 ||
    node.experience_kind === "expectation_correction"
  );
};

const renderNode = (mode: Exclude<InjectionMode, "skip">, node: ExperienceNode): string => {
  const lines = [`- ${node.compact_hint}`];

  if (!shouldExpandStructuredGuidance(mode, node)) {
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

export const renderInjection = (
  mode: Exclude<InjectionMode, "skip">,
  nodes: ExperienceNode[],
  maxHints = 3
): string => {
  const selected = nodes.slice(0, maxHints);
  const body = selected.map((node) => renderNode(mode, node)).join("\n");
  const title =
    mode === "inject" ? "Execution hints from prior similar tasks:" : "Conservative execution hints:";

  return [title, body].filter(Boolean).join("\n");
};
