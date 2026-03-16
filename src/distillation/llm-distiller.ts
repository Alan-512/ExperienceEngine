import type { ExperienceCandidate, ExperienceCandidateDraft, ExperienceInput } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { DistillationResult } from "./types.js";
import { resolveDistillerEndpoint, type DistillerEndpoint } from "./host-llm.js";

type DistillerRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetchImpl?: typeof fetch;
};

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

const DEFAULT_DISTILLER_SYSTEM_PROMPT = `You turn coding-task experience candidates into compact intervention hints.
Use hindsight framing: if the agent knew one key fact earlier, what would it do differently?

Return strict JSON with keys:
- compact_hint
- trigger_conditions
- success_criteria
- risk_level
- recommended_steps
- avoid_steps
- fallback_steps
- evidence_summary
- goal (optional)
- applicability_notes (optional)

Rules:
- Keep compact_hint to 1-2 sentences, action-oriented.
- trigger_conditions describes when to apply the hint (short phrase).
- success_criteria describes the terminal success evidence (short phrase).
- risk_level must be one of: low, medium, high.
- Preserve the original node_type intent (strategy or warning).
- Keep recommendations specific to the candidate evidence.
- Use sourceSignal (failure_signature, retry_count, correction_signals, tool_event_summary) to ground the hindsight.
- Do not invent tools or outcomes not present in the candidate.
- recommended_steps / avoid_steps / fallback_steps must be arrays of short strings.`;

const buildCandidatePayload = (candidate: ExperienceCandidate): string =>
  JSON.stringify(
    {
      nodeType: candidate.node_type,
      taskType: candidate.task_type,
      triggerPattern: candidate.trigger_pattern,
      compactHintDraft: candidate.compact_hint,
      goalDraft: candidate.goal,
      applicabilityNotesDraft: candidate.applicability_notes,
      recommendedStepsDraft: candidate.recommended_steps ?? [],
      avoidStepsDraft: candidate.avoid_steps ?? [],
      fallbackStepsDraft: candidate.fallback_steps ?? [],
      successSignalDraft: candidate.success_signal,
      stopConditionDraft: candidate.stop_condition,
      escalationConditionDraft: candidate.escalation_condition,
      evidenceSummaryDraft: candidate.evidence_summary,
      sourceSignal: candidate.source_signal
    },
    null,
    2
  );

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

const passthroughDistillation = (candidate: ExperienceCandidate): DistillationResult =>
  applyFallbacks(candidate, {});

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

  async distill(candidate: ExperienceCandidate): Promise<DistillationResult> {
    const endpoint = this.resolveEndpoint();
    if (!endpoint) {
      return passthroughDistillation(candidate);
    }

    if (endpoint.kind === "anthropic") {
      const response = await this.fetchImpl(this.buildAnthropicUrl(endpoint.baseUrl), {
        method: "POST",
        headers: endpoint.headers,
        body: JSON.stringify({
          model: endpoint.model,
          max_tokens: 900,
          system: DEFAULT_DISTILLER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildCandidatePayload(candidate) }],
          temperature: this.config.distillerProfile === "high_quality" ? 0.3 : 0.1
        })
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
      return applyFallbacks(candidate, parsed, validated);
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: DEFAULT_DISTILLER_SYSTEM_PROMPT },
      { role: "user", content: buildCandidatePayload(candidate) }
    ];

    const response = await this.fetchImpl(this.buildOpenAiUrl(endpoint.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...endpoint.headers
      },
      body: JSON.stringify({
        model: endpoint.model,
        response_format: { type: "json_object" },
        messages,
        temperature: this.config.distillerProfile === "high_quality" ? 0.3 : 0.1
      })
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
    return applyFallbacks(candidate, parsed, validated);
  }
}
