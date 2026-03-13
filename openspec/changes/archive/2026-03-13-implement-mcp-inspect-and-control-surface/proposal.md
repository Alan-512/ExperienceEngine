## Why

ExperienceEngine 已经有一套可用的 CLI 查看和控制面，但这仍然要求用户离开当前 agent 会话去执行 `ee ...`。新的交互方向已经明确为 MCP-native，因此下一步需要把最常用、风险最低的日常动作先搬进 MCP。

第一阶段不追求把所有 CLI 都搬完，而是优先实现：
- inspect 类只读视图
- 低风险反馈与 scope 控制

这样可以先让 Codex 这条 MCP-first 宿主拥有真正的 agent 内交互，同时避免过早把 repair/upgrade/import 这类高影响运维动作暴露进会话流。

## What Changes

- Add a shared interaction service that returns structured inspection and control results instead of CLI-only terminal text.
- Expose the first MCP Resources for last/recent/node/node-filter views.
- Expose the first low-risk MCP Tools for feedback and scope enable/disable control.
- Reuse the same shared interaction logic from the existing CLI so MCP and CLI do not drift semantically.

## Capabilities

### New Capabilities
- `mcp-inspect-and-control-surface`: MCP-native read and low-risk control surface for ExperienceEngine.

### Modified Capabilities
- `codex-runtime-loop`: Codex MCP server now exposes user-facing inspection resources and low-risk control tools in addition to the existing runtime-loop tools.
- `cli-user-experience-surface`: CLI-backed inspect and control semantics are promoted into a shared interaction contract that can also be served over MCP.

## Impact

- Affected code:
  - `src/adapters/codex/mcp-server.ts`
  - `src/cli/commands/inspect.ts`
  - `src/cli/commands/feedback.ts`
  - `src/cli/commands/disable.ts`
  - `src/cli/commands/enable.ts`
  - `src/store/sqlite/repositories/*`
  - new shared interaction service modules
- Affected systems:
  - Codex MCP interaction surface
  - local SQLite-backed ExperienceEngine state
