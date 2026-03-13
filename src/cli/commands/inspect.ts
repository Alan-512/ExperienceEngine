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
