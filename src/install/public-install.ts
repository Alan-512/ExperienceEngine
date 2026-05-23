type ReadyInstallGuidance = {
  ready: true;
  command?: string;
  commands?: [string, string];
};

type PendingInstallGuidance = {
  ready: false;
  reason: string;
  command?: string;
  commands?: [string, string];
};

type PostInstallOrientation = {
  setupState: "Installed";
  nextStep: string;
};

export const buildOpenClawPublicInstallCommand = (packageSpec = "@alan512/experienceengine"): string =>
  `openclaw plugins install ${packageSpec}`;

export const buildCodexPublicInstallCommand = (
  _packageSpec = "@alan512/experienceengine",
  _productHome = "$HOME/.experienceengine"
): string => "ee install codex";

export const buildCodexManualFallbackCommand = (
  packageSpec = "@alan512/experienceengine",
  productHome = "$HOME/.experienceengine"
): string =>
  `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=${productHome} -- npx -y ${packageSpec} codex-mcp-server`;

export const buildCodexHookReviewGuidance = (events: readonly string[] = [
  "UserPromptSubmit",
  "PostToolUse",
  "Stop"
]): string =>
  `Open /hooks in Codex and approve the ExperienceEngine hooks (${events.join(", ")}).`;

export const buildClaudeMarketplaceAddCommand = (
  repo = "https://github.com/Alan-512/ExperienceEngine.git"
): string =>
  `/plugin marketplace add ${repo}`;

export const buildClaudePluginInstallCommand = (
  pluginName = "experienceengine",
  marketplaceName = "experienceengine"
): string => `/plugin install ${pluginName}@${marketplaceName}`;

export const buildHostInstallGuidance = (
  packageSpec = "@alan512/experienceengine"
): {
  openclaw: PendingInstallGuidance | ReadyInstallGuidance;
  codex: PendingInstallGuidance | ReadyInstallGuidance;
  "claude-code": PendingInstallGuidance | ReadyInstallGuidance;
  antigravity: PendingInstallGuidance | ReadyInstallGuidance;
} => ({
  openclaw: {
    ready: true,
    command: buildOpenClawPublicInstallCommand(packageSpec)
  },
  codex: {
    ready: true,
    commands: [buildCodexPublicInstallCommand(packageSpec), buildCodexManualFallbackCommand(packageSpec)]
  },
  "claude-code": {
    ready: true,
    commands: [buildClaudeMarketplaceAddCommand(), buildClaudePluginInstallCommand()]
  },
  antigravity: {
    ready: true,
    commands: ["ee install antigravity", "ee agy exec -C <project-path> \"<prompt>\""]
  }
});

export const buildHostPostInstallOrientation = (): {
  openclaw: PostInstallOrientation;
  codex: PostInstallOrientation;
  "claude-code": PostInstallOrientation;
  antigravity: PostInstallOrientation;
} => ({
  openclaw: {
    setupState: "Installed",
    nextStep:
      "Restart the OpenClaw gateway. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
  },
  codex: {
    setupState: "Installed",
    nextStep:
      "Start a new Codex session in this repo. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
  },
  "claude-code": {
    setupState: "Installed",
    nextStep:
      "Start a new Claude Code session. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
  },
  antigravity: {
    setupState: "Installed",
    nextStep:
      "Start Agent Desktop in any project, or use `ee agy exec -C <project-path>` for headless CLI runs. If shared ExperienceEngine state is not initialized yet, run `ee init` before your first real task."
  }
});
