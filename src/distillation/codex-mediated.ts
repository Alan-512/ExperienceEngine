import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExperienceCandidate } from "../types/domain.js";
import {
  buildCodexExecCommand,
  defaultCodexExecRunner,
  type CodexExecRunner
} from "../install/codex-cli.js";
import { DistillationExecutionError } from "./errors.js";
import { DEFAULT_DISTILLER_SYSTEM_PROMPT, buildCandidatePayload } from "./prompt-contract.js";

const MEDIATED_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "compact_hint",
    "trigger_conditions",
    "success_criteria",
    "risk_level",
    "recommended_steps",
    "avoid_steps",
    "fallback_steps",
    "evidence_summary"
  ],
  properties: {
    compact_hint: { type: "string" },
    trigger_conditions: { type: "string" },
    success_criteria: { type: "string" },
    risk_level: { type: "string", enum: ["low", "medium", "high"] },
    recommended_steps: { type: "array", items: { type: "string" } },
    avoid_steps: { type: "array", items: { type: "string" } },
    fallback_steps: { type: "array", items: { type: "string" } },
    evidence_summary: { type: "string" }
  }
} as const;

const buildCodexMediatedPrompt = (candidate: ExperienceCandidate): string =>
  [
    DEFAULT_DISTILLER_SYSTEM_PROMPT,
    "You are running inside a host-mediated Codex distillation path.",
    "Do not run tools, shell commands, or repository inspection.",
    "Do not inspect files or search the workspace. Everything you need is already in the candidate payload.",
    "Return only the final JSON object that matches the output schema.",
    "Candidate payload:",
    buildCandidatePayload(candidate)
  ].join("\n\n");

export const runCodexMediatedDistillation = async (
  candidate: ExperienceCandidate,
  options: {
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
    runner?: CodexExecRunner;
    cwd?: string;
  }
): Promise<Record<string, unknown>> => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mediated-"));
  const outputPath = join(runtimeDir, "distillation-output.json");
  const schemaPath = join(runtimeDir, "distillation-output-schema.json");
  writeFileSync(schemaPath, `${JSON.stringify(MEDIATED_OUTPUT_SCHEMA, null, 2)}\n`, "utf8");

  try {
    const runner = options.runner ?? defaultCodexExecRunner;
    const result = runner(
      buildCodexExecCommand({
        prompt: buildCodexMediatedPrompt(candidate),
        outputPath,
        outputSchemaPath: schemaPath,
        cliEnv: options.env,
        cwd: options.cwd ?? runtimeDir,
        timeoutMs: options.timeoutMs
      })
    );

    if (result.exitCode !== 0) {
      throw new DistillationExecutionError(
        "mediated_host_error",
        `Codex mediated distillation failed with exit code ${result.exitCode}.`
      );
    }

    const content = readFileSync(outputPath, "utf8").trim();
    if (!content) {
      throw new DistillationExecutionError(
        "mediated_contract_error",
        "Codex mediated distillation did not produce a final output payload."
      );
    }

    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new DistillationExecutionError(
        "mediated_invalid_json",
        "Codex mediated distillation must return strict JSON."
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      ((error as NodeJS.ErrnoException).code === "ETIMEDOUT" || error.message.toLowerCase().includes("timed out"))
    ) {
      throw new DistillationExecutionError(
        "mediated_timeout",
        `Codex mediated distillation timed out after ${options.timeoutMs}ms.`
      );
    }

    throw error;
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
};
