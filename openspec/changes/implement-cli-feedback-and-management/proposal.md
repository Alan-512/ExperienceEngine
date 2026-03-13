## Why

ExperienceEngine 已经具备了低噪音可见性和按需查看，但用户还缺少最基本的控制面。现在如果某条经验在帮倒忙，用户没有正式的 CLI 路径去禁用、冷却、退役或显式纠偏反馈。

## What Changes

- Add explicit CLI feedback commands for the last injected experience or a specific node.
- Add CLI management commands for disabling, cooling, and retiring experience nodes.
- Add CLI scope disabling so users can stop ExperienceEngine interventions in the current workspace without uninstalling the engine.
- Wire scope disabling into runtime intervention gating so disabled scopes stay silent during normal task execution.

## Capabilities

### New Capabilities
- `cli-feedback-and-management`: Explicit CLI commands for user feedback and experience management.

### Modified Capabilities
- `openclaw-experience-plugin`: Runtime intervention behavior must respect disabled scopes before attempting injection.

## Impact

- Affected code:
  - `src/cli/commands/*`
  - `src/runtime/service.ts`
  - `src/store/sqlite/repositories/*`
  - `src/cli/index.ts`
- Affected systems:
  - local SQLite state for nodes and scopes
  - host-visible ExperienceEngine behavior when a scope has been disabled
