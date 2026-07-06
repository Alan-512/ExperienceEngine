import { classifyFailureAttributionReason } from "../feedback/automatic-attribution.js";
import { applyFeedback } from "../feedback/feedback-manager.js";
import { detectHarm } from "../feedback/harm-detector.js";
import { deriveNodeOriginProfileForNode } from "../experience-management/node-lifecycle-governance.js";
import type { AttributionWritebackService } from "./attribution-writeback-service.js";
import type { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import type { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import type { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import type { ScopeFingerprintRepository } from "../store/sqlite/repositories/scope-fingerprint-repo.js";
import type {
  ExperienceInput,
  ExperienceNode,
  InjectionEvent
} from "../types/domain.js";
import { nowIso } from "../utils/clock.js";
import { createId } from "../utils/ids.js";

export type InjectionOutcomeServiceOptions = {
  inputRepo: InputRecordRepository;
  nodeRepo: NodeRepository;
  reviewEventRepo: ReviewEventRepository;
  scopeFingerprintRepo: ScopeFingerprintRepository;
  injectionRepo: InjectionRepository;
  attributionWriteback: AttributionWritebackService;
};

export class InjectionOutcomeService {
  constructor(private readonly options: InjectionOutcomeServiceOptions) {}

  updateInjectedNodes(
    input: ExperienceInput,
    attributionRecordId: string,
    taskRunId?: string,
    injectionEvent?: InjectionEvent,
    episodeId?: string
  ): void {
    if (!input.injected_node_ids.length) {
      return;
    }

    if (injectionEvent?.scorecard?.interventionStrength === "diagnostic_hint" && !injectionEvent.delivered) {
      return;
    }

    const touched = input.injected_node_ids
      .map((id) => this.options.nodeRepo.getById(id))
      .filter((node): node is ExperienceNode => Boolean(node));

    const automaticEvents = touched
      .map((node) => {
        if (input.outcome_signal === "success") {
          return {
            nodeId: node.id,
            eventType: "mark_uncertain" as const
          };
        }

        if (detectHarm(input, node)) {
          return {
            nodeId: node.id,
            eventType: "mark_harmed" as const
          };
        }

        return undefined;
      })
      .filter(
        (
          value
        ): value is {
          nodeId: string;
          eventType: "mark_uncertain" | "mark_harmed";
        } => Boolean(value)
      );

    const originProfilesByNodeId = Object.fromEntries(
      touched.map((node) => {
        return [node.id, deriveNodeOriginProfileForNode(this.options.inputRepo, node)];
      })
    );

    const isDiagnosticHint = injectionEvent?.scorecard?.interventionStrength === "diagnostic_hint";
    const highMatchPromotionIds = new Set(
      isDiagnosticHint
        ? []
        : injectionEvent?.scorecard?.topCandidates
        ?.filter((candidate) =>
          candidate.matchScorecard?.scopeMatch === "same" &&
          candidate.matchScorecard.overallMatchBand === "high" &&
          candidate.matchScorecard.negativeEvidence.length === 0
        )
        .map((candidate) => candidate.id) ?? []
    );
    const promotedNodeIds: string[] = [];
    const fpRecord = this.options.scopeFingerprintRepo.getById(input.scope_id);
    const hostHash = fpRecord?.fingerprint_hash;

    for (const node of applyFeedback(input, touched, attributionRecordId, { originProfilesByNodeId })) {
      const shouldPromoteSameScopeHighMatch =
        input.outcome_signal === "success" &&
        input.scope_id === node.scope_id &&
        highMatchPromotionIds.has(node.id) &&
        node.state === "priority_candidate" &&
        node.delivery_state === "conservative_only" &&
        node.harmed_count === 0;
      let nextNode = shouldPromoteSameScopeHighMatch
        ? {
            ...node,
            state: "active" as const,
            delivery_state: "eligible" as const,
            validation_state: node.validation_state ?? "validated_by_reuse",
            promotion_reason: node.promotion_reason ?? "same_scope_high_match_success"
          }
        : node;

      if (hostHash && nextNode.scope_id !== input.scope_id) {
        const harmed = detectHarm(input, nextNode);
        const verdict =
          input.outcome_signal === "success"
            ? "success"
            : harmed
              ? "harmed"
              : "none";

        if (verdict === "success" || verdict === "harmed") {
          const evidence = nextNode.portable_validation_evidence ?? { compatibilityClasses: {} };
          const classes = evidence.compatibilityClasses ?? {};
          const prev = classes[hostHash] ?? { successReuseCount: 0, harmCount: 0, lastUsedAt: 0 };

          classes[hostHash] = {
            successReuseCount: verdict === "success" ? prev.successReuseCount + 1 : prev.successReuseCount,
            harmCount: verdict === "harmed" ? prev.harmCount + 1 : prev.harmCount,
            lastUsedAt: Date.now()
          };

          nextNode = {
            ...nextNode,
            portable_validation_evidence: {
              ...evidence,
              compatibilityClasses: classes
            }
          };
        }
      }

      if (shouldPromoteSameScopeHighMatch) {
        promotedNodeIds.push(node.id);
      }
      this.options.nodeRepo.upsert(nextNode);
    }

    for (const event of automaticEvents) {
      this.options.reviewEventRepo.upsert({
        id: createId("review"),
        episode_id: episodeId,
        node_id: event.nodeId,
        task_run_id: taskRunId,
        event_type: event.eventType,
        source: "automatic",
        created_at: nowIso()
      });
    }

    for (const nodeId of promotedNodeIds) {
      this.options.reviewEventRepo.upsert({
        id: createId("review"),
        episode_id: episodeId,
        node_id: nodeId,
        task_run_id: taskRunId,
        event_type: "promote_eligible",
        source: "automatic",
        created_at: nowIso()
      });
    }
  }

  finalizeInjectionOutcome(input: {
    sessionId: string;
    sessionLastInjectionEvent?: InjectionEvent;
    experienceInput: ExperienceInput;
    inputRecordId: string;
    taskRunId: string;
    episodeId?: string;
  }): void {
    const injectionEvent =
      input.sessionLastInjectionEvent ?? this.options.injectionRepo.getLatestBySessionId(input.sessionId);
    this.updateInjectedNodes(
      input.experienceInput,
      input.inputRecordId,
      input.taskRunId,
      injectionEvent,
      input.episodeId
    );
    if (!injectionEvent) {
      return;
    }

    const touchedNodes = injectionEvent.injected_node_ids
      .map((id) => this.options.nodeRepo.getById(id))
      .filter((node): node is ExperienceNode => Boolean(node));
    const harmObserved = touchedNodes.some((node) => detectHarm(input.experienceInput, node));
    const attributionReason = !injectionEvent.delivered
      ? "suppressed_delivery"
      : input.experienceInput.outcome_signal === "success"
        ? "success_outcome"
        : input.experienceInput.outcome_signal === "failure"
          ? touchedNodes
              .map((node) => classifyFailureAttributionReason(input.experienceInput, node))
              .find((reason) => reason === "relevant_failure")
              ?? classifyFailureAttributionReason(input.experienceInput)
            : "unknown_outcome";
    const resolvedInjectionEvent: InjectionEvent = {
      ...injectionEvent,
      was_successful: input.experienceInput.outcome_signal === "success",
      harm_observed: harmObserved,
      attribution_reason: attributionReason,
      resolved_at: nowIso()
    };
    this.options.injectionRepo.upsert(resolvedInjectionEvent);
    this.options.attributionWriteback.writeAttributionRecords({
      experienceInput: input.experienceInput,
      inputRecordId: input.inputRecordId,
      taskRunId: input.taskRunId,
      episodeId: input.episodeId,
      resolvedInjectionEvent
    });
  }
}
