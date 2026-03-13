## Why

ExperienceEngine 的 MCP 交互面已经有：
- inspect resources
- review/control prompts
- feedback tools
- scope enable/disable tools
- doctor/update read surface

但节点生命周期控制仍然主要停留在 CLI：
- `ee cool node <id>`
- `ee retire node <id>`

如果用户要在 agent 内直接处理噪音 warning 或错误 strategy，仍然需要跳回 CLI。这和 MCP-first 的交互方向不一致。

## What Changes

- Add shared lifecycle control operations for node cooling and retirement.
- Expose MCP tools for `experienceengine_cool_node` and `experienceengine_retire_node`.
- Reuse the shared lifecycle control logic from the CLI commands.

## Capabilities

### Modified Capabilities
- `mcp-native-interaction-surface`: ExperienceEngine MCP tools now cover node lifecycle control in addition to feedback and scope toggles.
- `cli-user-experience-surface`: CLI cool/retire semantics are backed by the shared interaction service.

## Impact

- Affected code:
  - `src/interaction/service.ts`
  - `src/cli/commands/cool.ts`
  - `src/cli/commands/retire.ts`
  - `src/adapters/codex/mcp-server.ts`
- Affected systems:
  - Codex MCP control surface
