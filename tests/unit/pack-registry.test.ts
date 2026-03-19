import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExperienceEnginePaths } from "../../src/config/path-resolver.js";
import { ExperiencePackRegistry } from "../../src/packs/fs-registry.js";
import { compilePack } from "../../src/compiler/compiler.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-pack-registry-"));
  tempDirs.push(dir);
  return dir;
};

const makeNode = (overrides: Partial<ExperienceNode> = {}): ExperienceNode => ({
  id: "node_auth_strategy",
  node_type: "strategy",
  scope_id: "scope_auth",
  task_type: "test_debug",
  trigger_pattern: "Auth vitest keeps failing",
  applicability_notes: "Use for repeated auth test debugging loops.",
  env_signature: undefined,
  compact_hint: "Keep the auth reproduction loop tight with vitest.",
  goal: "Restore passing auth tests.",
  recommended_steps: ["Run the auth vitest first", "Re-run after the smallest edit"],
  avoid_steps: [],
  fallback_steps: [],
  success_signal: "Auth vitest passes",
  stop_condition: undefined,
  escalation_condition: undefined,
  evidence_summary: "Auth vitest passed after a narrow fix.",
  retrieval_text: "Auth vitest keeps failing\nAuth vitest passed after a narrow fix.",
  embedding: undefined,
  embedding_provider: undefined,
  embedding_model: undefined,
  embedding_version: undefined,
  embedding_dimensions: undefined,
  distillation_mode_used: "llm",
  distillation_source: "host_mediated",
  redistilled_from: undefined,
  source_kind: "system_derived",
  origin_record_ids: ["input_auth_fix"],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 2,
  helped_count: 1,
  harmed_count: 0,
  support_count: 1,
  last_used_at: "2026-03-19T00:00:00.000Z",
  last_helped_at: "2026-03-19T00:00:00.000Z",
  last_harmed_at: undefined,
  created_at: "2026-03-19T00:00:00.000Z",
  updated_at: "2026-03-19T00:00:00.000Z",
  ...overrides
});

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("ExperiencePackRegistry", () => {
  it("creates a draft pack under the local shared registry with manifest and node snapshot", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    const created = registry.createDraft({
      packId: "auth-debug-pack",
      name: "Auth Debug Pack",
      description: "Reusable auth test debugging tactics.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex", "claude-code"],
      nodes: [makeNode()]
    });

    expect(created.packId).toBe("auth-debug-pack");
    expect(created.status).toBe("draft");
    expect(created.currentVersion).toBe("v1");

    const packJson = JSON.parse(
      readFileSync(join(paths.packsDir, "auth-debug-pack", "pack.json"), "utf8")
    ) as { status: string; currentVersion: string; hostCompatibility: string[] };
    const manifestJson = JSON.parse(
      readFileSync(join(paths.packsDir, "auth-debug-pack", "versions", "v1", "manifest.json"), "utf8")
    ) as { version: string; sourceNodeIds: string[] };
    const nodesJson = JSON.parse(
      readFileSync(join(paths.packsDir, "auth-debug-pack", "versions", "v1", "nodes.json"), "utf8")
    ) as Array<{ id: string; compact_hint: string }>;

    expect(packJson.status).toBe("draft");
    expect(packJson.currentVersion).toBe("v1");
    expect(packJson.hostCompatibility).toEqual(["codex", "claude-code"]);
    expect(manifestJson.version).toBe("v1");
    expect(manifestJson.sourceNodeIds).toEqual(["node_auth_strategy"]);
    expect(nodesJson).toHaveLength(1);
    expect(nodesJson[0]).toMatchObject({
      id: "node_auth_strategy",
      compact_hint: "Keep the auth reproduction loop tight with vitest."
    });
  });

  it("supports review, publish, and rollback across pack versions", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    registry.createDraft({
      packId: "auth-debug-pack",
      name: "Auth Debug Pack",
      description: "Reusable auth test debugging tactics.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex"],
      nodes: [makeNode()]
    });
    registry.reviewPack("auth-debug-pack", {
      description: "Reviewed auth debugging pack.",
      evidenceSummary: "Repeated auth vitest passes after narrow fixes.",
      riskLevel: "low"
    });
    registry.publishPack("auth-debug-pack");

    registry.createDraft({
      packId: "auth-debug-pack",
      name: "Auth Debug Pack",
      description: "Second version of the auth tactics.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex"],
      nodes: [makeNode({ id: "node_auth_strategy_v2", compact_hint: "Check auth mock startup before rerunning vitest." })]
    });
    registry.publishPack("auth-debug-pack");

    const rolledBack = registry.rollbackPack("auth-debug-pack", "v1");

    expect(rolledBack.currentVersion).toBe("v1");
    expect(rolledBack.status).toBe("rolled_back");

    const packJson = JSON.parse(
      readFileSync(join(paths.packsDir, "auth-debug-pack", "pack.json"), "utf8")
    ) as { currentVersion: string; status: string };
    const v1Manifest = JSON.parse(
      readFileSync(join(paths.packsDir, "auth-debug-pack", "versions", "v1", "manifest.json"), "utf8")
    ) as { statusSnapshot: string; publishedAt?: string };
    const v2Manifest = JSON.parse(
      readFileSync(join(paths.packsDir, "auth-debug-pack", "versions", "v2", "manifest.json"), "utf8")
    ) as { version: string };

    expect(packJson).toMatchObject({
      currentVersion: "v1",
      status: "rolled_back"
    });
    expect(v1Manifest.statusSnapshot).toBe("published");
    expect(v1Manifest.publishedAt).toBeTruthy();
    expect(v2Manifest.version).toBe("v2");
  });

  it("lists compiled artifacts for a pack by target and version", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    registry.createDraft({
      packId: "auth-debug-pack",
      name: "Auth Debug Pack",
      description: "Reusable auth test debugging tactics.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex"],
      nodes: [makeNode()]
    });
    registry.reviewPack("auth-debug-pack", {
      description: "Reviewed auth debugging pack.",
      evidenceSummary: "Repeated auth vitest passes after narrow fixes.",
      riskLevel: "low"
    });
    registry.publishPack("auth-debug-pack");
    compilePack({
      packsDir: paths.packsDir,
      packId: "auth-debug-pack",
      target: "agents",
      generatedAt: "2026-03-19T03:00:00.000Z"
    });
    compilePack({
      packsDir: paths.packsDir,
      packId: "auth-debug-pack",
      target: "codex",
      generatedAt: "2026-03-19T04:00:00.000Z"
    });

    expect(registry.listCompiledArtifacts("auth-debug-pack")).toEqual([
      expect.objectContaining({
        target: "codex",
        version: "v1",
        generatedAt: "2026-03-19T04:00:00.000Z",
        renderedNodeCount: 1
      }),
      expect.objectContaining({
        target: "agents",
        version: "v1",
        generatedAt: "2026-03-19T03:00:00.000Z",
        renderedNodeCount: 1
      })
    ]);
    expect(registry.getCompileStatus("auth-debug-pack", "v1")).toMatchObject({
      currentVersionCompiledTargets: ["agents", "codex"],
      stale: false,
      latestArtifact: expect.objectContaining({
        target: "codex",
        version: "v1"
      })
    });
  });
});
