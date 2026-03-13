import { ExperienceStateArtifactService } from "../../interaction/state-artifact-service.js";

export const runBackupCommand = (): void => {
  const service = new ExperienceStateArtifactService();
  const plan = service.planOperation({ operation: "backup" });
  const result = service.executePlannedOperation({
    planId: plan.planId,
    confirmationToken: plan.confirmationToken
  });

  console.log(`[ExperienceEngine] Created backup ${result.artifact?.id}.`);
  console.log(`Path: ${result.artifact?.path}`);
};
