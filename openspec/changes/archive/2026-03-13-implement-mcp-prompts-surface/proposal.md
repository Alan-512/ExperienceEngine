## Why

ExperienceEngine 的第一阶段 MCP 面已经提供了 resources 和低风险 tools，但用户仍然需要知道具体 resource URI 或 tool 名称。对于支持 prompt/slash 呈现的宿主，这还不够自然。

下一步需要补一层 MCP prompts，把高频 ExperienceEngine 工作流做成可发现、可唤起的入口，而不是要求用户记住底层资源和工具。

## What Changes

- Add the first ExperienceEngine MCP prompts to the Codex MCP server.
- Cover review flows for last intervention, recent injected history, and warning nodes.
- Cover guided action flows for pause/resume scope and marking the last experience as helpful/harmful.

## Capabilities

### Modified Capabilities
- `mcp-native-interaction-surface`: ExperienceEngine now exposes prompt-layer workflow entry points in addition to resources and tools.
- `codex-runtime-loop`: Codex MCP surface now includes discoverable ExperienceEngine prompts.

## Impact

- Affected code:
  - `src/adapters/codex/mcp-server.ts`
  - prompt-related MCP tests
- Affected systems:
  - Codex MCP interaction surface
