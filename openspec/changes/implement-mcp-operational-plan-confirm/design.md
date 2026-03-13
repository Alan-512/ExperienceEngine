## Context

The current product already separates low-risk inspection from higher-impact operational work, but only the read side is available through MCP. The design target is not to let agents silently execute install/repair/upgrade. The correct shape is:

1. create a structured plan
2. present the plan to the user
3. execute only when an explicit confirmation token is provided

This keeps the operational workflow inside the agent while preserving a clear human checkpoint.

## Decisions

### 1. Supported first-wave operations

The first supported high-impact MCP operations are:
- `install`
- `repair`
- `upgrade`

Adapters:
- `openclaw`: install, repair, upgrade
- `claude-code`: install, upgrade
- `codex`: install, upgrade

### 2. Planning is a first-class MCP tool

The planning tool should return:
- operation
- adapter
- summary
- expected effects
- whether confirmation is required
- a short-lived confirmation token

### 3. Execution must require an explicit confirmation token

The execution tool should reject requests without a matching confirmation token returned by a prior plan call. This is the minimum guardrail that keeps the action in-band but non-accidental.

### 4. The operational implementation should reuse existing installer logic

The MCP execution path should call the same installer/repair/upgrade functions that power the CLI. That keeps the product semantics aligned between MCP and CLI.
