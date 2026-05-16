## 1. Surface Tier Model

- [x] 1.0 Confirm `formalize-quality-band-inspection-model` is implemented and Quality Band wording is stable before changing CLI/MCP/docs wording.
- [x] 1.1 Define routine, operator, and advanced/experimental tier metadata in the CLI/MCP surface layer without changing command behavior.
- [x] 1.2 Classify existing CLI commands and Codex broker actions by tier while preserving existing risk/category fields.
- [x] 1.3 Document the distinction between workflow tier and mutation risk in development docs or inline constants where useful.
- [x] 1.4 Verify operator review, hygiene, and export draft behavior remains read-only and only receives tier labeling/presentation changes.

## 2. CLI And MCP Output

- [x] 2.1 Rework default `ee` help into concise routine, operator, and advanced/experimental sections.
- [x] 2.2 Keep full command syntax available without making advanced commands look like the default path.
- [x] 2.3 Update Codex MCP capabilities to expose tiered surface groupings.
- [x] 2.4 Add tier metadata or tier wording to brokered action listing without removing existing action ids.
- [x] 2.5 Ensure install/upgrade/repair and managed state workflows remain framed as operator/high-impact where applicable.

## 3. Docs And Tests

- [x] 3.1 Update README, README.zh-CN, and docs/user-guide so routine/operator/advanced wording is consistent.
- [x] 3.2 Update architecture docs if the interaction-surface model description changes.
- [x] 3.3 Add CLI help tests for grouped output.
- [x] 3.4 Add MCP capability or broker action tests for tier metadata/wording.
- [x] 3.5 Add release notes for the target version.
- [x] 3.6 Run targeted tests, `pnpm exec openspec validate complete-operator-surface-boundaries --strict`, `pnpm exec openspec validate --all --strict`, and `pnpm check`.
