import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { compilePack, compilePackToAgents, compilePackToCodex } from "../../src/compiler/compiler.js";
import { renderAgentsMarkdown } from "../../src/compiler/agents-renderer.js";
import { renderClaudeMarkdown } from "../../src/compiler/claude-renderer.js";
import { renderGitHubAgentMarkdown } from "../../src/compiler/github-renderer.js";
import { resolveExperienceEnginePaths } from "../../src/config/path-resolver.js";
import { ExperiencePackRegistry } from "../../src/packs/fs-registry.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-compiler-"));
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
  distillation_source: "explicit_provider",
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

describe("Experience Compiler v1", () => {
  it("renders deterministic AGENTS.md content with strategy and warning sections", () => {
    const markdown = renderAgentsMarkdown({
      generatedAt: "2026-03-19T10:00:00.000Z",
      pack: {
        packId: "auth-debug-pack",
        name: "Auth Debug Pack",
        description: "Reusable auth debugging tactics.",
        owner: "seed",
        status: "published",
        currentVersion: "v1",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
        publishedAt: "2026-03-19T00:00:00.000Z",
        rolledBackAt: undefined,
        scopeHints: ["repo:experienceengine"],
        taskFamilies: ["test_debug"],
        hostCompatibility: ["codex", "claude-code"]
      },
      manifest: {
        packId: "auth-debug-pack",
        version: "v1",
        statusSnapshot: "published",
        sourceNodeIds: ["node_auth_strategy", "node_auth_warning", "node_retired"],
        evidenceSummary: "Auth vitest evidence",
        benchmarkSummary: "healthy",
        riskLevel: "medium",
        ttl: undefined,
        hostCompatibility: ["codex", "claude-code"],
        createdAt: "2026-03-19T00:00:00.000Z",
        publishedAt: "2026-03-19T00:00:00.000Z"
      },
      nodes: [
        makeNode(),
        makeNode({
          id: "node_auth_warning",
          node_type: "warning",
          compact_hint: "Check the auth mock startup before rerunning vitest.",
          trigger_pattern:
            "Auth mock is flaky. First run `cd /home/alice/project` then run `pnpm test auth` and inspect /home/alice/project/packages/auth/mock.ts before retrying.",
          helped_count: 0,
          harmed_count: 1,
          usage_count: 1
        }),
        makeNode({
          id: "node_retired",
          state: "retired",
          compact_hint: "Retired node should not render."
        })
      ]
    });

    expect(markdown).toContain("# Experience Pack: Auth Debug Pack");
    expect(markdown).toContain("## Strategies");
    expect(markdown).toContain("## Warnings");
    expect(markdown).toContain("Confidence: medium");
    expect(markdown).toContain("Confidence: low");
    expect(markdown).toContain("Pack ID: auth-debug-pack");
    expect(markdown).toContain("Version: v1");
    expect(markdown).not.toContain("/home/alice/project");
    expect(markdown).not.toContain("pnpm test auth");
    expect(markdown).not.toContain("`cd /home/alice/project`");
    expect(markdown).not.toContain("First run");
    expect(markdown).not.toContain(". .");
    expect(markdown).not.toContain("Retired node should not render.");
  });

  it("compiles a published pack current version into compiled/agents output", () => {
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
      nodes: [
        makeNode(),
        makeNode({
          id: "node_auth_warning",
          node_type: "warning",
          compact_hint: "Check auth mock startup before rerunning vitest."
        })
      ]
    });
    registry.reviewPack("auth-debug-pack", {
      description: "Reviewed auth pack.",
      evidenceSummary: "Reviewed auth evidence.",
      riskLevel: "low"
    });
    registry.publishPack("auth-debug-pack");

    const result = compilePackToAgents({
      packsDir: paths.packsDir,
      packId: "auth-debug-pack",
      generatedAt: "2026-03-19T12:00:00.000Z"
    });

    expect(result.target).toBe("agents");
    expect(result.packId).toBe("auth-debug-pack");
    expect(result.version).toBe("v1");
    expect(result.renderedNodeCount).toBe(2);
    expect(result.outputDir).toBe(join(paths.packsDir, "auth-debug-pack", "compiled", "agents", "v1"));
    expect(existsSync(result.outputPath)).toBe(true);
    expect(existsSync(result.reportPath)).toBe(true);

    const markdown = readFileSync(result.outputPath, "utf8");
    const report = JSON.parse(readFileSync(result.reportPath, "utf8")) as {
      packId: string;
      version: string;
      target: string;
      outputPath: string;
    };

    expect(markdown).toContain("# Experience Pack: Auth Debug Pack");
    expect(report).toMatchObject({
      packId: "auth-debug-pack",
      version: "v1",
      target: "agents",
      outputPath: result.outputPath
    });
  });

  it("compiles a published pack into codex instructions output", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    registry.createDraft({
      packId: "codex-pack",
      name: "Codex Pack",
      description: "Codex target export.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex"],
      nodes: [makeNode()]
    });
    registry.reviewPack("codex-pack", {
      description: "Reviewed codex pack.",
      evidenceSummary: "Reviewed codex evidence.",
      riskLevel: "low"
    });
    registry.publishPack("codex-pack");

    const result = compilePackToCodex({
      packsDir: paths.packsDir,
      packId: "codex-pack",
      generatedAt: "2026-03-19T12:30:00.000Z"
    });

    expect(result.target).toBe("codex");
    expect(result.outputDir).toBe(join(paths.packsDir, "codex-pack", "compiled", "codex", "v1"));
    expect(result.outputPath).toBe(join(paths.packsDir, "codex-pack", "compiled", "codex", "v1", "CODEX.md"));
    const markdown = readFileSync(result.outputPath, "utf8");
    expect(markdown).toContain("# Codex Instructions: Codex Pack");
    expect(markdown).toContain("## Preferred Strategies");
  });

  it("renders claude instructions with operating rules and guidance sections", () => {
    const markdown = renderClaudeMarkdown({
      generatedAt: "2026-03-19T12:36:00.000Z",
      pack: {
        packId: "claude-pack",
        name: "Claude Pack",
        description: "Claude target export.",
        owner: "seed",
        status: "published",
        currentVersion: "v1",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
        publishedAt: "2026-03-19T00:00:00.000Z",
        rolledBackAt: undefined,
        scopeHints: ["repo:experienceengine"],
        taskFamilies: ["test_debug"],
        hostCompatibility: ["claude-code"]
      },
      manifest: {
        packId: "claude-pack",
        version: "v1",
        statusSnapshot: "published",
        sourceNodeIds: ["node_auth_strategy"],
        evidenceSummary: "Claude evidence",
        benchmarkSummary: "healthy",
        riskLevel: "medium",
        ttl: undefined,
        hostCompatibility: ["claude-code"],
        createdAt: "2026-03-19T00:00:00.000Z",
        publishedAt: "2026-03-19T00:00:00.000Z"
      },
      nodes: [makeNode()]
    });

    expect(markdown).toContain("# Claude Code Instructions: Claude Pack");
    expect(markdown).toContain("## Operating Rules");
    expect(markdown).toContain("## Preferred Strategies");
  });

  it("renders a github custom agent profile with frontmatter and guidance sections", () => {
    const markdown = renderGitHubAgentMarkdown({
      generatedAt: "2026-03-19T12:35:00.000Z",
      pack: {
        packId: "github-pack",
        name: "GitHub Pack",
        description: "GitHub target export.",
        owner: "seed",
        status: "published",
        currentVersion: "v1",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
        publishedAt: "2026-03-19T00:00:00.000Z",
        rolledBackAt: undefined,
        scopeHints: ["repo:experienceengine"],
        taskFamilies: ["test_debug"],
        hostCompatibility: ["codex", "claude-code"]
      },
      manifest: {
        packId: "github-pack",
        version: "v1",
        statusSnapshot: "published",
        sourceNodeIds: ["node_auth_strategy"],
        evidenceSummary: "GitHub agent evidence",
        benchmarkSummary: "healthy",
        riskLevel: "medium",
        ttl: undefined,
        hostCompatibility: ["codex"],
        createdAt: "2026-03-19T00:00:00.000Z",
        publishedAt: "2026-03-19T00:00:00.000Z"
      },
      nodes: [
        makeNode({
          trigger_pattern:
            "Simulate an API integration fix. Use the exec tool only. Step 1: run pnpm test api. Step 2: run pnpm test api again after the smallest change."
        })
      ]
    });

    expect(markdown).toContain("---");
    expect(markdown).toContain("name: GitHub Pack");
    expect(markdown).toContain("tools:");
    expect(markdown).toContain("# GitHub Copilot Custom Agent Profile");
    expect(markdown).toContain("## Preferred Strategies");
    expect(markdown).toContain("- Applies to: test_debug tasks matching the same historical signal");
    expect(markdown).not.toContain("### test_debug:");
    expect(markdown).not.toContain("Step 1: run pnpm test api");
  });

  it("supports generic compile target selection", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    registry.createDraft({
      packId: "generic-pack",
      name: "Generic Pack",
      description: "Generic compile path.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex"],
      nodes: [makeNode()]
    });
    registry.reviewPack("generic-pack", {
      description: "Reviewed generic pack.",
      evidenceSummary: "Reviewed generic evidence.",
      riskLevel: "low"
    });
    registry.publishPack("generic-pack");

    const result = compilePack({
      packsDir: paths.packsDir,
      packId: "generic-pack",
      target: "codex",
      generatedAt: "2026-03-19T12:40:00.000Z"
    });

    expect(result.target).toBe("codex");
    expect(result.outputPath).toContain("/compiled/codex/v1/CODEX.md");
  });

  it("supports claude output target selection", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    registry.createDraft({
      packId: "claude-pack",
      name: "Claude Pack",
      description: "Claude compile path.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["claude-code"],
      nodes: [makeNode()]
    });
    registry.reviewPack("claude-pack", {
      description: "Reviewed claude pack.",
      evidenceSummary: "Reviewed claude evidence.",
      riskLevel: "low"
    });
    registry.publishPack("claude-pack");

    const result = compilePack({
      packsDir: paths.packsDir,
      packId: "claude-pack",
      target: "claude",
      generatedAt: "2026-03-19T12:40:00.000Z"
    });

    expect(result.target).toBe("claude");
    expect(result.outputPath).toContain("/compiled/claude/v1/CLAUDE.md");
  });

  it("supports github custom agent profile output", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    registry.createDraft({
      packId: "github-pack",
      name: "GitHub Pack",
      description: "GitHub custom agent export.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex"],
      nodes: [makeNode()]
    });
    registry.reviewPack("github-pack", {
      description: "Reviewed GitHub pack.",
      evidenceSummary: "Reviewed GitHub evidence.",
      riskLevel: "low"
    });
    registry.publishPack("github-pack");

    const result = compilePack({
      packsDir: paths.packsDir,
      packId: "github-pack",
      target: "github",
      generatedAt: "2026-03-19T12:50:00.000Z"
    });

    expect(result.target).toBe("github");
    expect(result.outputPath).toContain("/compiled/github/v1/github-pack.agent.md");
    const markdown = readFileSync(result.outputPath, "utf8");
    expect(markdown).toContain("name: GitHub Pack");
    expect(markdown).toContain("# GitHub Copilot Custom Agent Profile");
  });

  it("fails when compiling a non-published pack", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    const registry = new ExperiencePackRegistry({ packsDir: paths.packsDir });

    registry.createDraft({
      packId: "draft-pack",
      name: "Draft Pack",
      description: "Still in draft.",
      owner: "seed",
      scopeHints: ["repo:experienceengine"],
      taskFamilies: ["test_debug"],
      hostCompatibility: ["codex"],
      nodes: [makeNode()]
    });

    expect(() =>
      compilePackToAgents({
        packsDir: paths.packsDir,
        packId: "draft-pack",
        generatedAt: "2026-03-19T12:00:00.000Z"
      })
    ).toThrow("Only published or rolled-back packs can be compiled");
  });
});
