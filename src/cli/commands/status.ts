import { ExperienceInteractionService } from "../../interaction/service.js";
import { inspectClaudeCodeInstall } from "../../install/claude-code-doctor.js";
import { inspectCodexInstall } from "../../install/codex-installer.js";
import { inspectOpenClawInstall } from "../../install/openclaw-installer.js";
import { loadConfig } from "../../config/load-config.js";
import { detectAvailableHosts } from "../../install/host-detection.js";
import type { ExperienceDecisionHealth } from "../../interaction/service.js";
import {
  deriveSetupState,
  deriveValueState,
  inspectSharedSetupState
} from "../state-model.js";

const summarizeRetrievalPattern = (decisionHealth: ExperienceDecisionHealth): string | undefined => {
  if (decisionHealth.recentDecisions === 0) {
    return undefined;
  }

  if (decisionHealth.recentInjects === 0 && decisionHealth.recentConservativeInjects === 0 && decisionHealth.recentSkips > 0) {
    return "ExperienceEngine is seeing nearby work in this repo, but it is still skipping most tasks.";
  }

  if (decisionHealth.recentConservativeInjects > 0 || decisionHealth.recentSkips > 0) {
    return "ExperienceEngine is finding matches in this repo, but some tasks still need smaller hints or no hint yet.";
  }

  if (decisionHealth.recentInjects > 0) {
    return "ExperienceEngine is finding reusable matches and injecting them normally in this repo.";
  }

  return undefined;
};

const summarizeGovernancePattern = (decisionHealth: ExperienceDecisionHealth): string | undefined => {
  if (decisionHealth.recentDecisions === 0) {
    return undefined;
  }

  if (decisionHealth.recentPotentialMisfires > 0) {
    return "Recent harmful outcomes suggest some hints still need tighter governance before broad reuse.";
  }

  if (decisionHealth.recentMetaDominantSelections > 0 && decisionHealth.recentRealDevAlignedSelections === 0) {
    return "Recent selections are still leaning toward meta or validation guidance more than real coding-error guidance.";
  }

  if (decisionHealth.recentRealDevAlignedSelections > 0) {
    return "Recent selections are mostly favoring real coding-error guidance when the task looks like real development work.";
  }

  return undefined;
};
export const runStatusCommand = (): void => {
  const config = loadConfig();
  const interaction = new ExperienceInteractionService(config);
  const decisionHealth = interaction.inspectDecisionHealth();
  const firstValueReadiness = interaction.inspectFirstValueReadiness();
  const sharedSetup = inspectSharedSetupState();
  const availableHosts = detectAvailableHosts().map((host) => host.id);
  const codex = inspectCodexInstall();
  const claude = inspectClaudeCodeInstall();
  const openclaw = inspectOpenClawInstall();
  const installedHosts = [
    codex.installed ? "codex" : null,
    claude.installed ? "claude-code" : null,
    openclaw.installed ? "openclaw" : null
  ].filter(Boolean) as string[];
  const interactionReady = Boolean(
    codex.hostWiring?.enabled ||
      claude.interactionReady ||
      (claude.hostWiring?.wired && claude.hooksPresent?.userPromptSubmit && claude.hooksPresent?.sessionEnd) ||
      openclaw.hostState?.enabled
  );

  console.log("ExperienceEngine status:");
  console.log(`- Available host CLIs: ${availableHosts.join(", ") || "none"}`);
  console.log(
    `- Installed hosts: ${installedHosts.join(", ") || "none"}`
  );
  console.log(`- Distillation provider: ${config.distillerProvider}`);
  console.log(`- Distillation model: ${config.distillerModel}`);
  console.log(`- Sync second-opinion mode: ${config.syncSecondOpinionMode}`);
  console.log(`- Sync second-opinion model: ${config.syncSecondOpinionModel || config.distillerModel || "shared distiller default"}`);
  console.log(`- Embedding provider mode: ${config.embeddingProvider}`);
  console.log(`- Embedding API provider override: ${config.embeddingApiProvider}`);
  console.log(
    `- Setup state: ${deriveSetupState({
      sharedInitialized: sharedSetup.initialized,
      installed: installedHosts.length > 0,
      interactionReady
    })}`
  );
  console.log(`- Value state: ${deriveValueState(firstValueReadiness)}`);
  console.log(`- Next step: ${firstValueReadiness.nextStep}`);
  if (codex.learningLoop) {
    console.log(`- Codex learning loop: ${codex.learningLoop.state}`);
    console.log(`- Codex instruction block: ${codex.learningLoop.instructionState}`);
    console.log(`- Codex task runs in current repo: ${codex.learningLoop.recentTaskRuns}`);
  }
  if (codex.cliFallback) {
    console.log(`- Codex CLI fallback available: ${codex.cliFallback.available ? "yes" : "no"}`);
    if (!codex.cliFallback.available && codex.cliFallback.recommendation) {
      console.log(`- Codex CLI fallback note: ${codex.cliFallback.recommendation}`);
    }
  }
  if (openclaw.runtimeDefaults) {
    console.log(`- OpenClaw learning loop: ${openclaw.runtimeDefaults.learningLoopState}`);
    console.log(
      `- OpenClaw background learning default: ${openclaw.runtimeDefaults.backgroundLearningEnabled ? "enabled" : "disabled"}`
    );
    console.log(
      `- OpenClaw async posttask default: ${openclaw.runtimeDefaults.hybridPosttaskEnabled ? "enabled" : "disabled"}`
    );
  }
  console.log(`- Recent retrieval decisions in current repo: ${decisionHealth.recentDecisions}`);
  console.log(`- Recent standard hints (inject): ${decisionHealth.recentInjects}`);
  console.log(`- Recent cautious hints (inject_conservative): ${decisionHealth.recentConservativeInjects}`);
  console.log(`- Recent no-hint decisions (skip): ${decisionHealth.recentSkips}`);
  console.log(`- Recent harmful or misfired hints: ${decisionHealth.recentPotentialMisfires}`);
  console.log(`- Recent meta-dominant selections: ${decisionHealth.recentMetaDominantSelections}`);
  console.log(`- Recent real-dev-aligned selections: ${decisionHealth.recentRealDevAlignedSelections}`);
  console.log(`- Recent fast matches (fast path): ${decisionHealth.recentFastPathActivations}`);
  console.log(`- Recent rerank reviews (rerank): ${decisionHealth.recentRerankParticipations}`);
  console.log(`- Recent query normalizations (query rewrites): ${decisionHealth.recentQueryRewriteUsages}`);
  console.log(`- Recent sync second-opinion reviews: ${decisionHealth.recentSecondOpinionActivations}`);
  console.log(`- Recent second-opinion skips: ${decisionHealth.recentSecondOpinionSkips}`);
  console.log(`- Recent second-opinion conservative downgrades: ${decisionHealth.recentSecondOpinionConservativeDowngrades}`);
  console.log(`- Current rising patterns (priority candidates): ${decisionHealth.currentPriorityCandidates}`);
  console.log(`- Recent merged refinements (converged updates): ${decisionHealth.recentConvergedUpdates}`);
  console.log(`- Recent newly promoted hints (priority promotions): ${decisionHealth.recentPriorityPromotions}`);
  const retrievalPattern = summarizeRetrievalPattern(decisionHealth);
  if (retrievalPattern) {
    console.log(`- Retrieval pattern: ${retrievalPattern}`);
  }
  const governancePattern = summarizeGovernancePattern(decisionHealth);
  if (governancePattern) {
    console.log(`- Governance pattern: ${governancePattern}`);
  }
};
