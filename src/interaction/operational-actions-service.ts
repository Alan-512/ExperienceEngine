import { randomUUID } from "node:crypto";
import { inspectClaudeCodeInstall } from "../install/claude-code-doctor.js";
import { installClaudeCodeAdapter } from "../install/claude-code-installer.js";
import { inspectCodexInstall, installCodexAdapter } from "../install/codex-installer.js";
import {
  inspectOpenClawInstall,
  installOpenClawAdapter,
  repairOpenClawAdapter
} from "../install/openclaw-installer.js";
import {
  inspectAntigravityInstall,
  installAntigravityAdapter,
  repairAntigravityAdapter
} from "../install/antigravity.js";
import type { ExperienceAdapter } from "./operational-service.js";

export type HighImpactOperation = "install" | "repair" | "upgrade";

type VersionInspection = {
  versionStatus?: {
    recordedVersion?: string | null;
    currentVersion?: string | null;
  };
};

type InstallResult = {
  adapter: ExperienceAdapter;
  installedVersion?: string;
};

type OpenClawInstallResult = InstallResult & {
  hostWiring?: {
    restartRecommended?: boolean;
  };
};

type PlanTokenFactory = () => string;

type PlannedOperation = {
  planId: string;
  confirmationToken: string;
  adapter: ExperienceAdapter;
  operation: HighImpactOperation;
  summary: string;
  effects: string[];
  requiresConfirmation: true;
  createdAt: string;
};

export type OperationalActionsDeps = {
  inspectOpenClawInstall?: () => VersionInspection;
  installOpenClawAdapter?: () => OpenClawInstallResult | Promise<OpenClawInstallResult>;
  repairOpenClawAdapter?: () => OpenClawInstallResult | Promise<OpenClawInstallResult>;
  inspectClaudeCodeInstall?: () => VersionInspection;
  installClaudeCodeAdapter?: () => InstallResult | Promise<InstallResult>;
  inspectCodexInstall?: () => VersionInspection;
  installCodexAdapter?: () => InstallResult | Promise<InstallResult>;
  inspectAntigravityInstall?: () => VersionInspection;
  installAntigravityAdapter?: () => InstallResult | Promise<InstallResult>;
  repairAntigravityAdapter?: () => InstallResult | Promise<InstallResult>;
  tokenFactory?: PlanTokenFactory;
  now?: () => string;
};

export type OperationalPlanResult = PlannedOperation & {
  commandHint: string;
};

export type OperationalExecutionResult = {
  status: "executed";
  adapter: ExperienceAdapter;
  operation: HighImpactOperation;
  summary: string;
  result: {
    installedVersion?: string;
    previousVersion?: string;
    restartRecommended?: boolean;
  };
};

const supportedOperation = (adapter: ExperienceAdapter, operation: HighImpactOperation): boolean => {
  if (operation === "repair") {
    return adapter === "openclaw" || adapter === "antigravity";
  }

  return true;
};

const buildCommandHint = (adapter: ExperienceAdapter, operation: HighImpactOperation): string =>
  operation === "repair" ? `ee repair ${adapter}` : `ee ${operation} ${adapter}`;

const buildPlanSummary = (
  adapter: ExperienceAdapter,
  operation: HighImpactOperation,
  currentVersion?: string
): string => {
  if (operation === "install") {
    return `Install ExperienceEngine on ${adapter} and register host wiring.`;
  }

  if (operation === "repair") {
    return `Repair ExperienceEngine host wiring on ${adapter}.`;
  }

  return `Upgrade ExperienceEngine on ${adapter}${currentVersion ? ` from ${currentVersion}` : ""}.`;
};

const buildPlanEffects = (adapter: ExperienceAdapter, operation: HighImpactOperation): string[] => {
  if (operation === "install") {
    return [
      `Writes or refreshes the ${adapter} adapter install state.`,
      `Registers ExperienceEngine host wiring for ${adapter}.`
    ];
  }

  if (operation === "repair") {
    return [
      "Mutates host configuration to restore expected ExperienceEngine wiring.",
      "May require the host to restart or open a new session."
    ];
  }

  return [
    `Refreshes ${adapter} host wiring against the current local ExperienceEngine package version.`,
    "May require the host to restart or open a new session."
  ];
};

const readRecordedVersion = (inspection: VersionInspection | null | undefined): string | undefined =>
  (inspection?.versionStatus?.recordedVersion ?? inspection?.versionStatus?.currentVersion) ?? undefined;

export class ExperienceOperationalActionsService {
  private readonly plans = new Map<string, PlannedOperation>();

  constructor(private readonly deps: OperationalActionsDeps = {}) {}

  private issueToken(): string {
    return (this.deps.tokenFactory ?? (() => randomUUID()))();
  }

  private now(): string {
    return (this.deps.now ?? (() => new Date().toISOString()))();
  }

  private inspect(adapter: ExperienceAdapter): VersionInspection | null {
    if (adapter === "openclaw") {
      return (this.deps.inspectOpenClawInstall ?? inspectOpenClawInstall)();
    }
    if (adapter === "claude-code") {
      return (this.deps.inspectClaudeCodeInstall ?? inspectClaudeCodeInstall)();
    }
    if (adapter === "antigravity") {
      return (this.deps.inspectAntigravityInstall ?? inspectAntigravityInstall)();
    }
    return (this.deps.inspectCodexInstall ?? inspectCodexInstall)();
  }

  planOperation(args: {
    adapter: ExperienceAdapter;
    operation: HighImpactOperation;
  }): OperationalPlanResult {
    if (!supportedOperation(args.adapter, args.operation)) {
      throw new Error(`Unsupported ${args.operation} operation for ${args.adapter}`);
    }

    const currentVersion = readRecordedVersion(this.inspect(args.adapter));
    const plan: PlannedOperation = {
      planId: this.issueToken(),
      confirmationToken: this.issueToken(),
      adapter: args.adapter,
      operation: args.operation,
      summary: buildPlanSummary(args.adapter, args.operation, currentVersion),
      effects: buildPlanEffects(args.adapter, args.operation),
      requiresConfirmation: true,
      createdAt: this.now()
    };

    this.plans.set(plan.planId, plan);

    return {
      ...plan,
      commandHint: buildCommandHint(args.adapter, args.operation)
    };
  }

  async executePlannedOperation(args: { planId: string; confirmationToken: string }): Promise<OperationalExecutionResult> {
    const plan = this.plans.get(args.planId);

    if (!plan || plan.confirmationToken !== args.confirmationToken) {
      throw new Error("Invalid or expired confirmation token. Request a fresh operation plan first.");
    }

    this.plans.delete(args.planId);

    const previousVersion = readRecordedVersion(this.inspect(plan.adapter));

    if (plan.operation === "repair") {
      if (plan.adapter === "antigravity") {
        const report = await (this.deps.repairAntigravityAdapter ?? repairAntigravityAdapter)();
        return {
          status: "executed",
          adapter: plan.adapter,
          operation: plan.operation,
          summary: plan.summary,
          result: {
            installedVersion: report.installedVersion,
            previousVersion
          }
        };
      }
      const report = await (this.deps.repairOpenClawAdapter ?? repairOpenClawAdapter)();
      return {
        status: "executed",
        adapter: plan.adapter,
        operation: plan.operation,
        summary: plan.summary,
        result: {
          installedVersion: report.installedVersion,
          previousVersion,
          restartRecommended: report.hostWiring?.restartRecommended
        }
      };
    }

    if (plan.adapter === "openclaw") {
      const report = await (this.deps.installOpenClawAdapter ?? installOpenClawAdapter)();
      return {
        status: "executed",
        adapter: plan.adapter,
        operation: plan.operation,
        summary: plan.summary,
        result: {
          installedVersion: report.installedVersion,
          previousVersion,
          restartRecommended: report.hostWiring?.restartRecommended
        }
      };
    }

    if (plan.adapter === "claude-code") {
      const report = await (this.deps.installClaudeCodeAdapter ?? installClaudeCodeAdapter)();
      return {
        status: "executed",
        adapter: plan.adapter,
        operation: plan.operation,
        summary: plan.summary,
        result: {
          installedVersion: report.installedVersion,
          previousVersion
        }
      };
    }

    if (plan.adapter === "antigravity") {
      const report = await (this.deps.installAntigravityAdapter ?? installAntigravityAdapter)();
      return {
        status: "executed",
        adapter: plan.adapter,
        operation: plan.operation,
        summary: plan.summary,
        result: {
          installedVersion: report.installedVersion,
          previousVersion
        }
      };
    }

    const report = await (this.deps.installCodexAdapter ?? installCodexAdapter)();
    return {
      status: "executed",
      adapter: plan.adapter,
      operation: plan.operation,
      summary: plan.summary,
      result: {
        installedVersion: report.installedVersion,
        previousVersion
      }
    };
  }
}
