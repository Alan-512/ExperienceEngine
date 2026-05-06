## 1. Report And CLI Workflow

- [ ] 1.1 Review the current operator review report shape and keep existing structured fields source-compatible.
- [ ] 1.2 Improve `ee inspect review` output so it reads as a bounded operator checklist with review order, prioritized items, drill-down commands, and next actions.
- [ ] 1.3 Keep the CLI review flow explicitly read-only and avoid policy, node, attribution, snapshot, instruction-file, or export writes.

## 2. MCP Metadata And Drill-Down Consistency

- [ ] 2.1 Update Codex MCP capabilities/resource/action descriptions so operator review is described as read-only workflow coordination.
- [ ] 2.2 Ensure review drill-down references stay aligned with repo policy, hygiene, and export draft CLI/MCP surfaces.
- [ ] 2.3 Add or update tests covering capability metadata and broker action descriptions.

## 3. Documentation

- [ ] 3.1 Update `docs/user-guide.md` with a read-only operator review workflow section.
- [ ] 3.2 Include examples for `ee inspect review`, manual drill-down into repo policy, hygiene, and export drafts, and MCP usage language.
- [ ] 3.3 State non-goals clearly: no console, no mutation dashboard, no automatic export writer, no team workflow.

## 4. Tests

- [ ] 4.1 Add or update CLI tests for operator review output readability, drill-down commands, and no-mutation wording.
- [ ] 4.2 Add or update operator review report tests for stable shape and drill-down alignment.
- [ ] 4.3 Add or update MCP tests for review resource/action metadata and payload compatibility.

## 5. Validation

- [ ] 5.1 Run targeted tests for operator review, inspect CLI, and Codex MCP surfaces.
- [ ] 5.2 Run `pnpm check`.
- [ ] 5.3 Run `openspec validate productize-operator-review-workflow --strict` and `openspec validate --changes --strict`.
