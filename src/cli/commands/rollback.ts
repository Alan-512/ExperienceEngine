import { ExperienceStateArtifactService } from "../../interaction/state-artifact-service.js";

export const runRollbackCommand = (backupId?: string): void => {
  if (!backupId) {
    console.log("Usage: ee rollback <backup-id>");
    return;
  }

  const service = new ExperienceStateArtifactService();
  const plan = service.planOperation({
    operation: "rollback",
    backupId
  });
  const result = service.executePlannedOperation({
    planId: plan.planId,
    confirmationToken: plan.confirmationToken
  });

  console.log(`[ExperienceEngine] Rolled back state from backup ${backupId}.`);
  if (result.safeguardBackup) {
    console.log(`Safeguard backup: ${result.safeguardBackup.id}`);
    console.log(`Safeguard path: ${result.safeguardBackup.path}`);
  }
};
