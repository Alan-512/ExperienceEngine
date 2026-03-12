# Change Proposal: Validate Real Codex Behavior Loop

## Why

Codex now has both an MCP foundation and a shared-runtime behavior loop, but those capabilities are still only proven by unit tests and isolated install checks. We need one real Codex run that actually calls the ExperienceEngine MCP tools end-to-end.

## What Changes

- Define the real runtime evidence required for Codex behavior-loop validation
- Run a real Codex execution that:
  - looks up hints
  - records a tool result
  - finalizes a task
- Verify that the real run persists injected node ids and helped/harmed feedback

## Scope

This change validates the existing Codex MCP behavior loop.

It does not redesign the Codex tool surface or add undocumented host integrations.
