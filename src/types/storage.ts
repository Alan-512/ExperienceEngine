import type { ExperienceInputRecord, ExperienceNode, InjectionEvent, Scope, ScopeTaskStats } from "./domain.js";

export type Repository<T> = {
  upsert(record: T): T;
};

export type ExperienceStore = {
  scopes: Repository<Scope>;
  inputRecords: Repository<ExperienceInputRecord>;
  nodes: Repository<ExperienceNode>;
  injections: Repository<InjectionEvent>;
  stats: Repository<ScopeTaskStats>;
};

