import { dirname } from "node:path";
import { buildCandidateSignals } from "../analyzer/candidate-signals.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import {
  applyGovernedNodeFeedback,
  deriveNodeOriginProfileForNode
} from "../experience-management/node-lifecycle-governance.js";
import type { PostmortemReviewCapsule } from "../hybrid/types.js";
import type {
  HybridPostmortemResult,
  HybridWorkerClient
} from "../hybrid/worker-client.js";
import type { HybridInvocationTraceRepository } from "../store/sqlite/repositories/hybrid-invocation-trace-repo.js";
import type { HybridReviewArtifactRepository } from "../store/sqlite/repositories/hybrid-review-artifact-repo.js";
import type { InputRecordRepository } from "../store/sqlite/repositories/input-record-repo.js";
import type { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type { ReviewEventRepository } from "../store/sqlite/repositories/review-event-repo.js";
import type {
  ExperienceInput,
  ExperienceNode,
  HybridReviewArtifact,
  TaskRun,
  ToolEvent
} from "../types/domain.js";
import type { OpenClawLogger } from "../types/plugin.js";
import { nowIso } from "../utils/clock.js";
import { createId } from "../utils/ids.js";
import type { HybridRouteDecision } from "../hybrid/router.js";

const loadHybridCapsuleBuilder = async (): Promise<typeof import("../hybrid/capsule-builder.js")> =>
  import("../hybrid/capsule-builder.js");

const loadHybridPostmortemProviderClient = async (): Promise<typeof import("../hybrid/postmortem-provider-client.js")> =>
  import("../hybrid/postmortem-provider-client.js");

export type HybridPostmortemServiceOptions = {
  config: ExperienceEngineConfig;
  enabled: boolean;
  inputRepo: InputRecordRepository;
  nodeRepo: NodeRepository;
  reviewEventRepo: ReviewEventRepository;
  hybridReviewArtifactRepo: HybridReviewArtifactRepository;
  hybridTraceRepo: HybridInvocationTraceRepository;
  logger: OpenClawLogger;
  getHybridWorkerClient: () => Promise<HybridWorkerClient | undefined>;
};

export class HybridPostmortemService {
  constructor(private readonly options: HybridPostmortemServiceOptions) {}

  private buildPostmortemArtifact(input: {
    taskRun: TaskRun;
    result: Extract<HybridPostmortemResult, { status: "accepted" }>;
    routeDecision: HybridRouteDecision;
  }): HybridReviewArtifact {
    const timestamp = nowIso();
    return {
      id: createId("hybridreview"),
      task_run_id: input.taskRun.id,
      scope_id: input.taskRun.scope_id,
      worker_task: "postmortem_review",
      approval_class:
        input.result.approvalClass === "policy_gated" ? "policy_gated" : "review_artifact",
      schema_version: this.options.config.hybridCapsuleSchemaVersion,
      route_policy_version: input.routeDecision.policyVersion,
      worker_profile_version: this.options.config.hybridPostmortemReviewProfileVersion,
      recommendation: input.result.value.candidate_recommendation,
      summary: input.result.value.review_artifact?.summary ?? input.result.value.reason,
      payload: input.result.value as unknown as Record<string, unknown>,
      created_at: timestamp,
      updated_at: timestamp
    };
  }

  private applyPostmortemDeliveryRecommendation(
    node: ExperienceNode,
    recommendation: "keep" | "conservative_only" | "quarantine" | "review"
  ): ExperienceNode {
    if (recommendation === "keep" || recommendation === "review") {
      return node;
    }

    if (recommendation === "quarantine") {
      return {
        ...node,
        delivery_state: "quarantined",
        quarantined_at: node.quarantined_at ?? nowIso(),
        quarantine_reason: node.quarantine_reason ?? "postmortem_review"
      };
    }

    if (node.delivery_state === "quarantined") {
      return node;
    }

    return {
      ...node,
      delivery_state: node.delivery_state === "shadow_only" ? "shadow_only" : "conservative_only"
    };
  }

  private applyAcceptedPostmortemNodeReviews(input: {
    taskRun: TaskRun;
    experienceInput: ExperienceInput;
    result: Extract<HybridPostmortemResult, { status: "accepted" }>;
  }): boolean {
    const reviews = input.result.value.injected_node_reviews ?? [];
    if (!reviews.length || input.taskRun.final_status === "cancelled") {
      return false;
    }

    const allowedIds = new Set(input.experienceInput.injected_node_ids);
    const existingEvents = this.options.reviewEventRepo.listByTaskRunId(input.taskRun.id);
    let applied = false;

    for (const review of reviews) {
      if (!allowedIds.has(review.node_id) || review.confidence === "low") {
        continue;
      }

      const current = this.options.nodeRepo.getById(review.node_id);
      if (!current) {
        continue;
      }

      const existingNodeEvents = existingEvents.filter(
        (event) => event.node_id === review.node_id && event.source === "automatic"
      );
      const alreadyMarkedHelped = existingNodeEvents.some((event) => event.event_type === "mark_helped");
      const alreadyMarkedHarmed = existingNodeEvents.some((event) => event.event_type === "mark_harmed");

      let nextNode = current;
      let feedbackEventType: "mark_helped" | "mark_harmed" | undefined;

      if (review.feedback_verdict === "helped" && !alreadyMarkedHelped) {
        nextNode = applyGovernedNodeFeedback(
          nextNode,
          "helped",
          deriveNodeOriginProfileForNode(this.options.inputRepo, nextNode)
        );
        feedbackEventType = "mark_helped";
      } else if (review.feedback_verdict === "harmed" && !alreadyMarkedHarmed) {
        nextNode = applyGovernedNodeFeedback(
          nextNode,
          "harmed",
          deriveNodeOriginProfileForNode(this.options.inputRepo, nextNode)
        );
        feedbackEventType = "mark_harmed";
      }

      const nodeAfterDelivery = this.applyPostmortemDeliveryRecommendation(
        nextNode,
        review.delivery_recommendation
      );

      if (
        feedbackEventType
        || nodeAfterDelivery.delivery_state !== current.delivery_state
        || nodeAfterDelivery.state !== current.state
        || nodeAfterDelivery.helped_count !== current.helped_count
        || nodeAfterDelivery.harmed_count !== current.harmed_count
        || nodeAfterDelivery.last_feedback_verdict !== current.last_feedback_verdict
      ) {
        this.options.nodeRepo.upsert(nodeAfterDelivery);
        applied = true;
      }

      if (feedbackEventType) {
        this.options.reviewEventRepo.upsert({
          id: createId("review"),
          episode_id: input.taskRun.episode_id,
          node_id: review.node_id,
          task_run_id: input.taskRun.id,
          event_type: feedbackEventType,
          source: "automatic",
          created_at: nowIso()
        });
      }
      if (current.delivery_state !== "quarantined" && nodeAfterDelivery.delivery_state === "quarantined") {
        this.options.reviewEventRepo.upsert({
          id: createId("review"),
          episode_id: input.taskRun.episode_id,
          node_id: review.node_id,
          task_run_id: input.taskRun.id,
          event_type: "quarantine",
          source: "automatic",
          created_at: nowIso()
        });
      }
    }

    return applied;
  }

  async persistAsync(input: {
    taskRun: TaskRun;
    experienceInput: ExperienceInput;
    routeDecision: HybridRouteDecision;
    toolEvents: ToolEvent[];
    rolloutMode: string;
    rolloutReason: string;
  }): Promise<void> {
    if (!this.options.enabled) {
      return;
    }
    if (this.options.hybridReviewArtifactRepo.getByTaskRunId(input.taskRun.id)) {
      return;
    }

    const hybridWorkerClient = await this.options.getHybridWorkerClient();
    if (!hybridWorkerClient) {
      return;
    }

    const candidateSignals = buildCandidateSignals(input.experienceInput);
    const [{ buildPostmortemReviewCapsule }, { resolveHybridPostmortemProviderEndpoint }] = await Promise.all([
      loadHybridCapsuleBuilder(),
      loadHybridPostmortemProviderClient()
    ]);
    const capsule: PostmortemReviewCapsule = buildPostmortemReviewCapsule({
      schemaVersion: this.options.config.hybridCapsuleSchemaVersion,
      routeDecision: input.routeDecision,
      taskRun: input.taskRun,
      outcomeSignal: input.experienceInput.outcome_signal,
      triggers: {
        directionalCorrectionPresent:
          candidateSignals.directional_correction?.detected === true
          || candidateSignals.evidence_driven_reversal?.detected === true,
        injectedNodeInteractionPresent: input.experienceInput.injected_node_ids.length > 0,
        retryOrInvalidationSignaturePresent:
          candidateSignals.retry_count > 0 || candidateSignals.evidence_driven_reversal?.invalidating_evidence === true,
        meaningfulFailureSignaturePresent: Boolean(candidateSignals.failure_signature),
        conservativeTransitionReviewWorthy:
          input.experienceInput.outcome_signal === "success" && input.experienceInput.injected_node_ids.length > 0
      },
      injectedNodes: input.experienceInput.injected_node_ids
        .map((id) => this.options.nodeRepo.getById(id))
        .filter((node): node is ExperienceNode => Boolean(node)),
      toolEvents: input.toolEvents
    });

    const providerResolution = this.options.config.hybridAsyncPostmortemLlmEnabled
      ? resolveHybridPostmortemProviderEndpoint(this.options.config, { homeDir: dirname(this.options.config.dataDir) })
      : { status: "disabled" as const, reason: "Phase 3 provider-backed postmortem review is disabled." };
    const result =
      this.options.config.hybridAsyncPostmortemLlmEnabled && providerResolution.status === "unavailable"
        ? ({
            status: "fallback",
            reason: "provider_unavailable"
          } as const)
        : await hybridWorkerClient.runPostmortemReview(
            capsule,
            providerResolution.status === "configured"
              ? {
                  mode: "provider",
                  endpoint: providerResolution.endpoint
                }
              : undefined
          );
    const timestamp = nowIso();
    const persistAcceptedArtifact =
      result.status === "accepted"
      && input.rolloutMode !== "shadow"
      && (result.approvalClass === "review_artifact" || result.approvalClass === "policy_gated");
    const appliedNodeWriteback =
      result.status === "accepted" && input.rolloutMode !== "shadow"
        ? this.applyAcceptedPostmortemNodeReviews({
            taskRun: input.taskRun,
            experienceInput: input.experienceInput,
            result
          })
        : false;
    this.options.hybridTraceRepo.upsert({
      id: createId("hybridtrace"),
      surface: "runtime",
      session_id: input.taskRun.session_id,
      scope_id: input.taskRun.scope_id,
      worker_task: "postmortem_review",
      route: input.routeDecision.route,
      route_policy_version: input.routeDecision.policyVersion,
      capsule_schema_version: this.options.config.hybridCapsuleSchemaVersion,
      worker_profile_version: this.options.config.hybridAsyncPostmortemLlmEnabled
        ? this.options.config.hybridPostmortemModelProfileVersion
        : this.options.config.hybridPostmortemReviewProfileVersion,
      rollout_mode: input.rolloutMode,
      rollout_reason: input.rolloutReason,
      worker_ran: result.status !== "fallback" || result.reason !== "provider_unavailable",
      validation_status: result.status === "accepted" ? "accepted" : "fallback",
      output_action: persistAcceptedArtifact || appliedNodeWriteback ? "stored" : "rejected",
      fallback_reason: result.status === "accepted" ? undefined : result.reason,
      created_at: timestamp
    });
    if (result.status !== "accepted") {
      this.options.logger.debug?.("experienceengine.hybrid_postmortem_skipped", {
        taskRunId: input.taskRun.id,
        reason: result.reason
      });
      return;
    }

    if (persistAcceptedArtifact) {
      this.options.hybridReviewArtifactRepo.upsert(
        this.buildPostmortemArtifact({
          taskRun: input.taskRun,
          result,
          routeDecision: input.routeDecision
        })
      );
    }
  }
}
