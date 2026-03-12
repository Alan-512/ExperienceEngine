## Context

OpenClaw's local path install supports both normal install and `-l` link mode. Link mode is convenient for development, but in the current environment it exposes the plugin directly from a world-writable project path and triggers OpenClaw's plugin safety checks. A copied install is a safer default for the product workflow.

## Goals / Non-Goals

**Goals:**
- Switch the default OpenClaw install planner from link mode to copied local-path install.
- Preserve the existing enable/config-set steps.
- Reflect the new install mode in persisted install state.

**Non-Goals:**
- Remove the possibility of future dev-only link mode.
- Rework doctor parsing or repair recommendation logic.

## Decisions

### Use copied local-path install by default

The planner will use:
- `openclaw plugins install <packageRoot>`

instead of:
- `openclaw plugins install -l <packageRoot>`

This keeps installation on documented official surfaces while avoiding the world-writable linked-path problem seen in real host verification.

## Risks / Trade-offs

- [Copied installs may need explicit re-run after code changes] → Accept for the product default; repair already provides a deterministic way to reapply installation.
- [Some local dev workflows may still prefer link mode] → Leave dev-mode link support as a future explicit option rather than the default.

## Implementation Plan

1. Change the OpenClaw install command planner to drop `-l`.
2. Update install-state metadata and tests to reflect copy-mode installs.
3. Keep validation green and prepare for a real rerun of repair on the host.
