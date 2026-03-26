import { ExperienceInteractionService } from "../../interaction/service.js";
import { inspectClaudeCodeInstall } from "../../install/claude-code-doctor.js";
import { inspectCodexInstall } from "../../install/codex-installer.js";
import { inspectOpenClawInstall } from "../../install/openclaw-installer.js";
import { loadConfig } from "../../config/load-config.js";
import { detectAvailableHosts } from "../../install/host-detection.js";

export const runStatusCommand = (): void => {
  const config = loadConfig();
  const interaction = new ExperienceInteractionService(config);
  const decisionHealth = interaction.inspectDecisionHealth();
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
  if (codex.learningLoop) {
    console.log(`- Codex learning loop: ${codex.learningLoop.state}`);
    console.log(`- Codex instruction block: ${codex.learningLoop.instructionState}`);
    console.log(`- Codex task runs in current repo: ${codex.learningLoop.recentTaskRuns}`);
  }
  console.log(`- Recent retrieval decisions in current repo: ${decisionHealth.recentDecisions}`);
  console.log(`- Recent injects: ${decisionHealth.recentInjects}`);
  console.log(`- Recent conservative injects: ${decisionHealth.recentConservativeInjects}`);
  console.log(`- Recent skips: ${decisionHealth.recentSkips}`);
  console.log(`- Recent fast-path activations: ${decisionHealth.recentFastPathActivations}`);
  console.log(`- Recent rerank participations: ${decisionHealth.recentRerankParticipations}`);
  console.log(`- Recent query rewrites: ${decisionHealth.recentQueryRewriteUsages}`);
  console.log(`- Current priority candidates: ${decisionHealth.currentPriorityCandidates}`);
  console.log(`- Recent converged updates: ${decisionHealth.recentConvergedUpdates}`);
  console.log(`- Recent priority promotions: ${decisionHealth.recentPriorityPromotions}`);
};
