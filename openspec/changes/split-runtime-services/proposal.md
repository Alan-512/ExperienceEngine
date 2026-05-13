## Why

`ExperienceRuntimeService` currently carries session state, tool result persistence, task finalization, learning, distillation worker loading, hybrid postmortem handling, review application, and capture writing. This makes the core runtime hard to reason about and increases the risk that future learning or governance changes accidentally alter host behavior.

## What Changes

- Split runtime responsibilities into focused internal services while keeping `ExperienceRuntimeService` as the compatibility facade.
- Extract finalization/persistence, prompt intervention orchestration, learning pipeline orchestration, and governance responsibilities in small phases.
- Preserve existing CLI, MCP, hook, and host adapter entrypoints.
- Add regression tests proving behavior is unchanged after each extraction.

## Capabilities

### New Capabilities

- `runtime-service-boundaries`: Runtime responsibilities are separated behind stable internal service boundaries without changing external host behavior.

### Modified Capabilities

- None.

## Impact

- Affects runtime internals and tests.
- Does not change public commands, MCP tool names, hook payloads, storage schema, or adapter contracts.
