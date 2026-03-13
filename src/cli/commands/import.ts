import { ExperienceStateArtifactService } from "../../interaction/state-artifact-service.js";

export const runImportCommand = (snapshotPath?: string): void => {
  if (!snapshotPath) {
    console.log("Usage: ee import <snapshot-path>");
    return;
  }

  const service = new ExperienceStateArtifactService();
  const plan = service.planOperation({
    operation: "import",
    importPath: snapshotPath
  });
  const result = service.executePlannedOperation({
    planId: plan.planId,
    confirmationToken: plan.confirmationToken
  });

  console.log(`[ExperienceEngine] Imported state from ${result.restoredFrom}.`);
  if (result.safeguardBackup) {
    console.log(`Safeguard backup: ${result.safeguardBackup.id}`);
    console.log(`Safeguard path: ${result.safeguardBackup.path}`);
  }
};
