import type {
  ExperienceNodeType,
  ExperiencePackRiskLevel,
  ExperiencePackStatus,
  TaskType
} from "../types/domain.js";
import type {
  ExperiencePackNodeSnapshot,
  ExperiencePackSummary,
  ExperiencePackVersionManifest
} from "../packs/types.js";

export type CompilerTarget = "agents" | "codex" | "github" | "claude";

export type CompilePackInput = {
  packsDir: string;
  packId: string;
  version?: string;
  target?: CompilerTarget;
  generatedAt?: string;
};

export type CompilePackToAgentsInput = Omit<CompilePackInput, "target">;
export type CompilePackToCodexInput = Omit<CompilePackInput, "target">;

export type ConfidenceLevel = "high" | "medium" | "low";

export type RenderedAgentsNode = {
  id: string;
  nodeType: ExperienceNodeType;
  title: string;
  applicability: string;
  guidanceLabel: "Guidance" | "Avoid";
  guidance: string;
  confidence: ConfidenceLevel;
  taskType: TaskType;
};

export type RenderAgentsMarkdownInput = {
  generatedAt: string;
  pack: ExperiencePackSummary;
  manifest: ExperiencePackVersionManifest;
  nodes: ExperiencePackNodeSnapshot[];
};

export type CompileReport = {
  packId: string;
  version: string;
  target: CompilerTarget;
  generatedAt: string;
  sourceNodeIds: string[];
  renderedNodeCount: number;
  riskLevel: ExperiencePackRiskLevel;
  outputPath: string;
};

export type CompileResult = CompileReport & {
  outputDir: string;
  outputPath: string;
  reportPath: string;
  status: ExperiencePackStatus;
};
