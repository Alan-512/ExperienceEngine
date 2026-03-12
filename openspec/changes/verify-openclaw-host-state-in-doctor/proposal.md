## Why

`ee doctor` currently reports product-owned install state, but it does not verify whether OpenClaw actually sees the ExperienceEngine plugin as enabled, healthy, and correctly configured. That leaves the most important failure mode outside diagnostics.

## What Changes

- Add real OpenClaw host-state inspection to `ee doctor`.
- Parse OpenClaw CLI output into stable diagnostic fields.
- Report mismatches between ExperienceEngine install state and OpenClaw's live plugin/config state.

## Capabilities

### Modified Capabilities

- `openclaw-experience-plugin`: Doctor now verifies the adapter from the host side, not only from product state.
- `agent-adapter-installation`: The OpenClaw diagnostics flow includes live host verification.

## Impact

- Improves install troubleshooting.
- Adds read-only dependence on local OpenClaw CLI query commands.
