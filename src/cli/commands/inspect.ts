import { loadConfig } from "../../config/load-config.js";
import { openDatabase } from "../../store/sqlite/db.js";
import { runMigrations } from "../../store/sqlite/migrations.js";
import { InputRecordRepository } from "../../store/sqlite/repositories/input-record-repo.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";

export const runInspectCommand = (target?: string): void => {
  const db = openDatabase(loadConfig());
  runMigrations(db);
  const nodeRepo = new NodeRepository(db);
  const inputRepo = new InputRecordRepository(db);

  if (target === "--last") {
    const record = inputRepo.getLatest();
    if (!record) {
      console.log("No experience input records recorded yet.");
      return;
    }

    const injectedNodes = nodeRepo.listByIds(record.injected_node_ids);
    console.log(`Session: ${record.session_id ?? "unknown"}`);
    console.log(`Scope: ${record.scope_id}`);
    console.log(`Task type: ${record.task_type}`);
    console.log(`Intervention: ${record.injected_node_ids.length ? "inject" : "skip"}`);

    if (record.injected_node_ids.length) {
      console.log("Injected nodes:");
      for (const node of injectedNodes) {
        console.log(`- ${node.id} ${node.node_type} ${node.state}`);
      }
    }

    if (injectedNodes.length) {
      console.log("Hints:");
      for (const node of injectedNodes) {
        console.log(`- ${node.compact_hint}`);
      }
    }

    if (record.evidence.length) {
      console.log("Evidence:");
      for (const evidence of record.evidence) {
        console.log(`- ${evidence}`);
      }
    }

    console.log(`Outcome: ${record.outcome_signal}`);
    return;
  }

  if (target === "recent") {
    const records = inputRepo.listRecent();
    if (!records.length) {
      console.log("No experience input records recorded yet.");
      return;
    }

    console.table(
      records.map((record) => ({
        session: record.session_id ?? "unknown",
        task: record.task_type,
        intervention: record.injected_node_ids.length ? "inject" : "skip",
        outcome: record.outcome_signal,
        created_at: record.created_at,
        summary: record.task_summary
      }))
    );
    return;
  }

  if (target === "node") {
    console.log("Usage: ee inspect node <id>");
    return;
  }

  if (target?.startsWith("node:")) {
    const nodeId = target.slice("node:".length);
    const node = nodeRepo.getById(nodeId);
    if (!node) {
      console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
      return;
    }

    console.log(`Node: ${node.id}`);
    console.log(`Type: ${node.node_type}`);
    console.log(`Task type: ${node.task_type}`);
    console.log(`State: ${node.state}`);
    console.log(`Scope: ${node.scope_id}`);
    console.log(`Helped: ${node.helped_count}`);
    console.log(`Harmed: ${node.harmed_count}`);
    console.log(`Used: ${node.usage_count}`);
    console.log(`Hint: ${node.compact_hint}`);
    if (node.goal) {
      console.log(`Goal: ${node.goal}`);
    }
    if (node.applicability_notes) {
      console.log(`Applicability: ${node.applicability_notes}`);
    }
    console.log(`Success signal: ${node.success_signal}`);
    console.log(`Evidence: ${node.evidence_summary}`);
    if (node.recommended_steps?.length) {
      console.log("Recommended steps:");
      for (const step of node.recommended_steps) {
        console.log(`- ${step}`);
      }
    }
    return;
  }

  const nodes = target === "active" ? nodeRepo.listActive() : nodeRepo.listAll();
  if (!nodes.length) {
    console.log(target === "active" ? "No active experience nodes stored yet." : "No experience nodes stored yet.");
    return;
  }

  console.table(
    nodes.map((node) => ({
      id: node.id,
      type: node.node_type,
      task: node.task_type,
      state: node.state,
      helped: node.helped_count,
      harmed: node.harmed_count,
      last_used: node.last_used_at ?? "",
      hint: node.compact_hint
    }))
  );
};
