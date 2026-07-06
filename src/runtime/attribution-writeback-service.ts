import { classifyFailureAttributionReason } from "../feedback/automatic-attribution.js";
import { detectHarm } from "../feedback/harm-detector.js";
import type { AttributionRecordRepository } from "../store/sqlite/repositories/attribution-record-repo.js";
import type { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import type {
  AttributionRecord,
  AttributionVerdict,
  ExperienceInput,
  ExperienceNode,
  InjectionEvent
} from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { stableId } from "../utils/ids.js";
import { TrajectoryCompiler } from "../compiler/trajectory-compiler.js";
import { TrajectoryMatcher } from "../compiler/trajectory-matcher.js";

export type AttributionWritebackServiceOptions = {
  nodeRepo: NodeRepository;
  attributionRecordRepo: AttributionRecordRepository;
  reviewEventRepo: ReviewEventRepository;
};

export class AttributionWritebackService {
  constructor(private readonly options: AttributionWritebackServiceOptions) {}

  private deriveAttributionVerdict(
    input: ExperienceInput,
    node: ExperienceNode,
    delivered: boolean,
    matchResult?: ReturnType<typeof TrajectoryMatcher.match>
  ): {
    verdict: AttributionVerdict;
    confidence: AttributionRecord["confidence"];
  } {
    if (!delivered) {
      return { verdict: "unknown", confidence: "low" };
    }

    if (input.trace_capsule_id) {
      const isLowCompleteness = typeof input.trace_completeness === "number" && input.trace_completeness < 0.6;
      const isUnstable = input.trace_is_unstable === true;

      if ((isLowCompleteness || isUnstable) && (!matchResult || matchResult.verdict === "trajectory_unknown")) {
        return { verdict: "unknown", confidence: "low" };
      }

      if (matchResult) {
        if (matchResult.verdict === "guidance_prevented_failure") {
          return { verdict: "strong_helped", confidence: "high" };
        }
        if (matchResult.verdict === "guidance_caused_failure") {
          return { verdict: "strong_harmed", confidence: "high" };
        }
        if (matchResult.verdict === "adoption_detected") {
          return { verdict: "weak_helped", confidence: "medium" };
        }
        if (matchResult.verdict === "contra_adoption_detected") {
          return { verdict: "weak_harmed", confidence: "medium" };
        }
        if (matchResult.verdict === "non_adoption_detected") {
          return { verdict: "neutral", confidence: "low" };
        }
      }
    }

    if (input.outcome_signal === "success") {
      return { verdict: "weak_helped", confidence: "medium" };
    }

    if (input.outcome_signal === "failure") {
      if (detectHarm(input, node)) {
        return { verdict: "strong_harmed", confidence: "high" };
      }

      const reason = classifyFailureAttributionReason(input, node);
      if (reason === "relevant_failure") {
        return { verdict: "weak_harmed", confidence: "medium" };
      }

      return { verdict: "neutral", confidence: "low" };
    }

    return { verdict: "unknown", confidence: "low" };
  }

  writeAttributionRecords(input: {
    experienceInput: ExperienceInput;
    inputRecordId: string;
    taskRunId: string;
    episodeId?: string;
    resolvedInjectionEvent: InjectionEvent;
  }): void {
    const event = input.resolvedInjectionEvent;
    const evidenceRefs = [input.inputRecordId, input.taskRunId, event.injection_id];
    if (input.experienceInput.trace_capsule_id) {
      evidenceRefs.push(input.experienceInput.trace_capsule_id);
    } else if (input.experienceInput.trace_provenance) {
      evidenceRefs.push(`trace_provenance:${input.taskRunId}`);
    }
    const selectedNodeIds = new Set(event.injected_node_ids);

    for (const nodeId of selectedNodeIds) {
      const node = this.options.nodeRepo.getById(nodeId);
      if (!node) {
        continue;
      }

      const compiledExps = TrajectoryCompiler.compileNodeExpectations(
        node.recommended_steps,
        node.avoid_steps,
        node.success_signal,
        node.stop_condition,
        node.escalation_condition
      );

      const matchResult = TrajectoryMatcher.match(
        compiledExps,
        input.experienceInput.tool_events,
        input.experienceInput.outcome_signal
      );

      const attribution = this.deriveAttributionVerdict(input.experienceInput, node, event.delivered, matchResult);
      this.options.attributionRecordRepo.insert({
        id: stableId("attr", `${event.injection_id}:${nodeId}:automatic`),
        injection_id: event.injection_id,
        node_id: nodeId,
        episode_id: input.episodeId,
        intervention_strength: event.scorecard?.interventionStrength,
        injection_mode: event.mode,
        delivery_mode: event.delivery_mode,
        delivered: event.delivered,
        outcome: input.experienceInput.outcome_signal,
        attribution_verdict: attribution.verdict,
        confidence: attribution.confidence,
        evidence_refs: evidenceRefs,
        source: "automatic",
        attribution_reason: event.attribution_reason,
        trajectory_verdict: matchResult.verdict,
        trajectory_confidence: matchResult.confidence,
        trajectory_matched_expectations: matchResult.matchedExpectationIds,
        trajectory_violated_expectations: matchResult.violatedExpectationIds,
        trajectory_evidence_refs: matchResult.evidenceRefs,
        created_at: nowIso(),
        resolved_at: event.resolved_at
      });
    }

    const diagnosticNodeIds = event.scorecard?.recordOnlyDiagnosticCandidateIds ?? [];
    for (const nodeId of diagnosticNodeIds) {
      if (selectedNodeIds.has(nodeId)) {
        continue;
      }

      const node = this.options.nodeRepo.getById(nodeId);
      let trajectoryFields = {};
      if (node) {
        const compiledExps = TrajectoryCompiler.compileNodeExpectations(
          node.recommended_steps,
          node.avoid_steps,
          node.success_signal,
          node.stop_condition,
          node.escalation_condition
        );
        const matchResult = TrajectoryMatcher.match(
          compiledExps,
          input.experienceInput.tool_events,
          input.experienceInput.outcome_signal
        );
        trajectoryFields = {
          trajectory_verdict: matchResult.verdict,
          trajectory_confidence: matchResult.confidence,
          trajectory_matched_expectations: matchResult.matchedExpectationIds,
          trajectory_violated_expectations: matchResult.violatedExpectationIds,
          trajectory_evidence_refs: matchResult.evidenceRefs,
        };

        if (node.delivery_state === "shadow_probe") {
          const hasHarm = detectHarm(input.experienceInput, node) || matchResult.verdict === "guidance_caused_failure";
          const isSuccess = input.experienceInput.outcome_signal === "success";

          if (isSuccess && !hasHarm) {
            const nextPassCount = (node.quarantine_no_harm_pass_count ?? 0) + 1;
            const updatedNode: ExperienceNode = {
              ...node,
              quarantine_no_harm_pass_count: nextPassCount,
              updated_at: nowIso()
            };

            if (nextPassCount >= 3) {
              updatedNode.delivery_state = "conservative_only";
              updatedNode.quarantine_release_reason = "passed_shadow_probe";

              this.options.reviewEventRepo.upsert({
                id: stableId("rev", `${input.taskRunId}:${nodeId}:restore_conservative`),
                episode_id: input.episodeId,
                node_id: nodeId,
                task_run_id: input.taskRunId,
                event_type: "restore_conservative",
                source: "automatic",
                created_at: nowIso()
              });
            }
            this.options.nodeRepo.upsert(updatedNode);
          } else {
            const nextAttemptCount = node.quarantine_release_attempt_count ?? 0;
            if (nextAttemptCount >= 3) {
              const updatedNode: ExperienceNode = {
                ...node,
                delivery_state: "retired",
                state: "retired",
                quarantine_no_harm_pass_count: 0,
                updated_at: nowIso()
              };
              this.options.nodeRepo.upsert(updatedNode);

              this.options.reviewEventRepo.upsert({
                id: stableId("rev", `${input.taskRunId}:${nodeId}:retire`),
                episode_id: input.episodeId,
                node_id: nodeId,
                task_run_id: input.taskRunId,
                event_type: "retire",
                source: "automatic",
                created_at: nowIso()
              });
            } else {
              const updatedNode: ExperienceNode = {
                ...node,
                delivery_state: "quarantined",
                quarantine_lease_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                quarantine_no_harm_pass_count: 0,
                updated_at: nowIso()
              };
              this.options.nodeRepo.upsert(updatedNode);

              this.options.reviewEventRepo.upsert({
                id: stableId("rev", `${input.taskRunId}:${nodeId}:quarantine`),
                episode_id: input.episodeId,
                node_id: nodeId,
                task_run_id: input.taskRunId,
                event_type: "quarantine",
                source: "automatic",
                created_at: nowIso()
              });
            }
          }
        }
      }

      this.options.attributionRecordRepo.insert({
        id: stableId("attr", `${event.injection_id}:${nodeId}:diagnostic_record`),
        injection_id: event.injection_id,
        node_id: nodeId,
        episode_id: input.episodeId,
        intervention_strength: "diagnostic_hint",
        injection_mode: event.mode,
        delivery_mode: event.delivery_mode,
        delivered: false,
        outcome: input.experienceInput.outcome_signal,
        attribution_verdict: "unknown",
        confidence: "low",
        evidence_refs: evidenceRefs,
        source: "diagnostic_record",
        attribution_reason: "diagnostic_record",
        ...trajectoryFields,
        created_at: nowIso(),
        resolved_at: event.resolved_at
      });
    }
  }
}
