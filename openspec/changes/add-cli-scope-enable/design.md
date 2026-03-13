## Context

The new CLI management surface now supports:
- `ee disable node <id>`
- `ee disable scope`
- `ee cool node <id>`
- `ee retire node <id>`
- `ee feedback ...`

The obvious gap is that scope disable is not reversible from the CLI. Since scope disable is meant to be a safe operational control rather than a destructive action, the product should expose the matching enable path.

## Goals / Non-Goals

**Goals:**
- Add `ee enable scope` as the inverse of `ee disable scope`.
- Reuse the same current-working-directory scope resolution model.
- Keep acknowledgement copy consistent with the existing management surface.

**Non-Goals:**
- Add `enable node` in this change.
- Introduce bulk state transitions or interactive prompts.

## Decisions

### 1. `ee enable scope` will use the current working directory

The command will resolve `process.cwd()` into a scope id and update `is_disabled` back to `false`.

Rationale:
- This matches the existing `ee disable scope` command.
- It avoids exposing raw scope ids for the common case.

### 2. Missing scopes will be treated as already enabled

If no stored scope exists for the current working directory, the command will print a short acknowledgement explaining that interventions are already enabled for that scope.

Rationale:
- It keeps the command idempotent.
- It avoids creating empty scope rows just to represent the default enabled state.

## Risks / Trade-offs

- [Users may run the command from the wrong directory] → Acknowledge the resolved scope id and path in the output.
- [Scope enable without node state changes may still leave injection silent if all nodes are cooled/retired] → Accept this because scope enable only restores eligibility, not node inventory.
