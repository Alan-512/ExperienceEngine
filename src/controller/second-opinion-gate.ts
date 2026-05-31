import { resolveDistillerEndpoints } from "../distillation/host-llm.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import { LlmRequestDispatcher } from "../distillation/llm-request-dispatcher.js";
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
> &
  Partial<
    Pick<
      ExperienceEngineConfig,
  | "distillationFallbackChain"
  | "distillationFallbackCodes"
    >
  >;

type EvaluateOptions = {
  config?: SecondOpinionConfig;
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

  const deliveryState = resolveDeliveryState(top);
  const plannedMode = deliveryState === "conservative_only" ? "inject_conservative" : "inject";

  if (deliveryState === "conservative_only" && top.state === "active") {
    return "conservative_delivery_state";
  }

  if (top.harmed_count > 0 || (top.consecutive_harmed_count ?? 0) > 0) {
    return "harm_history";
  }

  if (plannedMode === "inject" && (top.experience_kind === "expectation_correction" || hasCorrectionIntent(input))) {
    return "expectation_correction";
  }

  const margin =
    typeof topCandidate.scoreMargin === "number"
      ? topCandidate.scoreMargin
      : scoredCandidates[1]
        ? topCandidate.totalScore - scoredCandidates[1].totalScore
        : 1;
  if (margin <= 0.03) {
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

  let endpoints: DistillerEndpoint[];
  if (options.resolveEndpoints) {
    endpoints = options.resolveEndpoints({
      env: options.env,
      homeDir: options.homeDir,
      configProvider: options.config?.distillerProvider,
      configAuthMode: options.config?.distillationAuthMode,
      configModel: options.config?.syncSecondOpinionModel || options.config?.distillerModel,
      configFallbackChain: options.config?.distillationFallbackChain
    });
  } else if (options.resolveEndpoint) {
    const single = options.resolveEndpoint({
      env: options.env,
      homeDir: options.homeDir,
      configProvider: options.config?.distillerProvider,
      configAuthMode: options.config?.distillationAuthMode,
      configModel: options.config?.syncSecondOpinionModel || options.config?.distillerModel
    });
    endpoints = single ? [single] : [];
  } else {
    endpoints = resolveDistillerEndpoints({
      env: options.env,
      homeDir: options.homeDir,
      configProvider: options.config?.distillerProvider,
      configAuthMode: options.config?.distillationAuthMode,
      configModel: options.config?.syncSecondOpinionModel || options.config?.distillerModel,
      configFallbackChain: options.config?.distillationFallbackChain
    });
  }

  if (endpoints.length === 0) {
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
    const text = await LlmRequestDispatcher.execute(endpoints, {
      systemPrompt: SECOND_OPINION_SYSTEM_PROMPT,
      userPrompt: prompt,
      temperature: 0,
      responseJson: true,
      fetchImpl: options.fetchImpl,
      env: options.env,
      fallbackCodes: options.config?.distillationFallbackCodes,
      maxTimeoutMs: 15000,
      maxTokens: 160
    });

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
