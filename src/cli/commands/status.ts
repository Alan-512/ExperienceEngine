import { ExperienceInteractionService } from "../../interaction/service.js";
import { inspectClaudeCodeInstall } from "../../install/claude-code-doctor.js";
import { inspectCodexInstall } from "../../install/codex-installer.js";
import { inspectOpenClawInstall } from "../../install/openclaw-installer.js";
import { loadConfig } from "../../config/load-config.js";
import { detectAvailableHosts } from "../../install/host-detection.js";
import type { ExperienceDecisionHealth } from "../../interaction/service.js";
import type { ExperienceFirstValueReadiness } from "../../interaction/service.js";

const summarizeRetrievalPattern = (decisionHealth: ExperienceDecisionHealth): string | undefined => {
  if (decisionHealth.recentDecisions === 0) {
    return undefined;
  }

  if (decisionHealth.recentInjects === 0 && decisionHealth.recentConservativeInjects === 0 && decisionHealth.recentSkips > 0) {
    return "ExperienceEngine is seeing nearby work in this repo, but it is still skipping most tasks.";
  }

  if (decisionHealth.recentConservativeInjects > 0 || decisionHealth.recentSkips > 0) {
    return "ExperienceEngine is finding matches in this repo, but some tasks still need conservative routing or skip review.";
  }

  if (decisionHealth.recentInjects > 0) {
    return "ExperienceEngine is finding reusable matches and injecting them normally in this repo.";
  }

  return undefined;
};

const deriveSetupState = (installedHosts: string[]): "Ready" | "Initialized" | "Installed" =>
  installedHosts.length > 0 ? "Ready" : "Installed";

const deriveValueState = (readiness: ExperienceFirstValueReadiness): "Warming up" | "First value reached" =>
  readiness.nodes > 0 ? "First value reached" : "Warming up";

export const runStatusCommand = (): void => {
  const config = loadConfig();
  const interaction = new ExperienceInteractionService(config);
  const decisionHealth = interaction.inspectDecisionHealth();
  const firstValueReadiness = interaction.inspectFirstValueReadiness();
  const availableHosts = detectAvailableHosts().map((host) => host.id);
  const codex = inspectCodexInstall();
  const claude = inspectClaudeCodeInstall();
  const openclaw = inspectOpenClawInstall();
  const installedHosts = [
    codex.installed ? "codex" : null,
    claude.installed ? "claude-code" : null,
    openclaw.installed ? "openclaw" : null
  ].filter(Boolean) as string[];

  console.log("ExperienceEngine status:");
  console.log(`- Available host CLIs: ${availableHosts.join(", ") || "none"}`);
  console.log(
    `- Installed hosts: ${installedHosts.join(", ") || "none"}`
  );
  console.log(`- Distillation provider: ${config.distillerProvider}`);
  console.log(`- Distillation model: ${config.distillerModel}`);
  console.log(`- Embedding provider mode: ${config.embeddingProvider}`);
  console.log(`- Embedding API provider override: ${config.embeddingApiProvider}`);
  console.log(`- Setup state: ${deriveSetupState(installedHosts)}`);
  console.log(`- Value state: ${deriveValueState(firstValueReadiness)}`);
  console.log(`- Next step: ${firstValueReadiness.nextStep}`);
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
  const retrievalPattern = summarizeRetrievalPattern(decisionHealth);
  if (retrievalPattern) {
    console.log(`- Retrieval pattern: ${retrievalPattern}`);
  }
};
