import { resolveDistillerEndpoint } from "../distillation/host-llm.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type {
  ExperienceInput,
  ExperienceNode,
  InterventionConfidence,
  InjectionMode,
  SyncSecondOpinionDecision,
  SyncSecondOpinionTrigger
} from "../types/domain.js";
import type { RetrievedCandidate } from "./candidate-retriever.js";

type SecondOpinionConfig = Pick<
  ExperienceEngineConfig,
  | "distillerProvider"
  | "distillerModel"
  | "distillationAuthMode"
  | "syncSecondOpinionMode"
  | "syncSecondOpinionModel"
>;

type EvaluateOptions = {
  config?: SecondOpinionConfig;
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

export type SelectiveSecondOpinionInput = {
  input: ExperienceInput;
  plannedMode: Exclude<InjectionMode, "skip">;
  selected: ExperienceNode[];
  scoredCandidates: RetrievedCandidate[];
  trigger: SyncSecondOpinionTrigger;
};

export type SelectiveSecondOpinionResult = {
  decision: SyncSecondOpinionDecision;
  confidence?: InterventionConfidence;
  reason?: string;
  bestNodeId?: string;
  trigger: SyncSecondOpinionTrigger;
};

type PromptCandidate = {
  id: string;
  triggerPattern: string;
  compactHint: string;
  taskType: ExperienceNode["task_type"];
  state: ExperienceNode["state"];
  deliveryState?: ExperienceNode["delivery_state"];
  helpedCount: number;
  harmedCount: number;
  consecutiveHarmedCount: number;
  totalScore: number;
  scoreMargin: number;
  experienceKind?: ExperienceNode["experience_kind"];
};

type TestHooks = {
  evaluate?: (input: SelectiveSecondOpinionInput) => Promise<SelectiveSecondOpinionResult | null>;
};

const DEFAULT_DELIVERY_STATE_BY_LIFECYCLE: Record<ExperienceNode["state"], NonNullable<ExperienceNode["delivery_state"]>> = {
  candidate: "shadow_only",
  priority_candidate: "conservative_only",
  active: "eligible",
  cooling: "conservative_only",
  retired: "quarantined"
};

const SECOND_OPINION_SYSTEM_PROMPT = [
  "You are a synchronous safety gate for ExperienceEngine hint injection.",
  "You review only high-risk live hint candidates before injection.",
  "Return strict JSON with this shape:",
  "{\"decision\":\"allow|allow_conservative|skip\",\"best_node_id\":\"optional-node-id\",\"confidence\":\"low|medium|high\",\"reason\":\"short reason\"}",
  "Use allow_conservative when the hint is relevant but should ship as a single cautious hint.",
  "Use skip when the live hint is too risky or too weak for the current task.",
  "Never invent node ids and do not add commentary outside the JSON object."
].join(" ");

let testHooks: TestHooks | null = null;

const resolveDeliveryState = (
  node: Pick<ExperienceNode, "state" | "delivery_state">
): NonNullable<ExperienceNode["delivery_state"]> => node.delivery_state ?? DEFAULT_DELIVERY_STATE_BY_LIFECYCLE[node.state];

const hasCorrectionIntent = (input: ExperienceInput): boolean => {
  const text = [input.task_summary, input.context_summary].filter(Boolean).join("\n");
  return [
    /\bcorrection\b/i,
    /\bthat answer was wrong\b/i,
    /\bprevious pass\b/i,
    /\bthe real issue\b/i,
    /\bfocused too much on\b/i
  ].some((pattern) => pattern.test(text));
};

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
      system: SECOND_OPINION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0
    };
  }

  if (endpoint.kind === "gemini") {
    return {
      system_instruction: {
        parts: [{ text: SECOND_OPINION_SYSTEM_PROMPT }]
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      }
    };
  }

  if (endpoint.kind === "bedrock") {
    return {
      system: [{ text: SECOND_OPINION_SYSTEM_PROMPT }],
      messages: [{ role: "user", content: [{ text: prompt }] }],
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
      { role: "system", content: SECOND_OPINION_SYSTEM_PROMPT },
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

const buildPrompt = (payload: {
  input: ExperienceInput;
  plannedMode: Exclude<InjectionMode, "skip">;
  trigger: SyncSecondOpinionTrigger;
  candidates: PromptCandidate[];
}): string =>
  JSON.stringify(
    {
      task: {
        taskType: payload.input.task_type,
        taskSummary: payload.input.task_summary,
        contextSummary: payload.input.context_summary
      },
      plannedMode: payload.plannedMode,
      trigger: payload.trigger,
      candidates: payload.candidates
    },
    null,
    2
  );

const parseSecondOpinion = (
  text: string,
  allowedIds: Set<string>,
  trigger: SyncSecondOpinionTrigger
): SelectiveSecondOpinionResult | null => {
  if (!text.trim()) {
    return null;
  }

  const parsed = JSON.parse(text) as {
    decision?: SyncSecondOpinionDecision;
    best_node_id?: string;
    confidence?: InterventionConfidence;
    reason?: string;
  };

  if (parsed.decision !== "allow" && parsed.decision !== "allow_conservative" && parsed.decision !== "skip") {
    return null;
  }

  const bestNodeId =
    typeof parsed.best_node_id === "string" && allowedIds.has(parsed.best_node_id)
      ? parsed.best_node_id
      : undefined;

  const confidence =
    parsed.confidence === "low" || parsed.confidence === "medium" || parsed.confidence === "high"
      ? parsed.confidence
      : undefined;

  return {
    decision: parsed.decision,
    bestNodeId,
    confidence,
    reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    trigger
  };
};

export const deriveSelectiveSecondOpinionTrigger = (
  input: ExperienceInput,
  selected: ExperienceNode[],
  scoredCandidates: RetrievedCandidate[]
): SyncSecondOpinionTrigger | null => {
  const top = selected[0];
  const topCandidate = top ? scoredCandidates.find((candidate) => candidate.node.id === top.id) : undefined;
  if (!top || !topCandidate) {
    return null;
  }

  if (resolveDeliveryState(top) === "conservative_only") {
    return "conservative_delivery_state";
  }

  if (top.harmed_count > 0 || (top.consecutive_harmed_count ?? 0) > 0) {
    return "harm_history";
  }

  if (top.experience_kind === "expectation_correction" || hasCorrectionIntent(input)) {
    return "expectation_correction";
  }

  const margin =
    typeof topCandidate.scoreMargin === "number"
      ? topCandidate.scoreMargin
      : scoredCandidates[1]
        ? topCandidate.totalScore - scoredCandidates[1].totalScore
        : 1;
  if (margin <= 0.05) {
    return "close_score_margin";
  }

  return null;
};

export const evaluateSelectiveSecondOpinion = async (
  payload: SelectiveSecondOpinionInput,
  options: EvaluateOptions = {}
): Promise<SelectiveSecondOpinionResult | null> => {
  if ((options.config?.syncSecondOpinionMode ?? "disabled") !== "selective" || !payload.selected.length) {
    return null;
  }

  const endpoint = (options.resolveEndpoint ?? resolveDistillerEndpoint)({
    env: options.env,
    homeDir: options.homeDir,
    configProvider: options.config?.distillerProvider,
    configAuthMode: options.config?.distillationAuthMode,
    configModel: options.config?.syncSecondOpinionModel || options.config?.distillerModel
  });

  if (!endpoint) {
    return null;
  }

  const prompt = buildPrompt({
    input: payload.input,
    plannedMode: payload.plannedMode,
    trigger: payload.trigger,
    candidates: payload.scoredCandidates.slice(0, 3).map((candidate) => ({
      id: candidate.node.id,
      triggerPattern: candidate.node.trigger_pattern,
      compactHint: candidate.node.compact_hint,
      taskType: candidate.node.task_type,
      state: candidate.node.state,
      deliveryState: candidate.node.delivery_state,
      helpedCount: candidate.node.helped_count,
      harmedCount: candidate.node.harmed_count,
      consecutiveHarmedCount: candidate.node.consecutive_harmed_count ?? 0,
      totalScore: candidate.totalScore,
      scoreMargin: candidate.scoreMargin,
      experienceKind: candidate.node.experience_kind
    }))
  });

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
    return parseSecondOpinion(text, new Set(payload.scoredCandidates.map((candidate) => candidate.node.id)), payload.trigger);
  } catch {
    return null;
  }
};

export const runSelectiveSecondOpinion = (
  payload: SelectiveSecondOpinionInput,
  options: EvaluateOptions = {}
): Promise<SelectiveSecondOpinionResult | null> => {
  if (testHooks?.evaluate) {
    return testHooks.evaluate(payload);
  }
  return evaluateSelectiveSecondOpinion(payload, options);
};

export const setSelectiveSecondOpinionHooksForTests = (hooks: TestHooks): void => {
  testHooks = hooks;
};

export const clearSelectiveSecondOpinionHooksForTests = (): void => {
  testHooks = null;
};
