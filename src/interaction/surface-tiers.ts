export type ExperienceSurfaceTier = "routine" | "operator" | "advanced";

export type ExperienceSurfaceTierDefinition = {
  tier: ExperienceSurfaceTier;
  label: string;
  summary: string;
};

export const SURFACE_TIER_DEFINITIONS: Record<ExperienceSurfaceTier, ExperienceSurfaceTierDefinition> = {
  routine: {
    tier: "routine",
    label: "Routine",
    summary: "Day-to-day host-first review, status, last-inspection, and helped/harmed feedback."
  },
  operator: {
    tier: "operator",
    label: "Operator",
    summary: "Explicit install, repair, upgrade, review, hygiene, export-draft, and managed-state workflows."
  },
  advanced: {
    tier: "advanced",
    label: "Advanced / experimental",
    summary: "Maintenance, raw evaluation, broker-internal, and developer diagnostic workflows."
  }
};

export const describeSurfaceTier = (tier: ExperienceSurfaceTier): string =>
  SURFACE_TIER_DEFINITIONS[tier].summary;
