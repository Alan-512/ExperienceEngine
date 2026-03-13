## Why

ExperienceEngine 现在已经能让用户查看最后一次干预和当前活跃经验，但还不能回答两个高频问题：最近几次到底发生了什么，以及某一条经验节点为什么还活着。缺这个查看面，用户对系统的长期信任仍然不够。

## What Changes

- Add `ee inspect recent` to list recent recorded task/intervention summaries.
- Add `ee inspect node <id>` to show detailed metadata for a specific experience node.
- Extend the inspect command surface without changing the low-noise default runtime behavior.

## Capabilities

### New Capabilities
- `cli-inspect-history`: On-demand CLI views for recent intervention history and individual node details.

### Modified Capabilities
- `cli-user-experience-surface`: The inspect command surface expands beyond `--last` and `active`.

## Impact

- Affected code:
  - `src/cli/commands/inspect.ts`
  - `src/store/sqlite/repositories/*`
  - `src/cli/index.ts`
- Affected systems:
  - local SQLite read paths only
