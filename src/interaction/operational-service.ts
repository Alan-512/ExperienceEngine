import { inspectClaudeCodeInstall } from "../install/claude-code-doctor.js";
import { inspectCodexInstall } from "../install/codex-installer.js";
import {
  classifyOpenClawHostWarnings,
  getOpenClawRepairHint,
  inspectOpenClawInstall
} from "../install/openclaw-installer.js";
import { inspectAntigravityInstall } from "../install/antigravity.js";
import { fetchLatestGitHubReleaseStatus, type RemoteReleaseStatus } from "../version/remote-release.js";

export type ExperienceAdapter = "openclaw" | "claude-code" | "codex" | "antigravity";

type OperationalDeps = {
  inspectOpenClawInstall?: typeof inspectOpenClawInstall;
  inspectClaudeCodeInstall?: typeof inspectClaudeCodeInstall;
  inspectCodexInstall?: typeof inspectCodexInstall;
  inspectAntigravityInstall?: typeof inspectAntigravityInstall;
  fetchLatestGitHubReleaseStatus?: typeof fetchLatestGitHubReleaseStatus;
};

export type DoctorReadResult = {
  adapter: ExperienceAdapter;
  local: unknown;
  recommendedNextStep?: string;
};

export type UpdateCheckResult = {
  adapter: ExperienceAdapter;
  currentVersion: string;
  remote: RemoteReleaseStatus;
  recommendedNextStep?: string;
};

export class ExperienceOperationalService {
  constructor(private readonly deps: OperationalDeps = {}) {}

  async inspectDoctor(adapter: ExperienceAdapter): Promise<DoctorReadResult> {
    if (adapter === "claude-code") {
      const local = (this.deps.inspectClaudeCodeInstall ?? inspectClaudeCodeInstall)();
      return {
        adapter,
        local,
        recommendedNextStep: local.versionStatus.updateAvailable ? "ee upgrade claude-code" : undefined
      };
    }

    if (adapter === "codex") {
      const local = (this.deps.inspectCodexInstall ?? inspectCodexInstall)();
      return {
        adapter,
        local,
        recommendedNextStep: local.versionStatus.updateAvailable ? "ee upgrade codex" : undefined
      };
    }

    if (adapter === "antigravity") {
      const local = (this.deps.inspectAntigravityInstall ?? inspectAntigravityInstall)();
      return {
        adapter,
        local,
        recommendedNextStep: local.versionStatus.updateAvailable ? "ee upgrade antigravity" : undefined
      };
    }

    const local = (this.deps.inspectOpenClawInstall ?? inspectOpenClawInstall)();
    const warnings = classifyOpenClawHostWarnings(local);
    return {
      adapter,
      local: {
        ...local,
        classifiedWarnings: warnings
      },
      recommendedNextStep:
        getOpenClawRepairHint(local) ??
        (local.versionStatus.updateAvailable ? "ee upgrade openclaw" : undefined)
    };
  }

  async checkUpdate(adapter: ExperienceAdapter): Promise<UpdateCheckResult> {
    const doctor = await this.inspectDoctor(adapter);
    const local = doctor.local as {
      versionStatus?: {
        currentVersion?: string;
      };
    };
    const currentVersion = local.versionStatus?.currentVersion ?? "0.0.0";
    const remote = await (this.deps.fetchLatestGitHubReleaseStatus ?? fetchLatestGitHubReleaseStatus)({
      currentVersion
    });

    return {
      adapter,
      currentVersion,
      remote,
      recommendedNextStep: remote.updateAvailable ? `update local package, then run ee upgrade ${adapter}` : undefined
    };
  }
}
