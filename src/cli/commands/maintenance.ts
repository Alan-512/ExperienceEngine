import { loadConfig } from "../../config/load-config.js";
import { resolveDistillationResolution } from "../../distillation/host-llm.js";
import { LlmDistiller } from "../../distillation/llm-distiller.js";
import { runClaudePrintValidation } from "../../maintenance/claude-validate-print.js";
import { redistillRuleNodes } from "../../maintenance/redistill-rule-nodes.js";
import { mergeScopesWithConfig } from "../../maintenance/scope-merge.js";
import { bootstrapDatabase, openDatabase } from "../../store/sqlite/db.js";
import { CandidateRepository } from "../../store/sqlite/repositories/candidate-repo.js";
import { NodeRepository } from "../../store/sqlite/repositories/node-repo.js";
import { resetManagedEmbeddingCache } from "../../store/vector/local-provider.js";

type MaintenanceDeps = {
  loadConfig?: typeof loadConfig;
  resolveDistillationResolution?: typeof resolveDistillationResolution;
  resetManagedEmbeddingCache?: typeof resetManagedEmbeddingCache;
  redistillRuleNodes?: typeof redistillRuleNodes;
  claudeValidatePrint?: typeof runClaudePrintValidation;
  mergeScopesWithConfig?: typeof mergeScopesWithConfig;
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

  if (action === "redistill-rule-nodes") {
    const resolution = (deps.resolveDistillationResolution ?? resolveDistillationResolution)({
      env: process.env,
      configProvider: config.distillerProvider,
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
        "Usage: ee maintenance embeddings-reset|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>"
      );
      return;
    }

    const report = (deps.mergeScopesWithConfig ?? mergeScopesWithConfig)(config, sourceScopeId, targetScopeId);
    console.log(`[ExperienceEngine] Merged scope ${report.sourceScopeId} into ${report.targetScopeId}.`);
    console.log(
      `[ExperienceEngine] Moved: records=${report.moved.inputRecords} taskRuns=${report.moved.taskRuns} injections=${report.moved.injections} nodes=${report.moved.nodes} candidates=${report.moved.candidates}`
    );
    console.log(
      `[ExperienceEngine] Merged aggregates: packActivations=${report.merged.packActivations} taskStats=${report.merged.taskStats}`
    );
    return;
  }

  console.log(
    "Usage: ee maintenance embeddings-reset|redistill-rule-nodes|claude-validate-print|merge-scope <sourceScopeId> <targetScopeId>"
  );
};
