import { createHash, createHmac } from "node:crypto";
import type { ExperienceCandidate, ExperienceCandidateDraft, ExperienceNode } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import {
  resolveDistillationResolution,
  type DistillationResolution,
  type DistillerEndpoint
} from "./host-llm.js";

type MergeDecisionRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

type MergeAction = "ADD" | "UPDATE" | "NONE";

type MergeDecision = {
  action: MergeAction;
  targetNodeId?: string;
  reason: string;
  source: "llm" | "rule";
};

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

type AnthropicMessage = {
  role: "user";
  content: string;
};

type GeminiPart = {
  text: string;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const FREE_MODEL_REQUEST_TIMEOUT_MS = 75_000;
const BEDROCK_SERVICE = "bedrock";
const SYSTEM_PROMPT = `You decide how a newly distilled coding-task experience should merge into an existing node pool.

Return strict JSON:
- action: ADD | UPDATE | NONE
- target_node_id: required for UPDATE or NONE
- reason: one short sentence

Rules:
- ADD when the new experience is materially new.
- UPDATE when one existing node expresses the same core lesson but the new experience improves wording, evidence, or applicability.
- NONE when one existing node already covers the new experience well enough and no content update is needed.
- Prefer keeping the node pool small.
- Never choose a target outside the provided existing_nodes list.`;

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: string | Buffer, value: string): Buffer => createHmac("sha256", key).update(value, "utf8").digest();
const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, "");
const toDateStamp = (date: Date): string => toAmzDate(date).slice(0, 8);

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const isMergeAction = (value: unknown): value is MergeAction =>
  value === "ADD" || value === "UPDATE" || value === "NONE";

const resolveRequestTimeoutMs = (endpoint: DistillerEndpoint): number => {
  const model = endpoint.model.toLowerCase();
  if (endpoint.provider === "openrouter" && (model === "openrouter/free" || model.includes(":free"))) {
    return FREE_MODEL_REQUEST_TIMEOUT_MS;
  }

  if (model.includes(":free")) {
    return FREE_MODEL_REQUEST_TIMEOUT_MS;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
};

const buildMergePayload = (
  candidate: ExperienceCandidate,
  distilled: ExperienceCandidateDraft,
  existingNodes: ExperienceNode[]
): string =>
  JSON.stringify(
    {
      candidate: {
        taskType: candidate.task_type,
        nodeType: candidate.node_type,
        triggerPattern: candidate.trigger_pattern,
        sourceSignal: candidate.source_signal
      },
      new_experience: {
        experience_kind: distilled.experience_kind,
        correction_scope: distilled.correction_scope,
        correction_category: distilled.correction_category,
        deviation_pattern: distilled.deviation_pattern,
        corrected_constraint: distilled.corrected_constraint,
        task_type: distilled.task_type,
        node_type: distilled.node_type,
        trigger_pattern: distilled.trigger_pattern,
        compact_hint: distilled.compact_hint,
        goal: distilled.goal,
        recommended_steps: distilled.recommended_steps ?? [],
        avoid_steps: distilled.avoid_steps ?? [],
        fallback_steps: distilled.fallback_steps ?? [],
        success_signal: distilled.success_signal,
        evidence_summary: distilled.evidence_summary
      },
      existing_nodes: existingNodes.map((node) => ({
        id: node.id,
        experience_kind: node.experience_kind,
        correction_scope: node.correction_scope,
        correction_category: node.correction_category,
        deviation_pattern: node.deviation_pattern,
        corrected_constraint: node.corrected_constraint,
        task_type: node.task_type,
        node_type: node.node_type,
        trigger_pattern: node.trigger_pattern,
        compact_hint: node.compact_hint,
        goal: node.goal,
        recommended_steps: node.recommended_steps ?? [],
        avoid_steps: node.avoid_steps ?? [],
        fallback_steps: node.fallback_steps ?? [],
        success_signal: node.success_signal,
        evidence_summary: node.evidence_summary,
        state: node.state,
        helped_count: node.helped_count,
        harmed_count: node.harmed_count,
        support_count: node.support_count
      }))
    },
    null,
    2
  );

export class LlmMergeDecider {
  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly options: MergeDecisionRuntimeOptions = {}
  ) {}

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env;
  }

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private resolveDistillation(): DistillationResolution {
    return resolveDistillationResolution({
      env: this.env,
      configProvider: this.config.distillerProvider,
      configModel: this.config.distillerModel,
      distillationMode: this.config.distillationMode,
      allowRuleFallback: this.config.distillationAllowPassthrough
    });
  }

  private buildOpenAiUrl(baseUrl: string): string {
    if (/\/chat\/completions(?:\?.*)?$/.test(baseUrl)) {
      return baseUrl;
    }
    if (/\/v1\/?$/.test(baseUrl)) {
      return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    }
    return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }

  private buildRequestUrl(endpoint: DistillerEndpoint): string {
    if (endpoint.kind === "anthropic" || endpoint.kind === "gemini" || endpoint.kind === "bedrock") {
      return endpoint.baseUrl;
    }

    return this.buildOpenAiUrl(endpoint.baseUrl);
  }

  private buildRequestBody(
    endpoint: DistillerEndpoint,
    candidate: ExperienceCandidate,
    distilled: ExperienceCandidateDraft,
    existingNodes: ExperienceNode[]
  ): Record<string, unknown> {
    const payload = buildMergePayload(candidate, distilled, existingNodes);

    if (endpoint.kind === "anthropic") {
      const messages: AnthropicMessage[] = [{ role: "user", content: payload }];
      return {
        model: endpoint.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
        temperature: 0
      };
    }

    if (endpoint.kind === "gemini") {
      const parts: GeminiPart[] = [{ text: payload }];
      return {
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: "user", content: [{ text: payload }] }],
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0
        }
      };
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: payload }
    ];
    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages,
      temperature: 0
    };
  }

  private async parseResponseContent(endpoint: DistillerEndpoint, response: Response): Promise<string> {
    if (endpoint.kind === "anthropic") {
      const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
      const textBlock = payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string");
      if (!textBlock?.text) {
        throw new Error("Merge decision response did not include a text payload");
      }
      return textBlock.text;
    }

    if (endpoint.kind === "gemini") {
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Merge decision response did not include a Gemini text payload");
      }
      return text;
    }

    if (endpoint.kind === "bedrock") {
      const payload = (await response.json()) as {
        output?: { message?: { content?: Array<{ text?: string }> } };
      };
      const text = payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Merge decision response did not include a Bedrock text payload");
      }
      return text;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Merge decision response did not include a message payload");
    }
    return content;
  }

  private buildBedrockHeaders(endpoint: Extract<DistillerEndpoint, { kind: "bedrock" }>, body: string): Record<string, string> {
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = toDateStamp(now);
    const bodyHash = sha256Hex(body);
    const target = new URL(endpoint.baseUrl);
    const canonicalHeaders =
      `content-type:application/json\nhost:${target.host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n` +
      (endpoint.sessionToken ? `x-amz-security-token:${endpoint.sessionToken}\n` : "");
    const signedHeaders = endpoint.sessionToken
      ? "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
      : "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["POST", target.pathname, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
    const credentialScope = `${dateStamp}/${endpoint.region}/${BEDROCK_SERVICE}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${endpoint.secretAccessKey}`, dateStamp), endpoint.region), BEDROCK_SERVICE),
      "aws4_request"
    );
    const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

    return {
      "Content-Type": "application/json",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": bodyHash,
      ...(endpoint.sessionToken ? { "x-amz-security-token": endpoint.sessionToken } : {}),
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${endpoint.accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`
    };
  }

  private async postJson(url: string, endpoint: DistillerEndpoint, body: Record<string, unknown>): Promise<Response> {
    const serializedBody = JSON.stringify(body);
    const headers =
      endpoint.kind === "bedrock"
        ? this.buildBedrockHeaders(endpoint, serializedBody)
        : {
            "Content-Type": "application/json",
            ...endpoint.headers
          };
    const timeoutMs = resolveRequestTimeoutMs(endpoint);

    try {
      return await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: serializedBody,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (
        (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
        (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "TimeoutError")
      ) {
        throw new Error(`Merge decision request timed out after ${timeoutMs}ms`);
      }

      throw error;
    }
  }

  async decide(
    candidate: ExperienceCandidate,
    distilled: ExperienceCandidateDraft,
    existingNodes: ExperienceNode[],
    fallback: MergeDecision
  ): Promise<MergeDecision> {
    if (!existingNodes.length) {
      return { action: "ADD", reason: "no existing nodes matched", source: "rule" };
    }

    const resolution = this.resolveDistillation();
    if (resolution.distillationMode !== "llm" || !resolution.endpoint) {
      return fallback;
    }

    const response = await this.postJson(
      this.buildRequestUrl(resolution.endpoint),
      resolution.endpoint,
      this.buildRequestBody(resolution.endpoint, candidate, distilled, existingNodes)
    );
    if (!response.ok) {
      throw new Error(`Merge decision request failed with ${response.status}`);
    }

    const content = await this.parseResponseContent(resolution.endpoint, response);
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const action = parsed.action;
    const targetNodeId = pickString(parsed.target_node_id);
    const reason = pickString(parsed.reason) ?? "no reason provided";

    if (!isMergeAction(action)) {
      throw new Error("Merge decision output missing a valid action");
    }

    if ((action === "UPDATE" || action === "NONE") && !targetNodeId) {
      throw new Error("Merge decision requires target_node_id for UPDATE or NONE");
    }

    if (targetNodeId && !existingNodes.some((node) => node.id === targetNodeId)) {
      throw new Error("Merge decision selected a target outside the provided existing nodes");
    }

    return {
      action,
      targetNodeId,
      reason,
      source: "llm"
    };
  }
}
