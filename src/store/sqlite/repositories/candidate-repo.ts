import type { DatabaseSync } from "node:sqlite";
import type { ExperienceNode } from "../../../types/domain.js";
import { NodeRepository } from "./node-repo.js";

export class CandidateRepository {
  constructor(private readonly db: DatabaseSync) {
    this.nodeRepo = new NodeRepository(db);
  }

  private readonly nodeRepo: NodeRepository;

  listByScope(scopeId: string): ExperienceNode[] {
    return this.nodeRepo
      .listAll()
      .filter(
        (node) =>
          node.scope_id === scopeId && (node.state === "candidate" || node.state === "active" || node.state === "cooling")
      );
  }
}
