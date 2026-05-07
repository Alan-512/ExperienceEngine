import { resolveDistillerEndpoint } from "../distillation/host-llm.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
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
>;

export type ModelRerankerOptions = {
  config?: ModelRerankerConfig;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
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

const buildRequestUrl = (endpoint: DistillerEndpoint): string => {
  if (endpoint.kind === "anthropic" || endpoint.kind === "gemini" || endpoint.kind === "bedrock") {
    return endpoint.baseUrl;
  }

  if (/\/chat\/completions(?:\?.*)?$/.test(endpoint.baseUrl)) {
    return endpoint.baseUrl;
  }
  if (/\/v1\/?$/.test(endpoint.baseUrl)) {
    return `${endpoint.baseUrl.replace(/\/$/, "")}/chat/completions`;
  }
  return `${endpoint.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
};

const buildRequestBody = (endpoint: DistillerEndpoint, prompt: string): Record<string, unknown> => {
  if (endpoint.kind === "anthropic") {
    return {
      model: endpoint.model,
      max_tokens: 1024,
      system: RERANK_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0
    };
  }

  if (endpoint.kind === "gemini") {
    return {
      system_instruction: {
        parts: [{ text: RERANK_SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      }
    };
  }

  if (endpoint.kind === "bedrock") {
    return {
      system: [{ text: RERANK_SYSTEM_PROMPT }],
      messages: [
        {
          role: "user",
          content: [{ text: prompt }]
        }
      ],
      inferenceConfig: {
        maxTokens: 1024,
        temperature: 0
      }
    };
  }

  return {
    model: endpoint.model,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: RERANK_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ]
  };
};

const extractTextPayload = async (endpoint: DistillerEndpoint, response: Response): Promise<string> => {
  if (endpoint.kind === "anthropic") {
    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string")?.text ?? "";
  }

  if (endpoint.kind === "gemini") {
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text ?? "";
  }

  if (endpoint.kind === "bedrock") {
    const payload = (await response.json()) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
    };
    return payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text ?? "";
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
};

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

  const endpoint = (options.resolveEndpoint ?? resolveDistillerEndpoint)({
    env: options.env,
    homeDir: options.homeDir,
    configProvider: options.config?.distillerProvider,
    configAuthMode: options.config?.distillationAuthMode,
    configModel: options.config?.retrievalRerankerModel || options.config?.distillerModel
  });

  if (!endpoint) {
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
    const response = await (options.fetchImpl ?? fetch)(buildRequestUrl(endpoint), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...endpoint.headers
      },
      body: JSON.stringify(buildRequestBody(endpoint, prompt))
    });

    if (!response.ok) {
      return null;
    }

    const text = await extractTextPayload(endpoint, response);
    return parseScores(text, new Set(candidates.map((candidate) => candidate.node.id)));
  } catch {
    return null;
  }
};
