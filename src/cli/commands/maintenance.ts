import { loadConfig } from "../../config/load-config.js";
import { resolveDistillationResolution } from "../../distillation/host-llm.js";
import { LlmDistiller } from "../../distillation/llm-distiller.js";
import { resolveScope } from "../../input/scope-resolver.js";
import { runClaudePrintValidation } from "../../maintenance/claude-validate-print.js";
import { drainDueHygieneGovernance } from "../../maintenance/hygiene-governance-scheduler.js";
import { redistillRuleNodes } from "../../maintenance/redistill-rule-nodes.js";
import { mergeScopesWithConfig } from "../../maintenance/scope-merge.js";
import { runEmbeddingSmoke, type EmbeddingSmokeReport } from "../../maintenance/embedding-smoke.js";
import { bootstrapDatabase, openDatabase } from "../../store/sqlite/db.js";
import { CandidateRepository } from "../../store/sqlite/repositories/candidate-repo.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";
import { resetManagedEmbeddingCache } from "../../store/vector/local-provider.js";
import { VectorMigrationPipeline } from "../../maintenance/vector-migrator.js";
import { embedQueryText } from "../../store/vector/embeddings.js";

type MaintenanceDeps = {
  loadConfig?: typeof loadConfig;
  resolveDistillationResolution?: typeof resolveDistillationResolution;
  resetManagedEmbeddingCache?: typeof resetManagedEmbeddingCache;
  redistillRuleNodes?: typeof redistillRuleNodes;
  claudeValidatePrint?: typeof runClaudePrintValidation;
  mergeScopesWithConfig?: typeof mergeScopesWithConfig;
  embeddingSmoke?: (config: ReturnType<typeof loadConfig>) => Promise<EmbeddingSmokeReport>;
};

const parseGovernanceDrainArgs = (args: string[]): { cwd?: string; maxActions?: number } | null => {
  if (args[0] !== "drain") {
    return null;
  }
  const parsed: { cwd?: string; maxActions?: number } = {};
  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];
    if (value === "--cwd" && next) {
      parsed.cwd = next;
      index += 1;
      continue;
    }
    if (value === "--max-actions" && next) {
      const maxActions = Number(next);
      if (Number.isInteger(maxActions) && maxActions > 0) {
        parsed.maxActions = maxActions;
        index += 1;
        continue;
      }
    }
    return null;
  }
  return parsed;
};

const parseMigrateArgs = (args: string[]): { batchSize?: number; throttleGapMs?: number; maxTotal?: number } => {
  const parsed: { batchSize?: number; throttleGapMs?: number; maxTotal?: number } = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];
    if (value === "--batch-size" && next) {
      const batchSize = Number(next);
      if (Number.isInteger(batchSize) && batchSize > 0) {
        parsed.batchSize = batchSize;
        index += 1;
        continue;
      }
    }
    if (value === "--throttle-gap" && next) {
      const throttleGap = Number(next);
      if (Number.isInteger(throttleGap) && throttleGap >= 0) {
        parsed.throttleGapMs = throttleGap;
        index += 1;
        continue;
      }
    }
    if (value === "--max-total" && next) {
      const maxTotal = Number(next);
      if (Number.isInteger(maxTotal) && maxTotal > 0) {
        parsed.maxTotal = maxTotal;
        index += 1;
        continue;
      }
    }
  }
  return parsed;
};

export const runMaintenanceCommand = async (
  action?: string,
  argsOrDeps: string[] | MaintenanceDeps = [],
  maybeDeps: MaintenanceDeps = {}
): Promise<void> => {
  const args = Array.isArray(argsOrDeps) ? argsOrDeps : [];
  const deps = Array.isArray(argsOrDeps) ? maybeDeps : argsOrDeps;
  const config = (deps.loadConfig ?? loadConfig)();

  if (action === "embeddings-reset") {
    const report = await (deps.resetManagedEmbeddingCache ?? resetManagedEmbeddingCache)({ config });

    console.log(`[ExperienceEngine] Cleared embedding cache: ${report.cacheDir}`);
    if (!report.rebuilt) {
      console.log("[ExperienceEngine] Managed local embeddings are disabled; cache rebuild was skipped.");
      return;
    }

    console.log(
      `[ExperienceEngine] Rebuilt managed embedding cache with ${report.model} (${report.dimensions} dimensions).`
    );
    return;
  }

  if (action === "embedding-smoke") {
    const report = await (deps.embeddingSmoke ?? ((resolvedConfig) => runEmbeddingSmoke(resolvedConfig)))(config);
    console.log(
      `[ExperienceEngine] Embedding smoke complete for ${report.provider}/${report.model}.`
    );
    console.log(
      `[ExperienceEngine] Query cold=${report.coldQueryMs}ms warm=${report.warmQueryMs}ms`
    );
    console.log(
      `[ExperienceEngine] Passage cold=${report.coldPassageMs}ms warm=${report.warmPassageMs}ms`
    );
    return;
  }

  if (action === "governance") {
    const parsed = parseGovernanceDrainArgs(args);
    if (!parsed) {
      console.log("Usage: ee maintenance governance drain [--cwd <path>] [--max-actions <n>]");
      return;
    }
    const scopeId = resolveScope(parsed.cwd ?? process.cwd()).scope_id;
    const db = openDatabase(config);
    bootstrapDatabase(db);
    try {
      const result = await drainDueHygieneGovernance(db, {
        scopeId,
        maxActions: parsed.maxActions
      });
      const appliedActions = db
        .prepare("SELECT COUNT(*) AS count FROM hygiene_governance_actions WHERE scope_id = ? AND status = 'applied'")
        .get(scopeId) as { count: number };
      console.log(`[ExperienceEngine] Governance drain completed for ${scopeId}: ${result.status}.`);
      if (result.status === "deferred") {
        console.log(`[ExperienceEngine] Governance drain deferred: ${result.reason}.`);
      }
      if (result.status === "failed") {
        console.log(`[ExperienceEngine] Governance drain failed: ${result.failureClass} ${result.message}`);
      }
      console.log(`[ExperienceEngine] Recent applied actions: ${appliedActions.count}`);
    } finally {
      db.close();
    }
    return;
  }

  if (action === "redistill-rule-nodes") {
    const resolution = (deps.resolveDistillationResolution ?? resolveDistillationResolution)({
      env: process.env,
      configProvider: config.distillerProvider,
      configAuthMode: config.distillationAuthMode,
      configModel: config.distillerModel,
      distillationMode: config.distillationMode,
      allowRuleFallback: config.distillationAllowPassthrough
    });

    if (resolution.distillationMode !== "llm") {
      console.log(
        `[ExperienceEngine] Rule node re-distillation requires llm mode; current mode is ${resolution.distillationMode}.`
      );
      if (resolution.reason) {
        console.log(`[ExperienceEngine] ${resolution.reason}`);
      }
      return;
    }

    const report =
      deps.redistillRuleNodes
        ? await deps.redistillRuleNodes({
            config,
            candidateRepo: undefined as never,
            nodeRepo: undefined as never,
            distiller: undefined as never
          } as never)
        : await (async () => {
            const db = openDatabase(config);
            bootstrapDatabase(db);
            try {
              return await redistillRuleNodes({
                config,
                candidateRepo: new CandidateRepository(db),
                nodeRepo: new NodeRepository(db),
                distiller: new LlmDistiller(config)
              });
            } finally {
              db.close();
            }
          })();

    console.log(
      `[ExperienceEngine] Re-distilled rule-promoted nodes with source: ${resolution.distillationSource}`
    );
    console.log(
      `[ExperienceEngine] Attempted: ${report.attempted} | Upgraded: ${report.upgraded} | Skipped (no candidate): ${report.skippedNoCandidate} | Failed: ${report.failed}`
    );
    return;
  }

  if (action === "claude-validate-print") {
    const report = await (deps.claudeValidatePrint ?? runClaudePrintValidation)();
    console.log("[ExperienceEngine] Claude print validation complete.");
    console.log(`[ExperienceEngine] Exit code: ${report.exitCode ?? "null"}`);
    console.log(`[ExperienceEngine] Stdout empty: ${report.stdout.trim().length === 0 ? "yes" : "no"}`);
    console.log(`[ExperienceEngine] Transcript: ${report.transcriptPath ?? "not found"}`);
    console.log(
      `[ExperienceEngine] Target tool seen: ${report.toolSeen ? "yes" : "no"} (${report.targetToolName})`
    );
    console.log(`[ExperienceEngine] Tool result seen: ${report.toolResultSeen ? "yes" : "no"}`);
    console.log(
      `[ExperienceEngine] MCP server exposes target tool: ${report.mcpServerToolAvailable ? "yes" : "no"}`
    );
    if (report.mcpServerError) {
      console.log(`[ExperienceEngine] MCP server check error: ${report.mcpServerError}`);
    }
    if (report.usedTranscriptConclusion && report.assistantText) {
      console.log(`[ExperienceEngine] Transcript conclusion: ${report.assistantText}`);
    }
    return;
  }

  if (action === "merge-scope") {
    const [sourceScopeId, targetScopeId] = args;
    if (!sourceScopeId || !targetScopeId) {
      console.log("[ExperienceEngine] merge-scope requires <sourceScopeId> <targetScopeId>.");
      console.log(
        "Usage: ee maintenance embeddings-reset|embedding-smoke|governance drain|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>|migrate [--batch-size <n>] [--throttle-gap <ms>] [--max-total <n>]"
      );
      return;
    }

    const report = (deps.mergeScopesWithConfig ?? mergeScopesWithConfig)(config, sourceScopeId, targetScopeId);
    console.log(`[ExperienceEngine] Merged scope ${report.sourceScopeId} into ${report.targetScopeId}.`);
    console.log(
      `[ExperienceEngine] Moved: records=${report.moved.inputRecords} taskRuns=${report.moved.taskRuns} injections=${report.moved.injections} nodes=${report.moved.nodes} candidates=${report.moved.candidates}`
    );
    console.log(
      `[ExperienceEngine] Merged aggregates: taskStats=${report.merged.taskStats}`
    );
    return;
  }

  if (action === "migrate") {
    const parsed = parseMigrateArgs(args);

    console.log("[ExperienceEngine] Detecting active embedding space...");
    let currentSpace;
    try {
      const probeResult = await embedQueryText("migration_probe", { config });
      currentSpace = probeResult.space;
      console.log(
        `[ExperienceEngine] Active space: ${currentSpace.provider}/${currentSpace.model} (${currentSpace.dimensions}d, manifest=${currentSpace.manifestId || "none"})`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[ExperienceEngine] Failed to resolve active space: ${msg}`);
      return;
    }

    const db = openDatabase(config);
    bootstrapDatabase(db);
    try {
      const pipeline = new VectorMigrationPipeline();
      console.log("[ExperienceEngine] Discovering nodes needing migration...");
      const pendingCount = pipeline.discoverPendingNodes(db, currentSpace);
      console.log(`[ExperienceEngine] Discovered ${pendingCount} pending nodes.`);

      if (pendingCount === 0) {
        console.log("[ExperienceEngine] All vectors are up-to-date in active space. No migration needed.");
        return;
      }

      console.log("[ExperienceEngine] Running vector migration pipeline...");
      const report = await pipeline.runMigration(db, currentSpace, {
        config,
        batchSize: parsed.batchSize,
        throttleGapMs: parsed.throttleGapMs,
        maxTotalToProcess: parsed.maxTotal
      });

      console.log("[ExperienceEngine] Vector migration finished!");
      console.log(
        `[ExperienceEngine] Total discovered: ${report.totalDiscovered} | Processed: ${report.processed} | Succeeded: ${report.succeeded} | Failed: ${report.failed}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.stack || error.message : String(error);
      console.error(`[ExperienceEngine] Fatal migration error: ${msg}`);
    } finally {
      db.close();
    }
    return;
  }

  console.log(
    "Usage: ee maintenance embeddings-reset|embedding-smoke|governance drain|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>|migrate [--batch-size <n>] [--throttle-gap <ms>] [--max-total <n>]"
  );
};
