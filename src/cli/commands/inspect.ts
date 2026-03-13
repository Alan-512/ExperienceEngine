import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";
import type { ExperienceNode } from "../../types/domain.js";

const NODE_STATES: ExperienceNode["state"][] = ["candidate", "active", "cooling", "retired"];
const NODE_TYPES: ExperienceNode["node_type"][] = ["strategy", "warning"];

const parseRecentArgs = (arg1?: string, arg2?: string): { injectedOnly: boolean; limit: number } | null => {
  const values = [arg1, arg2].filter((value): value is string => Boolean(value));
  let injectedOnly = false;
  let limit = 10;

  for (const value of values) {
    if (value === "injected") {
      injectedOnly = true;
      continue;
    }

    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = parsed;
      continue;
    }

    return null;
  }

  return { injectedOnly, limit };
};

export const runInspectCommand = (target?: string, arg1?: string, arg2?: string): void => {
  const interaction = new ExperienceInteractionService(loadConfig());

  if (target === "--last") {
    const record = interaction.inspectLast();
    if (!record) {
      console.log("No experience input records recorded yet.");
      return;
    }

    console.log(`Session: ${record.sessionId ?? "unknown"}`);
    console.log(`Scope: ${record.scopeId}`);
    console.log(`Task type: ${record.taskType}`);
    console.log(`Intervention: ${record.intervention}`);

    if (record.injectedNodes.length) {
      console.log("Injected nodes:");
      for (const node of record.injectedNodes) {
        console.log(`- ${node.id} ${node.type} ${node.state}`);
      }
    }

    if (record.hints.length) {
      console.log("Hints:");
      for (const hint of record.hints) {
        console.log(`- ${hint}`);
      }
    }

    if (record.evidence.length) {
      console.log("Evidence:");
      for (const evidence of record.evidence) {
        console.log(`- ${evidence}`);
      }
    }

    console.log(`Outcome: ${record.outcome}`);
    return;
  }

  if (target === "recent") {
    const parsed = parseRecentArgs(arg1, arg2);
    if (!parsed) {
      console.log("Usage: ee inspect recent [injected] [limit]");
      return;
    }

    const records = interaction.inspectRecent({
      injectedOnly: parsed.injectedOnly,
      limit: parsed.limit
    });
    if (!records.length) {
      console.log("No experience input records recorded yet.");
      return;
    }

    console.table(
      records.map((record) => ({
        session: record.sessionId ?? "unknown",
        task: record.taskType,
        intervention: record.intervention,
        outcome: record.outcome,
        created_at: record.createdAt,
        summary: record.summary
      }))
    );
    return;
  }

  if (target === "node") {
    console.log("Usage: ee inspect node <id>");
    return;
  }

  if (target === "state") {
    if (!arg1 || !NODE_STATES.includes(arg1 as ExperienceNode["state"])) {
      console.log("Usage: ee inspect state <candidate|active|cooling|retired>");
      return;
    }

    const nodes = interaction.listNodesByState(arg1 as ExperienceNode["state"]);
    if (!nodes.length) {
      console.log(`No ${arg1} experience nodes stored yet.`);
      return;
    }

    console.table(
      nodes.map((node) => ({
        id: node.id,
        type: node.type,
        task: node.taskType,
        state: node.state,
        helped: node.helped,
        harmed: node.harmed,
        last_used: node.lastUsedAt ?? "",
        hint: node.hint
      }))
    );
    return;
  }

  if (target === "type") {
    if (!arg1 || !NODE_TYPES.includes(arg1 as ExperienceNode["node_type"])) {
      console.log("Usage: ee inspect type <strategy|warning>");
      return;
    }

    const nodes = interaction.listNodesByType(arg1 as ExperienceNode["node_type"]);
    if (!nodes.length) {
      console.log(`No ${arg1} experience nodes stored yet.`);
      return;
    }

    console.table(
      nodes.map((node) => ({
        id: node.id,
        type: node.type,
        task: node.taskType,
        state: node.state,
        helped: node.helped,
        harmed: node.harmed,
        last_used: node.lastUsedAt ?? "",
        hint: node.hint
      }))
    );
    return;
  }

  if (target?.startsWith("node:")) {
    const nodeId = target.slice("node:".length);
    const node = interaction.inspectNode(nodeId);
    if (!node) {
      console.log(`[ExperienceEngine] Node ${nodeId} was not found.`);
      return;
    }

    console.log(`Node: ${node.id}`);
    console.log(`Type: ${node.type}`);
    console.log(`Task type: ${node.taskType}`);
    console.log(`State: ${node.state}`);
    console.log(`Scope: ${node.scopeId}`);
    console.log(`Helped: ${node.helped}`);
    console.log(`Harmed: ${node.harmed}`);
    console.log(`Used: ${node.used}`);
    console.log(`Hint: ${node.hint}`);
    if (node.goal) {
      console.log(`Goal: ${node.goal}`);
    }
    if (node.applicability) {
      console.log(`Applicability: ${node.applicability}`);
    }
    console.log(`Success signal: ${node.successSignal}`);
    console.log(`Evidence: ${node.evidence}`);
    if (node.recommendedSteps.length) {
      console.log("Recommended steps:");
      for (const step of node.recommendedSteps) {
        console.log(`- ${step}`);
      }
    }
    return;
  }

  const rows = target === "active" ? interaction.listActiveNodes() : interaction.listAllNodes();
  if (!rows.length) {
    console.log(target === "active" ? "No active experience nodes stored yet." : "No experience nodes stored yet.");
    return;
  }

  console.table(
    rows.map((node) => ({
      id: node.id,
      type: node.type,
      task: node.taskType,
      state: node.state,
      helped: node.helped,
      harmed: node.harmed,
      last_used: node.lastUsedAt ?? "",
      hint: node.hint
    }))
  );
};
