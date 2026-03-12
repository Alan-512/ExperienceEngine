## Context

The current installer foundation computes the correct data home and writes ExperienceEngine install state, but OpenClaw still has to be wired manually. OpenClaw's documented plugin CLI already supports local path installs, plugin enablement, and config updates, so this change should use those official surfaces rather than inventing a separate config writer.

## Goals / Non-Goals

**Goals:**
- Use the official `openclaw` CLI to complete the OpenClaw-side install flow.
- Keep the install flow aligned with documented plugin commands and config paths.
- Preserve product-owned install state while reflecting host-side wiring details in diagnostics.

**Non-Goals:**
- Manage gateway restart automatically in this change.
- Implement uninstall or rollback flows.
- Add Claude Code or Codex logic.

## Decisions

### Use linked local plugin install for phase one

The installer will use OpenClaw's documented local link install flow so the current package root is exposed to OpenClaw as a plugin source.

### Use documented enable/config commands

After linking the plugin, the installer will enable the plugin and write `plugins.entries.experienceengine.config` through the OpenClaw CLI using JSON config payloads.

### Persist host-wiring metadata separately from runtime data

The product install-state file will record the package root, install mode, and whether OpenClaw CLI wiring succeeded, so `ee doctor` can distinguish:
- product paths resolved correctly
- host wiring completed

## Risks / Trade-offs

- [OpenClaw CLI may be missing from PATH] → Fail with a clear message that the OpenClaw CLI is required for this install target.
- [Host CLI behavior may change] → Keep command construction isolated and unit-tested.
- [Gateway restart is still manual] → Report restart as recommended in installer output and diagnostics.

## Implementation Plan

1. Add an OpenClaw command planner/executor for link-install, enable, and config-set.
2. Update `ee install openclaw` to execute that plan before writing final install state.
3. Extend `ee doctor` to report whether host wiring succeeded and which package root was linked.
4. Add unit coverage for command planning and installer flow.
