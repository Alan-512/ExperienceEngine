import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPackCommand } from "../../src/cli/commands/pack.js";
import { loadConfig } from "../../src/config/load-config.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { ExperiencePackRepository } from "../../src/store/sqlite/repositories/pack-repo.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-pack-command-"));
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

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }

  consoleLogSpy.mockClear();
  consoleTableSpy.mockClear();
});

describe("pack CLI command", () => {
  it("creates, reviews, publishes, lists, inspects, and rolls back a pack", () => {
    const homeDir = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const packRepo = new ExperiencePackRepository(db);

    nodeRepo.upsert(makeNode());
    nodeRepo.upsert(makeNode({ id: "node_auth_warning", node_type: "warning", compact_hint: "Check the auth mock startup before retrying vitest." }));

    runPackCommand(["draft", "create", "auth-debug-pack", "node_auth_strategy,node_auth_warning", "Auth", "Debug", "Pack"]);
    runPackCommand(["review", "auth-debug-pack", "Reviewed", "auth", "debugging", "pack"]);
    runPackCommand(["publish", "auth-debug-pack"]);
    runPackCommand(["enable", "auth-debug-pack", "scope_ee"]);
    runPackCommand(["compile", "auth-debug-pack"]);
    runPackCommand(["list"]);
    runPackCommand(["inspect", "auth-debug-pack"]);

    expect(packRepo.getPack("auth-debug-pack")).toMatchObject({
      pack_id: "auth-debug-pack",
      status: "published",
      current_version: "v1"
    });
    expect(packRepo.listActivations("scope_ee")).toEqual([
      expect.objectContaining({
        pack_id: "auth-debug-pack",
        enabled: true,
        pinned_version: "v1"
      })
    ]);
    expect(consoleTableSpy).toHaveBeenCalled();
    expect(consoleTableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        pack_id: "auth-debug-pack",
        current_version_compiled: "agents",
        stale: false,
        latest_compile_target: "agents"
      })
    ]);
    expect(consoleLogSpy.mock.calls.flat().join("\n")).toContain("Pack: auth-debug-pack");
    expect(consoleLogSpy.mock.calls.flat().join("\n")).toContain("Status: published");
    expect(consoleLogSpy.mock.calls.flat().join("\n")).toContain("Activations: scope_ee@v1 [enabled]");
    expect(consoleLogSpy.mock.calls.flat().join("\n")).toContain("Current version compiled targets: agents");
    expect(consoleLogSpy.mock.calls.flat().join("\n")).toContain("Compile stale: false");
    expect(consoleLogSpy.mock.calls.flat().join("\n")).toContain("Compiled targets:");
    expect(consoleLogSpy.mock.calls.flat().join("\n")).toContain("agents@v1");

    runPackCommand(["draft", "create", "auth-debug-pack", "node_auth_strategy", "Auth", "Debug", "Pack"]);
    runPackCommand(["publish", "auth-debug-pack"]);
    runPackCommand(["rollback", "auth-debug-pack", "v1"]);
    runPackCommand(["disable", "auth-debug-pack", "scope_ee"]);

    expect(packRepo.getPack("auth-debug-pack")).toMatchObject({
      status: "rolled_back",
      current_version: "v1"
    });
    expect(packRepo.listActivations("scope_ee")).toEqual([
      expect.objectContaining({
        pack_id: "auth-debug-pack",
        enabled: false
      })
    ]);
  });

  it("compiles a published pack into AGENTS.md-style output", () => {
    const homeDir = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);

    nodeRepo.upsert(makeNode());
    runPackCommand(["draft", "create", "auth-debug-pack", "node_auth_strategy", "Auth", "Debug", "Pack"]);
    runPackCommand(["review", "auth-debug-pack", "Reviewed", "auth", "debugging", "pack"]);
    runPackCommand(["publish", "auth-debug-pack"]);
    runPackCommand(["compile", "auth-debug-pack"]);

    const output = consoleLogSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Compiled experience pack auth-debug-pack");
    expect(output).toContain("AGENTS.md:");
    expect(output).toContain("compile-report.json:");
  });

  it("compiles a published pack into CODEX.md output when target is codex", () => {
    const homeDir = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);

    nodeRepo.upsert(makeNode());
    runPackCommand(["draft", "create", "codex-pack", "node_auth_strategy", "Codex", "Pack"]);
    runPackCommand(["review", "codex-pack", "Reviewed", "codex", "pack"]);
    runPackCommand(["publish", "codex-pack"]);
    runPackCommand(["compile", "codex-pack", "codex"]);

    const output = consoleLogSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Compiled experience pack codex-pack");
    expect(output).toContain("CODEX.md:");
    expect(output).toContain("compile-report.json:");
  });

  it("compiles a published pack into a GitHub custom agent profile when target is github", () => {
    const homeDir = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);

    nodeRepo.upsert(makeNode());
    runPackCommand(["draft", "create", "github-pack", "node_auth_strategy", "GitHub", "Pack"]);
    runPackCommand(["review", "github-pack", "Reviewed", "github", "pack"]);
    runPackCommand(["publish", "github-pack"]);
    runPackCommand(["compile", "github-pack", "github"]);

    const output = consoleLogSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Compiled experience pack github-pack");
    expect(output).toContain("github-pack.agent.md:");
    expect(output).toContain("compile-report.json:");
  });

  it("deploys a compiled agents target into the target repo with dry-run support", () => {
    const homeDir = makeTempDir();
    const targetRepo = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);

    nodeRepo.upsert(makeNode());
    runPackCommand(["draft", "create", "deploy-pack", "node_auth_strategy", "Deploy", "Pack"]);
    runPackCommand(["review", "deploy-pack", "Reviewed", "deploy", "pack"]);
    runPackCommand(["publish", "deploy-pack"]);

    runPackCommand(["deploy", "deploy-pack", "agents", targetRepo, "--dry-run"]);

    const output = consoleLogSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Deploy target: agents");
    expect(output).toContain(`Destination: ${join(targetRepo, "AGENTS.md")}`);
    expect(output).toContain("Dry run: true");
    expect(existsSync(join(targetRepo, "AGENTS.md"))).toBe(false);

    consoleLogSpy.mockClear();
    runPackCommand(["deploy", "deploy-pack", "agents", targetRepo]);
    expect(existsSync(join(targetRepo, "AGENTS.md"))).toBe(true);
    expect(readFileSync(join(targetRepo, "AGENTS.md"), "utf8")).toContain("# Experience Pack: Deploy Pack");
  });

  it("refuses to overwrite an existing deployed target unless force is set", () => {
    const homeDir = makeTempDir();
    const targetRepo = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);

    nodeRepo.upsert(makeNode());
    runPackCommand(["draft", "create", "deploy-pack", "node_auth_strategy", "Deploy", "Pack"]);
    runPackCommand(["review", "deploy-pack", "Reviewed", "deploy", "pack"]);
    runPackCommand(["publish", "deploy-pack"]);
    runPackCommand(["deploy", "deploy-pack", "codex", targetRepo]);

    writeFileSync(join(targetRepo, "CODEX.md"), "custom local content\n");
    expect(() => runPackCommand(["deploy", "deploy-pack", "codex", targetRepo])).toThrow(
      "Destination already exists"
    );

    runPackCommand(["deploy", "deploy-pack", "codex", targetRepo, "--force"]);
    expect(readFileSync(join(targetRepo, "CODEX.md"), "utf8")).toContain("# Codex Instructions: Deploy Pack");
  });

  it("deploys a github target into .github/agents using the pack id", () => {
    const homeDir = makeTempDir();
    const targetRepo = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HOME = join(homeDir, ".experienceengine");
    const db = openDatabase(loadConfig());
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);

    nodeRepo.upsert(makeNode());
    runPackCommand(["draft", "create", "github-pack", "node_auth_strategy", "GitHub", "Pack"]);
    runPackCommand(["review", "github-pack", "Reviewed", "github", "pack"]);
    runPackCommand(["publish", "github-pack"]);

    runPackCommand(["deploy", "github-pack", "github", targetRepo]);
    const destination = join(targetRepo, ".github", "agents", "github-pack.md");
    expect(existsSync(destination)).toBe(true);
    expect(readFileSync(destination, "utf8")).toContain("# GitHub Copilot Custom Agent Profile");
  });
});
