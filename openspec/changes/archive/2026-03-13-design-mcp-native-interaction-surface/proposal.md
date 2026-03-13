## Why

ExperienceEngine 现在已经有可用的 CLI 用户面，但它仍然把大量日常查看和控制动作放在独立 `ee` 命令里。对于长期的 agent 产品形态，这不够自然，也不够顺应当前生态正在强化的 MCP 交互模式。

最新公开资料显示，未来长期稳定的方向不是“继续堆独立 CLI 子命令”，而是把 ExperienceEngine 设计成一个 **MCP-native interaction surface**：
- `Resources` 负责只读状态和上下文
- `Prompts` 负责用户可控的交互入口与 slash-like 工作流
- `Tools` 负责执行动作
- `ee` CLI 保留为 fallback / automation / recovery 面

## What Changes

- Define ExperienceEngine's long-term user interaction model as MCP-native rather than CLI-first.
- Define which current `ee` capabilities map to MCP `Resources`, `Prompts`, and `Tools`.
- Define risk tiers for MCP actions so high-impact operations require explicit confirmation or dry-run planning.
- Reposition `ee` CLI as fallback, automation, and recovery surface rather than the primary day-to-day user interface.
- Define host-specific presentation guidance for Codex, Claude Code, and OpenClaw while keeping one unified ExperienceEngine interaction contract.

## Capabilities

### New Capabilities
- `mcp-native-interaction-surface`: Long-term MCP-first interaction design for ExperienceEngine across hosts.

### Modified Capabilities
- `cli-user-experience-surface`: CLI becomes a fallback and automation surface instead of the primary user-facing interaction layer.
- `agent-adapter-installation`: Host adapters must plan for MCP interaction surfaces in addition to runtime capture/injection surfaces.

## Impact

- Affected design areas:
  - CLI product surface
  - Codex integration strategy
  - Claude Code integration strategy
  - OpenClaw interaction fallback strategy
  - future install/doctor/repair/upgrade exposure model
- Expected implementation impact:
  - future MCP server expansion beyond current Codex lookup/finalize tools
  - future prompt/resource definitions
  - future confirmation model for high-impact operations
