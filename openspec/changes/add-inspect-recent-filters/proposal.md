## Why

`ee inspect recent` 现在已经能给出最近记录，但还不够实用。用户常见的两个追问是“只看真正发生过注入的记录”以及“多看几条/少看几条”，这需要最小的过滤和条数控制。

## What Changes

- Add a limit option to `ee inspect recent`.
- Add an injected-only filter to `ee inspect recent`.
- Keep the command read-only and table-oriented.

## Capabilities

### New Capabilities
- `cli-inspect-recent-filters`: Filtering and limit controls for recent CLI inspection.

### Modified Capabilities
- `cli-inspect-history`: Recent history inspection gains limit and injected-only filtering.

## Impact

- Affected code:
  - `src/cli/commands/inspect.ts`
  - `src/store/sqlite/repositories/input-record-repo.ts`
  - `tests/unit/inspect-command.test.ts`
