import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { AttributionRecordRepository } from "../store/sqlite/repositories/attribution-record-repo.js";
import { InjectionRepository } from "../store/sqlite/repositories/injection-repo.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import { RepoPolicyRepository } from "../store/sqlite/repositories/repo-policy-repo.js";
import { ScopeRepository } from "../store/sqlite/repositories/scope-repo.js";
import { StatsRepository } from "../store/sqlite/repositories/stats-repo.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { HostPromptContext } from "../types/plugin.js";
import type { PromptDecisionSessionState } from "./prompt-decision-pipeline.js";
import { PromptDecisionPipeline } from "./prompt-decision-pipeline.js";

type SessionState = PromptDecisionSessionState;

export class ExperiencePromptRuntimeService {
  private readonly db;
  private readonly sessions = new Map<string, SessionState>();
  private readonly scopeRepo;
  private readonly nodeRepo;
  private readonly statsRepo;
  private readonly injectionRepo;
  private readonly attributionRecordRepo;
  private readonly repoPolicyRepo;
  private readonly promptDecisionPipeline;

  constructor(readonly config: ExperienceEngineConfig) {
    this.db = openDatabase(config);
    bootstrapDatabase(this.db);
    this.scopeRepo = new ScopeRepository(this.db);
    this.nodeRepo = new NodeRepository(this.db);
    this.statsRepo = new StatsRepository(this.db);
    this.injectionRepo = new InjectionRepository(this.db);
    this.attributionRecordRepo = new AttributionRecordRepository(this.db);
    this.repoPolicyRepo = new RepoPolicyRepository(this.db);
    this.promptDecisionPipeline = new PromptDecisionPipeline({
      config: this.config,
      db: this.db,
      scopeRepo: this.scopeRepo,
      nodeRepo: this.nodeRepo,
      statsRepo: this.statsRepo,
      injectionRepo: this.injectionRepo,
      attributionRecordRepo: this.attributionRecordRepo,
      repoPolicyRepo: this.repoPolicyRepo
    });
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
    return this.promptDecisionPipeline.beforePromptBuild(context, sessionId, session);
  }
}
