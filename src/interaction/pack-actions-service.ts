import { randomUUID } from "node:crypto";
import { loadConfig } from "../config/load-config.js";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { deployCompiledPack } from "../compiler/deployer.js";
import type { CompilerTarget } from "../compiler/types.js";
import { ExperiencePackRegistry } from "../packs/fs-registry.js";
import { ExperiencePackIndexSync } from "../packs/index-sync.js";
import { bootstrapDatabase, openDatabase } from "../store/sqlite/db.js";
import { ExperiencePackRepository } from "../store/sqlite/repositories/pack-repo.js";

export type HighImpactPackOperation = "publish" | "rollback" | "deploy";

type ServiceOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  tokenFactory?: () => string;
  now?: () => string;
};

type PlannedPackOperation = {
  planId: string;
  confirmationToken: string;
  operation: HighImpactPackOperation;
  packId: string;
  version?: string;
  target?: CompilerTarget;
  repoPath?: string;
  summary: string;
  effects: string[];
  requiresConfirmation: true;
  createdAt: string;
};

export type PackOperationPlanResult = PlannedPackOperation & {
  commandHint: string;
};

export type PackOperationExecutionResult = {
  status: "executed";
  operation: HighImpactPackOperation;
  packId: string;
  summary: string;
  result:
    | {
        status: string;
        currentVersion: string;
      }
    | {
        target: CompilerTarget;
        destinationPath: string;
        sourcePath: string;
        deploymentStatus: "missing" | "up_to_date" | "drifted";
        overwritten: boolean;
      };
};

const buildCommandHint = (
  packId: string,
  operation: HighImpactPackOperation,
  version?: string,
  target?: CompilerTarget,
  repoPath?: string
): string =>
  operation === "publish"
    ? `ee pack publish ${packId}`
    : operation === "rollback"
      ? `ee pack rollback ${packId} ${version ?? "<version>"}`
      : `ee pack deploy ${packId} ${version ?? "<current>"} ${target ?? "<target>"} ${repoPath ?? "<repo-path>"}`;

export class ExperiencePackActionsService {
  private readonly registry: ExperiencePackRegistry;
  private readonly repo: ExperiencePackRepository;
  private readonly indexSync: ExperiencePackIndexSync;
  private readonly packsDir: string;
  private readonly plans = new Map<string, PlannedPackOperation>();

  constructor(private readonly options: ServiceOptions = {}) {
    const paths = resolveExperienceEnginePaths({
      adapter: "codex",
      env: options.env ?? process.env,
      homeDir: options.homeDir
    });
    const db = openDatabase(
      loadConfig(
        {
          dataDir: paths.dataDir,
          sqlitePath: paths.sqlitePath,
          captureDir: paths.captureDir
        },
        {
          env: options.env ?? process.env,
          homeDir: options.homeDir
        }
      )
    );
    bootstrapDatabase(db);
    this.packsDir = paths.packsDir;
    this.registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });
    this.repo = new ExperiencePackRepository(db);
    this.indexSync = new ExperiencePackIndexSync(this.registry, this.repo);
  }

  private issueToken(): string {
    return (this.options.tokenFactory ?? (() => randomUUID()))();
  }

  private now(): string {
    return (this.options.now ?? (() => new Date().toISOString()))();
  }

  planPublish(packId: string): PackOperationPlanResult {
    const pack = this.registry.readPack(packId);
    const plan: PlannedPackOperation = {
      planId: this.issueToken(),
      confirmationToken: this.issueToken(),
      operation: "publish",
      packId,
      summary: `Publish Experience Pack ${packId}@${pack.currentVersion}.`,
      effects: [
        "Updates the pack registry status to published.",
        "Refreshes the local SQLite pack index for runtime and inspect surfaces."
      ],
      requiresConfirmation: true,
      createdAt: this.now()
    };
    this.plans.set(plan.planId, plan);
    return {
      ...plan,
      commandHint: buildCommandHint(packId, "publish")
    };
  }

  planRollback(packId: string, version: string): PackOperationPlanResult {
    this.registry.readVersionManifest(packId, version);
    const plan: PlannedPackOperation = {
      planId: this.issueToken(),
      confirmationToken: this.issueToken(),
      operation: "rollback",
      packId,
      version,
      summary: `Rollback Experience Pack ${packId} to ${version}.`,
      effects: [
        "Switches the current pack version to the selected published version.",
        "Refreshes the local SQLite pack index for runtime and inspect surfaces."
      ],
      requiresConfirmation: true,
      createdAt: this.now()
    };
    this.plans.set(plan.planId, plan);
    return {
      ...plan,
      commandHint: buildCommandHint(packId, "rollback", version)
    };
  }

  planDeploy(packId: string, target: CompilerTarget, repoPath: string, version?: string): PackOperationPlanResult {
    const pack = this.registry.readPack(packId);
    const effectiveVersion = version ?? pack.currentVersion;
    this.registry.readVersionManifest(packId, effectiveVersion);
    const preview = deployCompiledPack({
      packsDir: this.packsDir,
      packId,
      version: effectiveVersion,
      target,
      repoPath,
      dryRun: true
    });
    const plan: PlannedPackOperation = {
      planId: this.issueToken(),
      confirmationToken: this.issueToken(),
      operation: "deploy",
      packId,
      version: effectiveVersion,
      target,
      repoPath,
      summary: `Deploy Experience Pack ${packId}@${effectiveVersion} to ${target} in ${repoPath}.`,
      effects: [
        `Writes the compiled ${target} artifact to ${preview.destinationPath}.`,
        preview.deploymentStatus === "drifted"
          ? "Overwrites drifted destination content because this path requires explicit confirmation."
          : `Current destination state: ${preview.deploymentStatus}.`
      ],
      requiresConfirmation: true,
      createdAt: this.now()
    };
    this.plans.set(plan.planId, plan);
    return {
      ...plan,
      commandHint: buildCommandHint(packId, "deploy", effectiveVersion, target, repoPath)
    };
  }

  executePlannedOperation(args: { planId: string; confirmationToken: string }): PackOperationExecutionResult {
    const plan = this.plans.get(args.planId);
    if (!plan || plan.confirmationToken !== args.confirmationToken) {
      throw new Error("Invalid or expired confirmation token. Request a fresh pack operation plan first.");
    }

    this.plans.delete(args.planId);

    if (plan.operation === "deploy") {
      const result = deployCompiledPack({
        packsDir: this.packsDir,
        packId: plan.packId,
        version: plan.version,
        target: plan.target!,
        repoPath: plan.repoPath!,
        force: true
      });

      return {
        status: "executed",
        operation: plan.operation,
        packId: plan.packId,
        summary: plan.summary,
        result: {
          target: result.target,
          destinationPath: result.destinationPath,
          sourcePath: result.sourcePath,
          deploymentStatus: result.deploymentStatus,
          overwritten: result.overwritten
        }
      };
    }

    const pack =
      plan.operation === "publish"
        ? this.registry.publishPack(plan.packId)
        : this.registry.rollbackPack(plan.packId, plan.version!);

    this.indexSync.syncPack(plan.packId);

    return {
      status: "executed",
      operation: plan.operation,
      packId: plan.packId,
      summary: plan.summary,
      result: {
        status: pack.status,
        currentVersion: pack.currentVersion
      }
    };
  }
}
