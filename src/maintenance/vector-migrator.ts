import type { DatabaseSync } from "node:sqlite";
import type { EmbeddingSpace, ExperienceNode } from "../types/domain.js";
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
   * 自动发现需要迁移的节点，并将它们的状态标记为 'pending'
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
          // 如果本身已经属于 current 了但是实际上空间不匹配，或者状态为空
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
   * 迁移单批待处理的节点。
   * 为了避免长期占用 SQLite 的排他锁，
   * 1. 我们先用一个微小的事务将 Batch 内待迁移节点锁定为 'migrating' 状态。
   * 2. 然后在事务外进行异步 embedding 生成。
   * 3. 生成好之后逐个节点用小事务提交更新。
   */
  async migrateBatch(
    db: DatabaseSync,
    currentSpace: EmbeddingSpace,
    options: MigrationOptions
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const nodeRepo = new NodeRepository(db);
    const batchSize = options.batchSize ?? 10;
    const config = options.config;

    // 1. 获取并锁定这一批节点
    const nodesToLock = withTransaction(db, () => {
      const pendingRows = db
        .prepare(
          `SELECT * FROM experience_nodes
           WHERE migration_status IN ('pending', 'failed', 'migrating')
           LIMIT ?`
        )
        .all(batchSize) as Array<Parameters<NodeRepository["mapNode"]>[0]>;

      const nodes = pendingRows.map((row) => {
        // 使用 NodeRepository 原有的 mapNode 反序列化行
        // 因为 mapNode 是 NodeRepository 的私有成员，我们在 NodeRepository 中用 public 方法包装或者直接在此调用
        // 既然 node-repo.ts 已经导出了 NodeRepository 并且 allNodes 都是反序列化的，
        // 我们可以直接从 nodeRepo.getById(row.id) 获取，但这会多次查询。
        // 不过由于 batchSize 很小，我们可以直接提取 ids 并在 repo 批量加载：
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

    // 2. 逐一执行异步重编码并单个事务更新
    for (const node of nodesToLock) {
      const retrievalText = node.retrieval_text?.trim() || `${node.trigger_pattern} ${node.compact_hint}`;

      try {
        // 调用 embedPassageText 重编码
        const embeddingResult = await embedPassageText(retrievalText, { config });

        // 3. 单个小事务写入成功状态
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

        // 3. 单个小事务写入失败状态
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
   * 自动开始整个向量迁移进程
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

      // 引入 Throttling 节流，把控制权还给事件循环
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
