import type { ExperienceCandidate, ExperienceCandidateDraft, ExperienceInput } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { DistillationResult } from "./types.js";

type DistillerRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

const DEFAULT_DISTILLER_SYSTEM_PROMPT = `You turn coding-task experience candidates into compact intervention hints.
Return strict JSON with keys:
- compact_hint
- applicability_notes
- goal
- recommended_steps
- avoid_steps
- fallback_steps
- success_signal
- stop_condition
- escalation_condition
- evidence_summary

Rules:
- Keep compact_hint to 1-2 sentences.
- Preserve the original node_type intent (strategy or warning).
- Keep recommendations specific to the candidate evidence.
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

const applyFallbacks = (candidate: ExperienceCandidate, parsed: Record<string, unknown>): DistillationResult => ({
  node_type: candidate.node_type,
  scope_id: candidate.scope_id,
  task_type: candidate.task_type,
  trigger_pattern: candidate.trigger_pattern,
  applicability_notes: pickString(parsed.applicability_notes) ?? candidate.applicability_notes,
  env_signature: candidate.env_signature,
  compact_hint: pickString(parsed.compact_hint) ?? candidate.compact_hint,
  goal: pickString(parsed.goal) ?? candidate.goal,
  recommended_steps: parseArray(parsed.recommended_steps) ?? candidate.recommended_steps,
  avoid_steps: parseArray(parsed.avoid_steps) ?? candidate.avoid_steps,
  fallback_steps: parseArray(parsed.fallback_steps) ?? candidate.fallback_steps,
  success_signal: pickString(parsed.success_signal) ?? candidate.success_signal,
  stop_condition: pickString(parsed.stop_condition) ?? candidate.stop_condition,
  escalation_condition: pickString(parsed.escalation_condition) ?? candidate.escalation_condition,
  evidence_summary: pickString(parsed.evidence_summary) ?? candidate.evidence_summary,
  retrieval_text: candidate.retrieval_text,
  source_kind: candidate.source_kind
});

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

  private get model(): string | undefined {
    return this.env.EXPERIENCE_ENGINE_DISTILLER_MODEL;
  }

  private get apiKey(): string | undefined {
    return this.env.EXPERIENCE_ENGINE_DISTILLER_API_KEY;
  }

  private get baseUrl(): string {
    return this.env.EXPERIENCE_ENGINE_DISTILLER_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
  }

  private shouldUseRemoteDistiller(): boolean {
    return Boolean(this.model && this.apiKey);
  }

  async distill(candidate: ExperienceCandidate): Promise<DistillationResult> {
    if (!this.shouldUseRemoteDistiller()) {
      return passthroughDistillation(candidate);
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: DEFAULT_DISTILLER_SYSTEM_PROMPT },
      { role: "user", content: buildCandidatePayload(candidate) }
    ];

    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
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
    return applyFallbacks(candidate, parsed);
  }
}
