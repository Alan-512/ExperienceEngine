## Why

现在 `ee inspect active` 和默认节点列表已经够看全量信息，但当节点数量变多后，用户会更频繁地只想看某一类节点，比如只看 warning 或只看 retired。没有过滤，管理效率会很快下降。

## What Changes

- Add `ee inspect state <state>` to filter nodes by lifecycle state.
- Add `ee inspect type <type>` to filter nodes by node type.
- Keep the output table format consistent with the current node list view.

## Capabilities

### New Capabilities
- `cli-inspect-node-filters`: Read-only CLI filters for node state and node type.

### Modified Capabilities
- `cli-user-experience-surface`: The inspect surface gains typed and state-based node filtering.

## Impact

- Affected code:
  - `src/cli/commands/inspect.ts`
  - `src/store/sqlite/repositories/node-repo.ts`
  - `tests/unit/inspect-command.test.ts`
