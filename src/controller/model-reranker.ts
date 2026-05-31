import { resolveDistillerEndpoints } from "../distillation/host-llm.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import { LlmRequestDispatcher } from "../distillation/llm-request-dispatcher.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { RerankCandidate, RerankResult } from "./candidate-retriever.js";
import { resolveModelRerankerMode } from "./model-reranker-mode.js";

type ModelRerankerConfig = Pick<
  ExperienceEngineConfig,
  | "distillerProvider"
  | "distillerModel"
  | "distillationAuthMode"
  | "retrievalRerankerMode"
  | "retrievalRerankerModel"
> &
  Partial<
    Pick<
      ExperienceEngineConfig,
  | "distillationFallbackChain"
  | "distillationFallbackCodes"
    >
  >;

export type ModelRerankerOptions = {
  config?: ModelRerankerConfig;
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
  }) => DistillerEndpoint[];
  resolveEndpoint?: (options?: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    configProvider?: ExperienceEngineConfig["distillerProvider"];
    configAuthMode?: string;
    configModel?: string;
  }) => DistillerEndpoint | null;
};

type RerankPromptCandidate = {
  id: string;
  triggerPattern: string;
  compactHint: string;
  goal?: string;
  recommendedSteps?: string[];
  semanticScore: number;
  lexicalScore: number;
  fusedScore: number;
  familyScore: number;
  helpedCount: number;
  harmedCount: number;
  supportCount: number;
  validationState?: string;
};

const RERANK_SYSTEM_PROMPT = [
  "You are a retrieval reranker for ExperienceEngine.",
  "Return strict JSON with this shape: {\"scores\":[{\"id\":\"candidate-id\",\"score\":0.0}]}",
  "Score each candidate from 0 to 1 based on how well it matches the current engineering task.",
  "Prefer exact task family matches, precise trigger alignment, concrete recommended steps, and historically helpful nodes.",
  "Do not invent ids and do not add commentary."
].join(" ");

const buildCandidatePrompt = (queryText: string, candidates: RerankPromptCandidate[]): string =>
  JSON.stringify(
    {
      query: queryText,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        triggerPattern: candidate.triggerPattern,
        compactHint: candidate.compactHint,
        goal: candidate.goal,
        recommendedSteps: candidate.recommendedSteps,
        semanticScore: candidate.semanticScore,
        lexicalScore: candidate.lexicalScore,
        fusedScore: candidate.fusedScore,
        familyScore: candidate.familyScore,
        helpedCount: candidate.helpedCount,
        harmedCount: candidate.harmedCount,
        supportCount: candidate.supportCount,
        validationState: candidate.validationState
      }))
    },
    null,
    2
  );



const parseScores = (text: string, allowedIds: Set<string>): RerankResult[] => {
  if (!text.trim()) {
    return [];
  }

  const parsed = JSON.parse(text) as {
    scores?: Array<{ id?: string; score?: number }>;
  };
  return (parsed.scores ?? [])
    .filter((entry): entry is { id: string; score: number } => typeof entry.id === "string" && typeof entry.score === "number")
    .filter((entry) => allowedIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      score: Number.isFinite(entry.score) ? entry.score : 0
    }));
};

export const rerankCandidatesWithModel = async (
  queryText: string,
  candidates: RerankCandidate[],
  options: ModelRerankerOptions = {}
): Promise<RerankResult[] | null> => {
  const mode = resolveModelRerankerMode(options.config);
  if (mode !== "model" || !queryText.trim() || !candidates.length) {
    return null;
  }

  let endpoints: DistillerEndpoint[];
  if (options.resolveEndpoints) {
    endpoints = options.resolveEndpoints({
      env: options.env,
      homeDir: options.homeDir,
      configProvider: options.config?.distillerProvider,
      configAuthMode: options.config?.distillationAuthMode,
      configModel: options.config?.retrievalRerankerModel || options.config?.distillerModel,
      configFallbackChain: options.config?.distillationFallbackChain
    });
  } else if (options.resolveEndpoint) {
    const single = options.resolveEndpoint({
      env: options.env,
      homeDir: options.homeDir,
      configProvider: options.config?.distillerProvider,
      configAuthMode: options.config?.distillationAuthMode,
      configModel: options.config?.retrievalRerankerModel || options.config?.distillerModel
    });
    endpoints = single ? [single] : [];
  } else {
    endpoints = resolveDistillerEndpoints({
      env: options.env,
      homeDir: options.homeDir,
      configProvider: options.config?.distillerProvider,
      configAuthMode: options.config?.distillationAuthMode,
      configModel: options.config?.retrievalRerankerModel || options.config?.distillerModel,
      configFallbackChain: options.config?.distillationFallbackChain
    });
  }

  if (endpoints.length === 0) {
    return null;
  }

  const prompt = buildCandidatePrompt(
    queryText,
    candidates.map((candidate) => ({
      id: candidate.node.id,
      triggerPattern: candidate.node.trigger_pattern,
      compactHint: candidate.node.compact_hint,
      goal: candidate.node.goal,
      recommendedSteps: candidate.node.recommended_steps,
      semanticScore: candidate.semanticScore,
      lexicalScore: candidate.lexicalScore,
      fusedScore: candidate.fusedScore,
      familyScore: candidate.familyScore,
      helpedCount: candidate.node.helped_count,
      harmedCount: candidate.node.harmed_count,
      supportCount: candidate.node.support_count,
      validationState: candidate.node.validation_state
    }))
  );

  try {
    const text = await LlmRequestDispatcher.execute(endpoints, {
      systemPrompt: RERANK_SYSTEM_PROMPT,
      userPrompt: prompt,
      temperature: 0,
      responseJson: true,
      fetchImpl: options.fetchImpl,
      env: options.env,
      fallbackCodes: options.config?.distillationFallbackCodes
    });

    return parseScores(text, new Set(candidates.map((candidate) => candidate.node.id)));
  } catch {
    return null;
  }
};
