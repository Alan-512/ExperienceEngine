import { buildInjectionScorecard } from "../controller/injection-scorecard.js";
import { buildRetrievalContext } from "../controller/retrieval-context.js";
import { decideIntervention } from "../controller/intervention-controller.js";
import { renderInlineNotice } from "../controller/inline-notice.js";
import { buildSkipScorecard } from "../controller/skip-scorecard.js";
import { buildExperienceInput } from "../input/input-adapter.js";
import { resolveScope } from "../input/scope-resolver.js";
import { evaluateRepoPolicy } from "../experience-management/repo-policy.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { AttributionRecordRepository } from "../store/sqlite/repositories/attribution-record-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { RepoPolicyRepository } from "../store/sqlite/repositories/repo-policy-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import { nowIso } from "../utils/clock.js";
import { createId, stableId } from "../utils/ids.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { HostPromptContext } from "../types/plugin.js";
import type {
  EvaluationMode,
  ExperienceInput,
  ExperienceNode,
  InjectionEvent,
  RepoPolicy,
  ToolEvent
} from "../types/domain.js";

type SessionState = {
  context?: HostPromptContext;
  episodeId?: string;
  toolEvents: ToolEvent[];
  injectedNodeIds: string[];
  lastInjectionEvent?: InjectionEvent;
};

const mergeContext = (existing: HostPromptContext | undefined, incoming: HostPromptContext): HostPromptContext => ({
  host: incoming.host ?? existing?.host,
  sessionId: incoming.sessionId ?? existing?.sessionId,
  cwd: incoming.cwd ?? existing?.cwd,
  userMessage: incoming.userMessage || existing?.userMessage || "",
  taskSummary: incoming.taskSummary ?? existing?.taskSummary,
  contextSummary: incoming.contextSummary ?? existing?.contextSummary,
  injectedNodeIds: incoming.injectedNodeIds ?? existing?.injectedNodeIds
});

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

const resolveEpisodeId = (session: SessionState, sessionId: string, input: Pick<ExperienceInput, "scope_id" | "task_summary">): string => {
  session.episodeId ??= stableId("episode", `${sessionId}:${input.scope_id}:${input.task_summary}`);
  return session.episodeId;
};

export class ExperiencePromptRuntimeService {
  private readonly db;
  private readonly sessions = new Map<string, SessionState>();
  private readonly scopeRepo;
  private readonly nodeRepo;
  private readonly statsRepo;
  private readonly injectionRepo;
  private readonly attributionRecordRepo;
  private readonly repoPolicyRepo;

  constructor(readonly config: ExperienceEngineConfig) {
    this.db = openDatabase(config);
    bootstrapDatabase(this.db);
    this.scopeRepo = new ScopeRepository(this.db);
    this.nodeRepo = new NodeRepository(this.db);
    this.statsRepo = new StatsRepository(this.db);
    this.injectionRepo = new InjectionRepository(this.db);
    this.attributionRecordRepo = new AttributionRecordRepository(this.db);
    this.repoPolicyRepo = new RepoPolicyRepository(this.db);
  }

  private getSession(sessionId: string): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const next: SessionState = {
      toolEvents: [],
      injectedNodeIds: []
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  async beforePromptBuild(context: HostPromptContext) {
    const sessionId = context.sessionId ?? "global";
    const session = this.getSession(sessionId);
    session.context = mergeContext(session.context, context);
    const input = buildExperienceInput(session.context, session.toolEvents);
    const retrievalContext = buildRetrievalContext(input, session.context);
    const resolvedScope = resolveScope(session.context.cwd);
    const existingScope = this.scopeRepo.getById(resolvedScope.scope_id);

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
        episode_id: resolveEpisodeId(session, sessionId, disabledInput),
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
      this.injectionRepo.upsert(injectionEvent);
      session.lastInjectionEvent = injectionEvent;

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
      input.task_type !== "unknown" ? this.statsRepo.get(input.scope_id, input.task_type) : undefined;
    const nodes = input.task_type !== "unknown"
      ? [
          ...this.nodeRepo.listLiveInjectableByExactScope(input.scope_id),
          ...this.nodeRepo.listConservativeCrossScopeCandidates(input.scope_id),
          ...this.nodeRepo.listDiagnosticCandidatesByExactScope(input.scope_id)
        ]
      : [];
    const existingRepoPolicy = this.repoPolicyRepo.getOrCreate(input.scope_id, this.config.repoExperienceMode);
    const repoPolicyEvaluation = evaluateRepoPolicy(
      existingRepoPolicy,
      this.attributionRecordRepo.listRecentEligibleByScope(input.scope_id),
      this.injectionRepo.listRecentResolvedByScope(input.scope_id)
    );
    if (repoPolicyEvaluation.changed) {
      this.repoPolicyRepo.upsert(repoPolicyEvaluation.policy);
    }

    const decision = await decideIntervention(
      input,
      nodes,
      stats,
      this.config.triggerThreshold,
      this.config.maxHints,
      this.config,
      retrievalContext,
      repoPolicyEvaluation.policy as RepoPolicy
    );
    const episodeId = resolveEpisodeId(session, sessionId, input);

    const selectedNodeIds = decision.selected.map((node: ExperienceNode) => node.id);
    const delivery = resolveDeliveryMode(
      this.config.evaluationMode,
      this.config.holdoutRate,
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
        ? buildInjectionScorecard(
            input,
            decision.mode,
            decision.selected,
            sessionId,
            decision.diagnostics
          )
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
    this.injectionRepo.upsert(injectionEvent);
    session.lastInjectionEvent = injectionEvent;

    const deliveredMode = decision.mode !== "skip" && !delivery.delivered ? "skip" : decision.mode;
    return {
      mode: deliveredMode,
      text: deliveredMode === "skip" ? undefined : decision.text,
      notice:
        deliveredMode !== "skip" && this.config.noticesInline ? renderInlineNotice(decision.selected) : undefined,
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
