import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";
import { ExperienceStateArtifactService } from "../../interaction/state-artifact-service.js";
import type { ExperienceNode } from "../../types/domain.js";
import type { ExperienceLastInspection, ExperienceNodeDetail } from "../../interaction/service.js";

const NODE_STATES: ExperienceNode["state"][] = ["candidate", "priority_candidate", "active", "cooling", "retired"];
const NODE_TYPES: ExperienceNode["node_type"][] = ["strategy", "warning"];

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

  return `${scorecard.riskLevel}-risk ${primaryNode.state} guidance with ${primaryNode.helped} helped and ${primaryNode.harmed} harmed signal(s).`;
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
  if (topCandidate?.rerankSource === "model" || topCandidate?.rerankSource === "custom") {
    notes.push(`${topCandidate.rerankSource === "model" ? "Model" : "External"} reranking participated in the final ordering.`);
  }

  if (scorecard.fastPathApplied) {
    notes.push("A strong candidate fast path was used.");
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

export const runInspectCommand = (target?: string, arg1?: string, arg2?: string): void => {
  const interaction = new ExperienceInteractionService(loadConfig());

  if (target === "--last") {
    const record = interaction.inspectLast();
    if (!record) {
      console.log("No experience input records recorded yet.");
      return;
    }

    console.log(`Session: ${record.sessionId ?? "unknown"}`);
    console.log(`Scope: ${record.scopeId}`);
    console.log(`Task type: ${record.taskType}`);
    console.log(`Intervention: ${record.intervention}`);
    if (record.scorecard?.mode) {
      console.log(`Route mode: ${record.scorecard.mode}`);
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
      if (typeof record.scorecard.topCandidateScore === "number") {
        console.log(`- Top candidate score: ${record.scorecard.topCandidateScore}`);
      }
      if (typeof record.scorecard.scoreMargin === "number") {
        console.log(`- Score margin: ${record.scorecard.scoreMargin}`);
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
      const retrievalNotes = buildRetrievalNotes(record);
      if (retrievalNotes.length) {
        console.log("- Retrieval notes:");
        for (const note of retrievalNotes) {
          console.log(`  - ${note}`);
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

  if (target === "repo") {
    const summary = interaction.inspectRepoSummary();
    console.log("Repo summary:");
    console.log(`- Scope: ${summary.scope.scopeId}`);
    console.log(`- Benchmark verdict: ${summary.benchmark.verdict}`);
    console.log(`- Suggested mode: ${summary.benchmark.suggestedMode}`);
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
    console.log(`Hint: ${node.hint}`);
    if (node.goal) {
      console.log(`Goal: ${node.goal}`);
    }
    if (node.applicability) {
      console.log(`Applicability: ${node.applicability}`);
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
      last_used: node.lastUsedAt ?? "",
      hint: node.hint
    }))
  );
};
