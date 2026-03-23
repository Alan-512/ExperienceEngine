export const buildOpenClawPublicInstallCommand = (packageSpec = "experienceengine"): string =>
  `openclaw plugins install ${packageSpec}`;

export const buildCodexPublicInstallCommand = (
  packageSpec = "experienceengine",
  productHome = "$HOME/.experienceengine"
): string =>
  `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=${productHome} -- npx -y ${packageSpec} codex-mcp-server`;

export const buildClaudeMarketplaceAddCommand = (repo = "Alan-512/ExperienceEngine"): string =>
  `/plugin marketplace add ${repo}`;

export const buildClaudePluginInstallCommand = (
  pluginName = "experienceengine",
  marketplaceName = "experienceengine"
): string => `/plugin install ${pluginName}@${marketplaceName}`;

export const buildHostNativeInstallGuidance = (
  packageSpec = "experienceengine"
): {
  openclaw: { ready: true; command: string };
  codex: { ready: true; command: string };
  "claude-code": { ready: false; reason: string; commands: [string, string] };
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
    ready: false,
    reason:
      "Claude Code now ships an official marketplace manifest and repo-backed plugin source, but Claude's official install flow still requires marketplace add plus plugin install rather than a single one-step command.",
    commands: [buildClaudeMarketplaceAddCommand(), buildClaudePluginInstallCommand()]
  }
});
