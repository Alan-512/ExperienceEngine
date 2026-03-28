import { readExperienceEngineSecrets } from "../config/secrets-store.js";
import { readExperienceEngineSettings } from "../config/settings-store.js";
import type { ExperienceFirstValueReadiness } from "../interaction/service.js";

export type SetupState = "Ready" | "Initialized" | "Installed";
export type ValueState = "Warming up" | "First value reached";

export type SharedSetupState = {
  initialized: boolean;
};

export const inspectSharedSetupState = (): SharedSetupState => {
  const settings = readExperienceEngineSettings();
  const secrets = readExperienceEngineSecrets();

  return {
    initialized: Object.keys(settings).length > 0 || Object.keys(secrets).length > 0
  };
};

export const deriveSetupState = (input: {
  sharedInitialized: boolean;
  installed: boolean;
  interactionReady: boolean;
}): SetupState => {
  if (input.sharedInitialized && input.interactionReady) {
    return "Ready";
  }

  if (input.sharedInitialized) {
    return "Initialized";
  }

  if (input.installed) {
    return "Installed";
  }

  return "Installed";
};

export const hasFirstValueReached = (summary: ExperienceFirstValueReadiness): boolean =>
  summary.rawRecords > 0 || summary.taskRuns > 0;

export const deriveValueState = (summary: ExperienceFirstValueReadiness): ValueState =>
  hasFirstValueReached(summary) ? "First value reached" : "Warming up";
