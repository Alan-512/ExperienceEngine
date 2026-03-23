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

export const buildOpenClawPublicInstallCommand = (packageSpec = "@alan512/experienceengine"): string =>
  `openclaw plugins install ${packageSpec}`;

export const buildCodexPublicInstallCommand = (
  packageSpec = "@alan512/experienceengine",
  productHome = "$HOME/.experienceengine"
): string =>
  `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=${productHome} -- npx -y ${packageSpec} codex-mcp-server`;

export const buildClaudeMarketplaceAddCommand = (
  repo = "https://github.com/Alan-512/ExperienceEngine.git"
): string =>
  `/plugin marketplace add ${repo}`;

export const buildClaudePluginInstallCommand = (
  pluginName = "experienceengine",
  marketplaceName = "experienceengine"
): string => `/plugin install ${pluginName}@${marketplaceName}`;

export const buildHostNativeInstallGuidance = (
  packageSpec = "@alan512/experienceengine"
): {
  openclaw: PendingInstallGuidance | ReadyInstallGuidance;
  codex: PendingInstallGuidance | ReadyInstallGuidance;
  "claude-code": PendingInstallGuidance | ReadyInstallGuidance;
} => ({
  openclaw: {
    ready: true,
    command: buildOpenClawPublicInstallCommand(packageSpec)
  },
  codex: {
    ready: true,
    command: buildCodexPublicInstallCommand(packageSpec)
  },
  "claude-code": {
    ready: true,
    commands: [buildClaudeMarketplaceAddCommand(), buildClaudePluginInstallCommand()]
  }
});
