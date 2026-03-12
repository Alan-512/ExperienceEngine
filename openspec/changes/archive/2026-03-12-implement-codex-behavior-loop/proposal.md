# Change Proposal: Implement Codex Behavior Loop

## Why

Codex now has a real ExperienceEngine MCP foundation, but it still only supports hint lookup. That means Codex can read prior experience, but it cannot complete the product loop by recording tool evidence, finalizing a task, or updating helped/harmed feedback.

To move Codex beyond "MCP wired" and into a real product path, ExperienceEngine needs an explicit behavior loop built on top of the existing MCP server.

## What Changes

- Extend the Codex MCP server with tools that map to the shared runtime lifecycle:
  - lookup hints
  - record tool results
  - finalize a task
- Keep a single shared runtime instance inside the Codex MCP server process so session state survives across tool calls.
- Add regression coverage for Codex helped/harmed behavior using the shared runtime.

## Scope

This change builds a Codex behavior loop through MCP tools.

It does not yet:

- assume official Codex lifecycle hooks exist
- implement automatic task-end callbacks from the Codex host
- add Codex-specific policy tuning beyond the existing shared runtime behavior
