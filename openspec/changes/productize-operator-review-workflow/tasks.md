## 1. Report And CLI Workflow

- [x] 1.1 Review the current operator review report shape and keep existing structured fields source-compatible.
- [x] 1.2 Improve `ee inspect review` output so it reads as a bounded operator checklist with review order, prioritized items, drill-down commands, and next actions.
- [x] 1.3 Keep the CLI review flow explicitly read-only and avoid policy, node, attribution, snapshot, instruction-file, or export writes.

## 2. MCP Metadata And Drill-Down Consistency

- [x] 2.1 Update Codex MCP capabilities/resource/action descriptions so operator review is described as read-only workflow coordination.
- [x] 2.2 Ensure review drill-down references stay aligned with repo policy, hygiene, and export draft CLI/MCP surfaces.
- [x] 2.3 Add or update tests covering capability metadata and broker action descriptions.

## 3. Documentation

- [x] 3.1 Update `docs/user-guide.md` with a read-only operator review workflow section.
- [x] 3.2 Include examples for `ee inspect review`, manual drill-down into repo policy, hygiene, and export drafts, and MCP usage language.
- [x] 3.3 State non-goals clearly: no console, no mutation dashboard, no automatic export writer, no team workflow.

## 4. Tests

- [x] 4.1 Add or update CLI tests for operator review output readability, drill-down commands, and no-mutation wording.
- [x] 4.2 Add or update operator review report tests for stable shape and drill-down alignment.
- [x] 4.3 Add or update MCP tests for review resource/action metadata and payload compatibility.

## 5. Validation

- [x] 5.1 Run targeted tests for operator review, inspect CLI, and Codex MCP surfaces.
- [x] 5.2 Run `pnpm check`.
- [x] 5.3 Run `openspec validate productize-operator-review-workflow --strict` and `openspec validate --changes --strict`.
