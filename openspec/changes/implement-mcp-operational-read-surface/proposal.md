## Why

ExperienceEngine 的 MCP 主交互面已经有：
- inspect resources
- low-risk control tools
- workflow prompts

但运维读取仍然主要停留在 CLI `ee doctor`。这不利于用户留在 agent 内完成检查，也让 MCP 交互面缺少一块非常高频的只读状态视图。

下一步需要把只读运维状态也映射进 MCP，包括：
- adapter doctor state
- remote release update state

## What Changes

- Add a shared operational read service for adapter doctor state and remote release checks.
- Expose operational read resources on the Codex MCP server.
- Expose read-only MCP tools for `doctor` and `check_update`.

## Capabilities

### Modified Capabilities
- `mcp-native-interaction-surface`: ExperienceEngine MCP surface now includes read-only operational state.
- `codex-runtime-loop`: Codex MCP surface now exposes doctor and update-check primitives.

## Impact

- Affected code:
  - `src/adapters/codex/mcp-server.ts`
  - doctor/update shared logic
  - new operational interaction service
- Affected systems:
  - Codex MCP interaction surface
  - remote release checking
