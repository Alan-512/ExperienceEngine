import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { getHostTraceCapabilityProfile, saveObservedHostCapability } from "../../src/adapters/trace-capabilities.js";
import { runDoctorCommand } from "../../src/cli/commands/doctor.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

// Mock loadConfig to prevent real workspace database updates (Finding 1)
vi.mock("../../src/config/load-config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/config/load-config.js")>();
  return {
    ...original,
    loadConfig: vi.fn(original.loadConfig)
  };
});

const tempDirs: string[] = [];
const activeConnections: any[] = [];
let testConfig: any;

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-capabilities-repo-"));
  tempDirs.push(runtimeDir);
  const db = openDatabase(
    loadConfig({
      dataDir: runtimeDir,
      sqlitePath: join(runtimeDir, "experienceengine.db"),
      captureDir: join(runtimeDir, "captures")
    })
  );
  bootstrapDatabase(db);
  activeConnections.push(db);
  return db;
};

beforeEach(() => {
  vi.mocked(loadConfig).mockReset();
  
  // Create a shared isolated temp config for the CLI doctor tests
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-capabilities-cli-"));
  tempDirs.push(runtimeDir);
  
  testConfig = loadConfig({
    dataDir: runtimeDir,
    sqlitePath: join(runtimeDir, "experienceengine.db"),
    captureDir: join(runtimeDir, "captures")
  });
  
  // Set up mock database file
  const db = openDatabase(testConfig);
  bootstrapDatabase(db);
  db.close();

  vi.mocked(loadConfig).mockReturnValue(testConfig);
});

afterEach(() => {
  // Gracefully close all connection handles to prevent Windows filesystem locks (Finding 2)
  while (activeConnections.length) {
    try {
      activeConnections.pop()!.close();
    } catch {}
  }
  
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

describe("Trace Capability Profiles And Doctor Command", () => {
  describe("getHostTraceCapabilityProfile", () => {
    it("returns static defaults for each supported host", () => {
      const db = makeDb();
      
      const codexProfile = getHostTraceCapabilityProfile("codex", db);
      expect(codexProfile.host).toBe("codex");
      expect(codexProfile.capabilities.prompt.state).toBe("verified");
      expect(codexProfile.capabilities.compaction.state).toBe("documented");
      expect(codexProfile.tool_coverage).toContain("replace_file_content");
      
      const antigravityProfile = getHostTraceCapabilityProfile("antigravity", db);
      expect(antigravityProfile.host).toBe("antigravity");
      expect(antigravityProfile.capabilities.prompt.state).toBe("verified");
      expect(antigravityProfile.capabilities.file_change.state).toBe("verified");
    });

    it("overlays dynamic database overrides correctly (Task 3.3)", () => {
      const db = makeDb();
      
      // Save dynamic overrides
      saveObservedHostCapability(db, "codex", "compaction", "verified", "verified");
      saveObservedHostCapability(db, "codex", "subagent_lifecycle", "disabled", "disabled");

      const codexProfile = getHostTraceCapabilityProfile("codex", db);
      expect(codexProfile.capabilities.compaction.state).toBe("verified");
      expect(codexProfile.capabilities.compaction.provenance).toBe("verified");
      expect(codexProfile.capabilities.subagent_lifecycle.state).toBe("disabled");
      expect(codexProfile.capabilities.subagent_lifecycle.provenance).toBe("disabled");
      
      // The prompt capability should remain at its default verified state
      expect(codexProfile.capabilities.prompt.state).toBe("verified");
      expect(codexProfile.capabilities.prompt.provenance).toBe("verified");
    });
  });

  describe("Doctor command --trace-capabilities (Task 3.2)", () => {
    it("correctly routes and logs target trace capabilities to stdout", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await runDoctorCommand("antigravity", {}, ["--trace-capabilities"]);
        
        expect(consoleLogSpy).toHaveBeenCalled();
        const logs = consoleLogSpy.mock.calls.map(c => c[0]).join("\n");
        expect(logs).toContain("Host Trace Capability Profile: antigravity");
        expect(logs).toContain("- Profile Version: 1.0.0");
        expect(logs).toContain("- prompt: verified");
      } finally {
        consoleLogSpy.mockRestore();
      }
    });

    it("displays an error for invalid targets with trace capabilities", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await runDoctorCommand("invalid-host", {}, ["--trace-capabilities"]);
        expect(consoleLogSpy).toHaveBeenCalledWith("Error: Please specify a valid target host: openclaw | claude-code | codex | antigravity");
      } finally {
        consoleLogSpy.mockRestore();
      }
    });
  });
});
