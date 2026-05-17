import { resolveDistillerEndpoint } from "../distillation/host-llm.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type {
  HygieneGovernanceInput,
  HygieneGovernancePlannerProvider
} from "./hygiene-governance-planner.js";

type LlmHygieneGovernancePlannerConfig = Pick<
  ExperienceEngineConfig,
  "distillerProvider" | "distillerModel" | "distillationAuthMode"
>;

export type LlmHygieneGovernancePlannerOptions = {
  config: LlmHygieneGovernancePlannerConfig;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
  resolveEndpoint?: (options?: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    configProvider?: ExperienceEngineConfig["distillerProvider"];
    configAuthMode?: string;
    configModel?: string;
  }) => DistillerEndpoint | null;
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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0
    };
  }
  if (endpoint.kind === "gemini") {
    return {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      }
    };
  }
  if (endpoint.kind === "bedrock") {
    return {
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0
      }
    };
  }
  return {
    model: endpoint.model,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ]
  };
};

const extractTextPayload = async (endpoint: DistillerEndpoint, response: Response): Promise<string> => {
  if (endpoint.kind === "anthropic") {
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    return payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string")?.text ?? "";
  }
  if (endpoint.kind === "gemini") {
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text ?? "";
  }
  if (endpoint.kind === "bedrock") {
    const payload = (await response.json()) as { output?: { message?: { content?: Array<{ text?: string }> } } };
    return payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text ?? "";
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "";
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (status: number): boolean => status === 429 || status >= 500;

export class LlmHygieneGovernancePlanner implements HygieneGovernancePlannerProvider {
  constructor(private readonly options: LlmHygieneGovernancePlannerOptions) {}

  hasEndpoint(): boolean {
    return Boolean((this.options.resolveEndpoint ?? resolveDistillerEndpoint)({
      env: this.options.env,
      homeDir: this.options.homeDir,
      configProvider: this.options.config.distillerProvider,
      configAuthMode: this.options.config.distillationAuthMode,
      configModel: this.options.config.distillerModel
    }));
  }

  async plan(input: HygieneGovernanceInput): Promise<string> {
    const endpoint = (this.options.resolveEndpoint ?? resolveDistillerEndpoint)({
      env: this.options.env,
      homeDir: this.options.homeDir,
      configProvider: this.options.config.distillerProvider,
      configAuthMode: this.options.config.distillationAuthMode,
      configModel: this.options.config.distillerModel
    });
    if (!endpoint) {
      throw new Error("No configured ExperienceEngine distiller endpoint is available for hygiene governance planning.");
    }

    const request = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...endpoint.headers
      },
      body: JSON.stringify(buildRequestBody(endpoint, buildPrompt(input)))
    };
    const maxRetries = this.options.maxRetries ?? 2;
    let response: Response | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      response = await (this.options.fetchImpl ?? fetch)(buildRequestUrl(endpoint), request);
      if (response.ok || !shouldRetry(response.status) || attempt === maxRetries) {
        break;
      }
      await sleep((this.options.retryDelayMs ?? 500) * (attempt + 1));
    }
    if (!response?.ok) {
      throw new Error(`Hygiene governance LLM planner failed with HTTP ${response?.status ?? "unknown"}.`);
    }
    const text = await extractTextPayload(endpoint, response);
    if (!text.trim()) {
      throw new Error("Hygiene governance LLM planner returned an empty response.");
    }
    return text;
  }
}
