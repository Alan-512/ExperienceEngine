
import type { ExperienceCandidate, ExperienceCandidateDraft, ExperienceNode } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import {
  resolveDistillationResolution,
  resolveDistillerEndpoints,
  type DistillationResolution,
  type DistillerEndpoint
} from "./host-llm.js";
import { LlmRequestDispatcher } from "./llm-request-dispatcher.js";
import { resolveExperienceFamily } from "./experience-family.js";

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



const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const isMergeAction = (value: unknown): value is MergeAction =>
  value === "ADD" || value === "UPDATE" || value === "NONE";



const buildMergePayload = (
  candidate: ExperienceCandidate,
  distilled: ExperienceCandidateDraft,
  existingNodes: ExperienceNode[]
): string =>
  JSON.stringify(
    {
      candidate: {
        taskType: candidate.task_type,
        taskFamily: resolveExperienceFamily(candidate.task_type),
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
        task_family: resolveExperienceFamily(distilled.task_type),
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
        task_family: resolveExperienceFamily(node.task_type),
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
      configAuthMode: this.config.distillationAuthMode,
      configModel: this.config.distillerModel,
      distillationMode: this.config.distillationMode,
      allowRuleFallback: this.config.distillationAllowPassthrough
    });
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

    const endpoints = resolveDistillerEndpoints({
      env: this.env,
      configProvider: this.config.distillerProvider,
      configAuthMode: this.config.distillationAuthMode,
      configModel: this.config.distillerModel,
      configFallbackChain: this.config.distillationFallbackChain
    });

    if (endpoints.length === 0) {
      return fallback;
    }

    const content = await LlmRequestDispatcher.execute(endpoints, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildMergePayload(candidate, distilled, existingNodes),
      temperature: 0,
      responseJson: true,
      fetchImpl: this.fetchImpl,
      env: this.env,
      fallbackCodes: this.config.distillationFallbackCodes
    });

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
