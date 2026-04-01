import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processClaudeHookPayload, persistClaudeHookCapture } from "../../src/cli/commands/claude-hook.js";
import { persistClaudeNormalizedEvent } from "../../src/adapters/claude-code/event-store.js";
import { normalizeClaudeHookPayload } from "../../src/adapters/claude-code/hook-normalizer.js";
import { loadClaudeSession } from "../../src/adapters/claude-code/session-store.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import { clearEmbeddingProviderForTests, setEmbeddingProviderForTests } from "../../src/store/vector/embeddings.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resolveScope } from "../../src/input/scope-resolver.js";
import { nowIso } from "../../src/utils/clock.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-hook-"));
  tempDirs.push(dir);
  return dir;
};

beforeEach(() => {
  setEmbeddingProviderForTests({
    provider: "local",
    model: "Xenova/multilingual-e5-small",
    version: "local-e5-v1",
    dimensions: 3,
    async embedQuery() {
      return [1, 0, 0];
    },
    async embedPassage() {
      return [1, 0, 0];
    }
  });
});

afterEach(() => {
  clearEmbeddingProviderForTests();
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("Claude hook capture", () => {
  it("persists hook payload JSON into the Claude adapter capture directory", () => {
    const homeDir = makeTempDir();
    const capturePath = persistClaudeHookCapture(
      JSON.stringify({
        session_id: "session-123",
        hook_event_name: "PostToolUse",
        tool_name: "Bash"
      }),
      { homeDir }
    );

    expect(capturePath).toBeTruthy();
    const captureDir = join(homeDir, ".experienceengine", "adapters", "claude-code", "captures");
    const files = readdirSync(captureDir);
    expect(files).toHaveLength(1);

    const capture = JSON.parse(readFileSync(join(captureDir, files[0]), "utf8")) as {
      payload?: { session_id?: string; hook_event_name?: string; tool_name?: string };
      raw?: string;
    };
    expect(capture.payload?.session_id).toBe("session-123");
    expect(capture.payload?.hook_event_name).toBe("PostToolUse");
    expect(capture.payload?.tool_name).toBe("Bash");
    expect(capture.raw).toContain("session-123");
  });

  it("appends normalized Claude events under the adapter state directory", () => {
    const homeDir = makeTempDir();
    const filePath = persistClaudeNormalizedEvent(
      normalizeClaudeHookPayload({
        hook_event_name: "SessionEnd",
        session_id: "session-789",
        message: "done"
      }),
      { homeDir }
    );

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const event = JSON.parse(lines[0]) as {
      adapter: string;
      eventName: string;
      sessionId?: string;
      promptText?: string;
    };
    expect(event.adapter).toBe("claude-code");
    expect(event.eventName).toBe("SessionEnd");
    expect(event.sessionId).toBe("session-789");
    expect(event.promptText).toBe("done");
  });

  it("persists session state across prompt and tool hooks, then replays on session end", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "session-replay",
        cwd: "/repo",
        prompt: "Fix the failing auth test"
      }),
      { homeDir, env }
    );
    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "session-replay",
        tool_name: "Bash",
        payload: {
          tool_input: { command: "pnpm test" },
          tool_result: { output: "auth test now passes" }
        },
        status: "success"
      }),
      { homeDir, env }
    );

    const stored = loadClaudeSession("session-replay", { homeDir, env });
    expect(stored?.promptContext?.taskSummary).toBe("Fix the failing auth test");
    expect(stored?.toolResults).toHaveLength(1);

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-replay"
      }),
      { homeDir, env }
    );

    expect(loadClaudeSession("session-replay", { homeDir, env })).toBeNull();

    const db = openDatabase(loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME },));
    const row = db
      .prepare(
        "SELECT session_id, task_summary, outcome_signal, evidence_json FROM experience_input_records WHERE session_id = ?"
      )
      .get("session-replay") as
      | {
          session_id: string;
          task_summary: string;
          outcome_signal: string;
          evidence_json: string;
        }
      | undefined;

    expect(row?.session_id).toBe("session-replay");
    expect(row?.task_summary).toBe("Fix the failing auth test");
    expect(row?.outcome_signal).toBe("success");
    expect(row?.evidence_json).toContain("Bash: success: auth test now passes");
  }, 10000);

  it("returns Claude additionalContext hook output for prompt-time injections and persists injected node ids", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const scope = resolveScope("/repo");
    const timestamp = nowIso();

    nodeRepo.upsert({
      id: "node_claude_prompt_injection",
      node_type: "strategy",
      scope_id: scope.scope_id,
      task_type: "test_debug",
      trigger_pattern: "Fix the failing auth test",
      applicability_notes: "Use the same repo and test scope",
      env_signature: undefined,
      compact_hint: "Run the failing test before editing and verify after the fix.",
      goal: "Stabilize the failing auth test",
      recommended_steps: ["Run the failing test", "Apply the minimal fix", "Re-run the test"],
      avoid_steps: [],
      fallback_steps: [],
      success_signal: "The targeted test passes",
      stop_condition: undefined,
      escalation_condition: undefined,
      evidence_summary: "Recovered the same failing auth test in a prior task.",
      retrieval_text: "Fix the failing auth test\nRun the failing test before editing and verify after the fix.",
      source_kind: "system_derived",
      origin_record_ids: [],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "candidate",
      usage_count: 0,
      helped_count: 0,
      harmed_count: 0,
      support_count: 1,
      last_used_at: undefined,
      last_helped_at: undefined,
      last_harmed_at: undefined,
      created_at: timestamp,
      updated_at: timestamp
    });

    const result = await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "session-injected-prompt",
        cwd: "/repo",
        prompt: "Fix the failing auth test"
      }),
      { homeDir, env }
    );

    expect(result.hookOutput).toBeTruthy();
    expect(result.notice).toBe(
      "[ExperienceEngine] Injected 1 strategy hint for this task (risk: high). Run ee inspect --last to review why it matched."
    );
    expect(JSON.parse(result.hookOutput ?? "{}")).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: expect.stringContaining(
          "Run the failing test before editing and verify after the fix."
        )
      }
    });

    const stored = loadClaudeSession("session-injected-prompt", { homeDir, env });
    expect(stored?.promptContext?.injectedNodeIds).toEqual(["node_claude_prompt_injection"]);

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-injected-prompt"
      }),
      { homeDir, env }
    );

    const row = db
      .prepare("SELECT injected_node_ids_json FROM experience_input_records WHERE session_id = ?")
      .get("session-injected-prompt") as { injected_node_ids_json: string } | undefined;

    expect(JSON.parse(row?.injected_node_ids_json ?? "[]")).toEqual(["node_claude_prompt_injection"]);
  });

  it("waits for async hybrid postmortem work before returning from SessionEnd", async () => {
    const homeDir = makeTempDir();
    const env = {
      EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine"),
      EXPERIENCE_ENGINE_HYBRID_ENABLED: "true",
      EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED: "true",
      EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_LLM_ENABLED: "true"
    };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME }, { env, homeDir });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const scope = resolveScope("/repo");
    const timestamp = nowIso();

    nodeRepo.upsert({
      id: "node_claude_postmortem_injection",
      node_type: "strategy",
      scope_id: scope.scope_id,
      task_type: "bug_fix",
      trigger_pattern: "diagnose a real bug",
      applicability_notes: "Same repo and diagnostic workflow",
      env_signature: undefined,
      compact_hint: "Inspect the installer flow before changing config state.",
      goal: "Diagnose the stale OpenClaw plugin entry issue",
      recommended_steps: ["Inspect installer flow", "Inspect plugin manifest", "Summarize root cause"],
      avoid_steps: [],
      fallback_steps: [],
      success_signal: "A root cause and remediation are identified",
      stop_condition: undefined,
      escalation_condition: undefined,
      evidence_summary: "A prior diagnostic run in the same repo produced a reusable path.",
      retrieval_text: "diagnose a real bug\nInspect the installer flow before changing config state.",
      source_kind: "system_derived",
      origin_record_ids: [],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "candidate",
      usage_count: 0,
      helped_count: 0,
      harmed_count: 0,
      support_count: 1,
      last_used_at: undefined,
      last_helped_at: undefined,
      last_harmed_at: undefined,
      created_at: timestamp,
      updated_at: timestamp
    });

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "session-async-postmortem",
        cwd: "/repo",
        prompt: "Diagnose a real bug without editing files."
      }),
      { homeDir, env }
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "session-async-postmortem",
        cwd: "/repo",
        tool_name: "Bash",
        payload: {
          tool_input: { command: "echo diagnosis complete" },
          tool_response: { stdout: "diagnosis complete" }
        },
        status: "success"
      }),
      { homeDir, env }
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-async-postmortem",
        cwd: "/repo"
      }),
      { homeDir, env }
    );

    const trace = db
      .prepare("SELECT worker_task, route, validation_status, fallback_reason FROM hybrid_invocation_traces WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
      .get("session-async-postmortem") as
      | {
          worker_task: string;
          route: string;
          validation_status: string;
          fallback_reason: string | null;
        }
      | undefined;

    expect(trace?.worker_task).toBe("postmortem_review");
    expect(trace?.route).toBe("ESCALATE_ASYNC_POSTMORTEM");
    expect(trace?.validation_status).toBe("fallback");
    expect(trace?.fallback_reason).toBe("provider_unavailable");
  });

  it("awaits runtime background learning during SessionEnd processing", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const { ExperienceRuntimeService } = await import("../../src/runtime/service.js");
    const waitSpy = vi
      .spyOn(ExperienceRuntimeService.prototype, "waitForBackgroundLearning")
      .mockResolvedValue();

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "session-await-background",
        cwd: "/repo",
        prompt: "Inspect the current repo state."
      }),
      { homeDir, env }
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-await-background",
        cwd: "/repo"
      }),
      { homeDir, env }
    );

    expect(waitSpy).toHaveBeenCalledTimes(1);
  });

  it("replays the latest pending session for the same cwd when SessionEnd arrives under a different session id", async () => {
    const homeDir = makeTempDir();
    const env = {
      EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine"),
      EXPERIENCE_ENGINE_HYBRID_ENABLED: "true",
      EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_ENABLED: "true",
      EXPERIENCE_ENGINE_HYBRID_ASYNC_POSTMORTEM_LLM_ENABLED: "true"
    };

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "session-primary",
        cwd: "/repo",
        prompt: "Diagnose the stale plugin issue."
      }),
      { homeDir, env }
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "session-primary",
        cwd: "/repo",
        tool_name: "Bash",
        payload: {
          tool_input: { command: "node dist/cli/index.js doctor openclaw" },
          tool_response: { stdout: "doctor ok" }
        },
        status: "success"
      }),
      { homeDir, env }
    );

    expect(loadClaudeSession("session-primary", { homeDir, env })).not.toBeNull();

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-sidechain",
        cwd: "/repo"
      }),
      { homeDir, env }
    );

    const db = openDatabase(loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME }, { env, homeDir }));
    const row = db
      .prepare("SELECT session_id, task_summary FROM experience_input_records WHERE session_id = ?")
      .get("session-primary") as
      | {
          session_id: string;
          task_summary: string;
        }
      | undefined;

    expect(row?.session_id).toBe("session-primary");
    expect(row?.task_summary).toBe("Diagnose the stale plugin issue.");
    expect(loadClaudeSession("session-primary", { homeDir, env })).toBeNull();
  });

  it("replays a real captured Claude tool-session fixture into evidence", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const fixture = JSON.parse(
      readFileSync(resolve("tests/fixtures/claude-code/scenario-real-tool-session.json"), "utf8")
    ) as { events: Array<unknown> };

    for (const event of fixture.events) {
      await processClaudeHookPayload(JSON.stringify(event), {
        homeDir,
        env
      });
    }

    const db = openDatabase(loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME }));
    const row = db
      .prepare("SELECT evidence_json FROM experience_input_records WHERE session_id = ?")
      .get("real-session-tool-sequence") as { evidence_json: string } | undefined;

    expect(JSON.parse(row?.evidence_json ?? "[]")).toContain(
      "Bash: success: /tmp/example-claude-tool-project\n1"
    );
  });

  it("replays a real captured Claude tool-failure fixture into injected harmed feedback", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const config = loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME });
    const db = openDatabase(config);
    bootstrapDatabase(db);
    const nodeRepo = new NodeRepository(db);
    const scope = resolveScope("/tmp/example-claude-failure-project");
    const timestamp = nowIso();

    nodeRepo.upsert({
      id: "node_claude_failure_fixture",
      node_type: "strategy",
      scope_id: scope.scope_id,
      task_type: "test_debug",
      trigger_pattern: "Reproduce the failing auth test",
      applicability_notes: "Reuse the same repo and failing auth test scope",
      env_signature: undefined,
      compact_hint: "Run the auth test first and stop once the failure is confirmed.",
      goal: "Confirm the auth test still fails",
      recommended_steps: ["Run the auth test", "Stop once the failure is confirmed"],
      avoid_steps: [],
      fallback_steps: [],
      success_signal: "The auth test failure is reproduced",
      stop_condition: undefined,
      escalation_condition: undefined,
      evidence_summary: "A prior Claude run reproduced the same auth test failure.",
      retrieval_text: "Reproduce the failing auth test\nRun the auth test first and stop once the failure is confirmed.",
      source_kind: "system_derived",
      origin_record_ids: [],
      helped_record_ids: [],
      harmed_record_ids: [],
      state: "candidate",
      usage_count: 0,
      helped_count: 0,
      harmed_count: 0,
      support_count: 1,
      last_used_at: undefined,
      last_helped_at: undefined,
      last_harmed_at: undefined,
      created_at: timestamp,
      updated_at: timestamp
    });

    const fixture = JSON.parse(
      readFileSync(resolve("tests/fixtures/claude-code/scenario-real-tool-failure-session.json"), "utf8")
    ) as { events: Array<unknown> };

    let firstResult:
      | {
          capturePath: string | null;
          hookOutput?: string;
        }
      | undefined;

    for (const [index, event] of fixture.events.entries()) {
      const result = await processClaudeHookPayload(JSON.stringify(event), {
        homeDir,
        env
      });
      if (index === 0) {
        firstResult = result;
      }
    }

    expect(firstResult?.hookOutput).toContain("Run the auth test first and stop once the failure is confirmed.");

    const row = db
      .prepare(
        "SELECT injected_node_ids_json, outcome_signal, evidence_json FROM experience_input_records WHERE session_id = ?"
      )
      .get("real-session-tool-failure") as
      | {
          injected_node_ids_json: string;
          outcome_signal: string;
          evidence_json: string;
        }
      | undefined;

    expect(JSON.parse(row?.injected_node_ids_json ?? "[]")).toEqual(["node_claude_failure_fixture"]);
    expect(row?.outcome_signal).toBe("failure");
    expect(JSON.parse(row?.evidence_json ?? "[]")).toContain("Bash: failure: Exit code 1\nauth test failing");

    const node = nodeRepo.getById("node_claude_failure_fixture");
    expect(node?.usage_count).toBe(1);
    expect(node?.helped_count).toBe(0);
    expect(node?.harmed_count).toBe(1);
  });

  it("replays a real captured Claude UserPromptSubmit payload fixture", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const fixture = JSON.parse(
      readFileSync(
        resolve("tests/fixtures/claude-code/scenario-real-user-prompt-submit.json"),
        "utf8"
      )
    ) as {
      events: Array<unknown>;
    };

    for (const event of fixture.events) {
      await processClaudeHookPayload(JSON.stringify(event), {
        homeDir,
        env
      });
    }

    const files = readdirSync(join(homeDir, ".experienceengine", "adapters", "claude-code", "captures"));
    expect(files).toHaveLength(1);

    const session = loadClaudeSession("real-session-user-prompt", { homeDir, env });
    expect(session?.promptContext?.userMessage).toBe("Reply with exactly OK.");
    expect(session?.promptContext?.cwd).toBe("/tmp/example-claude-project");
  });

  it("reconstructs prompt context from the transcript when SessionEnd arrives without a prior prompt hook", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const transcriptDir = join(homeDir, ".claude", "projects", "example-project");
    const transcriptPath = join(transcriptDir, "session-fallback.jsonl");
    rmSync(transcriptDir, { recursive: true, force: true });
    mkdirSync(transcriptDir, { recursive: true });
    writeFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: "user",
        cwd: "/tmp/example-claude-project",
        sessionId: "session-transcript-fallback",
        message: {
          role: "user",
          content: "Summarize the current working directory."
        }
      })}\n`,
      "utf8"
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "session-transcript-fallback",
        cwd: "/tmp/example-claude-project",
        tool_name: "Bash",
        payload: {
          tool_input: { command: "pwd" },
          tool_response: { stdout: "/tmp/example-claude-project" }
        },
        status: "success"
      }),
      { homeDir, env }
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-transcript-fallback",
        cwd: "/tmp/example-claude-project",
        transcript_path: transcriptPath
      }),
      { homeDir, env }
    );

    const db = openDatabase(loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME }));
    const row = db
      .prepare(
        "SELECT session_id, task_summary, outcome_signal, evidence_json FROM experience_input_records WHERE session_id = ?"
      )
      .get("session-transcript-fallback") as
      | {
          session_id: string;
          task_summary: string;
          outcome_signal: string;
          evidence_json: string;
        }
      | undefined;

    expect(row?.session_id).toBe("session-transcript-fallback");
    expect(row?.task_summary).toBe("Summarize the current working directory.");
    expect(row?.outcome_signal).toBe("success");
    expect(row?.evidence_json).toContain("Bash: success: /tmp/example-claude-project");
  });

  it("uses the latest user prompt when transcript fallback reconstructs a multi-turn session", async () => {
    const homeDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(homeDir, ".experienceengine") };
    const transcriptDir = join(homeDir, ".claude", "projects", "example-project");
    const transcriptPath = join(transcriptDir, "session-multi-turn.jsonl");
    rmSync(transcriptDir, { recursive: true, force: true });
    mkdirSync(transcriptDir, { recursive: true });
    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "user",
          cwd: "/tmp/example-claude-project",
          sessionId: "session-transcript-latest",
          message: {
            role: "user",
            content: "First task prompt."
          }
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: "Interim response."
          }
        }),
        JSON.stringify({
          type: "user",
          cwd: "/tmp/example-claude-project",
          sessionId: "session-transcript-latest",
          message: {
            role: "user",
            content: "Second task prompt."
          }
        })
      ].join("\n") + "\n",
      "utf8"
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "session-transcript-latest",
        cwd: "/tmp/example-claude-project",
        tool_name: "Bash",
        payload: {
          tool_input: { command: "pwd" },
          tool_response: { stdout: "/tmp/example-claude-project" }
        },
        status: "success"
      }),
      { homeDir, env }
    );

    await processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "session-transcript-latest",
        cwd: "/tmp/example-claude-project",
        transcript_path: transcriptPath
      }),
      { homeDir, env }
    );

    const db = openDatabase(loadConfig({ dataDir: env.EXPERIENCE_ENGINE_HOME }));
    const row = db
      .prepare("SELECT task_summary FROM experience_input_records WHERE session_id = ?")
      .get("session-transcript-latest") as { task_summary: string } | undefined;

    expect(row?.task_summary).toBe("Second task prompt.");
  });

  it("does not import the runtime module for PreToolUse-only hook processing", async () => {
    const homeDir = makeTempDir();

    vi.resetModules();
    vi.doMock("../../src/runtime/service.js", () => {
      throw new Error("runtime module should not load for PreToolUse");
    });

    const module = await import("../../src/cli/commands/claude-hook.js");
    const result = await module.processClaudeHookPayload(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        session_id: "session-pretool-lazy",
        cwd: "/repo",
        tool_name: "mcp__experienceengine__experienceengine_get_capabilities",
        tool_input: {}
      }),
      { homeDir }
    );

    expect(result.capturePath).toBeTruthy();
    vi.doUnmock("../../src/runtime/service.js");
    vi.resetModules();
  });
});
