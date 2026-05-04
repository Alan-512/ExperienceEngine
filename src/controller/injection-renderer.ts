import type { ExperienceNode, InjectionMode, InterventionStrength } from "../types/domain.js";

const MAX_RENDERED_STEPS = 3;
const MAX_RENDERED_AVOID_STEPS = 2;

const shouldExpandStructuredGuidance = (
  mode: Exclude<InjectionMode, "skip">,
  node: ExperienceNode
): boolean => {
  if (mode === "inject_conservative") {
    return (
      node.state === "active" &&
      ((node.recommended_steps?.length ?? 0) > 0 || (node.avoid_steps?.length ?? 0) > 0 || Boolean(node.goal?.trim())) &&
      (
        node.validation_state === "validated_by_reuse" ||
        node.helped_count >= 2 ||
        node.experience_kind === "expectation_correction"
      ) &&
      node.harmed_count <= node.helped_count
    );
  }

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
  maxHints = 3,
  strength?: InterventionStrength
): string => {
  const selected = nodes.slice(0, maxHints);
  const body = selected.map((node) => renderNode(mode, node)).join("\n");
  const fallbackTitle =
    mode === "inject" ? "Execution hints from prior similar tasks:" : "Conservative execution hints:";
  const policyHeader = strength ? policyHeaderByStrength[strength] : undefined;

  return [policyHeader?.title ?? fallbackTitle, policyHeader?.instruction, body].filter(Boolean).join("\n");
};
