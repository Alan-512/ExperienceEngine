import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export const OPENCLAW_RUNTIME_HEALTH_RELATIVE_PATH =
  "runtime-health/openclaw-production.json" as const;

export type OpenClawRuntimeHealthEvidence = {
  evidence_schema_version: "openclaw-runtime-health-v1";
  observed_at: string;
  lifecycle_state: "active" | "inactive" | "failed";
  code: string;
  status_projection: Record<string, unknown> | null;
  safe_detail: string | null;
  next_action: string;
};

export const resolveOpenClawRuntimeHealthPath = (canonicalHome: string): string =>
  join(canonicalHome, ...OPENCLAW_RUNTIME_HEALTH_RELATIVE_PATH.split("/"));

const safeDetail = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message.slice(0, 500) : null;
  }
  return null;
};

export const writeOpenClawRuntimeHealthEvidence = (options: {
  canonicalHome: string;
  lifecycleState: OpenClawRuntimeHealthEvidence["lifecycle_state"];
  code: string;
  statusProjection?: unknown;
  detail?: unknown;
  nextAction: string;
  now?: () => Date;
}): OpenClawRuntimeHealthEvidence => {
  const statusProjection = options.statusProjection &&
    typeof options.statusProjection === "object" &&
    !Array.isArray(options.statusProjection)
    ? options.statusProjection as Record<string, unknown>
    : null;
  const evidence: OpenClawRuntimeHealthEvidence = {
    evidence_schema_version: "openclaw-runtime-health-v1",
    observed_at: (options.now ?? (() => new Date()))().toISOString(),
    lifecycle_state: options.lifecycleState,
    code: options.code,
    status_projection: statusProjection,
    safe_detail: safeDetail(options.detail),
    next_action: options.nextAction
  };
  const path = resolveOpenClawRuntimeHealthPath(options.canonicalHome);
  const candidate = `${path}.${process.pid}.${randomUUID()}.candidate`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(candidate, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  try {
    renameSync(candidate, path);
  } finally {
    rmSync(candidate, { force: true });
  }
  return evidence;
};

export const readOpenClawRuntimeHealthEvidence = (
  canonicalHome: string
): OpenClawRuntimeHealthEvidence | null => {
  try {
    const parsed = JSON.parse(
      readFileSync(resolveOpenClawRuntimeHealthPath(canonicalHome), "utf8")
    ) as OpenClawRuntimeHealthEvidence;
    if (
      parsed.evidence_schema_version !== "openclaw-runtime-health-v1" ||
      !["active", "inactive", "failed"].includes(parsed.lifecycle_state) ||
      typeof parsed.code !== "string" ||
      typeof parsed.observed_at !== "string" ||
      Number.isNaN(Date.parse(parsed.observed_at))
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
