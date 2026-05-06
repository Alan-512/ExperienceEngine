import type {
  InjectionScorecard,
  PolicyEnrichmentComponent,
  RetrievalPolicyStageDiagnostic
} from "../types/domain.js";

export type RetrievalPolicyStageInspection = {
  stage: RetrievalPolicyStageDiagnostic["stage"];
  acceptedCount?: number;
  rejectedCount?: number;
  passedCount?: number;
  reasonCodes: string[];
};

export type RetrievalPolicyComponentInspection = PolicyEnrichmentComponent;

export type RetrievalPolicyInspectionSummary = {
  stages: RetrievalPolicyStageInspection[];
  semanticMode?: "skipped" | "rerank" | "backfill";
  topPolicyComponents: RetrievalPolicyComponentInspection[];
  rejectedCandidates: Array<{
    id: string;
    reasonCodes: string[];
  }>;
};

const SEMANTIC_STAGE = "semantic_rerank_backfill";

const inferSemanticMode = (
  stage: RetrievalPolicyStageDiagnostic | undefined
): RetrievalPolicyInspectionSummary["semanticMode"] => {
  const modeReason = stage?.reasonCodes.find((reason) => reason.startsWith("semantic_mode:"));
  const mode = modeReason?.slice("semantic_mode:".length);
  return mode === "skipped" || mode === "rerank" || mode === "backfill" ? mode : undefined;
};

export const buildRetrievalPolicyInspectionSummary = (
  scorecard?: InjectionScorecard
): RetrievalPolicyInspectionSummary | undefined => {
  const stages = scorecard?.retrievalPolicyDiagnostics?.stages ?? [];
  const topCandidate = scorecard?.topCandidates?.[0];
  const topPolicyComponents = [...(topCandidate?.policyComponents ?? [])]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 5);
  const rejectedCandidates =
    scorecard?.rejectedCandidates?.slice(0, 5).map((candidate) => ({
      id: candidate.id,
      reasonCodes: candidate.reasonCodes
    })) ?? [];

  if (!stages.length && !topPolicyComponents.length && !rejectedCandidates.length) {
    return undefined;
  }

  return {
    stages: stages.map((stage) => ({
      stage: stage.stage,
      acceptedCount: stage.acceptedCount,
      rejectedCount: stage.rejectedCount,
      passedCount: stage.passedCount,
      reasonCodes: stage.reasonCodes
    })),
    semanticMode: inferSemanticMode(stages.find((stage) => stage.stage === SEMANTIC_STAGE)),
    topPolicyComponents,
    rejectedCandidates
  };
};
