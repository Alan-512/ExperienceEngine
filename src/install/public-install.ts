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

export const buildOpenClawPublicInstallCommand = (packageSpec = "experienceengine"): string =>
  `openclaw plugins install ${packageSpec}`;

export const buildCodexPublicInstallCommand = (
  packageSpec = "experienceengine",
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
  packageSpec = "experienceengine"
): {
  openclaw: PendingInstallGuidance;
  codex: PendingInstallGuidance;
  "claude-code": PendingInstallGuidance | ReadyInstallGuidance;
} => ({
  openclaw: {
    ready: false,
    reason:
      "OpenClaw's one-step install command still depends on the public npm package 'experienceengine', which is not published yet.",
    command: buildOpenClawPublicInstallCommand(packageSpec)
  },
  codex: {
    ready: false,
    reason:
      "Codex's one-step MCP install still depends on running `npx -y experienceengine`, which requires the public npm package to be published first.",
    command: buildCodexPublicInstallCommand(packageSpec)
  },
  "claude-code": {
    ready: true,
    commands: [buildClaudeMarketplaceAddCommand(), buildClaudePluginInstallCommand()]
  }
});
