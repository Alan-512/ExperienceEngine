import { DatabaseSync } from "node:sqlite";
import type { HostTraceCapabilityProfile, HostCapabilityState } from "../types/domain.js";

const DEFAULT_CAPABILITIES: Record<string, Record<string, Omit<HostCapabilityState, "updated_at">>> = {
  "claude-code": {
    prompt: { state: "verified", provenance: "verified" },
    tool_call: { state: "verified", provenance: "verified" },
    tool_result: { state: "verified", provenance: "verified" },
    tool_failure: { state: "verified", provenance: "verified" },
    file_change: { state: "verified", provenance: "verified" },
    task_completion: { state: "verified", provenance: "verified" },
    stop: { state: "verified", provenance: "verified" },
    stop_failure: { state: "verified", provenance: "verified" },
    compaction: { state: "unavailable", provenance: "disabled" },
    subagent_lifecycle: { state: "unavailable", provenance: "disabled" },
    permission_request: { state: "unavailable", provenance: "disabled" }
  },
  codex: {
    prompt: { state: "verified", provenance: "verified" },
    tool_call: { state: "verified", provenance: "verified" },
    tool_result: { state: "verified", provenance: "verified" },
    tool_failure: { state: "verified", provenance: "verified" },
    file_change: { state: "documented", provenance: "documented" },
    task_completion: { state: "verified", provenance: "verified" },
    compaction: { state: "documented", provenance: "documented" },
    subagent_lifecycle: { state: "documented", provenance: "documented" },
    permission_request: { state: "verified", provenance: "verified" }
  },
  antigravity: {
    prompt: { state: "verified", provenance: "verified" },
    tool_call: { state: "verified", provenance: "verified" },
    tool_result: { state: "verified", provenance: "verified" },
    tool_failure: { state: "verified", provenance: "verified" },
    file_change: { state: "verified", provenance: "verified" },
    task_completion: { state: "verified", provenance: "verified" },
    stop: { state: "verified", provenance: "verified" }
  },
  openclaw: {
    prompt: { state: "verified", provenance: "verified" },
    tool_call: { state: "verified", provenance: "verified" },
    tool_result: { state: "verified", provenance: "verified" },
    tool_failure: { state: "verified", provenance: "verified" },
    task_completion: { state: "verified", provenance: "verified" }
  }
};

const DEFAULT_TOOL_COVERAGE: Record<string, string[]> = {
  "claude-code": ["run_command", "write_file", "read_file", "search_grep"],
  codex: ["run_command", "replace_file_content", "view_file", "grep_search"],
  antigravity: ["run_command", "replace_file_content", "view_file", "grep_search"],
  openclaw: ["run_command", "view_file", "write_file"]
};

const DEFAULT_TRANSCRIPT_STABILITY: Record<string, "stable" | "unstable" | "none"> = {
  "claude-code": "stable",
  codex: "stable",
  antigravity: "stable",
  openclaw: "unstable"
};

/**
 * Resolves the trace capability profile for a given host, overlaying any dynamic database overrides.
 */
export const getHostTraceCapabilityProfile = (
  host: "openclaw" | "claude-code" | "codex" | "antigravity",
  db?: DatabaseSync
): HostTraceCapabilityProfile => {
  const profile_version = "1.0.0";
  const adapter_version = "0.4.2";
  const defaults = DEFAULT_CAPABILITIES[host] || {};
  
  const capabilities: Record<string, HostCapabilityState> = {};
  const now = new Date().toISOString();

  // Populate static defaults
  for (const [capName, defaultVal] of Object.entries(defaults)) {
    capabilities[capName] = {
      state: defaultVal.state,
      provenance: defaultVal.provenance,
      updated_at: now
    };
  }

  // Overlay runtime-observed database overrides (Task 3.3)
  if (db) {
    try {
      const rows = db
        .prepare("SELECT capability, state, provenance, updated_at FROM host_capability_probes WHERE host = ?")
        .all(host) as Array<{ capability: string; state: any; provenance: any; updated_at: string }>;

      for (const row of rows) {
        capabilities[row.capability] = {
          state: row.state,
          provenance: row.provenance,
          updated_at: row.updated_at
        };
      }
    } catch {
      // Gracefully ignore if database or tables don't exist
    }
  }

  return {
    host,
    profile_version,
    adapter_version,
    capabilities,
    transcript_stability: DEFAULT_TRANSCRIPT_STABILITY[host] || "none",
    tool_coverage: DEFAULT_TOOL_COVERAGE[host] || [],
    observed_at: now
  };
};

/**
 * Dynamically records an observed host capability at runtime, overriding static defaults (Task 3.3).
 */
export const saveObservedHostCapability = (
  db: DatabaseSync,
  host: "openclaw" | "claude-code" | "codex" | "antigravity",
  capability: string,
  state: "verified" | "documented" | "inferred" | "disabled" | "unavailable",
  provenance: "verified" | "documented" | "inferred" | "disabled"
): void => {
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO host_capability_probes (host, capability, state, provenance, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(host, capability) DO UPDATE SET
         state = excluded.state,
         provenance = excluded.provenance,
         updated_at = excluded.updated_at`
    ).run(host, capability, state, provenance, now);
  } catch (error) {
    console.warn(`[ExperienceEngine] Failed to save observed host capability: ${error}`);
  }
};
