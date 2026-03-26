import { createHash, createHmac } from "node:crypto";
import type {
  ConfidenceSignal,
  CorrectionCategory,
  CorrectionScope,
  ExperienceCandidate,
  ExperienceCandidateDraft,
  ExperienceInput,
  ExperienceKind,
  PromotionSignal,
  ValidationState
} from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { DistillationResult } from "./types.js";
import {
  resolveDistillationResolution,
  type DistillationResolution,
  type DistillerEndpoint
} from "./host-llm.js";
import { DEFAULT_DISTILLER_SYSTEM_PROMPT, buildCandidatePayload } from "./prompt-contract.js";
import { resolveGoogleAdcAccessToken } from "./providers/google-adc.js";

type DistillerRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
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

const DEFAULT_DISTILLATION_REQUEST_TIMEOUT_MS = 45_000;
const FREE_MODEL_DISTILLATION_REQUEST_TIMEOUT_MS = 75_000;
const BEDROCK_SERVICE = "bedrock";

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const hmac = (key: string | Buffer, value: string): Buffer => createHmac("sha256", key).update(value, "utf8").digest();

const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, "");

const toDateStamp = (date: Date): string => toAmzDate(date).slice(0, 8);

const parseArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : undefined;

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const normalizeRiskLevel = (value: unknown): "low" | "medium" | "high" | undefined => {
  const normalized = pickString(value)?.toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return undefined;
};

const EXPERIENCE_KINDS: ExperienceKind[] = [
  "execution_pattern",
  "config_troubleshooting",
  "verification_loop",
  "warning",
  "expectation_correction"
];
const CONFIDENCE_SIGNALS: ConfidenceSignal[] = [
  "confirmed_by_user",
  "supported_by_objective_success",
  "unconfirmed"
];
const PROMOTION_SIGNALS: PromotionSignal[] = ["normal", "high_value"];
const VALIDATION_STATES: ValidationState[] = [
  "pending_reuse_validation",
  "validated_by_reuse",
  "invalidated"
];
const CORRECTION_SCOPES: CorrectionScope[] = [
  "task_local",
  "repo_local",
  "workflow_local",
  "host_local",
  "cross_repo_candidate"
];
const CORRECTION_CATEGORIES: CorrectionCategory[] = [
  "goal_interpretation",
  "quality_bar",
  "interaction_behavior",
  "verification_order",
  "implementation_boundary",
  "style_constraint"
];

const isExperienceKind = (value: unknown): value is ExperienceKind =>
  typeof value === "string" && EXPERIENCE_KINDS.includes(value as ExperienceKind);
const isConfidenceSignal = (value: unknown): value is ConfidenceSignal =>
  typeof value === "string" && CONFIDENCE_SIGNALS.includes(value as ConfidenceSignal);
const isValidationState = (value: unknown): value is ValidationState =>
  typeof value === "string" && VALIDATION_STATES.includes(value as ValidationState);
const isCorrectionScope = (value: unknown): value is CorrectionScope =>
  typeof value === "string" && CORRECTION_SCOPES.includes(value as CorrectionScope);
const isCorrectionCategory = (value: unknown): value is CorrectionCategory =>
  typeof value === "string" && CORRECTION_CATEGORIES.includes(value as CorrectionCategory);
const isPromotionSignal = (value: unknown): value is PromotionSignal =>
  typeof value === "string" && PROMOTION_SIGNALS.includes(value as PromotionSignal);

const withRiskLevel = (summary: string | undefined, riskLevel: string | undefined): string => {
  const trimmed = pickString(summary) ?? "";
  if (!riskLevel) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("risk level:")) {
    return trimmed;
  }
  return trimmed ? `Risk level: ${riskLevel}. ${trimmed}` : `Risk level: ${riskLevel}.`;
};

const validateDistillationPayload = (
  parsed: Record<string, unknown>
): {
  compactHint: string;
  triggerConditions: string;
  successCriteria: string;
  riskLevel: "low" | "medium" | "high";
} => {
  const compactHint = pickString(parsed.compact_hint);
  const triggerConditions = pickString(parsed.trigger_conditions);
  const successCriteria = pickString(parsed.success_criteria);
  const riskLevel = normalizeRiskLevel(parsed.risk_level);
  const missing: string[] = [];

  if (!compactHint) {
    missing.push("compact_hint");
  }
  if (!triggerConditions) {
    missing.push("trigger_conditions");
  }
  if (!successCriteria) {
    missing.push("success_criteria");
  }
  if (!riskLevel) {
    missing.push("risk_level");
  }

  if (missing.length) {
    throw new Error(`Distillation output missing required fields: ${missing.join(", ")}`);
  }

  return {
    compactHint: compactHint!,
    triggerConditions: triggerConditions!,
    successCriteria: successCriteria!,
    riskLevel: riskLevel!
  };
};

const applyFallbacks = (
  candidate: ExperienceCandidate,
  parsed: Record<string, unknown>,
  validated?: {
    compactHint: string;
    triggerConditions: string;
    successCriteria: string;
    riskLevel: "low" | "medium" | "high";
  }
): DistillationResult => {
  const triggerConditions =
    validated?.triggerConditions ?? pickString(parsed.trigger_conditions) ?? pickString(parsed.applicability_notes);
  const successCriteria =
    validated?.successCriteria ?? pickString(parsed.success_criteria) ?? pickString(parsed.success_signal);
  const riskLevel = validated?.riskLevel ?? normalizeRiskLevel(parsed.risk_level);
  const evidenceSummary = withRiskLevel(pickString(parsed.evidence_summary) ?? candidate.evidence_summary, riskLevel);

  return {
    node_type: candidate.node_type,
    scope_id: candidate.scope_id,
    task_type: candidate.task_type,
    experience_kind: isExperienceKind(parsed.experience_kind) ? parsed.experience_kind : candidate.experience_kind,
    confidence_signal: isConfidenceSignal(parsed.confidence_signal)
      ? parsed.confidence_signal
      : candidate.confidence_signal,
    validation_state: isValidationState(parsed.validation_state) ? parsed.validation_state : candidate.validation_state,
    correction_scope: isCorrectionScope(parsed.correction_scope) ? parsed.correction_scope : candidate.correction_scope,
    correction_category: isCorrectionCategory(parsed.correction_category)
      ? parsed.correction_category
      : candidate.correction_category,
    deviation_pattern: pickString(parsed.deviation_pattern) ?? candidate.deviation_pattern,
    corrected_constraint: pickString(parsed.corrected_constraint) ?? candidate.corrected_constraint,
    trigger_pattern: candidate.trigger_pattern,
    applicability_notes: triggerConditions ?? candidate.applicability_notes,
    env_signature: candidate.env_signature,
    compact_hint: validated?.compactHint ?? pickString(parsed.compact_hint) ?? candidate.compact_hint,
    goal: pickString(parsed.goal) ?? candidate.goal,
    recommended_steps: parseArray(parsed.recommended_steps) ?? candidate.recommended_steps,
    avoid_steps: parseArray(parsed.avoid_steps) ?? candidate.avoid_steps,
    fallback_steps: parseArray(parsed.fallback_steps) ?? candidate.fallback_steps,
    success_signal: successCriteria ?? candidate.success_signal,
    stop_condition: pickString(parsed.stop_condition) ?? candidate.stop_condition,
    escalation_condition: pickString(parsed.escalation_condition) ?? candidate.escalation_condition,
    evidence_summary: evidenceSummary,
    retrieval_text: candidate.retrieval_text,
    promotion_signal: isPromotionSignal(parsed.promotion_signal) ? parsed.promotion_signal : candidate.promotion_signal,
    promotion_reason: pickString(parsed.promotion_reason) ?? candidate.promotion_reason,
    source_kind: candidate.source_kind
  };
};

const passthroughDistillation = (candidate: ExperienceCandidate): DistillationResult => ({
  ...applyFallbacks(candidate, {}),
  distillation_mode_used: "rule",
  distillation_source: "rule"
});

const resolveTemperature = (profile: ExperienceEngineConfig["distillerProfile"]): number => {
  switch (profile) {
    case "high_quality":
      return 0.3;
    case "fast":
      return 0;
    case "balanced":
    default:
      return 0.1;
  }
};

const resolveRequestTimeoutMs = (endpoint: DistillerEndpoint): number => {
  const model = endpoint.model.toLowerCase();
  if (endpoint.provider === "openrouter" && (model === "openrouter/free" || model.includes(":free"))) {
    return FREE_MODEL_DISTILLATION_REQUEST_TIMEOUT_MS;
  }

  if (model.includes(":free")) {
    return FREE_MODEL_DISTILLATION_REQUEST_TIMEOUT_MS;
  }

  return DEFAULT_DISTILLATION_REQUEST_TIMEOUT_MS;
};

const isTransientProviderFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /timed out/i.test(message) ||
    /failed with 429\b/i.test(message) ||
    /failed with 5\d{2}\b/i.test(message) ||
    /did not include a message payload/i.test(message)
  );
};

export class LlmDistiller {
  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly options: DistillerRuntimeOptions = {}
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
      configAuthMode: this.config.distillationAuthMode,
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

  private buildRequestBody(endpoint: DistillerEndpoint, candidate: ExperienceCandidate): Record<string, unknown> {
    const temperature = resolveTemperature(this.config.distillerProfile);

    if (endpoint.kind === "anthropic") {
      const messages: AnthropicMessage[] = [
        {
          role: "user",
          content: buildCandidatePayload(candidate)
        }
      ];

      return {
        model: endpoint.model,
        max_tokens: 1024,
        system: DEFAULT_DISTILLER_SYSTEM_PROMPT,
        messages,
        temperature
      };
    }

    if (endpoint.kind === "gemini") {
      const userPayload = buildCandidatePayload(candidate);
      const parts: GeminiPart[] = [{ text: userPayload }];

      return {
        system_instruction: {
          parts: [{ text: DEFAULT_DISTILLER_SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: DEFAULT_DISTILLER_SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [{ text: buildCandidatePayload(candidate) }]
          }
        ],
        inferenceConfig: {
          maxTokens: 1024,
          temperature
        }
      };
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: DEFAULT_DISTILLER_SYSTEM_PROMPT },
      { role: "user", content: buildCandidatePayload(candidate) }
    ];

    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages,
      temperature
    };
  }

  private async parseResponseContent(
    endpoint: DistillerEndpoint,
    response: Response
  ): Promise<string> {
    if (endpoint.kind === "anthropic") {
      const payload = (await response.json()) as {
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      };
      const textBlock = payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string");
      if (!textBlock?.text) {
        throw new Error("Distillation response did not include a text payload");
      }
      return textBlock.text;
    }

    if (endpoint.kind === "gemini") {
      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
            }>;
          };
        }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Distillation response did not include a Gemini text payload");
      }
      return text;
    }

    if (endpoint.kind === "bedrock") {
      const payload = (await response.json()) as {
        output?: {
          message?: {
            content?: Array<{
              text?: string;
            }>;
          };
        };
      };
      const text = payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Distillation response did not include a Bedrock text payload");
      }
      return text;
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Distillation response did not include a message payload");
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
    const canonicalRequest = [
      "POST",
      target.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      bodyHash
    ].join("\n");
    const credentialScope = `${dateStamp}/${endpoint.region}/${BEDROCK_SERVICE}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join("\n");
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

  private async postJson(
    url: string,
    endpoint: DistillerEndpoint,
    body: Record<string, unknown>
  ): Promise<Response> {
    const serializedBody = JSON.stringify(body);
    const headers =
      endpoint.kind === "bedrock"
        ? this.buildBedrockHeaders(endpoint, serializedBody)
        : endpoint.kind === "gemini" && endpoint.authMode === "google_adc"
          ? {
              "Content-Type": "application/json",
              ...endpoint.headers,
              Authorization: `Bearer ${await resolveGoogleAdcAccessToken({
                env: this.env,
                fetchImpl: this.fetchImpl
              })}`
            }
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
        throw new Error(`Distillation request timed out after ${timeoutMs}ms`);
      }

      throw error;
    }
  }

  async distill(candidate: ExperienceCandidate): Promise<DistillationResult> {
    const resolution = this.resolveDistillation();
    if (resolution.distillationMode === "disabled") {
      if (this.config.distillationMode === "llm" || !this.config.distillationAllowPassthrough) {
        throw new Error("Distillation requires a configured LLM endpoint");
      }
      throw new Error(resolution.reason);
    }

    if (resolution.distillationMode === "rule") {
      return passthroughDistillation(candidate);
    }
    const endpoint = resolution.endpoint;
    if (!endpoint) {
      throw new Error("Distillation resolution did not provide a reusable endpoint.");
    }
    try {
      const response = await this.postJson(
        this.buildRequestUrl(endpoint),
        endpoint,
        this.buildRequestBody(endpoint, candidate)
      );

      if (!response.ok) {
        throw new Error(`Distillation request failed with ${response.status}`);
      }

      const content = await this.parseResponseContent(endpoint, response);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const validated = validateDistillationPayload(parsed);
      return {
        ...applyFallbacks(candidate, parsed, validated),
        distillation_mode_used: "llm",
        distillation_source: resolution.distillationSource
      };
    } catch (error) {
      if (this.config.distillationAllowPassthrough && isTransientProviderFailure(error)) {
        return passthroughDistillation(candidate);
      }
      throw error;
    }
  }
}
