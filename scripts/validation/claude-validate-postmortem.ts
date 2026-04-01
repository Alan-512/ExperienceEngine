import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { loadConfig } from "../../src/config/load-config.js";
import { openDatabase } from "../../src/store/sqlite/db.js";

type SpawnSyncLike = typeof nodeSpawnSync;

export type ClaudePostmortemValidationOptions = {
  prompt?: string;
  cwd?: string;
  homeDir?: string;
  spawnSync?: SpawnSyncLike;
  loadSnapshot?: (cwd: string, homeDir: string) => PostmortemValidationSnapshot;
};

export type PostmortemValidationTrace = {
  sessionId: string | null;
  validationStatus: string;
  fallbackReason: string | null;
  createdAt: string;
};

export type PostmortemValidationSnapshot = {
  traceCount: number;
  artifactCount: number;
  latestTrace: PostmortemValidationTrace | null;
};

export type ClaudePostmortemValidationReport = {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  traceDelta: number;
  artifactDelta: number;
  newTraceCreated: boolean;
  latestTrace: PostmortemValidationTrace | null;
};

const DEFAULT_PROMPT =
  "Diagnose a real issue in the current repo without editing files. You must use Bash to run `node dist/cli/index.js doctor openclaw` and `node dist/cli/index.js doctor claude-code`, then inspect the relevant installer/config files, explain the most likely root cause, and end with the safest remediation in 4 sentences.";

const loadPostmortemValidationSnapshot = (cwd: string, homeDir: string): PostmortemValidationSnapshot => {
  const config = loadConfig({}, { homeDir });
  const db = openDatabase(config);

  try {
    const traceCount = Number(
      (db.prepare("SELECT count(*) AS count FROM hybrid_invocation_traces WHERE worker_task = 'postmortem_review'").get() as { count?: number } | undefined)
        ?.count ?? 0
    );
    const artifactCount = Number(
      (db.prepare("SELECT count(*) AS count FROM hybrid_review_artifacts").get() as { count?: number } | undefined)?.count ?? 0
    );
    const latestTraceRow = db
      .prepare(
        "SELECT session_id, validation_status, fallback_reason, created_at FROM hybrid_invocation_traces WHERE worker_task = 'postmortem_review' ORDER BY created_at DESC LIMIT 1"
      )
      .get() as
      | {
          session_id: string | null;
          validation_status: string;
          fallback_reason: string | null;
          created_at: string;
        }
      | undefined;

    return {
      traceCount,
      artifactCount,
      latestTrace: latestTraceRow
        ? {
            sessionId: latestTraceRow.session_id,
            validationStatus: latestTraceRow.validation_status,
            fallbackReason: latestTraceRow.fallback_reason,
            createdAt: latestTraceRow.created_at
          }
        : null
    };
  } finally {
    db.close();
  }
};

export const inspectPostmortemValidation = (
  before: PostmortemValidationSnapshot,
  after: PostmortemValidationSnapshot
): Pick<ClaudePostmortemValidationReport, "traceDelta" | "artifactDelta" | "newTraceCreated" | "latestTrace"> => ({
  traceDelta: after.traceCount - before.traceCount,
  artifactDelta: after.artifactCount - before.artifactCount,
  newTraceCreated: after.traceCount > before.traceCount,
  latestTrace: after.latestTrace
});

export const runClaudePostmortemValidation = async (
  options: ClaudePostmortemValidationOptions = {}
): Promise<ClaudePostmortemValidationReport> => {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeDir = options.homeDir ?? homedir();
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const spawnSync = options.spawnSync ?? nodeSpawnSync;
  const loadSnapshot = options.loadSnapshot ?? loadPostmortemValidationSnapshot;

  const before = loadSnapshot(cwd, homeDir);
  const command = ["claude", "-p", "--permission-mode", "bypassPermissions", prompt];
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf8"
  });
  const after = loadSnapshot(cwd, homeDir);
  const validation = inspectPostmortemValidation(before, after);

  return {
    command,
    exitCode: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    ...validation
  };
};
