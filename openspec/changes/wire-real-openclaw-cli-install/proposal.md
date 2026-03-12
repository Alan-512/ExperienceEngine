## Why

`ee install openclaw` currently writes ExperienceEngine-owned install state, but it does not yet complete the host-facing OpenClaw installation flow. That leaves a gap between product state and actual OpenClaw plugin activation.

## What Changes

- Make `ee install openclaw` invoke real OpenClaw CLI installation/configuration steps.
- Define the exact OpenClaw command plan used to link, enable, and configure ExperienceEngine.
- Persist enough install metadata for `ee doctor` to distinguish product state from host wiring state.

## Capabilities

### Modified Capabilities

- `agent-adapter-installation`: The OpenClaw install flow becomes host-effective rather than product-internal only.
- `openclaw-experience-plugin`: Installation now includes OpenClaw CLI wiring for the adapter.

## Impact

- Affects installer behavior and diagnostics.
- Adds a runtime dependency on the local `openclaw` CLI for OpenClaw installation.
