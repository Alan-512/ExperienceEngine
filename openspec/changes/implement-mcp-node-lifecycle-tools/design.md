## Context

ExperienceEngine 已经把大部分高频交互迁到了 MCP：
- 查看
- 反馈
- scope 开关
- prompt 工作流
- 运维只读状态

剩余最明显的缺口是节点生命周期控制。warning 节点和 strategy 节点一旦需要人工干预，当前仍需要 CLI `cool` 或 `retire`。这对 agent 内管理来说不够自然，也让 MCP 控制面不完整。

## Goals / Non-Goals

**Goals:**
- Add shared node lifecycle control operations for cooling and retirement.
- Expose those operations as MCP tools on the Codex MCP server.
- Keep CLI acknowledgements unchanged while reusing the shared interaction layer.

**Non-Goals:**
- Add `enable node` in this change.
- Add bulk node lifecycle operations.
- Add high-impact operational changes such as rollback/import.

## Decisions

### 1. Node lifecycle control should reuse the shared interaction layer

Cooling and retirement will be implemented in the existing shared interaction service rather than directly in MCP callbacks.

Rationale:
- This keeps CLI and MCP semantics aligned.
- It avoids multiple code paths for the same state transitions.

### 2. Cooling and retirement remain separate actions

The MCP layer will expose:
- `experienceengine_cool_node`
- `experienceengine_retire_node`

It will not introduce a generic “set node state” action.

Rationale:
- The product language is already user-facing and clear.
- A generic state-setting tool is more error-prone and exposes internal mechanics too directly.

### 3. These tools are medium-risk controls

Cooling and retirement mutate ExperienceEngine behavior but do not alter host installation state. They belong to the medium-risk tier and should be surfaced as explicit tools, not hidden prompt mutations.

## Migration Plan

1. Add OpenSpec artifacts for lifecycle MCP tools.
2. Extend the shared interaction service with cool/retire operations.
3. Refactor CLI cool/retire commands to use the shared service.
4. Expose the tools on the Codex MCP server.
5. Add tests and run full validation.
