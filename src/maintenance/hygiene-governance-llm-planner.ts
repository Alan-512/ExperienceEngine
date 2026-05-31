import { resolveDistillerEndpoints } from "../distillation/host-llm.js";
import { LlmRequestDispatcher } from "../distillation/llm-request-dispatcher.js";

import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type {
  HygieneGovernanceInput,
  HygieneGovernancePlannerProvider
} from "./hygiene-governance-planner.js";

type LlmHygieneGovernancePlannerConfig = Pick<
  ExperienceEngineConfig,
  "distillerProvider" | "distillerModel" | "distillationAuthMode"
> &
  Partial<Pick<ExperienceEngineConfig, "distillationFallbackChain" | "distillationFallbackCodes">>;

export type LlmHygieneGovernancePlannerOptions = {
  config: LlmHygieneGovernancePlannerConfig;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
  resolveEndpoints?: (options?: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    configProvider?: ExperienceEngineConfig["distillerProvider"];
    configAuthMode?: string;
    configModel?: string;
    configFallbackChain?: string;
  }) => import("../distillation/providers/types.js").DistillerEndpoint[];
  resolveEndpoint?: (options?: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    configProvider?: ExperienceEngineConfig["distillerProvider"];
    configAuthMode?: string;
    configModel?: string;
  }) => import("../distillation/providers/types.js").DistillerEndpoint | null;
  maxRetries?: number;
  retryDelayMs?: number;
};

const SYSTEM_PROMPT = [
  "You are the autonomous hygiene governance planner for ExperienceEngine.",
  "Return strict JSON only with shape {\"source\":\"llm\",\"scopeId\":\"...\",\"findingHash\":\"...\",\"clusters\":[],\"actions\":[]}.",
  "Use only ids present in the input. Do not invent node ids, candidate ids, evidence refs, action types, or scope ids.",
  "Cluster semantic duplicates, overlapping applicability, and conflicting guidance.",
  "For every high or medium severity conflict cluster, include at least one governance action.",
  "When the safe mutation is uncertain, still propose a high-risk guarded action instead of leaving the cluster actionless.",
  "Prefer safe, evidence-preserving actions: merge_exact_duplicate, merge_near_duplicate, retire_stale_shadow, downgrade_delivery, quarantine.",
  "Mark uncertain semantic merges, conflicted helped/harmed merges, promotion, and soft deletion as high risk; ExperienceEngine will apply accepted high-risk experience-node actions conservatively with rollback snapshots.",
  "Do not propose export writing, repo policy changes, restore, or broad rewrite unless the input includes an explicit replacement contract.",
  "For merge actions choose a canonical node with stronger helped/support evidence or newer evidence.",
  "Do not broaden applicability. Preserve narrower triggers, avoid steps, and evidence references in the rationale.",
  "If no safe action is supported, return clusters explaining the conflict and no actions."
].join(" ");

const buildPrompt = (input: HygieneGovernanceInput): string =>
  JSON.stringify(
    {
      task: "Plan hygiene governance actions for this ExperienceEngine scope.",
      outputContract: {
        source: "llm",
        scopeId: input.scope.scopeId,
        findingHash: input.findingHash,
        clusters: [
          {
            clusterId: "stable descriptive id",
            type: "duplicate_guidance | conflicting_guidance | over_generalized_guidance | evidence_drift | stale_experience | stale_shadow",
            nodeIds: ["existing node ids only"],
            candidateIds: ["existing candidate ids only"],
            rationale: "why these entries belong together"
          }
        ],
        actions: [
          {
            actionId: "stable descriptive id",
            actionType: "merge_exact_duplicate | merge_near_duplicate | retire_stale_shadow | downgrade_delivery | quarantine | promote_delivery | delete_record | export_guidance | change_repo_policy | restore_guidance | rewrite_guidance",
            riskLevel: "low | medium | high",
            approvalRequired: false,
            affectedNodeIds: ["existing node ids only"],
            affectedCandidateIds: ["existing candidate ids only"],
            canonicalNodeId: "required for merge actions",
            expectedEffect: "specific risk reduction",
            rationale: "evidence-preserving reason"
          }
        ]
      },
      input
    },
    null,
    2
  );



export class LlmHygieneGovernancePlanner implements HygieneGovernancePlannerProvider {
  constructor(private readonly options: LlmHygieneGovernancePlannerOptions) {}

  private resolveEndpoints(): import("../distillation/providers/types.js").DistillerEndpoint[] {
    if (this.options.resolveEndpoints) {
      return this.options.resolveEndpoints({
        env: this.options.env,
        homeDir: this.options.homeDir,
        configProvider: this.options.config.distillerProvider,
        configAuthMode: this.options.config.distillationAuthMode,
        configModel: this.options.config.distillerModel,
        configFallbackChain: this.options.config.distillationFallbackChain
      });
    } else if (this.options.resolveEndpoint) {
      const single = this.options.resolveEndpoint({
        env: this.options.env,
        homeDir: this.options.homeDir,
        configProvider: this.options.config.distillerProvider,
        configAuthMode: this.options.config.distillationAuthMode,
        configModel: this.options.config.distillerModel
      });
      return single ? [single] : [];
    } else {
      return resolveDistillerEndpoints({
        env: this.options.env,
        homeDir: this.options.homeDir,
        configProvider: this.options.config.distillerProvider,
        configAuthMode: this.options.config.distillationAuthMode,
        configModel: this.options.config.distillerModel,
        configFallbackChain: this.options.config.distillationFallbackChain
      });
    }
  }

  hasEndpoint(): boolean {
    return this.resolveEndpoints().length > 0;
  }

  async plan(input: HygieneGovernanceInput): Promise<string> {
    const endpoints = this.resolveEndpoints();
    if (endpoints.length === 0) {
      throw new Error("No configured ExperienceEngine distiller endpoint is available for hygiene governance planning.");
    }

    const text = await LlmRequestDispatcher.execute(endpoints, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildPrompt(input),
      temperature: 0,
      responseJson: true,
      fetchImpl: this.options.fetchImpl,
      env: this.options.env,
      fallbackCodes: this.options.config.distillationFallbackCodes,
      maxRetries: this.options.maxRetries,
      retryDelayMs: this.options.retryDelayMs
    });
    if (!text.trim()) {
      throw new Error("Hygiene governance LLM planner returned an empty response.");
    }
    return text;
  }
}
