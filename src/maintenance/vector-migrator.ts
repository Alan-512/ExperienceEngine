import type { DatabaseSync } from "node:sqlite";
import type { ExperienceNode } from "../types/domain.js";
import type { EmbeddingSpace } from "../store/vector/embeddings.js";
import { embedPassageText } from "../store/vector/embeddings.js";
import { withTransaction } from "../store/sqlite/db.js";
import { NodeRepository } from "../store/sqlite/repositories/node-repo.js";
import type { ExperienceEngineConfig } from "../config/config-schema.js";

export type MigrationOptions = {
  config: ExperienceEngineConfig;
  batchSize?: number;
  throttleGapMs?: number;
  maxTotalToProcess?: number;
};

export type MigrationReport = {
  totalDiscovered: number;
  processed: number;
  succeeded: number;
  failed: number;
};

export class VectorMigrationPipeline {
  /**
   * Automatically discovers experience nodes that need migration and marks their status as 'pending'.
   */
  discoverPendingNodes(db: DatabaseSync, currentSpace: EmbeddingSpace): number {
    const nodeRepo = new NodeRepository(db);
    const allNodes = nodeRepo.listAll();
    let pendingCount = 0;

    withTransaction(db, () => {
      for (const node of allNodes) {
        const spaceMismatched =
          node.embedding_provider !== currentSpace.provider ||
          node.embedding_model !== currentSpace.model ||
          node.embedding_version !== currentSpace.version ||
          node.embedding_dimensions !== currentSpace.dimensions ||
          (node.embedding_manifest_id ?? undefined) !== (currentSpace.manifestId ?? undefined);

        const needsStatusUpdate = node.migration_status !== "current";

        if (spaceMismatched || needsStatusUpdate) {
          // If the node status is current but its space is mismatched, or if its status is empty
          if (node.migration_status !== "pending") {
            const updatedNode: ExperienceNode = {
              ...node,
              migration_status: "pending",
              migration_updated_at: new Date().toISOString()
            };
            nodeRepo.upsert(updatedNode);
            pendingCount += 1;
          } else {
            pendingCount += 1;
          }
        }
      }
    });

    return pendingCount;
  }

  /**
   * Migrates a single batch of pending experience nodes.
   * To prevent long-held SQLite exclusive locks:
   * 1. A short transaction locks the batch's target nodes to 'migrating' status.
   * 2. Asynchronous embedding generation is performed outside the transaction.
   * 3. Successful/failed node updates are committed one-by-one with small transactions.
   */
  async migrateBatch(
    db: DatabaseSync,
    currentSpace: EmbeddingSpace,
    options: MigrationOptions
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const nodeRepo = new NodeRepository(db);
    const batchSize = options.batchSize ?? 10;
    const config = options.config;

    // 1. Retrieve and lock this batch of nodes
    const nodesToLock = withTransaction(db, () => {
      const pendingRows = db
        .prepare(
          `SELECT * FROM experience_nodes
           WHERE migration_status = 'pending'
           LIMIT ?`
        )
        .all(batchSize) as Array<Parameters<NodeRepository["mapNode"]>[0]>;

      const nodes = pendingRows.map((row) => {
        // Deserialize the database row using NodeRepository.
        // Since mapNode is private to NodeRepository, we retrieve via nodeRepo.getById.
        // Because the batchSize is small, loading individually by ID is simple and safe.
        return nodeRepo.getById(row.id);
      }).filter(Boolean) as ExperienceNode[];

      for (const node of nodes) {
        nodeRepo.upsert({
          ...node,
          migration_status: "migrating",
          migration_updated_at: new Date().toISOString()
        });
      }

      return nodes;
    });

    if (nodesToLock.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    // 2. Perform asynchronous re-encoding one by one and commit with individual transactions
    for (const node of nodesToLock) {
      const retrievalText = node.retrieval_text?.trim() || `${node.trigger_pattern} ${node.compact_hint}`;

      try {
        // Call embedPassageText to re-encode the text
        const embeddingResult = await embedPassageText(retrievalText, { config });

        const spaceMatched =
          embeddingResult.space.provider === currentSpace.provider &&
          embeddingResult.space.model === currentSpace.model &&
          embeddingResult.space.version === currentSpace.version &&
          embeddingResult.space.dimensions === currentSpace.dimensions &&
          (embeddingResult.space.manifestId ?? undefined) === (currentSpace.manifestId ?? undefined);

        if (!spaceMatched) {
          throw new Error(
            `Migration fallback detected: re-encoded space ${embeddingResult.space.provider}/${embeddingResult.space.model} does not match target space ${currentSpace.provider}/${currentSpace.model}`
          );
        }

        // 3. Commit successful migration in a small transaction
        withTransaction(db, () => {
          const freshNode = nodeRepo.getById(node.id);
          if (freshNode) {
            nodeRepo.upsert({
              ...freshNode,
              embedding: embeddingResult.embedding,
              embedding_provider: embeddingResult.space.provider,
              embedding_model: embeddingResult.space.model,
              embedding_version: embeddingResult.space.version,
              embedding_dimensions: embeddingResult.space.dimensions,
              embedding_manifest_id: embeddingResult.space.manifestId,
              migration_status: "current",
              migration_last_error: undefined,
              migration_updated_at: new Date().toISOString()
            });
          }
        });

        succeeded += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.stack || error.message : String(error);

        // 3. Commit failed migration status in a small transaction
        withTransaction(db, () => {
          const freshNode = nodeRepo.getById(node.id);
          if (freshNode) {
            nodeRepo.upsert({
              ...freshNode,
              migration_status: "failed",
              migration_last_error: errorMessage,
              migration_updated_at: new Date().toISOString()
            });
          }
        });

        failed += 1;
      }
    }

    return {
      processed: nodesToLock.length,
      succeeded,
      failed
    };
  }

  /**
   * Automatically initiates the entire vector migration pipeline.
   */
  async runMigration(
    db: DatabaseSync,
    currentSpace: EmbeddingSpace,
    options: MigrationOptions
  ): Promise<MigrationReport> {
    const totalDiscovered = this.discoverPendingNodes(db, currentSpace);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    const maxTotalToProcess = options.maxTotalToProcess ?? Infinity;
    const throttleGapMs = options.throttleGapMs ?? 50;

    while (processed < maxTotalToProcess) {
      const remainingLimit = maxTotalToProcess - processed;
      const currentBatchSize = Math.min(options.batchSize ?? 10, remainingLimit);

      const batchResult = await this.migrateBatch(db, currentSpace, {
        ...options,
        batchSize: currentBatchSize
      });

      if (batchResult.processed === 0) {
        break;
      }

      processed += batchResult.processed;
      succeeded += batchResult.succeeded;
      failed += batchResult.failed;

      // Apply throttling to yield execution back to the event loop
      if (throttleGapMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, throttleGapMs));
      }
    }

    return {
      totalDiscovered,
      processed,
      succeeded,
      failed
    };
  }
}
