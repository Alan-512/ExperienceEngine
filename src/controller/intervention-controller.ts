import type {
  ExperienceInput,
  ExperienceNode,
  InterventionBudgetClass,
  InterventionConfidence,
  InterventionDecisionDiagnostics,
  InterventionStrength,
  InterventionRejectedCandidate,
  InjectionScorecardCandidate,
  InjectionMode,
  RepoPolicy,
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
import { explainInjectionRenderingPolicy, renderInjection } from "./injection-renderer.js";
import { rankNodes } from "./node-ranker.js";
import { evaluateTriggerRoute, type TriggerCandidateQuality } from "./trigger-evaluator.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";

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

const isLiveInjectableNode = (node: ExperienceNode): boolean => {
  const deliveryState = resolveDeliveryState(node);
  return deliveryState === "eligible" || deliveryState === "conservative_only";
};

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
    matchScorecard: candidate.matchScorecard,
    scoreMargin: candidate.scoreMargin
  };
};

const toScorecardCandidate = (candidate: RetrievedCandidate): InjectionScorecardCandidate => ({
  id: candidate.node.id,
  matchScorecard: candidate.matchScorecard,
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
  policyComponents: candidate.policyComponents,
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

const deriveInterventionStrength = (
  mode: InjectionMode,
  selected: ExperienceNode[]
): InterventionStrength | undefined => {
  const primaryNode = selected[0];
  if (mode === "skip" || !primaryNode) {
    return undefined;
  }

  if (
    primaryNode.experience_kind === "expectation_correction" &&
    primaryNode.confidence_signal === "confirmed_by_user" &&
    (
      primaryNode.validation_state === "validated_by_reuse" ||
      primaryNode.corrected_constraint?.trim()
    )
  ) {
    return "hard_constraint";
  }

  if (mode === "inject_conservative") {
    return primaryNode.state === "candidate" ? "diagnostic_hint" : "soft_recommendation";
  }

  if (
    primaryNode.state === "active" &&
    primaryNode.helped_count >= primaryNode.harmed_count &&
    (
      primaryNode.validation_state === "validated_by_reuse" ||
      primaryNode.helped_count >= 2
    )
  ) {
    return "strong_recommendation";
  }

  return "soft_recommendation";
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

const isDestructiveOrIrreversibleGuidance = (node: ExperienceNode): boolean => {
  const text = [
    node.trigger_pattern,
    node.compact_hint,
    node.goal,
    node.recommended_steps?.join(" "),
    node.avoid_steps?.join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(rm\s+-rf|git\s+reset\s+--hard|drop\s+table|delete\s+database|force\s+push|rewrite\s+history)\b/i.test(text);
};

const isDiagnosticCandidate = (candidate: RetrievedCandidate): boolean =>
  candidate.node.state === "candidate" && resolveDeliveryState(candidate.node) === "shadow_only";

const DIAGNOSTIC_GATE_THRESHOLDS: Record<RepoPolicy["effective_mode"], { totalScore: number; scoreMargin: number }> = {
  safe: { totalScore: 0.6, scoreMargin: 0.05 },
  fast_learning: { totalScore: 0.55, scoreMargin: 0.03 },
  strict: { totalScore: 0.6, scoreMargin: 0.05 }
};

const passesDiagnosticLiveGate = (candidate: RetrievedCandidate, repoPolicy?: RepoPolicy): boolean => {
  const mode = repoPolicy?.effective_mode ?? "safe";
  const thresholds = DIAGNOSTIC_GATE_THRESHOLDS[mode];
  const strictCircuitSuppressed = mode === "strict" && repoPolicy?.live_diagnostics_disabled;

  return (
    !strictCircuitSuppressed &&
    isDiagnosticCandidate(candidate) &&
    candidate.node.node_type === "strategy" &&
    candidate.scopeMatch &&
    candidate.taskFamilyMatch &&
    candidate.matchScorecard?.scopeMatch === "same" &&
    candidate.matchScorecard.overallMatchBand === "high" &&
    candidate.matchScorecard.negativeEvidence.length === 0 &&
    candidate.node.harmed_count === 0 &&
    candidate.totalScore >= thresholds.totalScore &&
    candidate.scoreMargin >= thresholds.scoreMargin &&
    !isDestructiveOrIrreversibleGuidance(candidate.node)
  );
};

const withDecisionEnvelope = (input: {
  diagnostics: Omit<InterventionDecisionDiagnostics, "confidence" | "budgetClass" | "selectedCandidateIds" | "rejectedCandidates">;
  mode: InjectionMode;
  selected: ExperienceNode[];
  scoredCandidates: RetrievedCandidate[];
  topCandidateQuality?: TriggerCandidateQuality;
}): InterventionDecisionDiagnostics => {
  const selectedCandidateIds = input.selected.map((node) => node.id);
  const retrievalPolicyDiagnostics = input.diagnostics.retrievalPolicyDiagnostics
    ? {
        stages: [
          ...input.diagnostics.retrievalPolicyDiagnostics.stages.filter((stage) => stage.stage !== "decision_assembly"),
          {
            stage: "decision_assembly" as const,
            acceptedCount: selectedCandidateIds.length,
            rejectedCount: input.scoredCandidates.length - selectedCandidateIds.length,
            reasonCodes: [
              input.diagnostics.gateReason,
              input.diagnostics.decisionReason
            ]
          }
        ]
      }
    : undefined;
  return {
    ...input.diagnostics,
    retrievalPolicyDiagnostics,
    interventionStrength: input.diagnostics.interventionStrength ?? deriveInterventionStrength(input.mode, input.selected),
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
  retrievalContext?: RetrievalContext,
  repoPolicy?: RepoPolicy
): Promise<InterventionDecision> =>
  decideInterventionInternal(input, nodes, stats, threshold, maxHints, config, retrievalContext, repoPolicy);

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
  retrievalContext?: RetrievalContext,
  repoPolicy?: RepoPolicy
): Promise<InterventionDecision> => {
  const retrievalBundle = await retrieveCandidateBundle(input, nodes, {
    config,
    retrievalContext,
    includeShadowDiagnosticCandidates: true
  });
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
  const liveCorrectionAwareRanked = correctionAwareRanked.filter(isLiveInjectableNode);
  const diagnosticCandidates = scoredCandidates.filter(isDiagnosticCandidate);
  const liveDiagnosticCandidate = diagnosticCandidates.find((candidate) => passesDiagnosticLiveGate(candidate, repoPolicy));
  const diagnosticCandidateIds = diagnosticCandidates.map((candidate) => candidate.node.id);

  const buildRecordOnlyDiagnosticDiagnostics = (
    gateReason: string,
    decisionReason: string
  ): InterventionDecisionDiagnostics => withDecisionEnvelope({
    mode: "skip",
    selected: [],
    scoredCandidates,
    topCandidateQuality: undefined,
    diagnostics: {
      topCandidates: scoredCandidates.slice(0, 3).map(toScorecardCandidate),
      fastPathApplied: false,
      queryRewriteApplied: retrievalBundle.retrievalQuery.rewriteApplied,
      retrievalPolicyDiagnostics: retrievalBundle.retrievalPolicyDiagnostics,
      gateReason,
      decisionReason,
      interventionStrength: diagnosticCandidateIds.length ? "diagnostic_hint" : undefined,
      recordOnlyDiagnosticCandidateIds: diagnosticCandidateIds
    }
  });

  if (!liveCorrectionAwareRanked.length) {
    if (liveDiagnosticCandidate) {
      return {
        mode: "inject_conservative",
        selected: [liveDiagnosticCandidate.node],
        text: renderInjection("inject_conservative", [liveDiagnosticCandidate.node], 1, "diagnostic_hint"),
        diagnostics: withDecisionEnvelope({
          mode: "inject_conservative",
          selected: [liveDiagnosticCandidate.node],
          scoredCandidates,
          topCandidateQuality: toCandidateQuality(input, liveDiagnosticCandidate.node, liveDiagnosticCandidate),
          diagnostics: {
            topCandidates: scoredCandidates.slice(0, 3).map(toScorecardCandidate),
            topCandidateScore: Number(liveDiagnosticCandidate.totalScore.toFixed(4)),
            scoreMargin: Number(liveDiagnosticCandidate.scoreMargin.toFixed(4)),
            fastPathApplied: false,
            queryRewriteApplied: retrievalBundle.retrievalQuery.rewriteApplied,
            retrievalPolicyDiagnostics: retrievalBundle.retrievalPolicyDiagnostics,
            gateReason: "diagnostic_candidate_gate",
            decisionReason: "diagnostic_candidate_high_match",
            interventionStrength: "diagnostic_hint"
          }
        })
      };
    }

    if (diagnosticCandidateIds.length) {
      return {
        mode: "skip",
        selected: [],
        diagnostics: buildRecordOnlyDiagnosticDiagnostics(
          "diagnostic_candidate_record_only",
          "diagnostic_candidate_not_live_eligible"
        )
      };
    }

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
        retrievalPolicyDiagnostics: retrievalBundle.retrievalPolicyDiagnostics,
        gateReason: "no_candidates",
        decisionReason: "no_matching_candidates"
        }
      })
    };
  }

  const mode: InjectionMode =
    liveCorrectionAwareRanked[0] && resolveDeliveryState(liveCorrectionAwareRanked[0]) === "conservative_only"
      ? "inject_conservative"
      : "inject";
  const selected = selectInjectableNodes(
    liveCorrectionAwareRanked,
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
    retrievalPolicyDiagnostics: retrievalBundle.retrievalPolicyDiagnostics,
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

    const secondOpinionModule =
      config?.syncSecondOpinionMode === "selective"
        ? await import("./second-opinion-gate.js")
        : null;
    const trigger =
      secondOpinionModule?.deriveSelectiveSecondOpinionTrigger(input, plannedSelected, scoredCandidates) ?? null;
    let finalMode: Exclude<InjectionMode, "skip"> = plannedMode;
    let finalSelected = plannedSelected;
    let secondOpinionApplied = false;
    let secondOpinionDecision: SyncSecondOpinionDecision | undefined;
    let secondOpinionReason: string | undefined;

    if (trigger && secondOpinionModule) {
      const secondOpinion = await secondOpinionModule.runSelectiveSecondOpinion(
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
          const replacement = plannedSelected.find((node) => node.id === secondOpinion.bestNodeId);
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

    const finalStrength = deriveInterventionStrength(finalMode, finalSelected);
    const finalConfidence = deriveDecisionConfidence(finalMode, topCandidateQuality, diagnostics.fastPathApplied);
    const renderingPolicy = {
      confidence: finalConfidence,
      overallMatchBand: topCandidateQuality?.matchScorecard?.overallMatchBand
    };

    return {
      mode: finalMode,
      selected: finalSelected,
      text: renderInjection(finalMode, finalSelected, 1, finalStrength, renderingPolicy),
      diagnostics: withDecisionEnvelope({
        mode: finalMode,
        selected: finalSelected,
        scoredCandidates,
        topCandidateQuality,
          diagnostics: {
            ...diagnostics,
          renderingPolicyReason: explainInjectionRenderingPolicy(finalMode, finalSelected, renderingPolicy),
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
    if (liveDiagnosticCandidate) {
      return finalizeLiveDecision("inject_conservative", [liveDiagnosticCandidate.node], {
        topCandidates: scoredCandidates.slice(0, 3).map(toScorecardCandidate),
        topCandidateScore: Number(liveDiagnosticCandidate.totalScore.toFixed(4)),
        scoreMargin: Number(liveDiagnosticCandidate.scoreMargin.toFixed(4)),
        fastPathApplied: false,
        queryRewriteApplied: retrievalBundle.retrievalQuery.rewriteApplied,
        retrievalPolicyDiagnostics: retrievalBundle.retrievalPolicyDiagnostics,
        mergeDecision: liveDiagnosticCandidate.node.merge_decision,
        mergeReason: liveDiagnosticCandidate.node.merge_reason,
        promotionSignal: liveDiagnosticCandidate.node.promotion_signal,
        priorityPromotionApplied: liveDiagnosticCandidate.node.priority_promotion_applied,
        gateReason: "diagnostic_candidate_gate",
        decisionReason: "diagnostic_candidate_high_match"
      });
    }

    return {
      mode: "skip",
      selected: [],
      diagnostics: diagnosticCandidateIds.length
        ? buildRecordOnlyDiagnosticDiagnostics("uncertainty_aware_routing", route.reason)
        : withDecisionEnvelope({
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
    const conservativeSelection = selectInjectableNodes(liveCorrectionAwareRanked, 1, input.task_type);
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
