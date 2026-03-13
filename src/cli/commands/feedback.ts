import { loadConfig } from "../../config/load-config.js";
import { nowIso } from "../../utils/clock.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { InputRecordRepository } from "../../store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";
import type { ExperienceNode } from "../../types/domain.js";

type FeedbackValue = "helped" | "harmed";

const applyNodeFeedback = (node: ExperienceNode, feedback: FeedbackValue): ExperienceNode => {
  const timestamp = nowIso();

  return {
    ...node,
    helped_count: feedback === "helped" ? node.helped_count + 1 : node.helped_count,
    harmed_count: feedback === "harmed" ? node.harmed_count + 1 : node.harmed_count,
    last_helped_at: feedback === "helped" ? timestamp : node.last_helped_at,
    last_harmed_at: feedback === "harmed" ? timestamp : node.last_harmed_at,
    updated_at: timestamp
  };
};

export const runFeedbackCommand = (target?: string, reference?: string, feedback?: string): void => {
  if (target !== "--last" && target !== "node") {
    console.log("Usage: ee feedback --last helped|harmed | ee feedback node <id> helped|harmed");
    return;
  }

  const feedbackValue =
    target === "--last" ? reference : feedback;

  if (feedbackValue !== "helped" && feedbackValue !== "harmed") {
    console.log("Usage: ee feedback --last helped|harmed | ee feedback node <id> helped|harmed");
    return;
  }

  const db = openDatabase(loadConfig());
  runMigrations(db);
  const nodeRepo = new NodeRepository(db);
  const inputRepo = new InputRecordRepository(db);

  if (target === "--last") {
    const record = inputRepo.getLatestInjected();
    if (!record) {
      console.log("[ExperienceEngine] No injected experience found for the last task.");
      return;
    }

    const nodes = nodeRepo.listByIds(record.injected_node_ids);
    if (!nodes.length) {
      console.log("[ExperienceEngine] No injected experience nodes were found for the last task.");
      return;
    }

    for (const node of nodes) {
      nodeRepo.upsert(applyNodeFeedback(node, feedbackValue));
    }

    console.log(
      `[ExperienceEngine] Recorded feedback for the last injected experience: ${feedbackValue}.`
    );
    return;
  }

  const nodeId = reference;
  if (!nodeId) {
    console.log("Usage: ee feedback --last helped|harmed | ee feedback node <id> helped|harmed");
    return;
  }

  const node = nodeRepo.getById(nodeId);
  if (!node) {
    console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
    return;
  }

  nodeRepo.upsert(applyNodeFeedback(node, feedbackValue));
  console.log(`[ExperienceEngine] Recorded feedback for node ${nodeId}: ${feedbackValue}.`);
};
