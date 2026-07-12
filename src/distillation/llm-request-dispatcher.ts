import { createHash, createHmac } from "node:crypto";
import { resolveExperienceEngineRuntimeEnv } from "../config/runtime-env.js";
import { resolveGoogleAdcAccessToken } from "./providers/google-adc.js";
import type { DistillerEndpoint } from "./providers/types.js";

const BEDROCK_SERVICE = "bedrock";
const DEFAULT_DISTILLATION_REQUEST_TIMEOUT_MS = 45_000;
const FREE_MODEL_DISTILLATION_REQUEST_TIMEOUT_MS = 75_000;

export type LlmRequestFailureKind =
  | "configuration"
  | "http"
  | "network"
  | "timeout"
  | "response_contract";

export class LlmRequestExecutionError extends Error {
  constructor(
    readonly kind: LlmRequestFailureKind,
    message: string,
    readonly status?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "LlmRequestExecutionError";
  }
}

export interface LlmRequestOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseJson?: boolean;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  fallbackCodes?: number[];
  maxTimeoutMs?: number; // cumulative timeout cap in ms
  maxTokens?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: string | Buffer, value: string): Buffer => createHmac("sha256", key).update(value, "utf8").digest();
const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, "");
const toDateStamp = (date: Date): string => toAmzDate(date).slice(0, 8);

function resolveRequestTimeoutMs(endpoint: DistillerEndpoint): number {
  const model = endpoint.model.toLowerCase();
  if (endpoint.provider === "openrouter" && (model === "openrouter/free" || model.includes(":free"))) {
    return FREE_MODEL_DISTILLATION_REQUEST_TIMEOUT_MS;
  }
  if (model.includes(":free")) {
    return FREE_MODEL_DISTILLATION_REQUEST_TIMEOUT_MS;
  }
  return DEFAULT_DISTILLATION_REQUEST_TIMEOUT_MS;
}

function buildBedrockHeaders(endpoint: Extract<DistillerEndpoint, { kind: "bedrock" }>, body: string): Record<string, string> {
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

function buildRequestUrl(endpoint: DistillerEndpoint): string {
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
}

function buildRequestBody(endpoint: DistillerEndpoint, options: LlmRequestOptions): Record<string, unknown> {
  const temperature = options.temperature ?? 0;
  if (endpoint.kind === "anthropic") {
    return {
      model: endpoint.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.systemPrompt,
      messages: [{ role: "user", content: options.userPrompt }],
      temperature
    };
  }
  if (endpoint.kind === "gemini") {
    return {
      system_instruction: { parts: [{ text: options.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: options.userPrompt }] }],
      generationConfig: {
        temperature,
        ...(options.responseJson ? { responseMimeType: "application/json" } : {})
      }
    };
  }
  if (endpoint.kind === "bedrock") {
    return {
      system: [{ text: options.systemPrompt }],
      messages: [{ role: "user", content: [{ text: options.userPrompt }] }],
      inferenceConfig: {
        maxTokens: options.maxTokens ?? 4096,
        temperature
      }
    };
  }

  // OpenAI Style
  const fallbackEnv = options.env?.EXPERIENCE_ENGINE_FALLBACK_MODELS?.trim();
  const fallbackList = fallbackEnv ? fallbackEnv.split(",").map(m => m.trim()).filter(Boolean) : [];

  return {
    model: endpoint.model,
    ...(options.responseJson ? { response_format: { type: "json_object" } } : {}),
    temperature,
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt }
    ],
    ...(endpoint.provider === "openrouter" ? {
      ...(fallbackList.length > 0 ? { models: [endpoint.model, ...fallbackList] } : {}),
      reasoning: {
        effort: "minimal",
        exclude: true
      },
      ...(endpoint.model.includes(":free") ? {
        thinking: { type: "minimal" }
      } : {})
    } : {})
  };
}

async function parseResponseContent(endpoint: DistillerEndpoint, response: Response): Promise<string> {
  if (endpoint.kind === "anthropic") {
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const textBlock = payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string");
    if (!textBlock?.text) {
      throw new LlmRequestExecutionError(
        "response_contract",
        "Response did not include an Anthropic text payload"
      );
    }
    return textBlock.text;
  }
  if (endpoint.kind === "gemini") {
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) {
      throw new LlmRequestExecutionError(
        "response_contract",
        "Response did not include a Gemini text payload"
      );
    }
    return text;
  }
  if (endpoint.kind === "bedrock") {
    const payload = (await response.json()) as { output?: { message?: { content?: Array<{ text?: string }> } } };
    const text = payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) {
      throw new LlmRequestExecutionError(
        "response_contract",
        "Response did not include a Bedrock text payload"
      );
    }
    return text;
  }

  // OpenAI Style
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new LlmRequestExecutionError(
      "response_contract",
      "Response did not include an OpenAI style message payload"
    );
  }
  return content;
}

export class LlmRequestDispatcher {
  static async execute(
    endpoints: DistillerEndpoint[],
    options: LlmRequestOptions
  ): Promise<string> {
    if (endpoints.length === 0) {
      throw new LlmRequestExecutionError(
        "configuration",
        "No endpoints provided for execution"
      );
    }

    const env = resolveExperienceEngineRuntimeEnv({ env: options.env ?? process.env });
    const fetchImpl = options.fetchImpl ?? fetch;
    const fallbackCodes = options.fallbackCodes ?? [429, 500, 502, 503, 504];
    const startTime = Date.now();
    const maxRetries = options.maxRetries ?? 0;
    const retryDelayMs = options.retryDelayMs ?? 1000;

    let lastError: Error | undefined;

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      let attempts = 0;

      while (attempts <= maxRetries) {
        attempts++;

        // Check cumulative timeout cap
        if (options.maxTimeoutMs) {
          const elapsed = Date.now() - startTime;
          if (elapsed >= options.maxTimeoutMs) {
            throw new LlmRequestExecutionError(
              "timeout",
              `LLM execution chain exceeded cumulative timeout cap of ${options.maxTimeoutMs}ms`
            );
          }
        }

        try {
          const url = buildRequestUrl(endpoint);
          const body = buildRequestBody(endpoint, { ...options, env });
          const serializedBody = JSON.stringify(body);

          let headers: Record<string, string>;
          if (endpoint.kind === "bedrock") {
            headers = buildBedrockHeaders(endpoint, serializedBody);
          } else if (endpoint.kind === "gemini" && endpoint.authMode === "google_adc") {
            const token = await resolveGoogleAdcAccessToken({ env, fetchImpl });
            headers = {
              "Content-Type": "application/json",
              ...endpoint.headers,
              Authorization: `Bearer ${token}`
            };
          } else {
            headers = {
              "Content-Type": "application/json",
              ...endpoint.headers
            };
          }

          // Per-request timeout calculation
          const baseTimeoutMs = resolveRequestTimeoutMs(endpoint);
          let timeoutMs = baseTimeoutMs;
          if (options.maxTimeoutMs) {
            const remaining = options.maxTimeoutMs - (Date.now() - startTime);
            timeoutMs = Math.max(500, Math.min(baseTimeoutMs, remaining));
          }

          const response = await fetchImpl(url, {
            method: "POST",
            headers,
            body: serializedBody,
            signal: AbortSignal.timeout(timeoutMs)
          });

          if (!response.ok) {
            throw new LlmRequestExecutionError(
              "http",
              `LLM request failed with HTTP ${response.status}`,
              response.status
            );
          }

          return await parseResponseContent(endpoint, response);
        } catch (error) {
          if (error instanceof LlmRequestExecutionError) {
            lastError = error;
          } else if (error instanceof Error) {
            const kind = error.name === "AbortError" || error.name === "TimeoutError"
              ? "timeout"
              : "network";
            lastError = new LlmRequestExecutionError(kind, error.message, undefined, {
              cause: error
            });
          } else {
            lastError = new LlmRequestExecutionError("network", String(error));
          }

          // Check if fallback trigger (timeout or fallback code)
          const isFallbackTrigger =
            lastError instanceof LlmRequestExecutionError &&
            (
              lastError.kind === "timeout" ||
              lastError.kind === "network" ||
              lastError.kind === "response_contract" ||
              (
                lastError.kind === "http" &&
                lastError.status !== undefined &&
                fallbackCodes.includes(lastError.status)
              )
            );

          if (!isFallbackTrigger) {
            throw lastError;
          }

          // If we can try again on the same endpoint, delay and retry
          if (attempts <= maxRetries) {
            if (retryDelayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
            continue;
          }

          // Otherwise, if we have another endpoint, fall back to it
          if (i < endpoints.length - 1) {
            break;
          }

          throw lastError;
        }
      }
    }

    throw lastError ?? new LlmRequestExecutionError(
      "network",
      "Execution failed without a valid error"
    );
  }
}
