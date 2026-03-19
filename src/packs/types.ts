import type {
  ExperienceNode,
  ExperiencePackHost,
  ExperiencePackRiskLevel,
  ExperiencePackStatus,
  TaskType
} from "../types/domain.js";

export type { ExperiencePackHost, ExperiencePackRiskLevel, ExperiencePackStatus };

export type ExperiencePackSummary = {
  packId: string;
  name: string;
  description: string;
  owner: string;
  status: ExperiencePackStatus;
  currentVersion: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  rolledBackAt?: string;
  scopeHints: string[];
  taskFamilies: TaskType[];
  hostCompatibility: ExperiencePackHost[];
};

export type ExperiencePackVersionManifest = {
  packId: string;
  version: string;
  statusSnapshot: ExperiencePackStatus;
  sourceNodeIds: string[];
  evidenceSummary: string;
  benchmarkSummary?: string;
  riskLevel: ExperiencePackRiskLevel;
  ttl?: string;
  hostCompatibility: ExperiencePackHost[];
  createdAt: string;
  publishedAt?: string;
  rolledBackFrom?: string;
};

export type ExperiencePackNodeSnapshot = Pick<
  ExperienceNode,
  | "id"
  | "node_type"
  | "scope_id"
  | "task_type"
  | "trigger_pattern"
  | "compact_hint"
  | "evidence_summary"
  | "source_kind"
  | "state"
  | "usage_count"
  | "helped_count"
  | "harmed_count"
  | "support_count"
  | "distillation_mode_used"
  | "distillation_source"
  | "created_at"
  | "updated_at"
>;

export type ExperiencePackDraftCreateInput = {
  packId: string;
  name: string;
  description: string;
  owner: string;
  scopeHints: string[];
  taskFamilies: TaskType[];
  hostCompatibility: ExperiencePackHost[];
  nodes: ExperienceNode[];
};

export type ExperiencePackCompiledArtifact = {
  target: string;
  version: string;
  generatedAt: string;
  outputPath: string;
  reportPath: string;
  renderedNodeCount: number;
};

export type ExperiencePackCompileStatus = {
  currentVersionCompiledTargets: string[];
  latestArtifact?: ExperiencePackCompiledArtifact;
  stale: boolean;
};
