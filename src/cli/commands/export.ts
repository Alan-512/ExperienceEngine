import { ExperienceStateArtifactService } from "../../interaction/state-artifact-service.js";

export const runExportCommand = (): void => {
  const service = new ExperienceStateArtifactService();
  const plan = service.planOperation({ operation: "export" });
  const result = service.executePlannedOperation({
    planId: plan.planId,
    confirmationToken: plan.confirmationToken
  });

  console.log(`[ExperienceEngine] Created export ${result.artifact?.id}.`);
  console.log(`Path: ${result.artifact?.path}`);
};
