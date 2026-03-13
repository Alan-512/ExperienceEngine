import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { resolveSettingsPath } from "../config/settings-store.js";
import { nowIso } from "../utils/clock.js";
import { readCurrentPackageVersion } from "../version/package-version.js";

export type StateArtifactKind = "backup" | "export";
export type StateOperation = "backup" | "export" | "import" | "rollback";

type ServiceOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  now?: () => string;
  idFactory?: () => string;
};

type StateArtifactMetadata = {
  id: string;
  kind: StateArtifactKind;
  createdAt: string;
  packageVersion: string;
  productHome: string;
  sqliteIncluded: boolean;
  settingsIncluded: boolean;
  installStates: string[];
  sourcePath?: string;
  safeguardBackupId?: string;
};

type PlannedStateOperation = {
  planId: string;
  confirmationToken: string;
  operation: StateOperation;
  summary: string;
  effects: string[];
  createdAt: string;
  requiresConfirmation: true;
  backupId?: string;
  importPath?: string;
};

export type StateArtifactSummary = {
  id: string;
  kind: StateArtifactKind;
  createdAt: string;
  packageVersion: string;
  sqliteIncluded: boolean;
  settingsIncluded: boolean;
  installStates: string[];
  path: string;
};

export type StateArtifactPlanResult = PlannedStateOperation & {
  artifactPathHint?: string;
};

export type StateArtifactExecutionResult = {
  status: "executed";
  operation: StateOperation;
  summary: string;
  artifact?: StateArtifactSummary;
  safeguardBackup?: StateArtifactSummary;
  restoredFrom?: string;
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const listAdapterInstallStates = (productHome: string): Array<{ adapter: string; path: string }> => {
  const adaptersRoot = join(productHome, "adapters");
  if (!existsSync(adaptersRoot)) {
    return [];
  }

  return readdirSync(adaptersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      adapter: entry.name,
      path: join(adaptersRoot, entry.name, "install.json")
    }))
    .filter((entry) => existsSync(entry.path));
};

const copyIfExists = (source: string, target: string): boolean => {
  if (!existsSync(source)) {
    return false;
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return true;
};

const readArtifactSummary = (artifactPath: string): StateArtifactSummary => {
  const metadata = readJson<StateArtifactMetadata>(join(artifactPath, "metadata.json"));
  return {
    id: metadata.id,
    kind: metadata.kind,
    createdAt: metadata.createdAt,
    packageVersion: metadata.packageVersion,
    sqliteIncluded: metadata.sqliteIncluded,
    settingsIncluded: metadata.settingsIncluded,
    installStates: metadata.installStates,
    path: artifactPath
  };
};

export class ExperienceStateArtifactService {
  private readonly paths;
  private readonly settingsPath;
  private readonly backupsDir: string;
  private readonly exportsDir: string;
  private readonly plans = new Map<string, PlannedStateOperation>();

  constructor(private readonly options: ServiceOptions = {}) {
    this.paths = resolveExperienceEnginePaths({
      adapter: "codex",
      env: options.env ?? process.env,
      homeDir: options.homeDir
    });
    this.settingsPath = resolveSettingsPath({
      env: options.env ?? process.env,
      homeDir: options.homeDir
    });
    this.backupsDir = join(this.paths.productHome, "backups");
    this.exportsDir = join(this.paths.productHome, "exports");
  }

  listBackups(): StateArtifactSummary[] {
    return this.listArtifacts(this.backupsDir);
  }

  planOperation(args: { operation: "backup" | "export" } | { operation: "rollback"; backupId: string } | {
    operation: "import";
    importPath: string;
  }): StateArtifactPlanResult {
    if (args.operation === "rollback") {
      const artifactPath = join(this.backupsDir, args.backupId);
      if (!existsSync(join(artifactPath, "metadata.json"))) {
        throw new Error(`Unknown backup id: ${args.backupId}`);
      }

      const plan = this.createPlan({
        operation: "rollback",
        summary: `Rollback ExperienceEngine managed state to backup ${args.backupId}.`,
        effects: [
          "Creates a safeguard backup of the current ExperienceEngine-managed state first.",
          "Restores SQLite, settings, and adapter install-state from the selected backup."
        ],
        backupId: args.backupId,
        artifactPathHint: artifactPath
      });
      return plan;
    }

    if (args.operation === "import") {
      const importPath = resolve(args.importPath);
      if (!existsSync(join(importPath, "metadata.json"))) {
        throw new Error(`Invalid ExperienceEngine snapshot path: ${importPath}`);
      }

      return this.createPlan({
        operation: "import",
        summary: `Import ExperienceEngine managed state from ${importPath}.`,
        effects: [
          "Creates a safeguard backup of the current ExperienceEngine-managed state first.",
          "Restores SQLite, settings, and adapter install-state from the provided snapshot."
        ],
        importPath,
        artifactPathHint: importPath
      });
    }

    const targetRoot = args.operation === "backup" ? this.backupsDir : this.exportsDir;
    return this.createPlan({
      operation: args.operation,
      summary:
        args.operation === "backup"
          ? "Create a managed ExperienceEngine backup snapshot."
          : "Create a managed ExperienceEngine export snapshot.",
      effects: [
        "Copies SQLite, settings, and adapter install-state into a managed snapshot directory.",
        `Stores the snapshot under ${targetRoot}.`
      ]
    });
  }

  executePlannedOperation(args: { planId: string; confirmationToken: string }): StateArtifactExecutionResult {
    const plan = this.plans.get(args.planId);
    if (!plan || plan.confirmationToken !== args.confirmationToken) {
      throw new Error("Invalid or expired confirmation token. Request a fresh state-operation plan first.");
    }

    this.plans.delete(args.planId);

    if (plan.operation === "backup") {
      const artifact = this.createSnapshot("backup");
      return {
        status: "executed",
        operation: "backup",
        summary: plan.summary,
        artifact
      };
    }

    if (plan.operation === "export") {
      const artifact = this.createSnapshot("export");
      return {
        status: "executed",
        operation: "export",
        summary: plan.summary,
        artifact
      };
    }

    const safeguardBackup = this.createSnapshot("backup", `safeguard-${this.issueId()}`);
    const sourcePath =
      plan.operation === "rollback"
        ? join(this.backupsDir, plan.backupId!)
        : resolve(plan.importPath!);
    this.restoreSnapshot(sourcePath);

    return {
      status: "executed",
      operation: plan.operation,
      summary: plan.summary,
      safeguardBackup,
      restoredFrom: sourcePath
    };
  }

  private createPlan(args: {
    operation: StateOperation;
    summary: string;
    effects: string[];
    backupId?: string;
    importPath?: string;
    artifactPathHint?: string;
  }): StateArtifactPlanResult {
    const plan: PlannedStateOperation = {
      planId: this.issueId(),
      confirmationToken: this.issueId(),
      operation: args.operation,
      summary: args.summary,
      effects: args.effects,
      createdAt: this.now(),
      requiresConfirmation: true,
      backupId: args.backupId,
      importPath: args.importPath
    };

    this.plans.set(plan.planId, plan);

    return {
      ...plan,
      artifactPathHint: args.artifactPathHint
    };
  }

  private createSnapshot(kind: StateArtifactKind, overrideId?: string): StateArtifactSummary {
    const id = overrideId ?? `${kind}-${this.now().replace(/[:.]/g, "-")}-${this.issueId().slice(0, 8)}`;
    const root = kind === "backup" ? this.backupsDir : this.exportsDir;
    const artifactPath = join(root, id);
    mkdirSync(artifactPath, { recursive: true });

    const sqliteIncluded = copyIfExists(
      this.paths.sqlitePath,
      join(artifactPath, "sqlite", "experienceengine.db")
    );
    const settingsIncluded = copyIfExists(this.settingsPath, join(artifactPath, "settings.json"));
    const installStates = listAdapterInstallStates(this.paths.productHome).map(({ adapter, path }) => {
      copyIfExists(path, join(artifactPath, "adapters", adapter, "install.json"));
      return adapter;
    });

    writeJson(join(artifactPath, "metadata.json"), {
      id,
      kind,
      createdAt: this.now(),
      packageVersion: readCurrentPackageVersion(),
      productHome: this.paths.productHome,
      sqliteIncluded,
      settingsIncluded,
      installStates
    } satisfies StateArtifactMetadata);

    return readArtifactSummary(artifactPath);
  }

  private restoreSnapshot(artifactPath: string): void {
    const metadataPath = join(artifactPath, "metadata.json");
    if (!existsSync(metadataPath)) {
      throw new Error(`Invalid ExperienceEngine snapshot path: ${artifactPath}`);
    }

    const metadata = readJson<StateArtifactMetadata>(metadataPath);
    const sqliteSource = join(artifactPath, "sqlite", "experienceengine.db");
    const settingsSource = join(artifactPath, "settings.json");
    const currentInstallStates = listAdapterInstallStates(this.paths.productHome);

    if (metadata.sqliteIncluded && existsSync(sqliteSource)) {
      mkdirSync(dirname(this.paths.sqlitePath), { recursive: true });
      copyFileSync(sqliteSource, this.paths.sqlitePath);
    } else if (existsSync(this.paths.sqlitePath)) {
      unlinkSync(this.paths.sqlitePath);
    }

    if (metadata.settingsIncluded && existsSync(settingsSource)) {
      mkdirSync(dirname(this.settingsPath), { recursive: true });
      copyFileSync(settingsSource, this.settingsPath);
    } else if (existsSync(this.settingsPath)) {
      unlinkSync(this.settingsPath);
    }

    const snapshotInstallStates = new Set(metadata.installStates);
    for (const { adapter, path } of currentInstallStates) {
      if (!snapshotInstallStates.has(adapter) && existsSync(path)) {
        unlinkSync(path);
      }
    }

    for (const adapter of metadata.installStates) {
      const source = join(artifactPath, "adapters", adapter, "install.json");
      const target = join(this.paths.productHome, "adapters", adapter, "install.json");
      if (existsSync(source)) {
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
    }
  }

  private listArtifacts(root: string): StateArtifactSummary[] {
    if (!existsSync(root)) {
      return [];
    }

    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
      .filter((path) => existsSync(join(path, "metadata.json")))
      .map((path) => readArtifactSummary(path))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private now(): string {
    return (this.options.now ?? nowIso)();
  }

  private issueId(): string {
    return (this.options.idFactory ?? randomUUID)();
  }
}
