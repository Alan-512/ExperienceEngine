## Why

The operator review flow now exists, but it is still a raw inspection surface. The next step is to make it usable as a repeated operator workflow with clearer CLI output, documented drill-down paths, and MCP metadata that explains how to inspect without mutating ExperienceEngine state.

This is the correct next slice before a console or team workflow because it productizes the existing read-only surfaces without widening scope into mutation, automatic export, or UI dashboards.

## What Changes

- Improve `ee inspect review` output so operators can quickly see review order, priority, source, summary, and drill-down commands.
- Add user-guide documentation for the repo policy, hygiene, export draft, and operator review workflow.
- Make MCP capability descriptions and drill-down references consistent for the operator review flow.
- Add examples that show review-only behavior and manual drill-down.
- Keep all operator review, hygiene, repo policy, and export draft surfaces read-only.
- Do not add a console/TUI, automatic export writer, node mutation, repo policy mutation, or team workflow.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `operator-review-flow`: Clarify the report contract for operator-facing display, review order, drill-down references, and no-mutation workflow guidance.
- `cli-user-experience-surface`: Improve the `ee inspect review` CLI contract for repeated operator use.
- `mcp-native-interaction-surface`: Clarify MCP capability metadata and drill-down expectations for operator review resources/actions.

## Impact

- Affected code:
  - `src/maintenance/operator-review-flow.ts`
  - `src/cli/commands/inspect.ts`
  - `src/adapters/codex/mcp-server.ts`
  - `src/adapters/codex/action-registry.ts`
- Affected docs:
  - `docs/user-guide.md`
  - related tests under `tests/unit/*inspect*`, `tests/unit/*mcp*`, and `tests/unit/operator-review-flow.test.ts`
- No database migration.
- No new external dependency.
- No host lifecycle behavior change.
