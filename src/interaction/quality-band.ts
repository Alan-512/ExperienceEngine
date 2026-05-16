import type { ExperienceNode } from "../types/domain.js";

export type ExperienceQualityBand = "strong" | "building" | "risky";

export type QualityBandReasonCode =
  | "active_eligible"
  | "validated_by_reuse"
  | "helped_without_harm"
  | "limited_reuse_evidence"
  | "early_lifecycle"
  | "conservative_only"
  | "shadow_only"
  | "retired"
  | "cooling"
  | "harm_outweighs_help"
  | "quarantined"
  | "high_hygiene_risk"
  | "warning_guidance"
  | "invalidated";

export type QualityBandEvidenceRef = {
  kind: "node" | "origin_record" | "helped_record" | "harmed_record" | "hygiene";
  id: string;
};

export type QualityBandReviewAction = {
  label: string;
  command?: string;
  resource?: string;
};

export type ExperienceQualityBandExplanation = {
  band: ExperienceQualityBand;
  summary: string;
  reasonCodes: QualityBandReasonCode[];
  reasons: string[];
  evidenceRefs: QualityBandEvidenceRef[];
  recommendedAction?: QualityBandReviewAction;
};

export type QualityBandDistribution = {
  strong: number;
  building: number;
  risky: number;
  summary: string;
};

export const deriveNodeRisk = (node: ExperienceNode): "low" | "medium" | "high" => {
  if (node.state === "candidate") {
    return "high";
  }

  if (node.state === "priority_candidate") {
    return "medium";
  }

  if (node.state === "cooling" || node.harmed_count > 0 || node.node_type === "warning") {
    return node.harmed_count > node.helped_count ? "high" : "medium";
  }

  return "low";
};

export const deriveNodeConfidence = (node: ExperienceNode): "high" | "medium" | "low" => {
  if (node.validation_state === "validated_by_reuse" && node.state === "active" && node.harmed_count === 0) {
    return "high";
  }

  if (node.state === "candidate" || node.harmed_count > node.helped_count) {
    return "low";
  }

  return "medium";
};

const firstUnique = <T>(items: T[]): T[] => [...new Set(items)];

const buildEvidenceRefs = (node: ExperienceNode): QualityBandEvidenceRef[] => [
  { kind: "node", id: node.id },
  ...node.origin_record_ids.map((id) => ({ kind: "origin_record" as const, id })),
  ...node.helped_record_ids.map((id) => ({ kind: "helped_record" as const, id })),
  ...node.harmed_record_ids.map((id) => ({ kind: "harmed_record" as const, id }))
];

const actionForBand = (node: ExperienceNode, band: ExperienceQualityBand): QualityBandReviewAction | undefined => {
  if (band === "risky") {
    return {
      label: "Review this node before trusting it in live guidance.",
      command: `ee inspect node ${node.id}`
    };
  }

  if (band === "building") {
    return {
      label: "Use as tentative guidance and keep collecting outcome evidence.",
      command: `ee inspect node ${node.id}`
    };
  }

  return undefined;
};

export const deriveQualityBandExplanation = (node: ExperienceNode): ExperienceQualityBandExplanation => {
  const reasonCodes: QualityBandReasonCode[] = [];
  const reasons: string[] = [];
  const isHighHygieneRisk = node.delivery_state === "quarantined" || Boolean(node.quarantined_at);
  const harmOutweighsHelp = node.harmed_count > node.helped_count;

  let band: ExperienceQualityBand = "building";

  if (
    node.state === "retired" ||
    node.state === "cooling" ||
    node.validation_state === "invalidated" ||
    harmOutweighsHelp ||
    isHighHygieneRisk
  ) {
    band = "risky";
  } else if (
    node.state === "active" &&
    node.validation_state === "validated_by_reuse" &&
    node.harmed_count === 0 &&
    (!node.delivery_state || node.delivery_state === "eligible")
  ) {
    band = "strong";
  }

  if (node.state === "active" && (!node.delivery_state || node.delivery_state === "eligible")) {
    reasonCodes.push("active_eligible");
    reasons.push("This node is active and eligible for normal delivery.");
  }
  if (node.validation_state === "validated_by_reuse") {
    reasonCodes.push("validated_by_reuse");
    reasons.push("This node has already been validated by successful reuse.");
  }
  if (node.helped_count > 0 && node.harmed_count === 0) {
    reasonCodes.push("helped_without_harm");
    reasons.push("Helpful outcomes exist and no harmful outcome has been recorded for this node.");
  }
  if (node.helped_count === 0 && node.harmed_count === 0) {
    reasonCodes.push("limited_reuse_evidence");
    reasons.push("This node still has limited reuse evidence.");
  }
  if (node.state === "candidate" || node.state === "priority_candidate") {
    reasonCodes.push("early_lifecycle");
    reasons.push("This node is still early in its lifecycle and needs more runtime evidence.");
  }
  if (node.delivery_state === "conservative_only") {
    reasonCodes.push("conservative_only");
    reasons.push("Delivery governance limits this node to conservative use.");
  }
  if (node.delivery_state === "shadow_only") {
    reasonCodes.push("shadow_only");
    reasons.push("Delivery governance keeps this node in shadow-only observation.");
  }
  if (node.state === "retired") {
    reasonCodes.push("retired");
    reasons.push("This node is retired and should not be reused without review.");
  }
  if (node.state === "cooling") {
    reasonCodes.push("cooling");
    reasons.push("This node is in cooling state because recent runtime evidence weakened confidence.");
  }
  if (harmOutweighsHelp) {
    reasonCodes.push("harm_outweighs_help");
    reasons.push("Harmful outcomes currently outweigh helpful ones for this node.");
  } else if (node.helped_count > node.harmed_count) {
    reasons.push("Helpful outcomes still outweigh harmful ones for this node.");
  }
  if (node.delivery_state === "quarantined") {
    reasonCodes.push("quarantined");
    reasons.push(node.quarantine_reason ?? "Delivery governance has quarantined this node.");
  }
  if (isHighHygieneRisk) {
    reasonCodes.push("high_hygiene_risk");
  }
  if (node.node_type === "warning") {
    reasonCodes.push("warning_guidance");
    reasons.push("This is warning guidance, so reuse should stay narrow and evidence-led.");
  }
  if (node.validation_state === "invalidated") {
    reasonCodes.push("invalidated");
    reasons.push("Reuse validation has invalidated this node.");
  }

  const summary =
    band === "strong"
      ? "Strong guidance: active, reuse-validated guidance with no harmful feedback."
      : band === "risky"
        ? "Risky guidance: review before reuse because governance or outcome evidence weakened confidence."
        : "Building guidance: usable with caution while ExperienceEngine gathers stronger reuse evidence.";

  return {
    band,
    summary,
    reasonCodes: firstUnique(reasonCodes),
    reasons: firstUnique(reasons).slice(0, 4),
    evidenceRefs: buildEvidenceRefs(node),
    recommendedAction: actionForBand(node, band)
  };
};

export const summarizeQualityBandDistribution = (
  explanations: ExperienceQualityBandExplanation[]
): QualityBandDistribution => {
  const distribution = explanations.reduce(
    (counts, explanation) => {
      counts[explanation.band] += 1;
      return counts;
    },
    { strong: 0, building: 0, risky: 0 }
  );
  const total = explanations.length;
  const summary = total === 0
    ? "No experience nodes are available for this scope yet."
    : `${distribution.strong} strong, ${distribution.building} building, ${distribution.risky} risky node(s) in this scope.`;

  return {
    ...distribution,
    summary
  };
};
