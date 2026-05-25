import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";

describe("trace configuration boundary", () => {
  it("keeps runtime trace capture separate from diagnostic snapshot persistence by default", () => {
    const config = loadConfig(
      {
        traceCaptureEnabled: true,
        traceCaptureHosts: ["codex"]
      },
      { env: {}, homeDir: "/tmp/ee-trace-config-defaults" }
    );

    expect(config.traceCaptureEnabled).toBe(true);
    expect(config.tracePersistDiagnosticSnapshots).toBe(false);
    expect(config.traceDiagnosticSnapshotHosts).toEqual([]);
  });

  it("maps deprecated full-capture allowlists to diagnostic snapshot persistence", () => {
    const config = loadConfig(
      {
        traceCaptureEnabled: true,
        traceMetadataOnly: false,
        traceFullCaptureHosts: ["antigravity"],
        traceFullCaptureScopes: ["repo-a"]
      },
      { env: {}, homeDir: "/tmp/ee-trace-config-legacy" }
    );

    expect(config.tracePersistDiagnosticSnapshots).toBe(true);
    expect(config.traceDiagnosticSnapshotHosts).toEqual(["antigravity"]);
    expect(config.traceDiagnosticSnapshotScopes).toEqual(["repo-a"]);
  });

  it("supports explicit diagnostic snapshot environment overrides", () => {
    const config = loadConfig(
      {},
      {
        env: {
          EXPERIENCE_ENGINE_TRACE_CAPTURE_ENABLED: "true",
          EXPERIENCE_ENGINE_TRACE_PERSIST_DIAGNOSTIC_SNAPSHOTS: "true",
          EXPERIENCE_ENGINE_TRACE_DIAGNOSTIC_SNAPSHOT_HOSTS: "codex,claude-code",
          EXPERIENCE_ENGINE_TRACE_DIAGNOSTIC_SNAPSHOT_SCOPES: "scope-a,scope-b"
        } as NodeJS.ProcessEnv,
        homeDir: "/tmp/ee-trace-config-env"
      }
    );

    expect(config.traceCaptureEnabled).toBe(true);
    expect(config.tracePersistDiagnosticSnapshots).toBe(true);
    expect(config.traceDiagnosticSnapshotHosts).toEqual(["codex", "claude-code"]);
    expect(config.traceDiagnosticSnapshotScopes).toEqual(["scope-a", "scope-b"]);
  });
});
