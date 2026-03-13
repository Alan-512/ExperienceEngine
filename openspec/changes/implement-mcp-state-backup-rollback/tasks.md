## 1. State Snapshot Service

- [x] 1.1 Add a shared state-artifact service for managed backup/export/import/rollback
- [x] 1.2 Persist managed backup and export metadata under the product home
- [x] 1.3 Create safeguard backups before rollback/import restores

## 2. MCP Surface

- [x] 2.1 Add MCP resources for listing backup inventory
- [x] 2.2 Add MCP plan/confirm tools for backup, export, import, and rollback
- [x] 2.3 Add MCP prompt(s) that instruct agents to review state-operation plans before execution

## 3. Validation

- [x] 3.1 Add regression tests for state-artifact snapshots and restore behavior
- [x] 3.2 Run `pnpm check`
- [x] 3.3 Run `openspec validate --changes --strict`
