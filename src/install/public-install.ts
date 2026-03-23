export const buildOpenClawPublicInstallCommand = (packageSpec = "experienceengine"): string =>
  `openclaw plugins install ${packageSpec}`;

export const buildCodexPublicInstallCommand = (
  packageSpec = "experienceengine",
  productHome = "$HOME/.experienceengine"
): string =>
  `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=${productHome} -- npx -y ${packageSpec} codex-mcp-server`;

export const buildHostNativeInstallGuidance = (
  packageSpec = "experienceengine"
): {
  openclaw: { ready: true; command: string };
  codex: { ready: true; command: string };
  "claude-code": { ready: false; reason: string };
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
    reason: "Claude Code still needs a marketplace/plugin packaging path to become a true one-step host-native install."
  }
});
