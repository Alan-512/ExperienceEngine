import type {
  ExperienceInput,
  ExperienceNode,
  InterventionBudgetClass,
  InterventionConfidence,
  InterventionDecisionDiagnostics,
  InterventionRejectedCandidate,
  InjectionScorecardCandidate,
  InjectionMode,
  RetrievalContext,
  ResolvedTaskType,
  ScopeTaskStats,
  SyncSecondOpinionDecision,
  ValidationState
} from "../types/domain.js";
import {
  retrieveCandidateBundle,
  retrieveCandidates,
  retrieveScoredCandidates,
  type RetrievedCandidate
} from "./candidate-retriever.js";
import { renderInjection } from "./injection-renderer.js";
import { rankNodes } from "./node-ranker.js";
import { evaluateTriggerRoute, type TriggerCandidateQuality } from "./trigger-evaluator.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { deriveSelectiveSecondOpinionTrigger, runSelectiveSecondOpinion } from "./second-opinion-gate.js";

export type InterventionDecision = {
  mode: InjectionMode;
  selected: ExperienceNode[];
  text?: string;
  diagnostics?: InterventionDecisionDiagnostics;
};

const DEFAULT_DELIVERY_STATE_BY_LIFECYCLE: Record<ExperienceNode["state"], NonNullable<ExperienceNode["delivery_state"]>> = {
  candidate: "shadow_only",
  priority_candidate: "conservative_only",
  active: "eligible",
  cooling: "conservative_only",
  retired: "quarantined"
};

const resolveDeliveryState = (
  node: Pick<ExperienceNode, "state" | "delivery_state">
): NonNullable<ExperienceNode["delivery_state"]> => node.delivery_state ?? DEFAULT_DELIVERY_STATE_BY_LIFECYCLE[node.state];

const isTrustedSameFamilyCluster = (
  quality: TriggerCandidateQuality,
  runnerUpQuality?: TriggerCandidateQuality
): boolean =>
  Boolean(
    runnerUpQuality &&
    quality.scopeMatch &&
    quality.taskFamilyMatch &&
    runnerUpQuality.scopeMatch &&
    runnerUpQuality.taskFamilyMatch &&
    quality.state === "active" &&
    runnerUpQuality.state === "active" &&
    quality.helpedCount >= 2 &&
    runnerUpQuality.helpedCount >= 2 &&
    quality.totalScore >= 1.1 &&
    runnerUpQuality.totalScore >= 0.95 &&
    quality.helpedCount >= runnerUpQuality.helpedCount
  );

const isStrongCandidate = (
  quality: TriggerCandidateQuality,
  runnerUpQuality?: TriggerCandidateQuality
): boolean => {
  return quality.scopeMatch &&
    quality.taskFamilyMatch &&
    quality.state === "active" &&
    quality.totalScore >= 0.75 &&
    (
      quality.scoreMargin >= 0.08 ||
      !runnerUpQuality ||
      (
        (runnerUpQuality.state === "candidate" || runnerUpQuality.state === "priority_candidate") &&
        runnerUpQuality.helpedCount === 0 &&
        runnerUpQuality.validationState !== "validated_by_reuse"
      ) ||
      isTrustedSameFamilyCluster(quality, runnerUpQuality)
    ) &&
    (quality.helpedCount >= 2 || quality.validationState === "validated_by_reuse") &&
    quality.helpedCount >= quality.harmedCount;
};

const toCandidateQuality = (
  input: ExperienceInput,
  node: ExperienceNode | undefined,
  candidate: RetrievedCandidate | undefined
): TriggerCandidateQuality | undefined => {
  if (!node || !candidate) {
    return undefined;
  }

  return {
    semanticScore: candidate.semanticScore,
    retrievalScore: candidate.retrievalScore,
    policyAdjustment: candidate.policyAdjustment,
    retrievalReasons: candidate.retrievalReasons,
    policyReasons: candidate.policyReasons,
    totalScore: candidate.totalScore,
    familyScore: candidate.familyScore,
    scopeMatch: candidate.scopeMatch,
    taskFamilyMatch: candidate.taskFamilyMatch || node.task_type === input.task_type,
    state: node.state,
    helpedCount: node.helped_count,
    harmedCount: node.harmed_count,
    validationState: node.validation_state as ValidationState | undefined,
    scoreMargin: candidate.scoreMargin
  };
};

const toScorecardCandidate = (candidate: RetrievedCandidate): InjectionScorecardCandidate => ({
  id: candidate.node.id,
  semanticScore: Number(candidate.semanticScore.toFixed(4)),
  lexicalScore: Number(candidate.lexicalScore.toFixed(4)),
  fusedScore: Number(candidate.fusedScore.toFixed(4)),
  retrievalScore: Number(candidate.retrievalScore.toFixed(4)),
  policyAdjustment: Number(candidate.policyAdjustment.toFixed(4)),
  policyScore: Number(candidate.policyScore.toFixed(4)),
  totalScore: Number(candidate.totalScore.toFixed(4)),
  rerankScore: typeof candidate.rerankScore === "number" ? Number(candidate.rerankScore.toFixed(4)) : undefined,
  rerankSource: candidate.rerankSource,
  retrievalReasons: candidate.retrievalReasons,
  policyReasons: candidate.policyReasons,
  taskFamilyMatch: candidate.taskFamilyMatch
});

const deriveDecisionConfidence = (
  mode: InjectionMode,
  quality?: TriggerCandidateQuality,
  fastPathApplied = false
): InterventionConfidence => {
  if (mode === "skip") {
    return "low";
  }
  if (mode === "inject_conservative") {
    return "low";
  }
  if (fastPathApplied || (quality && quality.totalScore >= 1.1 && quality.scoreMargin >= 0.08)) {
    return "high";
  }
  return "medium";
};

const deriveBudgetClass = (mode: InjectionMode, selectedCount: number): InterventionBudgetClass => {
  if (mode === "skip" || selectedCount === 0) {
    return "none";
  }
  return selectedCount > 1 ? "multi_hint" : "single_hint";
};

const buildRejectedCandidateBriefs = (
  candidates: RetrievedCandidate[],
  selectedIds: Set<string>
): InterventionRejectedCandidate[] =>
  candidates
    .filter((candidate) => !selectedIds.has(candidate.node.id))
    .slice(0, 3)
    .map((candidate) => ({
      id: candidate.node.id,
      reasonCodes: [
        candidate.taskFamilyMatch ? "same_family_runner_up" : "adjacent_family_runner_up",
        candidate.node.state === "candidate" || candidate.node.state === "priority_candidate"
          ? "state_requires_conservative_handling"
          : "lower_total_score"
      ],
      retrievalScore: Number(candidate.retrievalScore.toFixed(4)),
      policyAdjustment: Number(candidate.policyAdjustment.toFixed(4)),
      totalScore: Number(candidate.totalScore.toFixed(4))
    }));

const withDecisionEnvelope = (input: {
  diagnostics: Omit<InterventionDecisionDiagnostics, "confidence" | "budgetClass" | "selectedCandidateIds" | "rejectedCandidates">;
  mode: InjectionMode;
  selected: ExperienceNode[];
  scoredCandidates: RetrievedCandidate[];
  topCandidateQuality?: TriggerCandidateQuality;
}): InterventionDecisionDiagnostics => {
  const selectedCandidateIds = input.selected.map((node) => node.id);
  return {
    ...input.diagnostics,
    confidence: deriveDecisionConfidence(input.mode, input.topCandidateQuality, input.diagnostics.fastPathApplied),
    budgetClass: deriveBudgetClass(input.mode, input.selected.length),
    selectedCandidateIds,
    rejectedCandidates: buildRejectedCandidateBriefs(input.scoredCandidates, new Set(selectedCandidateIds))
  };
};

const CORRECTION_INTENT_PATTERNS = [
  /\bcorrection\b/i,
  /\bthat answer was wrong\b/i,
  /\bprevious pass\b/i,
  /\bthe real issue\b/i,
  /\bfocused too much on\b/i
];

const hasCorrectionIntent = (input: ExperienceInput): boolean => {
  const text = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  return CORRECTION_INTENT_PATTERNS.some((pattern) => pattern.test(text));
};

const buildCandidateRiskSummary = (node: ExperienceNode | undefined): string | undefined => {
  if (!node) {
    return undefined;
  }

  if (node.experience_kind === "expectation_correction") {
    return [node.deviation_pattern, node.corrected_constraint, node.trigger_pattern].filter(Boolean).join("\n");
  }

  return node.trigger_pattern ?? node.compact_hint;
};

const resolveTriggerThreshold = (selected: ExperienceNode | undefined, threshold: number): number => {
  if (!selected) {
    return threshold;
  }

  if (selected.experience_kind === "expectation_correction") {
    return Math.min(threshold, 0.4);
  }

  return threshold;
};

const isMatureReusableNode = (node: ExperienceNode): boolean =>
  node.state === "active" &&
  resolveDeliveryState(node) === "eligible" &&
  (node.helped_count >= 2 || node.validation_state === "validated_by_reuse") &&
  node.helped_count >= node.harmed_count;

export const selectInjectableNodes = (
  ranked: ExperienceNode[],
  maxHints = 3,
  preferredTaskType?: ResolvedTaskType
): ExperienceNode[] => {
  const strategyNodes = ranked.filter((node) => node.node_type === "strategy");
  const exactFamilyStrategies =
    preferredTaskType && preferredTaskType !== "unknown"
      ? strategyNodes.filter((node) => node.task_type === preferredTaskType)
      : [];
  const matureExactFamilyStrategies = exactFamilyStrategies.filter(isMatureReusableNode);
  const familyScopedStrategies =
    exactFamilyStrategies.length >= 2 && matureExactFamilyStrategies.length >= 2
      ? matureExactFamilyStrategies
      : exactFamilyStrategies.length >= 1
        ? exactFamilyStrategies
        : strategyNodes;
  const fallback = familyScopedStrategies.length
    ? familyScopedStrategies
    : ranked.filter((node) => node.node_type === "warning");
  const selectionCap = exactFamilyStrategies.length >= 2 ? Math.min(maxHints, 2) : maxHints;
  return fallback.slice(0, selectionCap);
};

export const decideIntervention = (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  stats?: ScopeTaskStats,
  threshold = 0.6,
  maxHints = 3,
  config?: Pick<
    ExperienceEngineConfig,
    | "embeddingProvider"
    | "embeddingModel"
    | "embeddingDtype"
    | "embeddingCacheDir"
    | "distillerProvider"
    | "distillationAuthMode"
    | "distillerModel"
    | "retrievalRerankerMode"
    | "retrievalRerankerModel"
    | "syncSecondOpinionMode"
    | "syncSecondOpinionModel"
  >,
  retrievalContext?: RetrievalContext
): Promise<InterventionDecision> =>
  decideInterventionInternal(input, nodes, stats, threshold, maxHints, config, retrievalContext);

const decideInterventionInternal = async (
  input: ExperienceInput,
  nodes: ExperienceNode[],
  stats?: ScopeTaskStats,
  threshold = 0.6,
  maxHints = 3,
  config?: Pick<
    ExperienceEngineConfig,
    | "embeddingProvider"
    | "embeddingModel"
    | "embeddingDtype"
    | "embeddingCacheDir"
    | "distillerProvider"
    | "distillationAuthMode"
    | "distillerModel"
    | "retrievalRerankerMode"
    | "retrievalRerankerModel"
    | "syncSecondOpinionMode"
    | "syncSecondOpinionModel"
  >,
  retrievalContext?: RetrievalContext
): Promise<InterventionDecision> => {
  const retrievalBundle = await retrieveCandidateBundle(input, nodes, { config, retrievalContext });
  const scoredCandidates = retrievalBundle.candidates;
  const rankingSummary = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  const rankTieBreakOrder = new Map(
    rankNodes(
      rankingSummary || input.task_summary,
      scoredCandidates.map(({ node }) => node),
      input.task_type
    ).map((node, index) => [node.id, index])
  );
  const ranked = [...scoredCandidates]
    .sort((left, right) => {
      const scoreDiff = right.totalScore - left.totalScore;
      if (Math.abs(scoreDiff) > 0.01) {
        return scoreDiff;
      }

      return (rankTieBreakOrder.get(left.node.id) ?? Number.MAX_SAFE_INTEGER) -
        (rankTieBreakOrder.get(right.node.id) ?? Number.MAX_SAFE_INTEGER);
    })
    .map(({ node }) => node);
  const candidateById = new Map(scoredCandidates.map((candidate) => [candidate.node.id, candidate]));
  const correctionAwareRanked = hasCorrectionIntent(input)
    ? [
        ...ranked.filter((node) => node.experience_kind === "expectation_correction"),
        ...ranked.filter((node) => node.experience_kind !== "expectation_correction")
      ]
    : ranked;

  if (!correctionAwareRanked.length) {
    return {
      mode: "skip",
      selected: [],
      diagnostics: withDecisionEnvelope({
        mode: "skip",
        selected: [],
        scoredCandidates,
        topCandidateQuality: undefined,
        diagnostics: {
        topCandidates: [],
        fastPathApplied: false,
        gateReason: "no_candidates",
        decisionReason: "no_matching_candidates"
        }
      })
    };
  }

  const mode: InjectionMode =
    correctionAwareRanked[0] && resolveDeliveryState(correctionAwareRanked[0]) === "conservative_only"
      ? "inject_conservative"
      : "inject";
  const selected = selectInjectableNodes(
    correctionAwareRanked,
    mode === "inject_conservative" ? 1 : maxHints,
    input.task_type
  );
  const topCandidateQuality = toCandidateQuality(input, selected[0], selected[0] ? candidateById.get(selected[0].id) : undefined);
  const runnerUpQuality = toCandidateQuality(input, selected[1], selected[1] ? candidateById.get(selected[1].id) : undefined);
  const candidateRiskSummary = buildCandidateRiskSummary(selected[0]);
  const triggerThreshold = resolveTriggerThreshold(selected[0], threshold);
  const diagnosticsBase = {
    topCandidates: scoredCandidates.slice(0, 3).map(toScorecardCandidate),
    topCandidateScore: topCandidateQuality ? Number(topCandidateQuality.totalScore.toFixed(4)) : undefined,
    scoreMargin: topCandidateQuality ? Number(topCandidateQuality.scoreMargin.toFixed(4)) : undefined,
    fastPathApplied: false,
    queryRewriteApplied: retrievalBundle.retrievalQuery.rewriteApplied,
    mergeDecision: selected[0]?.merge_decision,
    mergeReason: selected[0]?.merge_reason,
    promotionSignal: selected[0]?.promotion_signal,
    priorityPromotionApplied: selected[0]?.priority_promotion_applied,
    gateReason: "candidate_quality_gate",
    decisionReason: "candidate_quality_positive"
  };

  const finalizeLiveDecision = async (
    plannedMode: Exclude<InjectionMode, "skip">,
    plannedSelected: ExperienceNode[],
    diagnostics: typeof diagnosticsBase
  ): Promise<InterventionDecision> => {
    if (!plannedSelected.length) {
      return {
        mode: "skip",
        selected: [],
        diagnostics: withDecisionEnvelope({
          mode: "skip",
          selected: [],
          scoredCandidates,
          topCandidateQuality,
          diagnostics: {
            ...diagnostics,
            gateReason: "no_selected_nodes",
            decisionReason: "selection_empty"
          }
        })
      };
    }

    const trigger = deriveSelectiveSecondOpinionTrigger(input, plannedSelected, scoredCandidates);
    let finalMode: Exclude<InjectionMode, "skip"> = plannedMode;
    let finalSelected = plannedSelected;
    let secondOpinionApplied = false;
    let secondOpinionDecision: SyncSecondOpinionDecision | undefined;
    let secondOpinionReason: string | undefined;

    if (trigger) {
      const secondOpinion = await runSelectiveSecondOpinion(
        {
          input,
          plannedMode,
          selected: plannedSelected,
          scoredCandidates,
          trigger
        },
        { config }
      );

      if (secondOpinion) {
        secondOpinionApplied = true;
        secondOpinionDecision = secondOpinion.decision;
        secondOpinionReason = secondOpinion.reason;

        if (secondOpinion.bestNodeId) {
          const replacement = plannedSelected.find((node) => node.id === secondOpinion.bestNodeId)
            ?? scoredCandidates.find((candidate) => candidate.node.id === secondOpinion.bestNodeId)?.node;
          if (replacement) {
            finalSelected = [replacement];
          }
        }

        if (secondOpinion.decision === "skip") {
          return {
            mode: "skip",
            selected: [],
            diagnostics: withDecisionEnvelope({
              mode: "skip",
              selected: [],
              scoredCandidates,
              topCandidateQuality,
              diagnostics: {
                ...diagnostics,
                gateReason: "selective_sync_second_opinion",
                decisionReason: secondOpinion.reason ?? "second_opinion_skip",
                secondOpinionApplied,
                secondOpinionDecision,
                secondOpinionReason,
                secondOpinionTrigger: trigger
              }
            })
          };
        }

        if (secondOpinion.decision === "allow_conservative") {
          finalMode = "inject_conservative";
          finalSelected = finalSelected[0] ? [finalSelected[0]] : [];
        }
      }
    }

    return {
      mode: finalMode,
      selected: finalSelected,
      text: renderInjection(finalMode, finalSelected, finalMode === "inject_conservative" ? 1 : maxHints),
      diagnostics: withDecisionEnvelope({
        mode: finalMode,
        selected: finalSelected,
        scoredCandidates,
        topCandidateQuality,
          diagnostics: {
            ...diagnostics,
          secondOpinionApplied: secondOpinionApplied || undefined,
          secondOpinionDecision,
          secondOpinionReason,
          secondOpinionTrigger: secondOpinionApplied && trigger ? trigger : undefined
        }
      })
    };
  };

  if (topCandidateQuality && isStrongCandidate(topCandidateQuality, runnerUpQuality)) {
    const fastPathSelection =
      isTrustedSameFamilyCluster(topCandidateQuality, runnerUpQuality)
        ? selected
        : selected[0]
          ? [selected[0]]
          : [];
    return finalizeLiveDecision(mode, fastPathSelection, {
      ...diagnosticsBase,
      fastPathApplied: true,
      gateReason: "strong_candidate_fast_path",
      decisionReason: "mature_validated_candidate"
    });
  }

  const route = evaluateTriggerRoute(
    input,
    stats,
    {
      knownRiskSummary: candidateRiskSummary,
      candidateQuality: topCandidateQuality
    },
    triggerThreshold
  );

  if (route.decision === "skip") {
    return {
      mode: "skip",
      selected: [],
      diagnostics: withDecisionEnvelope({
        mode: "skip",
        selected: [],
        scoredCandidates,
        topCandidateQuality,
        diagnostics: {
          ...diagnosticsBase,
          gateReason: "uncertainty_aware_routing",
          decisionReason: route.reason
        }
      })
    };
  }

  if (route.decision === "inject_conservative") {
    const conservativeSelection = selectInjectableNodes(correctionAwareRanked, 1, input.task_type);
    if (!conservativeSelection.length) {
      return {
        mode: "skip",
        selected: [],
        diagnostics: withDecisionEnvelope({
          mode: "skip",
          selected: [],
          scoredCandidates,
          topCandidateQuality,
          diagnostics: {
            ...diagnosticsBase,
            gateReason: "no_selected_nodes",
            decisionReason: "selection_empty"
          }
        })
      };
    }

    return finalizeLiveDecision("inject_conservative", conservativeSelection, {
      ...diagnosticsBase,
      gateReason: "uncertainty_aware_routing",
      decisionReason: route.reason
    });
  }

  if (!selected.length) {
    return {
      mode: "skip",
      selected: [],
      diagnostics: withDecisionEnvelope({
        mode: "skip",
        selected: [],
        scoredCandidates,
        topCandidateQuality,
        diagnostics: {
          ...diagnosticsBase,
          gateReason: "no_selected_nodes",
          decisionReason: "selection_empty"
        }
      })
    };
  }

  return finalizeLiveDecision(mode, selected, diagnosticsBase);
};
