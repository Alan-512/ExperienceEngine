import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { ExperiencePackRepository } from "../../src/store/sqlite/repositories/pack-repo.js";
import type {
  ExperiencePackActivation,
  ExperiencePackMembership,
  ExperiencePackSummaryRecord,
  ExperiencePackVersionRecord
} from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeDb = () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-pack-repo-"));
  tempDirs.push(runtimeDir);
  const db = openDatabase(
    loadConfig({
      dataDir: runtimeDir,
      sqlitePath: join(runtimeDir, "experienceengine.db"),
      captureDir: join(runtimeDir, "captures")
    })
  );
  bootstrapDatabase(db);
  return db;
};

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const pack = (overrides: Partial<ExperiencePackSummaryRecord> = {}): ExperiencePackSummaryRecord => ({
  pack_id: "auth-debug-pack",
  name: "Auth Debug Pack",
  description: "Reusable auth tactics.",
  owner: "seed",
  status: "published",
  current_version: "v2",
  scope_hints: ["repo:experienceengine"],
  task_families: ["test_debug"],
  host_compatibility: ["codex", "claude-code"],
  created_at: "2026-03-19T00:00:00.000Z",
  updated_at: "2026-03-19T00:10:00.000Z",
  published_at: "2026-03-19T00:10:00.000Z",
  rolled_back_at: undefined,
  ...overrides
});

const version = (overrides: Partial<ExperiencePackVersionRecord> = {}): ExperiencePackVersionRecord => ({
  pack_id: "auth-debug-pack",
  version: "v2",
  status_snapshot: "published",
  evidence_summary: "Auth vitest repeated pass in a narrow loop.",
  benchmark_summary: "healthy",
  risk_level: "low",
  ttl: undefined,
  host_compatibility: ["codex", "claude-code"],
  created_at: "2026-03-19T00:10:00.000Z",
  published_at: "2026-03-19T00:10:00.000Z",
  rolled_back_from: undefined,
  ...overrides
});

const membership = (overrides: Partial<ExperiencePackMembership> = {}): ExperiencePackMembership => ({
  pack_id: "auth-debug-pack",
  version: "v2",
  node_id: "node_auth_strategy",
  created_at: "2026-03-19T00:10:00.000Z",
  ...overrides
});

const activation = (overrides: Partial<ExperiencePackActivation> = {}): ExperiencePackActivation => ({
  scope_id: "scope_ee",
  pack_id: "auth-debug-pack",
  enabled: true,
  pinned_version: "v2",
  created_at: "2026-03-19T00:10:00.000Z",
  updated_at: "2026-03-19T00:10:00.000Z",
  ...overrides
});

describe("ExperiencePackRepository", () => {
  it("persists pack summaries, versions, memberships, and activations", () => {
    const db = makeDb();
    const repo = new ExperiencePackRepository(db);

    repo.upsertPack(pack());
    repo.upsertVersion(version());
    repo.replaceMemberships("auth-debug-pack", "v2", [membership()]);
    repo.upsertActivation(activation());

    expect(repo.getPack("auth-debug-pack")).toMatchObject({
      pack_id: "auth-debug-pack",
      current_version: "v2",
      status: "published"
    });
    expect(repo.listVersions("auth-debug-pack")).toHaveLength(1);
    expect(repo.listMemberships("auth-debug-pack", "v2")).toEqual([
      expect.objectContaining({ node_id: "node_auth_strategy" })
    ]);
    expect(repo.listActivations("scope_ee")).toEqual([
      expect.objectContaining({ pack_id: "auth-debug-pack", pinned_version: "v2", enabled: true })
    ]);
  });
});
