import { inspectClaudeCodeInstall } from "../../install/claude-code-doctor.js";
import { inspectCodexInstall } from "../../install/codex-installer.js";
import { inspectOpenClawInstall } from "../../install/openclaw-installer.js";
import { loadConfig } from "../../config/load-config.js";
import { detectAvailableHosts } from "../../install/host-detection.js";

export const runStatusCommand = (): void => {
  const config = loadConfig();
  const availableHosts = detectAvailableHosts().map((host) => host.id);
  const codex = inspectCodexInstall();
  const claude = inspectClaudeCodeInstall();
  const openclaw = inspectOpenClawInstall();

  console.log("ExperienceEngine status:");
  console.log(`- Available host CLIs: ${availableHosts.join(", ") || "none"}`);
  console.log(
    `- Installed hosts: ${[
      codex.installed ? "codex" : null,
      claude.installed ? "claude-code" : null,
      openclaw.installed ? "openclaw" : null
    ]
      .filter(Boolean)
      .join(", ") || "none"}`
  );
  console.log(`- Distillation provider: ${config.distillerProvider}`);
  console.log(`- Distillation model: ${config.distillerModel}`);
  console.log(`- Embedding provider mode: ${config.embeddingProvider}`);
  console.log(`- Embedding API provider override: ${config.embeddingApiProvider}`);
};
