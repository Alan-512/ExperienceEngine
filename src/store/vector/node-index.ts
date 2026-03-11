import type { ExperienceNode } from "../../types/domain.js";
import { embedText } from "./embeddings.js";

export class NodeIndex {
  private readonly index = new Map<string, number[]>();

  async upsert(node: ExperienceNode): Promise<void> {
    this.index.set(node.id, await embedText(`${node.trigger_pattern} ${node.compact_hint}`));
  }

  get size(): number {
    return this.index.size;
  }
}

