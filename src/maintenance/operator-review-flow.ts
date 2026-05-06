import type { ExperienceRepoSummary } from "../interaction/repo-summary.js";
import type { ExperienceExportDraftReport } from "./experience-export-drafts.js";
import type { HygieneReviewReport } from "./experience-hygiene.js";

export type OperatorReviewPriority = "high" | "medium" | "low";
export type OperatorReviewSource = "repo_policy" | "hygiene" | "export_drafts";
export type RepoPolicyReviewHealth = "clear" | "attention" | "tripped";

export type OperatorReviewDrillDown = {
  cli: string;
  mcpResource?: string;
  brokerAction?: string;
};

export type OperatorReviewItem = {
  priority: OperatorReviewPriority;
  source: OperatorReviewSource;
  title: string;
  summary: string;
  drillDown: OperatorReviewDrillDown;
};

export type OperatorReviewNextAction = {
  priority: OperatorReviewPriority;
  summary: string;
  drillDown?: OperatorReviewDrillDown;
};

export type OperatorReviewReport = {
  scopeId: string;
  generatedAt: string;
  filters: {
    scopeId?: string;
    limit: number;
  };
  sections: {
    repo_policy: {
      health: RepoPolicyReviewHealth;
      configuredMode?: string;
      effectiveMode?: string;
      circuitState?: string;
      circuitReason?: string;
      summary: string;
      drillDown: OperatorReviewDrillDown;
    };
    hygiene: {
      total: number;
      high: number;
      medium: number;
      low: number;
      surfacedFindings: Array<{
        severity: "high" | "medium" | "low";
        type: string;
        summary: string;
        affectedNodeIds: string[];
        affectedCandidateIds: string[];
      }>;
      drillDown: OperatorReviewDrillDown;
    };
    export_drafts: {
      total: number;
      highRisk: number;
      mediumRisk: number;
      lowRisk: number;
      surfacedDrafts: Array<{
        draftId: string;
        nodeIds: string[];
        risk: "high" | "medium" | "low";
        suggestedTargetType: string;
        summary: string;
      }>;
      drillDown: OperatorReviewDrillDown;
    };
  };
  reviewItems: OperatorReviewItem[];
  recommendedReviewOrder: OperatorReviewSource[];
  reviewOnlyNextActions: OperatorReviewNextAction[];
};

export type BuildOperatorReviewFlowInput = {
  repo: ExperienceRepoSummary;
  hygiene: HygieneReviewReport;
  exportDrafts: ExperienceExportDraftReport;
  limit?: number;
  generatedAt?: string;
};

const DEFAULT_LIMIT = 5;
const PRIORITY_RANK: Record<OperatorReviewPriority, number> = { high: 0, medium: 1, low: 2 };
const SOURCE_RANK: Record<OperatorReviewSource, number> = { repo_policy: 0, hygiene: 1, export_drafts: 2 };

const drillDowns = () => ({
  repo_policy: {
    cli: "ee inspect repo",
    mcpResource: "experienceengine://repo-summary"
  },
  hygiene: {
    cli: "ee inspect hygiene",
    mcpResource: "experienceengine://hygiene",
    brokerAction: "inspect_experience_hygiene"
  },
  export_drafts: {
    cli: "ee inspect export-drafts",
    mcpResource: "experienceengine://export-drafts",
    brokerAction: "inspect_export_drafts"
  }
});

const policyHealth = (repo: ExperienceRepoSummary): RepoPolicyReviewHealth => {
  if (repo.policy?.circuitState === "tripped") {
    return "tripped";
  }
  if (repo.benchmark.verdict === "failing" || repo.policy?.effectiveMode === "strict") {
    return "attention";
  }
  return "clear";
};

const policySummary = (repo: ExperienceRepoSummary, health: RepoPolicyReviewHealth): string => {
  if (health === "tripped") {
    return repo.policy?.circuitReason ?? "Repo policy circuit is tripped.";
  }
  if (health === "attention") {
    return `Repo review needs attention: benchmark=${repo.benchmark.verdict}, effectiveMode=${repo.policy?.effectiveMode ?? "unknown"}.`;
  }
  return "Repo policy is clear for normal review.";
};

const addReviewItem = (items: OperatorReviewItem[], item: OperatorReviewItem): void => {
  items.push(item);
};

const sortedItems = (items: OperatorReviewItem[]): OperatorReviewItem[] =>
  [...items].sort((left, right) => {
    const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return SOURCE_RANK[left.source] - SOURCE_RANK[right.source] || left.title.localeCompare(right.title);
  });

const reviewOrder = (items: OperatorReviewItem[]): OperatorReviewSource[] => {
  const order: OperatorReviewSource[] = [];
  for (const item of sortedItems(items)) {
    if (!order.includes(item.source)) {
      order.push(item.source);
    }
  }
  for (const source of ["repo_policy", "hygiene", "export_drafts"] as OperatorReviewSource[]) {
    if (!order.includes(source)) {
      order.push(source);
    }
  }
  return order;
};

export const buildOperatorReviewFlow = (input: BuildOperatorReviewFlowInput): OperatorReviewReport => {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const scopeId = input.repo.scope.scopeId;
  const drillDown = drillDowns();
  const health = policyHealth(input.repo);
  const items: OperatorReviewItem[] = [];

  if (health === "tripped") {
    addReviewItem(items, {
      priority: "high",
      source: "repo_policy",
      title: "Repo policy circuit is tripped",
      summary: policySummary(input.repo, health),
      drillDown: drillDown.repo_policy
    });
  } else if (health === "attention") {
    addReviewItem(items, {
      priority: "medium",
      source: "repo_policy",
      title: "Repo policy needs attention",
      summary: policySummary(input.repo, health),
      drillDown: drillDown.repo_policy
    });
  }

  for (const finding of input.hygiene.findings.slice(0, limit)) {
    addReviewItem(items, {
      priority: finding.severity,
      source: "hygiene",
      title: `${finding.type} hygiene finding`,
      summary: finding.evidenceSummary,
      drillDown: drillDown.hygiene
    });
  }

  const riskyHygiene = input.hygiene.summary.bySeverity.high > 0;
  for (const draft of input.exportDrafts.drafts.slice(0, limit)) {
    const priority = draft.risk === "high" ? "high" : draft.risk === "medium" || riskyHygiene ? "medium" : "low";
    addReviewItem(items, {
      priority,
      source: "export_drafts",
      title: `Export draft ${draft.draftId}`,
      summary: riskyHygiene
        ? `Review hygiene risk before exporting ${draft.suggestedTargetType}.`
        : `Review ${draft.suggestedTargetType} candidate for ${draft.taskFamily}.`,
      drillDown: drillDown.export_drafts
    });
  }

  const reviewItems = sortedItems(items);
  const nextActions = reviewItems.length
    ? reviewItems.slice(0, 3).map((item) => ({
        priority: item.priority,
        summary: `Review ${item.source}: ${item.summary}`,
        drillDown: item.drillDown
      }))
    : [
        {
          priority: "low" as const,
          summary: "No immediate review items. Keep monitoring repo policy, hygiene, and export drafts."
        }
      ];

  return {
    scopeId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    filters: {
      scopeId,
      limit
    },
    sections: {
      repo_policy: {
        health,
        configuredMode: input.repo.policy?.configuredMode,
        effectiveMode: input.repo.policy?.effectiveMode,
        circuitState: input.repo.policy?.circuitState,
        circuitReason: input.repo.policy?.circuitReason,
        summary: policySummary(input.repo, health),
        drillDown: drillDown.repo_policy
      },
      hygiene: {
        total: input.hygiene.summary.total,
        high: input.hygiene.summary.bySeverity.high,
        medium: input.hygiene.summary.bySeverity.medium,
        low: input.hygiene.summary.bySeverity.low,
        surfacedFindings: input.hygiene.findings.slice(0, limit).map((finding) => ({
          severity: finding.severity,
          type: finding.type,
          summary: finding.evidenceSummary,
          affectedNodeIds: finding.affectedNodeIds,
          affectedCandidateIds: finding.affectedCandidateIds
        })),
        drillDown: drillDown.hygiene
      },
      export_drafts: {
        total: input.exportDrafts.summary.total,
        highRisk: input.exportDrafts.summary.byRisk.high,
        mediumRisk: input.exportDrafts.summary.byRisk.medium,
        lowRisk: input.exportDrafts.summary.byRisk.low,
        surfacedDrafts: input.exportDrafts.drafts.slice(0, limit).map((draft) => ({
          draftId: draft.draftId,
          nodeIds: draft.nodeIds,
          risk: draft.risk,
          suggestedTargetType: draft.suggestedTargetType,
          summary: draft.evidenceSummary
        })),
        drillDown: drillDown.export_drafts
      }
    },
    reviewItems,
    recommendedReviewOrder: reviewOrder(reviewItems),
    reviewOnlyNextActions: nextActions
  };
};
