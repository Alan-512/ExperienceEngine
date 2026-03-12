# Design: Codex Behavior Loop

## Runtime Model

Codex does not currently have the same documented lifecycle hook surface as OpenClaw or Claude Code, so ExperienceEngine will expose the shared runtime lifecycle as MCP tools.

The Codex MCP server process must keep one shared `ExperienceRuntimeService` instance alive for the lifetime of the server connection. That is the only way to preserve:

- remembered prompt context
- injected node ids selected during hint lookup
- tool events recorded before task finalization

If each tool call created a new runtime instance, session state would be lost and helped/harmed attribution would be wrong.

## MCP Tool Surface

The Codex server will expose three tools:

1. `experienceengine_lookup_hints`
   - inputs: `cwd`, `prompt`, optional `sessionId`
   - behavior: call `beforePromptBuild`
   - output: injection mode, text, injected node ids

2. `experienceengine_record_tool_result`
   - inputs: `sessionId`, `toolName`, optional summaries and status fields
   - behavior: call `persistToolResult`
   - output: normalized tool event summary

3. `experienceengine_finalize_task`
   - inputs: `sessionId`, `cwd`, `prompt`, optional `contextSummary`
   - behavior: call `finalizeTask`
   - output: finalized task type, outcome signal, injected node ids

This makes the Codex loop explicit and host-agnostic: lookup first, record any tool results, then finalize once the task is done.

## Validation Strategy

Validation will stay aligned with the existing product loop:

- seed a matching strategy node
- call lookup to trigger injection
- record a failed or successful tool result
- finalize the task
- verify persisted input records and node feedback counters

## Scope Control

This change does not attempt to automate Codex behavior through undocumented host features. It only makes the full ExperienceEngine loop available through the already-installed MCP surface.
