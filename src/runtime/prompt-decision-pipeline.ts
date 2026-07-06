import type { DatabaseSync } from "node:sqlite";
import { buildInjectionScorecard } from "../controller/injection-scorecard.js";
import { buildRetrievalContext } from "../controller/retrieval-context.js";
import { decideIntervention } from "../controller/intervention-controller.js";
import { renderInlineNotice } from "../controller/inline-notice.js";
import { buildSkipScorecard } from "../controller/skip-scorecard.js";
import { evaluateRepoPolicy } from "../experience-management/repo-policy.js";
import { buildExperienceInput } from "../input/input-adapter.js";
import { persistProjectFingerprint } from "../input/fingerprint-extractor.js";
import { resolveScope } from "../input/scope-resolver.js";
import type { AttributionRecordRepository } from "../store/sqlite/repositories/attribution-record-repo.js";
import type { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import type { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type { RepoPolicyRepository } from "../store/sqlite/repositories/repo-policy-repo.js";
import type { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import type { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type {
  EvaluationMode,
  ExperienceInput,
  InjectionEvent,
  RepoPolicy,
  ToolEvent
} from "../types/domain.js";
import type { HostPromptContext } from "../types/plugin.js";
import { nowIso } from "../utils/clock.js";
import { createId } from "../utils/ids.js";
import { mergeContext, resolveSessionEpisodeId } from "./session-runtime.js";

export type PromptDecisionSessionState = {
  context?: HostPromptContext;
  episodeId?: string;
  toolEvents: ToolEvent[];
  injectedNodeIds: string[];
  lastInjectionEvent?: InjectionEvent;
};

export type PromptDecisionPipelineOptions = {
  config: ExperienceEngineConfig;
  db: DatabaseSync;
  scopeRepo: ScopeRepository;
  nodeRepo: NodeRepository;
  statsRepo: StatsRepository;
  injectionRepo: InjectionRepository;
  attributionRecordRepo: AttributionRecordRepository;
  repoPolicyRepo: RepoPolicyRepository;
  onScopeDisabled?: (input: { sessionId: string; scopeId: string }) => void;
  onRepoPolicyChanged?: (input: { policy: RepoPolicy }) => void;
  onDecision?: (input: {
    sessionId: string;
    mode: InjectionEvent["mode"];
    injectedCount: number;
    evaluationMode: ExperienceEngineConfig["evaluationMode"];
    delivered: boolean;
  }) => void;
};

const computeHoldoutBucket = (sessionId: string, taskSummary: string): number => {
  const value = `${sessionId}:${taskSummary}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
};

const resolveDeliveryMode = (
  evaluationMode: ExperienceEngineConfig["evaluationMode"],
  holdoutRate: number,
  sessionId: string,
  taskSummary: string,
  hasInjection: boolean
): {
  deliveryMode: EvaluationMode;
  delivered: boolean;
} => {
  if (!hasInjection) {
    return {
      deliveryMode: evaluationMode,
      delivered: false
    };
  }

  if (evaluationMode === "shadow") {
    return {
      deliveryMode: "shadow",
      delivered: false
    };
  }

  if (evaluationMode === "holdout") {
    return {
      deliveryMode: "holdout",
      delivered: computeHoldoutBucket(sessionId, taskSummary) >= holdoutRate
    };
  }

  return {
    deliveryMode: "live",
    delivered: true
  };
};

export class PromptDecisionPipeline {
  constructor(private readonly options: PromptDecisionPipelineOptions) {}

  async beforePromptBuild(context: HostPromptContext, sessionId: string, session: PromptDecisionSessionState) {
    session.context = mergeContext(session.context, context);

    if (session.context.cwd) {
      try {
        persistProjectFingerprint(this.options.db, session.context.cwd);
      } catch {
        // Fingerprinting is advisory for prompt lookup and must not block injection decisions.
      }
    }

    const input = buildExperienceInput(session.context, session.toolEvents);
    const retrievalContext = buildRetrievalContext(input, session.context);
    retrievalContext.db = this.options.db;
    const resolvedScope = resolveScope(session.context.cwd);
    const existingScope = this.options.scopeRepo.getById(resolvedScope.scope_id);

    if (existingScope?.is_disabled) {
      session.injectedNodeIds = [];
      session.context = {
        ...session.context,
        injectedNodeIds: []
      };
      const disabledInput = {
        ...input,
        scope_id: existingScope.scope_id,
        injected_node_ids: []
      };
      const scorecard = buildSkipScorecard(disabledInput, sessionId, undefined, true);
      const injectionEvent: InjectionEvent = {
        injection_id: createId("decision"),
        episode_id: resolveSessionEpisodeId(session, sessionId, disabledInput),
        session_id: sessionId,
        scope_id: disabledInput.scope_id,
        task_type: disabledInput.task_type === "unknown" ? "general" : disabledInput.task_type,
        task_summary: disabledInput.task_summary,
        mode: "skip",
        delivery_mode: "live",
        delivered: false,
        injected_node_ids: [],
        injection_count: 0,
        scorecard,
        was_successful: null,
        harm_observed: null,
        created_at: nowIso()
      };
      this.options.injectionRepo.upsert(injectionEvent);
      session.lastInjectionEvent = injectionEvent;
      this.options.onScopeDisabled?.({ sessionId, scopeId: existingScope.scope_id });

      return {
        mode: "skip" as const,
        text: undefined,
        notice: undefined,
        scorecard,
        retrievalContext,
        input: disabledInput
      };
    }

    const stats =
      input.task_type !== "unknown" ? this.options.statsRepo.get(input.scope_id, input.task_type) : undefined;
    const nodes =
      input.task_type !== "unknown"
        ? [
            ...this.options.nodeRepo.listLiveInjectableByExactScope(input.scope_id),
            ...this.options.nodeRepo.listConservativeCrossScopeCandidates(input.scope_id),
            ...this.options.nodeRepo.listDiagnosticCandidatesByExactScope(input.scope_id),
            ...this.options.nodeRepo.listShadowProbeByExactScope(input.scope_id)
          ]
        : [];
    const existingRepoPolicy = this.options.repoPolicyRepo.getOrCreate(
      input.scope_id,
      this.options.config.repoExperienceMode
    );
    const repoPolicyEvaluation = evaluateRepoPolicy(
      existingRepoPolicy,
      this.options.attributionRecordRepo.listRecentEligibleByScope(input.scope_id),
      this.options.injectionRepo.listRecentResolvedByScope(input.scope_id)
    );
    if (repoPolicyEvaluation.changed) {
      this.options.repoPolicyRepo.upsert(repoPolicyEvaluation.policy);
      this.options.onRepoPolicyChanged?.({ policy: repoPolicyEvaluation.policy });
    }

    const decision = await decideIntervention(
      input,
      nodes,
      stats,
      this.options.config.triggerThreshold,
      this.options.config.maxHints,
      this.options.config,
      retrievalContext,
      repoPolicyEvaluation.policy
    );
    const episodeId = resolveSessionEpisodeId(session, sessionId, input);

    const selectedNodeIds = decision.selected.map((node) => node.id);
    const delivery = resolveDeliveryMode(
      this.options.config.evaluationMode,
      this.options.config.holdoutRate,
      sessionId,
      input.task_summary,
      decision.mode !== "skip" && selectedNodeIds.length > 0
    );
    session.injectedNodeIds = delivery.delivered ? selectedNodeIds : [];
    session.context = {
      ...session.context,
      injectedNodeIds: session.injectedNodeIds
    };

    const scorecard =
      decision.mode !== "skip"
        ? buildInjectionScorecard(input, decision.mode, decision.selected, sessionId, decision.diagnostics)
        : buildSkipScorecard(input, sessionId, decision.diagnostics);
    if (scorecard && decision.mode !== "skip" && !delivery.delivered) {
      if (delivery.deliveryMode === "holdout") {
        scorecard.skipReasonCode = "holdout_suppressed";
        scorecard.skipReasonExplanation = "ExperienceEngine found a usable match but withheld it for holdout evaluation.";
      } else {
        scorecard.skipReasonCode = "shadow_suppressed";
        scorecard.skipReasonExplanation = "ExperienceEngine found a usable match but shadow mode suppressed prompt delivery.";
      }
    }
    const injectionEvent: InjectionEvent = {
      injection_id: createId(decision.mode === "skip" ? "decision" : "inject"),
      episode_id: episodeId,
      session_id: sessionId,
      scope_id: input.scope_id,
      task_type: input.task_type === "unknown" ? "general" : input.task_type,
      task_summary: input.task_summary,
      mode: decision.mode,
      delivery_mode: delivery.deliveryMode,
      delivered: delivery.delivered,
      injected_node_ids: selectedNodeIds,
      injection_count: selectedNodeIds.length,
      scorecard,
      was_successful: null,
      harm_observed: null,
      created_at: nowIso()
    };
    this.options.injectionRepo.upsert(injectionEvent);
    session.lastInjectionEvent = injectionEvent;
    this.options.onDecision?.({
      sessionId,
      mode: decision.mode,
      injectedCount: session.injectedNodeIds.length,
      evaluationMode: this.options.config.evaluationMode,
      delivered: delivery.delivered
    });

    const deliveredMode = decision.mode !== "skip" && !delivery.delivered ? "skip" : decision.mode;
    return {
      mode: deliveredMode,
      text: deliveredMode === "skip" ? undefined : decision.text,
      notice:
        deliveredMode !== "skip" && this.options.config.noticesInline ? renderInlineNotice(decision.selected) : undefined,
      scorecard: session.lastInjectionEvent?.scorecard,
      deliveryMode: decision.mode !== "skip" ? delivery.deliveryMode : undefined,
      delivered: decision.mode !== "skip" ? delivery.delivered : undefined,
      retrievalContext,
      input: {
        ...input,
        injected_node_ids: session.injectedNodeIds
      }
    };
  }
}
