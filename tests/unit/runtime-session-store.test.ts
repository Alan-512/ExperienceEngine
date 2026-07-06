import { describe, expect, it } from "vitest";
import { RuntimeSessionStore, mergeContext, resolveSessionEpisodeId } from "../../src/runtime/session-runtime.js";

describe("RuntimeSessionStore", () => {
  it("creates isolated sessions with the runtime defaults", () => {
    const store = new RuntimeSessionStore();

    const first = store.get("session-a");
    const second = store.get("session-b");

    expect(first).toMatchObject({
      toolEvents: [],
      injectedNodeIds: [],
      traceEvents: []
    });
    expect(first.toolEventKeys).toBeInstanceOf(Set);
    expect(second).not.toBe(first);
  });

  it("merges host context while preserving useful existing context", () => {
    const merged = mergeContext(
      {
        host: "codex",
        sessionId: "session-a",
        cwd: "/repo",
        userMessage: "Fix the failing test",
        taskSummary: "Fix the failing test",
        contextSummary: "Existing context",
        injectedNodeIds: ["node-a"]
      },
      {
        sessionId: "session-a",
        userMessage: "",
        contextSummary: "Updated context"
      }
    );

    expect(merged).toEqual({
      host: "codex",
      sessionId: "session-a",
      cwd: "/repo",
      userMessage: "Fix the failing test",
      taskSummary: "Fix the failing test",
      contextSummary: "Updated context",
      injectedNodeIds: ["node-a"]
    });
  });

  it("resets session state without changing episode id derivation semantics", () => {
    const store = new RuntimeSessionStore();
    const session = store.mergeContext("session-a", {
      sessionId: "session-a",
      cwd: "/repo",
      userMessage: "Fix the failing test",
      taskSummary: "Fix the failing test"
    });

    session.toolEventKeys.add("tool-key");
    const firstEpisodeId = resolveSessionEpisodeId(session, "session-a", {
      scope_id: "scope-a",
      task_summary: "Fix the failing test"
    });
    const secondEpisodeId = resolveSessionEpisodeId(session, "session-a", {
      scope_id: "scope-a",
      task_summary: "A later summary should not change an active episode"
    });

    expect(secondEpisodeId).toBe(firstEpisodeId);

    store.reset("session-a");
    const nextSession = store.get("session-a");
    const resetEpisodeId = resolveSessionEpisodeId(nextSession, "session-a", {
      scope_id: "scope-a",
      task_summary: "Fix the failing test"
    });

    expect(nextSession.toolEventKeys.size).toBe(0);
    expect(resetEpisodeId).toBe(firstEpisodeId);
  });
});
