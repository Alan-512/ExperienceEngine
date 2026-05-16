import { loadConfig } from "../../config/load-config.js";
import { deriveGovernanceSignals } from "../../experience-management/governance-observability.js";
import { ExperienceInteractionService } from "../../interaction/service.js";
import { ExperienceStateArtifactService } from "../../interaction/state-artifact-service.js";
import type { DeliveryState, ExperienceNode } from "../../types/domain.js";
import type { ExperienceLastInspection, ExperienceNodeDetail } from "../../interaction/service.js";
import type { ExperienceQualityBandExplanation } from "../../interaction/quality-band.js";
import type { HygieneFindingType, HygieneSeverity } from "../../maintenance/experience-hygiene.js";
import type { ExportDraftRisk } from "../../maintenance/experience-export-drafts.js";

const NODE_STATES: ExperienceNode["state"][] = ["candidate", "priority_candidate", "active", "cooling", "retired"];
const NODE_TYPES: ExperienceNode["node_type"][] = ["strategy", "warning"];
const DELIVERY_STATES: DeliveryState[] = ["shadow_only", "conservative_only", "eligible", "quarantined"];
const HYGIENE_TYPES: HygieneFindingType[] = [
  "stale_experience",
  "duplicate_guidance",
  "conflicting_guidance",
  "over_generalized_guidance",
  "evidence_drift"
];
const HYGIENE_SEVERITIES: HygieneSeverity[] = ["high", "medium", "low"];
const EXPORT_DRAFT_RISKS: ExportDraftRisk[] = ["high", "medium", "low"];

const describeInterventionReason = (record: ExperienceLastInspection): string | undefined => {
  const scorecard = record.scorecard;
  if (!scorecard) {
    return undefined;
  }

  if (scorecard.mode === "inject_conservative") {
    if (scorecard.decisionReason === "ambiguous_same_family_candidate") {
      return "ExperienceEngine found a promising same-family match and chose conservative injection instead of skipping.";
    }

    if (scorecard.decisionReason === "promising_candidate_quality") {
      return "ExperienceEngine found a credible candidate, but kept the injection conservative until it has stronger runtime proof.";
    }

    return "ExperienceEngine chose conservative injection because the best match still needs more runtime evidence.";
  }

  if (scorecard.decisionReason === "mature_validated_candidate") {
    return "A mature validated candidate cleared the fast path, so ExperienceEngine injected it normally.";
  }

  if (scorecard.decisionReason === "candidate_quality_positive") {
    return "Candidate quality was strong enough to justify intervention for this task.";
  }

  if (scorecard.mode === "inject") {
    return "ExperienceEngine injected the best available reusable guidance for this task.";
  }

  if (scorecard.mode === "skip" && scorecard.skipReasonExplanation) {
    return scorecard.skipReasonExplanation;
  }

  if (record.intervention === "shadow") {
    return "ExperienceEngine found a usable match, but delivery was suppressed because this run was in shadow mode.";
  }

  if (record.intervention === "holdout") {
    return "ExperienceEngine found a usable match, but delivery was withheld for evaluation.";
  }

  return undefined;
};

const describeTrustSummary = (record: ExperienceLastInspection): string | undefined => {
  const scorecard = record.scorecard;
  const primaryNode = record.injectedNodes[0];
  if (!scorecard || !primaryNode) {
    return undefined;
  }

  const confidence = scorecard.confidence ? ` ${scorecard.confidence}-confidence` : "";
  return `${scorecard.riskLevel}-risk${confidence} ${primaryNode.state} guidance with ${primaryNode.helped} helped and ${primaryNode.harmed} harmed signal(s).`;
};

const formatQualitySummary = (quality: ExperienceQualityBandExplanation): string =>
  `${quality.band} - ${quality.summary}`;

const printQualityDetails = (quality: ExperienceQualityBandExplanation, indent = ""): void => {
  console.log(`${indent}Quality: ${formatQualitySummary(quality)}`);
  if (quality.reasonCodes.length) {
    console.log(`${indent}Quality reasons: ${quality.reasonCodes.join(", ")}`);
  }
  if (quality.recommendedAction) {
    const command = quality.recommendedAction.command ? ` (${quality.recommendedAction.command})` : "";
    console.log(`${indent}Recommended review: ${quality.recommendedAction.label}${command}`);
  }
};

const buildRetrievalNotes = (record: ExperienceLastInspection): string[] => {
  const scorecard = record.scorecard;
  if (!scorecard) {
    return [];
  }

  const notes: string[] = [];
  if (scorecard.queryRewriteApplied) {
    notes.push("Query rewrite preserved retrieval intent for this task.");
  }

  const topCandidate = scorecard.topCandidates?.[0];
  if (topCandidate?.rerankSource === "model") {
    notes.push("Model reranking participated in the final ordering.");
  }

  if (scorecard.fastPathApplied) {
    notes.push("A strong candidate fast path was used.");
  }

  return notes;
};

const buildGovernanceNotes = (record: ExperienceLastInspection): string[] => {
  const governance = deriveGovernanceSignals(record.scorecard);
  const notes: string[] = [];

  if (governance.realDevAligned) {
    notes.push("Governance favored real coding-error guidance for this task.");
  }

  if (governance.metaDominant) {
    notes.push("Governance penalized meta-like guidance, so this match needs caution outside validation-style work.");
  }

  if (governance.metaTaskAligned) {
    notes.push("Governance recognized this turn as more validation- or meta-like than ordinary coding work.");
  }

  return notes;
};

const describeNodeAssessment = (node: ExperienceNodeDetail): string => {
  if (node.state === "retired") {
    return "retired from reuse because repeated runtime evidence went against it.";
  }

  if (node.state === "cooling") {
    return "usable only with caution because recent runtime evidence weakened confidence.";
  }

  if (node.state === "candidate" || node.state === "priority_candidate") {
    return "still gathering reuse evidence, so it should be applied carefully.";
  }

  if (node.harmed > node.helped) {
    return "active but currently risky because harmful outcomes outweigh helpful ones.";
  }

  if (node.helped >= 1 && node.harmed === 0) {
    return "trusted for normal reuse in similar tasks.";
  }

  return "usable, but still building runtime confidence.";
};

const parseRecentArgs = (arg1?: string, arg2?: string): { injectedOnly: boolean; limit: number } | null => {
  const values = [arg1, arg2].filter((value): value is string => Boolean(value));
  let injectedOnly = false;
  let limit = 10;

  for (const value of values) {
    if (value === "injected") {
      injectedOnly = true;
      continue;
    }

    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = parsed;
      continue;
    }

    return null;
  }

  return { injectedOnly, limit };
};

const isVerboseInspect = (arg1?: string, arg2?: string): boolean =>
  arg1 === "--verbose" || arg2 === "--verbose";

const parseHygieneArgs = (args: string[]): { cwd?: string; type?: HygieneFindingType; severity?: HygieneSeverity; limit?: number } | null => {
  const parsed: { cwd?: string; type?: HygieneFindingType; severity?: HygieneSeverity; limit?: number } = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];
    if ((value === "--cwd" || value === "cwd" || value === "--scope" || value === "scope") && next) {
      parsed.cwd = next;
      index += 1;
      continue;
    }
    if ((value === "--type" || value === "type") && next && HYGIENE_TYPES.includes(next as HygieneFindingType)) {
      parsed.type = next as HygieneFindingType;
      index += 1;
      continue;
    }
    if ((value === "--severity" || value === "severity") && next && HYGIENE_SEVERITIES.includes(next as HygieneSeverity)) {
      parsed.severity = next as HygieneSeverity;
      index += 1;
      continue;
    }
    if ((value === "--limit" || value === "limit") && next) {
      const limit = Number(next);
      if (Number.isInteger(limit) && limit > 0) {
        parsed.limit = limit;
        index += 1;
        continue;
      }
    }
    const numericLimit = Number(value);
    if (Number.isInteger(numericLimit) && numericLimit > 0) {
      parsed.limit = numericLimit;
      continue;
    }
    return null;
  }
  return parsed;
};

const parseExportDraftArgs = (
  args: string[]
): {
  cwd?: string;
  nodeId?: string;
  nodeType?: ExperienceNode["node_type"];
  taskFamily?: ExperienceNode["task_type"];
  state?: ExperienceNode["state"];
  deliveryState?: DeliveryState;
  risk?: ExportDraftRisk;
  limit?: number;
} | null => {
  const parsed: {
    cwd?: string;
    nodeId?: string;
    nodeType?: ExperienceNode["node_type"];
    taskFamily?: ExperienceNode["task_type"];
    state?: ExperienceNode["state"];
    deliveryState?: DeliveryState;
    risk?: ExportDraftRisk;
    limit?: number;
  } = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];
    if ((value === "--cwd" || value === "cwd" || value === "--scope" || value === "scope") && next) {
      parsed.cwd = next;
      index += 1;
      continue;
    }
    if ((value === "--node-id" || value === "node" || value === "nodeId") && next) {
      parsed.nodeId = next;
      index += 1;
      continue;
    }
    if ((value === "--node-type" || value === "nodeType" || value === "type") && next && NODE_TYPES.includes(next as ExperienceNode["node_type"])) {
      parsed.nodeType = next as ExperienceNode["node_type"];
      index += 1;
      continue;
    }
    if ((value === "--task-family" || value === "taskFamily" || value === "task") && next) {
      parsed.taskFamily = next as ExperienceNode["task_type"];
      index += 1;
      continue;
    }
    if ((value === "--state" || value === "state") && next && NODE_STATES.includes(next as ExperienceNode["state"])) {
      parsed.state = next as ExperienceNode["state"];
      index += 1;
      continue;
    }
    if (
      (value === "--delivery-state" || value === "deliveryState" || value === "delivery")
      && next
      && DELIVERY_STATES.includes(next as DeliveryState)
    ) {
      parsed.deliveryState = next as DeliveryState;
      index += 1;
      continue;
    }
    if ((value === "--risk" || value === "risk") && next && EXPORT_DRAFT_RISKS.includes(next as ExportDraftRisk)) {
      parsed.risk = next as ExportDraftRisk;
      index += 1;
      continue;
    }
    if ((value === "--limit" || value === "limit") && next) {
      const limit = Number(next);
      if (Number.isInteger(limit) && limit > 0) {
        parsed.limit = limit;
        index += 1;
        continue;
      }
    }
    const numericLimit = Number(value);
    if (Number.isInteger(numericLimit) && numericLimit > 0) {
      parsed.limit = numericLimit;
      continue;
    }
    return null;
  }
  return parsed;
};

const parseReviewArgs = (args: string[]): { cwd?: string; limit?: number } | null => {
  const parsed: { cwd?: string; limit?: number } = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];
    if ((value === "--cwd" || value === "cwd" || value === "--scope" || value === "scope") && next) {
      parsed.cwd = next;
      index += 1;
      continue;
    }
    if ((value === "--limit" || value === "limit") && next) {
      const limit = Number(next);
      if (Number.isInteger(limit) && limit > 0) {
        parsed.limit = limit;
        index += 1;
        continue;
      }
    }
    const numericLimit = Number(value);
    if (Number.isInteger(numericLimit) && numericLimit > 0) {
      parsed.limit = numericLimit;
      continue;
    }
    return null;
  }
  return parsed;
};

const describeDeliveryStyle = (mode?: string): string | undefined => {
  if (mode === "inject") {
    return "normal hint delivery";
  }

  if (mode === "inject_conservative") {
    return "cautious hint delivery";
  }

  if (mode === "skip") {
    return "no hint delivered";
  }

  return mode;
};

const formatSignedNumber = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;

export const runInspectCommand = (target?: string, arg1?: string, arg2?: string, ...extraArgs: string[]): void => {
  const interaction = new ExperienceInteractionService(loadConfig());

  if (target === "--last") {
    const verbose = isVerboseInspect(arg1, arg2);
    const record = interaction.inspectLast();
    if (!record) {
      console.log("No experience input records recorded yet.");
      return;
    }

    console.log(`Session: ${record.sessionId ?? "unknown"}`);
    if (record.episodeId) {
      console.log(`Episode: ${record.episodeId}`);
    }
    console.log(`Scope: ${record.scopeId}`);
    console.log(`Task type: ${record.taskType}`);
    console.log(`Intervention: ${record.intervention}`);
    const deliveryStyleMode = record.scorecard?.mode ?? (record.intervention === "skip" ? "skip" : undefined);
    if (deliveryStyleMode) {
      console.log(`Delivery style: ${describeDeliveryStyle(deliveryStyleMode)}`);
      if (verbose) {
        console.log(`Route mode: ${deliveryStyleMode}`);
      }
    }
    console.log(`Automatic feedback: ${record.autoFeedback}`);
    if (record.autoFeedbackReason) {
      console.log(`Automatic feedback reason: ${record.autoFeedbackReason}`);
    }

    if (record.injectedNodes.length) {
      console.log("Injected nodes:");
      for (const node of record.injectedNodes) {
        console.log(`- ${node.id} ${node.type} ${node.state} ${node.sourceKind}`);
        console.log(`  Trigger: ${node.triggerPattern}`);
        printQualityDetails(node.quality, "  ");
        console.log(`  Best fit: ${node.applicabilityProfile.bestFit}`);
        if (node.promotionSignal) {
          console.log(`  Promotion signal: ${node.promotionSignal}`);
        }
        if (node.promotionReason) {
          console.log(`  Promotion reason: ${node.promotionReason}`);
        }
        if (node.priorityPromotionApplied) {
          console.log("  Priority promotion applied: yes");
        }
        if (node.mergeDecision) {
          console.log(`  Merge decision: ${node.mergeDecision}`);
        }
        if (node.mergeReason) {
          console.log(`  Merge reason: ${node.mergeReason}`);
        }
        if (node.originRecordIds.length) {
          console.log(`  Origin records: ${node.originRecordIds.join(", ")}`);
        }
        console.log(`  Evidence: ${node.evidenceSummary}`);
      }
    }

    if (record.hints.length) {
      console.log("Hints:");
      for (const hint of record.hints) {
        console.log(`- ${hint}`);
      }
    }

    if (record.scorecard) {
      console.log("Scorecard:");
      console.log(`- Risk: ${record.scorecard.riskLevel}`);
      console.log(`- Recommendation: ${record.scorecard.recommendation}`);
      const interventionReason = describeInterventionReason(record);
      if (interventionReason) {
        console.log(`- Why ExperienceEngine acted: ${interventionReason}`);
      }
      const trustSummary = describeTrustSummary(record);
      if (trustSummary) {
        console.log(`- Trust summary: ${trustSummary}`);
      }
      if (!record.injectedNodes.length && record.qualityContext) {
        console.log(`- Quality context: ${formatQualitySummary(record.qualityContext)}`);
        if (record.qualityContext.reasonCodes.length) {
          console.log(`- Quality reasons: ${record.qualityContext.reasonCodes.join(", ")}`);
        }
      }
      if (verbose) {
        if (typeof record.scorecard.topCandidateScore === "number") {
          console.log(`- Top candidate score: ${record.scorecard.topCandidateScore}`);
        }
        if (typeof record.scorecard.scoreMargin === "number") {
          console.log(`- Score margin: ${record.scorecard.scoreMargin}`);
        }
        if (record.scorecard.confidence) {
          console.log(`- Confidence: ${record.scorecard.confidence}`);
        }
        if (record.scorecard.interventionStrength) {
          console.log(`- Intervention strength: ${record.scorecard.interventionStrength}`);
        }
        if (record.scorecard.skipReasonCode) {
          console.log(`- Skip reason: ${record.scorecard.skipReasonCode}`);
        }
        if (record.scorecard.skipReasonExplanation) {
          console.log(`- Skip explanation: ${record.scorecard.skipReasonExplanation}`);
        }
        if (record.scorecard.budgetClass) {
          console.log(`- Budget class: ${record.scorecard.budgetClass}`);
        }
        if (typeof record.scorecard.fastPathApplied === "boolean") {
          console.log(`- Fast path applied: ${record.scorecard.fastPathApplied ? "yes" : "no"}`);
        }
        if (typeof record.scorecard.queryRewriteApplied === "boolean") {
          console.log(`- Query rewrite applied: ${record.scorecard.queryRewriteApplied ? "yes" : "no"}`);
        }
        if (record.scorecard.promotionSignal) {
          console.log(`- Promotion signal: ${record.scorecard.promotionSignal}`);
        }
        if (typeof record.scorecard.priorityPromotionApplied === "boolean") {
          console.log(`- Priority promotion applied: ${record.scorecard.priorityPromotionApplied ? "yes" : "no"}`);
        }
        if (record.scorecard.mergeDecision) {
          console.log(`- Merge decision: ${record.scorecard.mergeDecision}`);
        }
        if (record.scorecard.mergeReason) {
          console.log(`- Merge reason: ${record.scorecard.mergeReason}`);
        }
        const topCandidate = record.scorecard.topCandidates?.[0];
        if (typeof topCandidate?.semanticScore === "number") {
          console.log(`- Top candidate semantic score: ${topCandidate.semanticScore}`);
        }
        if (typeof topCandidate?.lexicalScore === "number") {
          console.log(`- Top candidate lexical score: ${topCandidate.lexicalScore}`);
        }
        if (typeof topCandidate?.fusedScore === "number") {
          console.log(`- Top candidate fused score: ${topCandidate.fusedScore}`);
        }
        if (typeof topCandidate?.retrievalScore === "number") {
          console.log(`- Top candidate retrieval score: ${topCandidate.retrievalScore}`);
        }
        if (typeof topCandidate?.policyAdjustment === "number") {
          console.log(`- Top candidate policy adjustment: ${topCandidate.policyAdjustment}`);
        }
        if (typeof topCandidate?.rerankScore === "number") {
          console.log(`- Top candidate rerank score: ${topCandidate.rerankScore}`);
        }
        if (topCandidate?.rerankSource) {
          console.log(`- Top candidate rerank source: ${topCandidate.rerankSource}`);
        }
        if (record.scorecard.gateReason) {
          console.log(`- Gate reason: ${record.scorecard.gateReason}`);
        }
        if (record.scorecard.decisionReason) {
          console.log(`- Decision reason: ${record.scorecard.decisionReason}`);
        }
        if (typeof record.scorecard.secondOpinionApplied === "boolean") {
          console.log(`- Sync second-opinion applied: ${record.scorecard.secondOpinionApplied ? "yes" : "no"}`);
        }
        if (record.scorecard.secondOpinionDecision) {
          console.log(`- Sync second-opinion decision: ${record.scorecard.secondOpinionDecision}`);
        }
        if (record.scorecard.secondOpinionTrigger) {
          console.log(`- Sync second-opinion trigger: ${record.scorecard.secondOpinionTrigger}`);
        }
        if (record.scorecard.secondOpinionReason) {
          console.log(`- Sync second-opinion reason: ${record.scorecard.secondOpinionReason}`);
        }
        if (record.scorecard.selectedCandidateIds?.length) {
          console.log(`- Selected candidates: ${record.scorecard.selectedCandidateIds.join(", ")}`);
        }
        if (record.scorecard.rejectedCandidates?.length) {
          console.log("- Rejected candidates:");
          for (const candidate of record.scorecard.rejectedCandidates) {
            console.log(`  - ${candidate.id}: ${candidate.reasonCodes.join(", ")}`);
          }
        }
        if (topCandidate?.retrievalReasons?.length) {
          console.log("- Top candidate retrieval reasons:");
          for (const reason of topCandidate.retrievalReasons) {
            console.log(`  - ${reason}`);
          }
        }
        if (topCandidate?.policyReasons?.length) {
          console.log("- Top candidate policy reasons:");
          for (const reason of topCandidate.policyReasons) {
            console.log(`  - ${reason}`);
          }
        }
        if (record.retrievalPolicySummary) {
          console.log("- Retrieval policy stages:");
          for (const stage of record.retrievalPolicySummary.stages) {
            const counts = [
              stage.acceptedCount == null ? undefined : `accepted=${stage.acceptedCount}`,
              stage.rejectedCount == null ? undefined : `rejected=${stage.rejectedCount}`,
              stage.passedCount == null ? undefined : `passed=${stage.passedCount}`
            ].filter((value): value is string => Boolean(value));
            const suffix = stage.reasonCodes.length ? ` reasons=${stage.reasonCodes.join(",")}` : "";
            console.log(`  - ${stage.stage}: ${counts.join(" ") || "observed"}${suffix}`);
          }
          if (record.retrievalPolicySummary.semanticMode) {
            console.log(`- Semantic retrieval mode: ${record.retrievalPolicySummary.semanticMode}`);
          }
          if (record.retrievalPolicySummary.topPolicyComponents.length) {
            console.log("- Top policy components:");
            for (const component of record.retrievalPolicySummary.topPolicyComponents) {
              console.log(
                `  - ${component.name} (${component.category}) ${formatSignedNumber(component.value)}: ${component.reason}`
              );
            }
          }
          if (record.retrievalPolicySummary.rejectedCandidates.length) {
            console.log("- Retrieval policy rejected candidates:");
            for (const candidate of record.retrievalPolicySummary.rejectedCandidates) {
              console.log(`  - ${candidate.id}: ${candidate.reasonCodes.join(", ")}`);
            }
          }
        }
        const retrievalNotes = buildRetrievalNotes(record);
        if (retrievalNotes.length) {
          console.log("- Retrieval notes:");
          for (const note of retrievalNotes) {
            console.log(`  - ${note}`);
          }
        }
        const governanceNotes = buildGovernanceNotes(record);
        if (governanceNotes.length) {
          console.log("- Governance notes:");
          for (const note of governanceNotes) {
            console.log(`  - ${note}`);
          }
        }
        if (record.attributionRecords.length) {
          console.log("- Attribution records:");
          for (const attribution of record.attributionRecords) {
            const delivered = attribution.delivered ? "delivered" : "not delivered";
            const override = attribution.user_override ? ` override=${attribution.user_override}` : "";
            console.log(
              `  - ${attribution.node_id}: ${attribution.attribution_verdict} (${attribution.confidence}, ${delivered}, source=${attribution.source}${override})`
            );
          }
        }
      }
      if (record.scorecard.reasons.length) {
        console.log("- Why it matched:");
        for (const reason of record.scorecard.reasons) {
          console.log(`  - ${reason}`);
        }
      }
    }

    if (record.timeline.length) {
      console.log("Timeline:");
      for (const entry of record.timeline) {
        console.log(`- ${entry.kind} ${entry.summary}`);
      }
    }

    if (record.evidence.length) {
      console.log("Evidence:");
      for (const evidence of record.evidence) {
        console.log(`- ${evidence}`);
      }
    }

    if (record.learningStatus) {
      console.log(`Learning status: ${record.learningStatus}`);
    }
    if (record.learningReason) {
      console.log(`Learning reason: ${record.learningReason}`);
    }

    console.log(`Outcome: ${record.outcome}`);
    return;
  }

  if (target === "recent") {
    const parsed = parseRecentArgs(arg1, arg2);
    if (!parsed) {
      console.log("Usage: ee inspect recent [injected] [limit]");
      return;
    }

    const records = interaction.inspectRecent({
      injectedOnly: parsed.injectedOnly,
      limit: parsed.limit
    });
    if (!records.length) {
      console.log("No experience input records recorded yet.");
      return;
    }

    console.table(
      records.map((record) => ({
        session: record.sessionId ?? "unknown",
        task: record.taskType,
        intervention: record.intervention,
        outcome: record.outcome,
        created_at: record.createdAt,
        summary: record.summary
      }))
    );
    return;
  }

  if (target === "backups") {
    const artifacts = new ExperienceStateArtifactService().listBackups();
    if (!artifacts.length) {
      console.log("No ExperienceEngine backups stored yet.");
      return;
    }

    console.table(
      artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        created_at: artifact.createdAt,
        sqlite: artifact.sqliteIncluded,
        settings: artifact.settingsIncluded,
        adapters: artifact.installStates.join(","),
        path: artifact.path
      }))
    );
    return;
  }

  if (target === "learning") {
    const summary = interaction.inspectLearningSummary();
    console.log("Candidate lifecycle:");
    console.table(summary.candidates);
    console.log("Distillation jobs:");
    console.table(summary.jobs);
    console.log("Formal nodes:");
    console.table(summary.nodes);
    console.log("Node sources:");
    console.table(summary.nodeSources);
    console.log("Effectiveness:");
    console.table(summary.effectiveness);
    console.log("Benchmark summary:");
    console.table(summary.benchmark);
    console.log(`Recommendation: ${summary.benchmark.recommendation}`);
    console.log("Attribution reasons:");
    console.table(summary.attributionReasons);
    console.log("Runtime records:");
    console.table(summary.runtime);
    if (summary.latestRecordCreatedAt) {
      console.log(`Latest task record: ${summary.latestRecordCreatedAt}`);
    }
    return;
  }

  if (target === "hygiene") {
    const filters = parseHygieneArgs([arg1, arg2, ...extraArgs].filter((value): value is string => Boolean(value)));
    if (!filters) {
      console.log("Usage: ee inspect hygiene [--cwd <path>] [--type <finding_type>] [--severity <high|medium|low>] [--limit <n>]");
      return;
    }
    const { cwd, ...hygieneFilters } = filters;
    const report = interaction.inspectHygiene(cwd ?? process.cwd(), hygieneFilters);
    console.log("Experience hygiene:");
    console.log(`- Scope: ${report.scopeId ?? "current"}`);
    console.log(`- Findings: ${report.summary.total}`);
    console.log(`- Generated at: ${report.generatedAt}`);
    console.log("By severity:");
    console.table(report.summary.bySeverity);
    console.log("By type:");
    console.table(report.summary.byType);
    if (!report.findings.length) {
      console.log("No hygiene findings found.");
      return;
    }
    console.table(
      report.findings.map((finding) => ({
        severity: finding.severity,
        type: finding.type,
        nodes: finding.affectedNodeIds.join(","),
        candidates: finding.affectedCandidateIds.join(","),
        evidence: finding.evidenceSummary,
        recommendation: finding.recommendation
      }))
    );
    return;
  }

  if (target === "export-drafts") {
    const filters = parseExportDraftArgs([arg1, arg2, ...extraArgs].filter((value): value is string => Boolean(value)));
    if (!filters) {
      console.log(
        "Usage: ee inspect export-drafts [--cwd <path>] [--node-id <id>] [--node-type <strategy|warning>] [--task-family <task>] [--state <candidate|priority_candidate|active|cooling|retired>] [--delivery-state <shadow_only|conservative_only|eligible|quarantined>] [--risk <high|medium|low>] [--limit <n>]"
      );
      return;
    }
    const { cwd, ...draftFilters } = filters;
    const report = interaction.inspectExportDrafts(cwd ?? process.cwd(), draftFilters);
    console.log("Guidance export drafts:");
    console.log("- Review-only: no instruction files, skills, docs, node state, attribution, review events, repo policy, or snapshots were written.");
    console.log(`- Scope: ${report.scopeId ?? "current"}`);
    console.log(`- Drafts: ${report.summary.total}`);
    console.log(`- Generated at: ${report.generatedAt}`);
    console.log("By risk:");
    console.table(report.summary.byRisk);
    console.log("By suggested target:");
    console.table(report.summary.byTargetType);
    if (!report.drafts.length) {
      console.log("No exportable guidance drafts found.");
      return;
    }
    console.table(
      report.drafts.map((draft) => ({
        draft: draft.draftId,
        nodes: draft.nodeIds.join(","),
        candidates: draft.contextCandidateIds.join(","),
        task: draft.taskFamily,
        risk: draft.risk,
        target: draft.suggestedTargetType,
        readiness: draft.readinessScore,
        guidance: draft.guidanceText.split("\n")[0],
        evidence: draft.evidenceSummary
      }))
    );
    return;
  }

  if (target === "review") {
    const filters = parseReviewArgs([arg1, arg2, ...extraArgs].filter((value): value is string => Boolean(value)));
    if (!filters) {
      console.log("Usage: ee inspect review [--cwd <path>] [--limit <n>]");
      return;
    }
    const { cwd, ...reviewFilters } = filters;
    const report = interaction.inspectReview(cwd ?? process.cwd(), reviewFilters);
    console.log("Operator review:");
    console.log("- Review-only: no repo policy, node, candidate, attribution, review, snapshot, or instruction-file state was changed.");
    console.log(`- Scope: ${report.scopeId}`);
    console.log(`- Generated at: ${report.generatedAt}`);
    console.log("Summary:");
    console.log(`- Repo policy: ${report.sections.repo_policy.health} (${report.sections.repo_policy.drillDown.cli})`);
    console.log(
      `- Hygiene findings: ${report.sections.hygiene.total} high=${report.sections.hygiene.high} medium=${report.sections.hygiene.medium} low=${report.sections.hygiene.low} (${report.sections.hygiene.drillDown.cli})`
    );
    console.log(
      `- Export drafts: ${report.sections.export_drafts.total} high=${report.sections.export_drafts.highRisk} medium=${report.sections.export_drafts.mediumRisk} low=${report.sections.export_drafts.lowRisk} (${report.sections.export_drafts.drillDown.cli})`
    );
    console.log(`- Recommended order: ${report.recommendedReviewOrder.join(" -> ")}`);
    if (!report.reviewItems.length) {
      console.log("No immediate operator review items found.");
    } else {
      console.log("Review items:");
      console.table(
        report.reviewItems.map((item, index) => ({
          next: index + 1,
          priority: item.priority,
          source: item.source,
          title: item.title,
          summary: item.summary,
          drill_down: item.drillDown.cli
        }))
      );
    }
    console.log("Review-only next actions:");
    for (const action of report.reviewOnlyNextActions) {
      const suffix = action.drillDown?.cli ? ` (${action.drillDown.cli})` : "";
      console.log(`- [${action.priority}] ${action.summary}${suffix}`);
    }
    console.log("Drill-down surfaces:");
    console.log(`- repo_policy: ${report.sections.repo_policy.drillDown.cli}`);
    console.log(`- hygiene: ${report.sections.hygiene.drillDown.cli}`);
    console.log(`- export_drafts: ${report.sections.export_drafts.drillDown.cli}`);
    return;
  }

  if (target === "repo") {
    const summary = interaction.inspectRepoSummary();
    console.log("Repo summary:");
    console.log(`- Scope: ${summary.scope.scopeId}`);
    console.log(`- Benchmark verdict: ${summary.benchmark.verdict}`);
    console.log(`- Suggested mode: ${summary.benchmark.suggestedMode}`);
    console.log(`- Quality bands: ${summary.quality.summary}`);
    if (summary.policy) {
      console.log("Repo policy:");
      console.log(`- Configured mode: ${summary.policy.configuredMode}`);
      console.log(`- Effective mode: ${summary.policy.effectiveMode}`);
      console.log(`- Circuit state: ${summary.policy.circuitState}`);
      console.log(`- Live diagnostics suppressed: ${summary.policy.liveDiagnosticsDisabled ? "yes" : "no"}`);
      console.log(`- Updated at: ${summary.policy.updatedAt}`);
      if (summary.policy.circuitReason) {
        console.log(`- Circuit reason: ${summary.policy.circuitReason}`);
      }
      if (summary.policy.lastTrippedAt) {
        console.log(`- Last tripped at: ${summary.policy.lastTrippedAt}`);
      }
      if (summary.policy.restoreGuidance) {
        console.log(`- Restore: ${summary.policy.restoreGuidance}`);
      }
      if (summary.policy.evidenceSummary) {
        console.log("Repo policy evidence:");
        console.log(`- Window: ${summary.policy.evidenceSummary.windowSize}/${summary.policy.evidenceSummary.limit}`);
        console.log(`- Attribution evidence: ${summary.policy.evidenceSummary.countsBySource.attribution}`);
        console.log(`- Injection fallback evidence: ${summary.policy.evidenceSummary.countsBySource.injection_fallback}`);
        console.log(`- Manual override evidence: ${summary.policy.evidenceSummary.manualOverrideCount}`);
        if (summary.policy.evidenceSummary.fallbackSuppressedCount > 0) {
          console.log(`- Duplicate fallback entries suppressed: ${summary.policy.evidenceSummary.fallbackSuppressedCount}`);
        }
        console.log("Evidence verdicts:");
        console.table(summary.policy.evidenceSummary.countsByVerdict);
        if (summary.policy.evidence?.length) {
          console.log("Recent policy evidence:");
          console.table(
            summary.policy.evidence.map((entry) => ({
              source: entry.source,
              label: entry.evidenceLabel,
              verdict: entry.verdict,
              node: entry.nodeId ?? "",
              injection: entry.injectionId ?? "",
              delivered: entry.delivered == null ? "" : entry.delivered ? "yes" : "no",
              override: entry.userOverride ?? "",
              reason: entry.attributionReason ?? "",
              created_at: entry.createdAt
            }))
          );
        }
      }
    }
    if (summary.recent.latestIntervention) {
      console.log(`- Latest intervention summary: ${summary.recent.latestIntervention} on the latest recorded task.`);
    }
    if (summary.recent.latestDecisionExplanation) {
      console.log(`- Latest decision explanation: ${summary.recent.latestDecisionExplanation}`);
    }
    console.log("Recommended next action:");
    console.log(`- ${summary.recommendedNextAction}`);
    return;
  }

  if (target === "node") {
    console.log("Usage: ee inspect node <id>");
    return;
  }

  if (target === "state") {
    if (!arg1 || !NODE_STATES.includes(arg1 as ExperienceNode["state"])) {
      console.log("Usage: ee inspect state <candidate|priority_candidate|active|cooling|retired>");
      return;
    }

    const nodes = interaction.listNodesByState(arg1 as ExperienceNode["state"]);
    if (!nodes.length) {
      console.log(`No ${arg1} experience nodes stored yet.`);
      return;
    }

    console.table(
      nodes.map((node) => ({
        id: node.id,
        type: node.type,
        source: node.sourceKind,
        task: node.taskType,
        state: node.state,
        helped: node.helped,
        harmed: node.harmed,
        quality: node.qualityBand,
        last_used: node.lastUsedAt ?? "",
        hint: node.hint
      }))
    );
    return;
  }

  if (target === "type") {
    if (!arg1 || !NODE_TYPES.includes(arg1 as ExperienceNode["node_type"])) {
      console.log("Usage: ee inspect type <strategy|warning>");
      return;
    }

    const nodes = interaction.listNodesByType(arg1 as ExperienceNode["node_type"]);
    if (!nodes.length) {
      console.log(`No ${arg1} experience nodes stored yet.`);
      return;
    }

    console.table(
      nodes.map((node) => ({
        id: node.id,
        type: node.type,
        source: node.sourceKind,
        task: node.taskType,
        state: node.state,
        helped: node.helped,
        harmed: node.harmed,
        quality: node.qualityBand,
        last_used: node.lastUsedAt ?? "",
        hint: node.hint
      }))
    );
    return;
  }

  if (target?.startsWith("node:")) {
    const nodeId = target.slice("node:".length);
    const node = interaction.inspectNode(nodeId);
    if (!node) {
      console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
      return;
    }

    console.log(`Node: ${node.id}`);
    console.log(`Type: ${node.type}`);
    console.log(`Source: ${node.sourceKind}`);
    if (node.distillationMode) {
      console.log(`Distillation mode: ${node.distillationMode}`);
    }
    if (node.distillationSource) {
      console.log(`Distillation source: ${node.distillationSource}`);
    }
    if (node.redistilledFrom) {
      console.log(`Redistilled from: ${node.redistilledFrom}`);
    }
    console.log(`Task type: ${node.taskType}`);
    console.log(`State: ${node.state}`);
    console.log(`Scope: ${node.scopeId}`);
    console.log(`Helped: ${node.helped}`);
    console.log(`Harmed: ${node.harmed}`);
    console.log(`Used: ${node.used}`);
    console.log(`Current assessment: ${describeNodeAssessment(node)}`);
    console.log(`Quality band: ${node.quality.band}`);
    console.log(`Quality summary: ${node.quality.summary}`);
    if (node.quality.reasonCodes.length) {
      console.log(`Quality reason codes: ${node.quality.reasonCodes.join(", ")}`);
    }
    if (node.quality.reasons.length) {
      console.log("Quality reasons:");
      for (const reason of node.quality.reasons) {
        console.log(`- ${reason}`);
      }
    }
    if (node.quality.evidenceRefs.length) {
      console.log("Quality evidence refs:");
      for (const ref of node.quality.evidenceRefs.slice(0, 8)) {
        console.log(`- ${ref.kind}:${ref.id}`);
      }
    }
    if (node.quality.recommendedAction) {
      const command = node.quality.recommendedAction.command ? ` (${node.quality.recommendedAction.command})` : "";
      console.log(`Quality review action: ${node.quality.recommendedAction.label}${command}`);
    }
    console.log(`Hint: ${node.hint}`);
    if (node.goal) {
      console.log(`Goal: ${node.goal}`);
    }
    if (node.applicability) {
      console.log(`Applicability: ${node.applicability}`);
    }
    console.log("Applicability profile:");
    console.log(`- Best fit: ${node.applicabilityProfile.bestFit}`);
    console.log(`- Scope validity: ${node.applicabilityProfile.scopeValidity}`);
    console.log(`- Confidence: ${node.applicabilityProfile.confidence}`);
    console.log(`- Risk: ${node.applicabilityProfile.risk}`);
    if (node.applicabilityProfile.avoidWhen) {
      console.log(`- Avoid when: ${node.applicabilityProfile.avoidWhen}`);
    }
    console.log(`Success signal: ${node.successSignal}`);
    console.log(`Evidence: ${node.evidence}`);
    if (node.originRecordIds.length) {
      console.log(`Origin records: ${node.originRecordIds.join(", ")}`);
    }
    if (node.helpedRecordIds.length) {
      console.log(`Helped records: ${node.helpedRecordIds.join(", ")}`);
    }
    if (node.harmedRecordIds.length) {
      console.log(`Harmed records: ${node.harmedRecordIds.join(", ")}`);
    }
    if (node.recommendedSteps.length) {
      console.log("Recommended steps:");
      for (const step of node.recommendedSteps) {
        console.log(`- ${step}`);
      }
    }
    return;
  }

  const rows = target === "active" ? interaction.listActiveNodes() : interaction.listAllNodes();
  if (!rows.length) {
    console.log(target === "active" ? "No active experience nodes stored yet." : "No experience nodes stored yet.");
    return;
  }

  console.table(
    rows.map((node) => ({
      id: node.id,
      type: node.type,
      source: node.sourceKind,
      task: node.taskType,
      state: node.state,
      helped: node.helped,
      harmed: node.harmed,
      quality: node.qualityBand,
      last_used: node.lastUsedAt ?? "",
      hint: node.hint
    }))
  );
};
