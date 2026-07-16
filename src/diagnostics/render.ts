import type { SafeDiagnosticManifest } from "./contract.js";

export const renderSafeDiagnosticSummary = (manifest: SafeDiagnosticManifest): string => {
  const lines = [
    "ExperienceEngine diagnosis:",
    `- Setup state: ${manifest.setup.setup_state}`,
    `- Value state: ${manifest.setup.value_state}`,
    `- Database: ${manifest.database.present ? manifest.database.integrity : "not initialized"}`,
    `- Package activation: ${manifest.runtime.package_activation_state ?? "unavailable"}`,
    `- Migration: ${manifest.runtime.migration_status ?? "unavailable"}`,
    `- Queue: ${manifest.runtime.queue_state}`,
    `- Stable diagnostic errors: ${manifest.errors.reduce((sum, error) => sum + error.occurrence_count, 0)}`,
    `- Warnings: ${manifest.warnings.join(", ") || "none"}`,
    "- Privacy: raw databases, prompts, paths, credentials, tool/provider payloads, and free-text errors are excluded.",
    "- Upload: no files were uploaded."
  ];
  return lines.join("\n");
};
