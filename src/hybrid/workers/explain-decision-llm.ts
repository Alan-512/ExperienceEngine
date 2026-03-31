import type { DistillerEndpoint } from "../../distillation/providers/types.js";
import type { ExplainDecisionCapsule, ExplainDecisionWorkerOutput } from "../types.js";
import { validateExplainDecisionOutput } from "../validators.js";

type ExplainDecisionLlmOptions = {
  endpoint: DistillerEndpoint;
  fetchImpl?: typeof fetch;
};

const SYSTEM_PROMPT = [
  "You are ExperienceEngine's bounded explain_decision worker.",
  "Use only the supplied route metadata and bounded evidence.",
  "Do not invent evidence or speculate beyond the capsule.",
  "Return only JSON with keys: decision, reason, confidence, evidence_summary.",
  "Keep the wording concise and user-readable."
].join(" ");

const buildUserPayload = (capsule: ExplainDecisionCapsule): string =>
  JSON.stringify(
    {
      route: capsule.trusted.route,
      inspection: capsule.trusted.inspection,
      scorecard: capsule.trusted.scorecard,
      evidence: capsule.evidence.map((entry) => ({
        source: entry.source,
        text: entry.text
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

const buildRequestBody = (endpoint: DistillerEndpoint, capsule: ExplainDecisionCapsule): Record<string, unknown> => {
  const payload = buildUserPayload(capsule);

  if (endpoint.kind === "anthropic") {
    return {
      model: endpoint.model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: payload }],
      temperature: 0
    };
  }

  if (endpoint.kind === "gemini") {
    return {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [{ role: "user", parts: [{ text: payload }] }],
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
        maxTokens: 512,
        temperature: 0
      }
    };
  }

  return {
    model: endpoint.model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: payload }
    ],
    temperature: 0
  };
};

const parseResponseContent = async (endpoint: DistillerEndpoint, response: Response): Promise<string> => {
  if (endpoint.kind === "anthropic") {
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const textBlock = payload.content?.find((entry) => entry.type === "text" && typeof entry.text === "string");
    if (!textBlock?.text) {
      throw new Error("Explain response did not include a text payload");
    }
    return textBlock.text;
  }

  if (endpoint.kind === "gemini") {
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) {
      throw new Error("Explain response did not include a Gemini text payload");
    }
    return text;
  }

  if (endpoint.kind === "bedrock") {
    const payload = (await response.json()) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
    };
    const text = payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) {
      throw new Error("Explain response did not include a Bedrock text payload");
    }
    return text;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Explain response did not include a message payload");
  }
  return content;
};

const normalizeConfidence = (value: unknown): unknown => {
  if (typeof value === "string" && (value === "high" || value === "medium" || value === "low")) {
    return value;
  }

  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (Number.isNaN(numeric)) {
    return value;
  }

  if (numeric >= 0.8) {
    return "high";
  }
  if (numeric >= 0.5) {
    return "medium";
  }
  return "low";
};

export const runExplainDecisionLlmWorker = async (
  capsule: ExplainDecisionCapsule,
  options: ExplainDecisionLlmOptions
): Promise<ExplainDecisionWorkerOutput> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildRequestUrl(options.endpoint), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...options.endpoint.headers
    },
    body: JSON.stringify(buildRequestBody(options.endpoint, capsule))
  });

  if (!response.ok) {
    throw new Error(`Explain worker failed with ${response.status}`);
  }

  const content = await parseResponseContent(options.endpoint, response);
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const validated = validateExplainDecisionOutput({
    task: "explain_decision",
    decision: parsed.decision,
    reason: parsed.reason,
    confidence: normalizeConfidence(parsed.confidence),
    evidence_summary: parsed.evidence_summary
  });

  if (validated.status !== "accepted") {
    throw new Error(validated.detail);
  }

  return validated.value;
};
