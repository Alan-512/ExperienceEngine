import type { DistillerEndpoint } from "../../distillation/providers/types.js";
import type { PostmortemReviewCapsule, PostmortemReviewWorkerOutput } from "../types.js";
import { parsePostmortemReviewOutput } from "../validators.js";

type PostmortemReviewLlmOptions = {
  endpoint: DistillerEndpoint;
  fetchImpl?: typeof fetch;
};

const SYSTEM_PROMPT = [
  "You are ExperienceEngine's bounded postmortem_review worker.",
  "Use only the supplied route metadata, trusted run metadata, and bounded evidence.",
  "Do not invent evidence or lifecycle facts.",
  "Do not recommend direct lifecycle mutation, write-back, promotion, or retirement.",
  "Return only JSON with keys: review_verdict, candidate_recommendation, feedback_followup_recommendation, confidence, reason, review_artifact, suggestedFollowUps, candidateShapingSuggestions, governanceRecommendations.",
  "Keep the result concise and artifact-oriented."
].join(" ");

const buildUserPayload = (capsule: PostmortemReviewCapsule): string =>
  JSON.stringify(
    {
      route: capsule.trusted.route,
      run: capsule.trusted.run,
      reviewTriggers: capsule.trusted.reviewTriggers,
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

const buildRequestBody = (endpoint: DistillerEndpoint, capsule: PostmortemReviewCapsule): Record<string, unknown> => {
  const payload = buildUserPayload(capsule);

  if (endpoint.kind === "anthropic") {
    return {
      model: endpoint.model,
      max_tokens: 768,
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
        maxTokens: 768,
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
      throw new Error("Postmortem response did not include a text payload");
    }
    return textBlock.text;
  }

  if (endpoint.kind === "gemini") {
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) {
      throw new Error("Postmortem response did not include a Gemini text payload");
    }
    return text;
  }

  if (endpoint.kind === "bedrock") {
    const payload = (await response.json()) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
    };
    const text = payload.output?.message?.content?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) {
      throw new Error("Postmortem response did not include a Bedrock text payload");
    }
    return text;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Postmortem response did not include a message payload");
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

const isValidationFailure = (
  value: PostmortemReviewWorkerOutput | { status: "rejected"; detail: string }
): value is { status: "rejected"; detail: string } => "status" in value;

export const runPostmortemReviewLlmWorker = async (
  capsule: PostmortemReviewCapsule,
  options: PostmortemReviewLlmOptions
): Promise<PostmortemReviewWorkerOutput> => {
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
    throw new Error(`Postmortem worker failed with ${response.status}`);
  }

  const content = await parseResponseContent(options.endpoint, response);
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const validated = parsePostmortemReviewOutput({
    task: "postmortem_review",
    review_verdict: parsed.review_verdict,
    candidate_recommendation: parsed.candidate_recommendation,
    feedback_followup_recommendation: parsed.feedback_followup_recommendation,
    confidence: normalizeConfidence(parsed.confidence),
    reason: parsed.reason,
    review_artifact: parsed.review_artifact,
    suggestedFollowUps: parsed.suggestedFollowUps,
    candidateShapingSuggestions: parsed.candidateShapingSuggestions,
    governanceRecommendations: parsed.governanceRecommendations,
    lifecycleSuggestions: parsed.lifecycleSuggestions,
    writeBackSuggestions: parsed.writeBackSuggestions
  });

  if (isValidationFailure(validated)) {
    throw new Error(validated.detail);
  }

  return validated;
};
