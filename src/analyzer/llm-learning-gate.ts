import { createHash, createHmac } from "node:crypto";
import type {
  ConfidenceSignal,
  CorrectionCategory,
  CorrectionScope,
  ExperienceCandidateDraft,
  ExperienceInput,
  TaskType,
  ValidationState
} from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import { analyzeExperience } from "./experience-analyzer.js";
import { dedupeCandidates } from "./node-deduper.js";
import { normalizeCandidate } from "./node-normalizer.js";
import {
  resolveDistillationResolution,
  type DistillationResolution,
  type DistillerEndpoint
} from "../distillation/host-llm.js";

type LearningGateRuntimeOptions = {
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

type LearningGateResult = {
  worthCapturing: boolean;
  reason: string;
  drafts: ExperienceCandidateDraft[];
  source: "llm" | "rule" | "disabled";
};

const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const FREE_MODEL_REQUEST_TIMEOUT_MS = 75_000;
const BEDROCK_SERVICE = "bedrock";
const TASK_TYPES: TaskType[] = [
  "bug_fix",
  "build_debug",
  "config_debug",
  "test_debug",
  "integration_fix",
  "feature_add",
  "refactor",
  "performance",
  "general"
];

const SYSTEM_PROMPT = `You are ExperienceEngine's coding-experience learner.

You decide whether a finished coding task is worth capturing as reusable experience.

Capture when the run contains any of:
- a concrete failure and repair path
- repeated retries or narrowing steps
- provider, model, routing, credential, endpoint, privacy, rate-limit, or config troubleshooting
- a non-obvious but reusable verification or execution loop
- a warning pattern that should stop the agent from repeating the same failing path

Do not capture:
- routine success with no reusable signal
- repo-specific noise that would not help a later similar task
- generic advice with no concrete trigger or verification signal

Return strict JSON with:
- worth_capturing: boolean
- experience_kind: one of execution_pattern | config_troubleshooting | verification_loop | warning | expectation_correction | none
- reason: one short sentence
- candidate: required only when worth_capturing is true

candidate must include:
- node_type: strategy | warning
- task_type: one of bug_fix | build_debug | config_debug | test_debug | integration_fix | feature_add | refactor | performance | general
- trigger_pattern
- compact_hint
- success_signal
- evidence_summary

candidate may also include:
- experience_kind
- confidence_signal
- validation_state
- correction_scope
- correction_category
- deviation_pattern
- corrected_constraint
- goal
- applicability_notes
- recommended_steps
- avoid_steps
- fallback_steps
- stop_condition
- escalation_condition

Keep the hint concrete, reusable, and tied to the task evidence.`;

const EXPECTATION_CORRECTION_NOTE = `If multiple user corrections happened in one task, only learn from the correction that directly led to the final successful direction. Ignore exploratory corrections that were later superseded.`;

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: string | Buffer, value: string): Buffer => createHmac("sha256", key).update(value, "utf8").digest();
const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, "");
const toDateStamp = (date: Date): string => toAmzDate(date).slice(0, 8);

const buildInputPayload = (input: ExperienceInput): string =>
  JSON.stringify(
    {
      task_summary: input.task_summary,
      task_type: input.task_type,
      context_summary: input.context_summary,
      outcome_signal: input.outcome_signal,
      tool_events: input.tool_events.map((event) => ({
        tool_name: event.tool_name,
        status: event.status,
        exit_code: event.exit_code,
        error_signature: event.error_signature,
        output_summary: event.output_summary
      })),
      injected_node_ids: input.injected_node_ids
    },
    null,
    2
  );

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const parseArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : undefined;

const isTaskType = (value: unknown): value is TaskType =>
  typeof value === "string" && TASK_TYPES.includes(value as TaskType);

const isNodeType = (value: unknown): value is ExperienceCandidateDraft["node_type"] =>
  value === "strategy" || value === "warning";

const CONFIDENCE_SIGNALS: ConfidenceSignal[] = [
  "confirmed_by_user",
  "supported_by_objective_success",
  "unconfirmed"
];
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

const isConfidenceSignal = (value: unknown): value is ConfidenceSignal =>
  typeof value === "string" && CONFIDENCE_SIGNALS.includes(value as ConfidenceSignal);
const isValidationState = (value: unknown): value is ValidationState =>
  typeof value === "string" && VALIDATION_STATES.includes(value as ValidationState);
const isCorrectionScope = (value: unknown): value is CorrectionScope =>
  typeof value === "string" && CORRECTION_SCOPES.includes(value as CorrectionScope);
const isCorrectionCategory = (value: unknown): value is CorrectionCategory =>
  typeof value === "string" && CORRECTION_CATEGORIES.includes(value as CorrectionCategory);

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

const normalizeDraft = (candidate: Record<string, unknown>, input: ExperienceInput): ExperienceCandidateDraft => {
  const taskType =
    (isTaskType(candidate.task_type) ? candidate.task_type : undefined) ??
    (input.task_type !== "unknown" ? input.task_type : "general");
  const nodeType =
    (isNodeType(candidate.node_type) ? candidate.node_type : undefined) ??
    (input.outcome_signal === "failure" ? "warning" : "strategy");
  const triggerPattern = pickString(candidate.trigger_pattern) ?? input.task_summary;
  const compactHint = pickString(candidate.compact_hint);
  const successSignal = pickString(candidate.success_signal);
  const evidenceSummary = pickString(candidate.evidence_summary);

  if (!compactHint || !successSignal || !evidenceSummary) {
    throw new Error("Learning gate output missing required candidate fields");
  }

  const experienceKind = pickString(candidate.experience_kind) as ExperienceCandidateDraft["experience_kind"] | undefined;
  const confidenceSignal = isConfidenceSignal(candidate.confidence_signal) ? candidate.confidence_signal : undefined;
  const correctionScope = isCorrectionScope(candidate.correction_scope) ? candidate.correction_scope : undefined;
  const correctionCategory = isCorrectionCategory(candidate.correction_category) ? candidate.correction_category : undefined;
  const deviationPattern = pickString(candidate.deviation_pattern);
  const correctedConstraint = pickString(candidate.corrected_constraint);

  return normalizeCandidate({
    node_type: nodeType,
    scope_id: input.scope_id,
    task_type: taskType,
    experience_kind:
      experienceKind ?? (correctionScope || correctionCategory || deviationPattern || correctedConstraint ? "expectation_correction" : undefined),
    confidence_signal: confidenceSignal,
    validation_state:
      (isValidationState(candidate.validation_state) ? candidate.validation_state : undefined) ??
      (confidenceSignal ? "pending_reuse_validation" : undefined),
    correction_scope: correctionScope,
    correction_category: correctionCategory,
    deviation_pattern: deviationPattern,
    corrected_constraint: correctedConstraint,
    trigger_pattern: triggerPattern,
    applicability_notes: pickString(candidate.applicability_notes),
    env_signature: undefined,
    compact_hint: compactHint,
    goal: pickString(candidate.goal),
    recommended_steps: parseArray(candidate.recommended_steps),
    avoid_steps: parseArray(candidate.avoid_steps),
    fallback_steps: parseArray(candidate.fallback_steps),
    success_signal: successSignal,
    stop_condition: pickString(candidate.stop_condition),
    escalation_condition: pickString(candidate.escalation_condition),
    evidence_summary: evidenceSummary,
    retrieval_text: undefined,
    source_kind: "system_derived"
  });
};

export class LlmLearningGate {
  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly options: LearningGateRuntimeOptions = {}
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

  private buildRequestBody(endpoint: DistillerEndpoint, input: ExperienceInput): Record<string, unknown> {
    const payload = buildInputPayload(input);

    if (endpoint.kind === "anthropic") {
      const messages: AnthropicMessage[] = [{ role: "user", content: payload }];
      return {
        model: endpoint.model,
        max_tokens: 1536,
        system: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}`,
        messages,
        temperature: 0.1
      };
    }

    if (endpoint.kind === "gemini") {
      const parts: GeminiPart[] = [{ text: payload }];
      return {
        system_instruction: {
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}` }]
        },
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      };
    }

    if (endpoint.kind === "bedrock") {
      return {
        system: [{ text: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}` }],
        messages: [
          {
            role: "user",
            content: [{ text: payload }]
          }
        ],
        inferenceConfig: {
          maxTokens: 1536,
          temperature: 0.1
        }
      };
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${EXPECTATION_CORRECTION_NOTE}` },
      { role: "user", content: payload }
    ];

    return {
      model: endpoint.model,
      response_format: { type: "json_object" },
      messages,
      temperature: 0.1
    };
  }

  private async parseResponseContent(endpoint: DistillerEndpoint, response: Response): Promise<string> {
    if (endpoint.kind === "anthropic") {
      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const textBlock = payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string");
      if (!textBlock?.text) {
        throw new Error("Learning gate response did not include a text payload");
      }
      return textBlock.text;
    }

    if (endpoint.kind === "gemini") {
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Learning gate response did not include a Gemini text payload");
      }
      return text;
    }

    if (endpoint.kind === "bedrock") {
      const payload = (await response.json()) as {
        output?: { message?: { content?: Array<{ text?: string }> } };
      };
      const text = payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text;
      if (!text) {
        throw new Error("Learning gate response did not include a Bedrock text payload");
      }
      return text;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Learning gate response did not include a message payload");
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
        throw new Error(`Learning gate request timed out after ${timeoutMs}ms`);
      }

      throw error;
    }
  }

  async generateCandidateDrafts(input: ExperienceInput): Promise<LearningGateResult> {
    if (input.task_type === "unknown") {
      return {
        worthCapturing: false,
        reason: "task type is unknown",
        drafts: [],
        source: "disabled"
      };
    }

    const resolution = this.resolveDistillation();
    if (this.config.distillationMode === "disabled" || resolution.distillationMode === "disabled") {
      return {
        worthCapturing: false,
        reason: resolution.reason,
        drafts: [],
        source: "disabled"
      };
    }

    if (resolution.distillationMode !== "llm" || !resolution.endpoint) {
      const fallback = analyzeExperience(input);
      return {
        worthCapturing: fallback.accepted.length > 0,
        reason: fallback.accepted.length > 0 ? "captured by rule fallback" : "rule fallback rejected candidate",
        drafts: fallback.accepted,
        source: "rule"
      };
    }

    try {
      const response = await this.postJson(
        this.buildRequestUrl(resolution.endpoint),
        resolution.endpoint,
        this.buildRequestBody(resolution.endpoint, input)
      );
      if (!response.ok) {
        throw new Error(`Learning gate request failed with ${response.status}`);
      }

      const content = await this.parseResponseContent(resolution.endpoint, response);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const worthCapturing = parsed.worth_capturing === true;
      const reason = pickString(parsed.reason) ?? "no reason provided";

      if (!worthCapturing) {
        return {
          worthCapturing: false,
          reason,
          drafts: [],
          source: "llm"
        };
      }

      const rawCandidate =
        parsed.candidate && typeof parsed.candidate === "object"
          ? (parsed.candidate as Record<string, unknown>)
          : undefined;
      if (!rawCandidate) {
        throw new Error("Learning gate marked worth_capturing=true without a candidate payload");
      }

      return {
        worthCapturing: true,
        reason,
        drafts: dedupeCandidates([normalizeDraft(rawCandidate, input)]),
        source: "llm"
      };
    } catch (error) {
      const fallback = analyzeExperience(input);
      return {
        worthCapturing: fallback.accepted.length > 0,
        reason: `llm gate failed: ${error instanceof Error ? error.message : String(error)}`,
        drafts: fallback.accepted,
        source: "rule"
      };
    }
  }
}
