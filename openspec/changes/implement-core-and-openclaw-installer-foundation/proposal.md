## Why

The repository now has a validated architecture direction for a host-agnostic ExperienceEngine core plus per-host adapters, but the codebase is still shaped as an OpenClaw-first plugin. The next implementation slice needs to turn that architecture into a real runtime boundary and ship the first unified installer surface without taking on Claude Code or Codex too early.

## What Changes

- Extract a host-agnostic runtime boundary that the OpenClaw adapter can call into.
- Introduce an `ee` CLI foundation with `install openclaw` and `doctor`.
- Add a product-owned data-home resolver with backward-compatible OpenClaw path support.
- Refit the existing OpenClaw plugin runtime to depend on the common core and installer-managed path resolution.

## Capabilities

### New Capabilities

- `experienceengine-cli-foundation`: A product CLI that can install and inspect supported adapters.

### Modified Capabilities

- `experienceengine-core`: Moves from planned architecture to a concrete runtime boundary in the codebase.
- `openclaw-experience-plugin`: Uses the extracted core boundary and installer-managed configuration.
- `agent-adapter-installation`: Ships the first real `ee install openclaw` implementation.

## Impact

- Affects source layout and runtime dependency flow.
- Adds a user-facing product CLI surface.
- Establishes the first migration path from `~/.openclaw/experienceengine` toward a product-owned data home.
