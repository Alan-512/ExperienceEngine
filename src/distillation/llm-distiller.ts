import type { ExperienceCandidate, ExperienceCandidateDraft, ExperienceInput } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { DistillationResult } from "./types.js";
import {
  resolveDistillationResolution,
  resolveDistillerEndpoint,
  type DistillationResolution,
  type DistillerEndpoint
} from "./host-llm.js";
import { runCodexMediatedDistillation } from "./codex-mediated.js";
import { DEFAULT_DISTILLER_SYSTEM_PROMPT, buildCandidatePayload } from "./prompt-contract.js";
import type { CodexExecRunner } from "../install/codex-cli.js";

type DistillerRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
  codexExecRunner?: CodexExecRunner;
};

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

const DISTILLATION_REQUEST_TIMEOUT_MS = 25_000;

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
      homeDir: this.options.homeDir,
      distillationMode: this.config.distillationMode,
      hostLlmMode: this.config.hostLlmMode,
      allowRuleFallback: this.config.distillationAllowPassthrough
    });
  }

  private resolveEndpoint(): DistillerEndpoint | null {
    return resolveDistillerEndpoint({ env: this.env, homeDir: this.options.homeDir });
  }

  private buildOpenAiUrl(baseUrl: string): string {
    if (/\/chat\/completions\/?$/.test(baseUrl)) {
      return baseUrl;
    }
    if (/\/v1\/?$/.test(baseUrl)) {
      return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    }
    return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }

  private buildAnthropicUrl(baseUrl: string): string {
    if (/\/v1\/messages\/?$/.test(baseUrl)) {
      return baseUrl;
    }
    if (/\/v1\/?$/.test(baseUrl)) {
      return `${baseUrl.replace(/\/$/, "")}/messages`;
    }
    return `${baseUrl.replace(/\/$/, "")}/v1/messages`;
  }

  private async postJson(
    url: string,
    endpoint: DistillerEndpoint,
    body: Record<string, unknown>
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: "POST",
        headers:
          endpoint.kind === "openai"
            ? {
                "Content-Type": "application/json",
                ...endpoint.headers
              }
            : endpoint.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DISTILLATION_REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      if (
        (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
        (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "TimeoutError")
      ) {
        throw new Error(`Distillation request timed out after ${DISTILLATION_REQUEST_TIMEOUT_MS}ms`);
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
    const hostResolution = resolution.host;
    if (hostResolution && hostResolution.mode === "mediated") {
      const parsed = await runCodexMediatedDistillation(candidate, {
        env: this.env,
        timeoutMs: this.config.hostLlmMediatedTimeoutMs,
        runner: this.options.codexExecRunner
      });
      const validated = validateDistillationPayload(parsed);
      return {
        ...applyFallbacks(candidate, parsed, validated),
        distillation_mode_used: "llm",
        distillation_source: resolution.distillationSource
      };
    }
    const endpoint = resolution.endpoint;
    if (!endpoint) {
      throw new Error("Distillation resolution did not provide a reusable endpoint.");
    }

    if (endpoint.kind === "anthropic") {
      const response = await this.postJson(this.buildAnthropicUrl(endpoint.baseUrl), endpoint, {
          model: endpoint.model,
          max_tokens: 900,
          system: DEFAULT_DISTILLER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildCandidatePayload(candidate) }],
          temperature: resolveTemperature(this.config.distillerProfile)
      });

      if (!response.ok) {
        throw new Error(`Distillation request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        choices?: Array<{ message?: { content?: string } }>;
      };
      let text = payload.content?.find((entry) => entry.type === "text")?.text;
      if (!text) {
        text = payload.choices?.[0]?.message?.content;
      }
      if (!text) {
        throw new Error("Distillation response did not include a message payload");
      }

      const parsed = JSON.parse(text) as Record<string, unknown>;
      const validated = validateDistillationPayload(parsed);
      return {
        ...applyFallbacks(candidate, parsed, validated),
        distillation_mode_used: "llm",
        distillation_source: resolution.distillationSource
      };
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: DEFAULT_DISTILLER_SYSTEM_PROMPT },
      { role: "user", content: buildCandidatePayload(candidate) }
    ];

    const response = await this.postJson(this.buildOpenAiUrl(endpoint.baseUrl), endpoint, {
        model: endpoint.model,
        response_format: { type: "json_object" },
        messages,
        temperature: resolveTemperature(this.config.distillerProfile)
    });

    if (!response.ok) {
      throw new Error(`Distillation request failed with ${response.status}`);
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

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const validated = validateDistillationPayload(parsed);
    return {
      ...applyFallbacks(candidate, parsed, validated),
      distillation_mode_used: "llm",
      distillation_source: resolution.distillationSource
    };
  }
}
