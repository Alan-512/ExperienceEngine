import { nowIso } from "../utils/clock.js";
import type { ExperienceCandidate, ExperienceNode } from "../types/domain.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { CandidateRepository } from "../store/sqlite/repositories/candidate-repo.js";
import type { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type { LlmDistiller } from "../distillation/llm-distiller.js";
import { embedPassageText, withEmbeddingMetadata } from "../store/vector/embeddings.js";

export type RedistillRuleNodeReport = {
  attempted: number;
  upgraded: number;
  skippedNoCandidate: number;
  failed: number;
};

type RedistillRuleNodesOptions = {
  config: ExperienceEngineConfig;
  candidateRepo: Pick<CandidateRepository, "getById" | "listByDistilledNodeId" | "upsert">;
  nodeRepo: Pick<NodeRepository, "listAll" | "upsert">;
  distiller: Pick<LlmDistiller, "distill">;
};

const buildRetrievalText = (node: Pick<ExperienceNode, "trigger_pattern" | "compact_hint" | "goal" | "evidence_summary">): string =>
  [node.trigger_pattern, node.compact_hint, node.goal, node.evidence_summary].filter(Boolean).join("\n");

const mergeIds = (existing: string[], next: string[]): string[] => [...new Set([...existing, ...next])];

const pickCandidateForNode = (
  node: ExperienceNode,
  candidateRepo: Pick<CandidateRepository, "listByDistilledNodeId" | "getById">
): ExperienceCandidate | undefined => {
  const candidates = candidateRepo.listByDistilledNodeId(node.id);
  const distilled = candidates.find((candidate) => candidate.lifecycle_state === "distilled");
  return distilled ?? candidates[0];
};

const materializeRedistilledNode = async (
  node: ExperienceNode,
  candidate: ExperienceCandidate,
  distilled: Awaited<ReturnType<Pick<LlmDistiller, "distill">["distill"]>>,
  config: ExperienceEngineConfig
): Promise<ExperienceNode> => {
  const timestamp = nowIso();
  const retrievalText = buildRetrievalText(distilled);
  const semanticEmbedding = await embedPassageText(
    retrievalText || `${distilled.trigger_pattern}\n${distilled.compact_hint}`,
    { config }
  );

  return {
    ...node,
    ...distilled,
    id: node.id,
    retrieval_text: retrievalText,
    ...withEmbeddingMetadata(semanticEmbedding),
    source_kind: node.source_kind,
    origin_record_ids: mergeIds(node.origin_record_ids, [candidate.source_record_id]),
    distillation_mode_used: distilled.distillation_mode_used ?? "llm",
    distillation_source: distilled.distillation_source ?? node.distillation_source,
    redistilled_from: node.distillation_source ?? node.redistilled_from,
    created_at: node.created_at,
    updated_at: timestamp
  };
};

export const redistillRuleNodes = async (
  options: RedistillRuleNodesOptions
): Promise<RedistillRuleNodeReport> => {
  const report: RedistillRuleNodeReport = {
    attempted: 0,
    upgraded: 0,
    skippedNoCandidate: 0,
    failed: 0
  };

  const eligibleNodes = options.nodeRepo
    .listAll()
    .filter((node) => node.distillation_mode_used === "rule" || node.distillation_source === "rule");

  for (const node of eligibleNodes) {
    report.attempted += 1;
    const candidate = pickCandidateForNode(node, options.candidateRepo);

    if (!candidate) {
      report.skippedNoCandidate += 1;
      continue;
    }

    try {
      const distilled = await options.distiller.distill(candidate);
      const upgraded = await materializeRedistilledNode(node, candidate, distilled, options.config);
      options.nodeRepo.upsert(upgraded);
      options.candidateRepo.upsert({
        ...candidate,
        last_error: undefined,
        distilled_at: nowIso(),
        updated_at: nowIso()
      });
      report.upgraded += 1;
    } catch (error) {
      report.failed += 1;
      options.candidateRepo.upsert({
        ...candidate,
        last_error: error instanceof Error ? error.message : String(error),
        updated_at: nowIso()
      });
    }
  }

  return report;
};
