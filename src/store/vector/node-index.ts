import type { ExperienceNode } from "../../types/domain.js";
import { buildLegacyEmbedding, isCompatibleEmbedding } from "./embeddings.js";
import { openVectorStore } from "./lancedb.js";

export class NodeIndex {
  private readonly index = new Map<string, number[]>();
  private readonly store = openVectorStore();

  upsert(node: ExperienceNode): void {
    const embedding = isCompatibleEmbedding(node.embedding)
      ? node.embedding
      : buildLegacyEmbedding(node.retrieval_text ?? `${node.trigger_pattern} ${node.compact_hint}`).embedding;
    this.index.set(node.id, embedding);
  }

  query(summary: string, limit = 8): Array<{ id: string; score: number }> {
    const queryEmbedding = buildLegacyEmbedding(summary).embedding;
    return this.store.query(
      [...this.index.entries()].map(([id, embedding]) => ({
        id,
        embedding
      })),
      queryEmbedding,
      limit
    );
  }

  get size(): number {
    return this.index.size;
  }
}
